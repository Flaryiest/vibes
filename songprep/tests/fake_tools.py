"""Stand-ins for the heavy tools, so the whole import can run in a unit test.

`FakeTools` replaces `songprep.pipeline.run`. ffmpeg commands go to the real
ffmpeg; audio-separator, the alignment worker, beat_this and mlx_whisper are
answered from the synthetic song, in the file formats the real tools write.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile
from scipy.signal import resample_poly

from songprep import runner

BPM = 120.0


def vocal_44k(song) -> np.ndarray:
    mono = resample_poly(song.audio.astype(np.float64), 441, 160)
    return np.stack([mono, mono], axis=1).astype(np.float32)


def clicks_44k(seconds: float) -> np.ndarray:
    rate = 44100
    out = np.zeros(int(seconds * rate), dtype=np.float32)
    click = (0.5 * np.sin(2 * np.pi * 1000 * np.arange(441) / rate) * np.hanning(441)).astype(np.float32)
    step = 60.0 / BPM
    for i in range(int(seconds / step)):
        start = int(i * step * rate)
        out[start : start + 441] += click[: len(out) - start][:441]
    return np.stack([out, out], axis=1)


def write_mix(song, path: Path) -> None:
    vocals = vocal_44k(song)
    soundfile.write(str(path), vocals + clicks_44k(len(vocals) / 44100), 44100, subtype="PCM_16")


def _after(command: list[str], flag: str) -> str:
    return command[command.index(flag) + 1]


class FakeTools:
    def __init__(self, song, fail: str | None = None):
        self.song = song
        self.fail = fail  # name of a tool that should fail
        self.calls: list[str] = []
        self.align_specs: list[dict] = []

    def count(self, name: str) -> int:
        return self.calls.count(name)

    def __call__(self, stage: str, command: list[str], *, log=None, env=None, cwd=None):
        if command[0] == "ffmpeg":
            self.calls.append("ffmpeg")
            return runner.run(stage, command, log=log, env=env, cwd=cwd)
        name = next(
            (n for n, marker in (("separator", "audio-separator"), ("beats", "beat_this"), ("transcribe", "mlx_whisper")) if marker in command),
            "align" if any(str(a).endswith("align_worker.py") for a in command) else None,
        )
        assert name, f"unexpected command: {command}"
        self.calls.append(name)
        if self.fail == name:
            raise runner.StageError(stage, "exit code 1\nsimulated failure", command, log)
        getattr(self, f"_{name}")(command)
        return runner.RunResult(command, 0.01, "")

    def _separator(self, command: list[str]) -> None:
        out_dir = Path(_after(command, "--output_dir"))
        names = json.loads(_after(command, "--custom_output_names"))
        vocals = vocal_44k(self.song)
        soundfile.write(str(out_dir / f"{names['Vocals']}.flac"), vocals, 44100, format="FLAC", subtype="PCM_16")
        soundfile.write(str(out_dir / f"{names['Instrumental']}.flac"), clicks_44k(len(vocals) / 44100), 44100, format="FLAC", subtype="PCM_16")

    def _align(self, command: list[str]) -> None:
        spec = json.loads(Path(_after(command, "--input")).read_text())
        self.align_specs.append(spec)
        truth = self.song.lyrics["lines"]
        assert len(spec["lines"]) == len(truth)
        lines = []
        for given, line in zip(spec["lines"], truth):
            tokens = given["text"].split()
            assert len(tokens) == len(line["words"])
            words = [{"text": token, "start": w["t0"], "end": w["t1"], "score": 0.9} for token, w in zip(tokens, line["words"])]
            start = given["start"] if given["start"] is not None else line["t0"] - 0.5
            end = given["end"] if given["end"] is not None else line["t1"] + 0.75
            lines.append({"text": given["text"], "start": max(0.0, start), "end": end, "words": words})
        result = {"lines": lines, "model": "FAKE_ALIGNER", "globalPass": spec["lines"][0]["start"] is None, "versions": {}}
        Path(_after(command, "--output")).write_text(json.dumps(result))

    def _beats(self, command: list[str]) -> None:
        seconds = len(self.song.audio) / self.song.sample_rate
        step = 60.0 / BPM
        rows = [f"{i * step:.3f}\t{i % 4 + 1}" for i in range(int(seconds / step))]
        Path(_after(command, "--output")).write_text("\n".join(rows) + "\n")

    def _transcribe(self, command: list[str]) -> None:
        segments = [
            {"id": i, "start": line["t0"], "end": line["t1"] + 0.3, "text": " " + line["text"], "no_speech_prob": 0.02}
            for i, line in enumerate(self.song.lyrics["lines"])
        ]
        out = Path(_after(command, "--output-dir")) / f"{_after(command, '--output-name')}.json"
        out.write_text(json.dumps({"text": "", "segments": segments, "language": "en"}))
