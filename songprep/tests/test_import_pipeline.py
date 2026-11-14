"""`songprep import` end to end with the heavy tools replaced by stand-ins.

Decoding and resampling use the real ffmpeg; pitch tracking, note extraction,
analysis and packaging are the real code. The generated package is validated
against `schema/song-package.schema.json`.
"""

from __future__ import annotations

import json
import shlex
import shutil
from pathlib import Path

import pytest

import fake_tools
from songprep import cli, lyrics, package, pipeline
from songprep.cache import read_json
from songprep.paths import Paths
from songprep.runner import StageError

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is needed to decode the test audio")

PLAIN_LYRICS = "[Verse]\nla la la la\nhold me now\n\nla la la la\noh yeah\nla la la la\nit\n"
SONG_ID = "test-artist-test-song"


class Bench:
    """A scratch repository: songs/, work/, models/, a source file and stand-in tools."""

    def __init__(self, root: Path, song, monkeypatch: pytest.MonkeyPatch, fail: str | None = None):
        self.root = root
        self.paths = Paths(root=root, songs=root / "songs", work=root / "work", models=root / "models")
        self.source = root / "mix.wav"
        fake_tools.write_mix(song, self.source)
        self.lyrics_file = root / "lyrics.txt"
        self.lyrics_file.write_text(PLAIN_LYRICS)
        self.tools = fake_tools.FakeTools(song, fail=fail)
        monkeypatch.setattr(pipeline, "run", self.tools)
        monkeypatch.setattr(lyrics, "fetch_lrclib", self._no_network)
        self.messages: list[str] = []

    @staticmethod
    def _no_network(*_args, **_kwargs):
        raise AssertionError("the test must not reach lrclib.net")

    def run(self, with_lyrics: bool = True, **overrides):
        options = pipeline.ImportOptions(
            audio=self.source,
            artist="Test Artist",
            title="Test Song",
            lyrics=self.lyrics_file if with_lyrics else None,
            **overrides,
        )
        return pipeline.run_import(options, self.paths, log=self.messages.append)

    @property
    def package(self) -> Path:
        return self.paths.songs / SONG_ID


@pytest.fixture
def bench(tmp_path, song, monkeypatch) -> Bench:
    return Bench(tmp_path, song, monkeypatch)


def test_import_writes_a_valid_package(bench, song, validate):
    result = bench.run()
    assert result.song_id == SONG_ID and result.package == bench.package
    assert sorted(p.name for p in bench.package.iterdir()) == sorted(package.PACKAGE_FILES)

    manifest = read_json(bench.package / "manifest.json")
    notes = read_json(bench.package / "notes.json")
    auto = read_json(bench.package / "notes.auto.json")
    lyric = read_json(bench.package / "lyrics.json")
    beats = read_json(bench.package / "beats.json")
    f0 = read_json(bench.package / "f0.json")
    peaks = read_json(bench.package / "peaks.json")

    validate(manifest, "manifest")
    validate(notes, "notes")
    validate(auto, "notes")
    validate(lyric, "lyrics")
    validate(beats, "beats")
    validate(f0, "f0")
    validate(peaks, "peaks")
    validate({"manifest": manifest, "notes": notes, "lyrics": lyric, "beats": beats, "f0": f0})
    validate(read_json(bench.paths.songs / "index.json"), "songIndex")

    assert notes == auto, "on a first import notes.json is a copy of notes.auto.json"
    assert manifest["schema"] == 1 and manifest["id"] == SONG_ID
    assert (manifest["title"], manifest["artist"]) == ("Test Song", "Test Artist")
    assert manifest["sampleRate"] == 44100
    assert manifest["durationS"] == pytest.approx(len(song.audio) / song.sample_rate, abs=0.01)
    assert manifest["sourceHash"].startswith("sha256:") and len(manifest["sourceHash"]) == 71
    assert manifest["lyricsSource"] == "file" and manifest["lyricsNeedReview"] is False
    assert manifest["bpm"] == 120.0
    assert manifest["range"] == {"lowMidi": 55, "highMidi": 67}
    assert manifest["typicalRange"] == {"lowMidi": 57, "highMidi": 64}
    assert manifest["bakedKeys"] == []
    assert manifest["tools"]["separationModel"].startswith("model_bs_roformer")
    assert "mlx-whisper" not in manifest["tools"]

    # The notes survive the real decode -> 16 kHz -> SwiftF0 -> segmentation path.
    assert [n["midi"] for n in notes] == [n["midi"] for n in song.notes]
    for expected, found in zip(song.notes, notes):
        assert abs(found["t"] - expected["t"]) <= 0.06
        assert found["text"] == expected["text"]
    assert len(f0["hz"]) == len(f0["conf"]) and f0["hopS"] == pytest.approx(0.016)
    assert abs(len(f0["hz"]) * f0["hopS"] - manifest["durationS"]) < 0.05
    assert beats["beats"] == sorted(beats["beats"]) and set(beats["downbeats"]) <= set(beats["beats"])
    assert len(peaks["vocals"]["max"]) == len(peaks["instrumental"]["max"]) == int(manifest["durationS"] / 0.02)
    for name in ("vocals.flac", "instrumental.flac"):
        assert (bench.package / name).stat().st_size > 1000

    # Every note points at a real word of the lyrics.
    for note in notes:
        word = lyric["lines"][note["line"]]["words"][note["word"]]
        assert note["text"] in (word["text"], "~")
    assert read_json(bench.paths.songs / "index.json") == [
        {"id": SONG_ID, "title": "Test Song", "artist": "Test Artist", "durationS": manifest["durationS"]}
    ]
    # Plain-text lyrics carry no times, so the aligner is asked to find each line's window.
    assert all(line["start"] is None for line in bench.tools.align_specs[0]["lines"])
    assert [r["stage"] for r in result.timings] == ["decode", "separate", "lyrics", "align", "pitch", "notes", "beats", "analysis", "package"]
    assert all(r["ran"] for r in result.timings)


def test_second_import_does_no_work(bench):
    bench.run()
    calls = list(bench.tools.calls)
    stamp = (bench.package / "manifest.json").stat().st_mtime_ns
    again = bench.run()
    assert [r["ran"] for r in again.timings] == [False] * 9
    assert bench.tools.calls == calls, "no tool was started again"
    assert (bench.package / "manifest.json").stat().st_mtime_ns == stamp


def test_force_reruns_one_stage(bench):
    bench.run()
    again = bench.run(force={"beats"})
    ran = {r["stage"] for r in again.timings if r["ran"]}
    assert ran == {"beats"}, "beats ran again; its result was identical, so nothing downstream re-ran"
    assert bench.tools.count("beats") == 2 and bench.tools.count("separator") == 1


def test_changed_lyrics_rerun_from_the_lyrics_stage(bench):
    bench.run()
    bench.lyrics_file.write_text(PLAIN_LYRICS.replace("it\n", "IT\n"))
    again = bench.run()
    ran = [r["stage"] for r in again.timings if r["ran"]]
    assert ran == ["lyrics", "align", "notes", "analysis", "package"]
    assert bench.tools.count("separator") == 1 and bench.tools.count("beats") == 1
    assert read_json(bench.package / "notes.auto.json")[-1]["text"] == "IT"


def test_reimport_never_overwrites_notes_json(bench):
    bench.run()
    corrected = read_json(bench.package / "notes.json")
    corrected[0]["midi"] = 58
    corrected[0]["text"] = "corrected"
    (bench.package / "notes.json").write_text(json.dumps(corrected))
    bench.lyrics_file.write_text(PLAIN_LYRICS.replace("it\n", "IT\n"))

    bench.run(force={"all"})
    assert read_json(bench.package / "notes.json") == corrected
    auto = read_json(bench.package / "notes.auto.json")
    assert auto[0]["midi"] == 57 and auto[0]["text"] == "la" and auto[-1]["text"] == "IT"
    assert [p.name for p in bench.paths.songs.iterdir() if p.name.startswith(".")] == []


def test_deleted_package_is_rebuilt_from_the_cache(bench):
    bench.run()
    shutil.rmtree(bench.package)
    again = bench.run()
    assert [r["stage"] for r in again.timings if r["ran"]] == ["package"]
    assert (bench.package / "notes.json").exists()


def test_no_lyrics_falls_back_to_transcription(bench, monkeypatch, validate):
    monkeypatch.setattr(lyrics, "fetch_lrclib", lambda *_a, **_k: (None, "no match"))
    result = bench.run(with_lyrics=False)
    manifest = read_json(bench.package / "manifest.json")
    validate(manifest, "manifest")
    assert manifest["lyricsSource"] == "transcribed" and manifest["lyricsNeedReview"] is True
    assert manifest["tools"]["transcribeModel"] == "mlx-community/whisper-large-v3-turbo"
    assert bench.tools.count("transcribe") == 1
    assert result.summary["lyrics"]["lrclib"] == "no match"
    assert read_json(bench.package / "lyrics.json")["offsetS"] == 0.0
    assert all(line["start"] is not None for line in bench.tools.align_specs[0]["lines"])


def test_no_lrclib_flag_skips_the_request(bench):
    # Bench's fetch_lrclib raises if it is called at all.
    bench.run(with_lyrics=False, no_lrclib=True)
    assert read_json(bench.package / "manifest.json")["lyricsSource"] == "transcribed"


def test_lrclib_lyrics_are_shifted_onto_this_audio(bench, song, monkeypatch, validate):
    shift = 0.4  # the LRCLIB record was timed against a master that starts 0.4 s earlier
    lrc = "".join(
        f"[{int((line['t0'] - shift) // 60):02d}:{(line['t0'] - shift) % 60:05.2f}]{line['text']}\n" for line in song.lyrics["lines"]
    )
    seen = {}

    def fetch(artist, title, duration):
        seen.update(artist=artist, title=title, duration=duration)
        return lyrics.lyrics_from_lrclib({"syncedLyrics": lrc, "plainLyrics": ""})

    monkeypatch.setattr(lyrics, "fetch_lrclib", fetch)
    bench.run(with_lyrics=False)
    manifest = read_json(bench.package / "manifest.json")
    lyric = read_json(bench.package / "lyrics.json")
    validate(lyric, "lyrics")
    assert manifest["lyricsSource"] == "lrclib" and manifest["lyricsNeedReview"] is False
    assert seen == {"artist": "Test Artist", "title": "Test Song", "duration": pytest.approx(manifest["durationS"], abs=0.01)}
    assert lyric["offsetS"] == pytest.approx(shift, abs=0.06)
    assert bench.tools.count("transcribe") == 0
    # Each line's window sits around its real position in this audio.
    for window, line in zip(bench.tools.align_specs[0]["lines"], song.lyrics["lines"]):
        assert window["start"] <= line["t0"] <= window["end"]


def test_failing_stage_stops_and_keeps_earlier_stages(tmp_path, song, monkeypatch):
    bench = Bench(tmp_path, song, monkeypatch, fail="beats")
    with pytest.raises(StageError) as caught:
        bench.run()
    error = caught.value
    assert error.stage == "beats"
    assert "beat_this" in error.command and str(bench.paths.work / SONG_ID / "separate" / "instrumental.flac") in error.command
    assert not bench.package.exists(), "no package is written when a stage fails"

    bench.tools.fail = None
    result = bench.run()
    ran = [r["stage"] for r in result.timings if r["ran"]]
    assert ran == ["beats", "analysis", "package"], "stages before the failure were not repeated"
    assert bench.tools.count("separator") == 1 and bench.tools.count("align") == 1


def test_cli_prints_the_stage_and_the_exact_command(tmp_path, song, monkeypatch, capsys):
    bench = Bench(tmp_path, song, monkeypatch, fail="separator")
    code = cli.main(
        [
            "import", str(bench.source), "--artist", "Test Artist", "--title", "Test Song", "--lyrics", str(bench.lyrics_file),
            "--songs-dir", str(bench.paths.songs), "--work-dir", str(bench.paths.work), "--models-dir", str(bench.paths.models),
        ]  # fmt: skip
    )
    captured = capsys.readouterr()
    assert code == 1
    assert "stage 'separate' failed" in captured.err
    command = pipeline.separate_command(
        bench.paths.work / SONG_ID / "source.wav",
        bench.paths.work / SONG_ID / "separate",
        bench.paths.models,
        pipeline.SEPARATION_MODEL,
        {"Vocals": "vocals", "Instrumental": "instrumental"},
    )
    assert shlex.join(command) in captured.err
    assert "Earlier stages stay cached" in captured.err
    assert not bench.package.exists()


def test_cli_import_prints_a_summary(tmp_path, song, monkeypatch, capsys):
    bench = Bench(tmp_path, song, monkeypatch)
    code = cli.main(
        [
            "import", str(bench.source), "--artist", "Test Artist", "--title", "Test Song", "--lyrics", str(bench.lyrics_file),
            "--songs-dir", str(bench.paths.songs), "--work-dir", str(bench.paths.work), "--models-dir", str(bench.paths.models),
            "--force", "notes,analysis",
        ]  # fmt: skip
    )
    out = capsys.readouterr().out
    assert code == 0
    assert "G3-G4 (MIDI 55-67)" in out and "120.0 BPM" in out and "Stage timings" in out


def test_missing_audio_and_unknown_stage_are_reported(bench):
    with pytest.raises(StageError, match="not found"):
        pipeline.run_import(pipeline.ImportOptions(audio=bench.root / "nope.mp3", artist="A", title="B"), bench.paths, log=lambda _m: None)
    with pytest.raises(StageError, match="unknown stage"):
        bench.run(force={"mastering"})


def test_lead_only_tracks_pitch_on_the_lead_stem(bench):
    result = bench.run(lead_only=True)
    assert bench.tools.count("separator") == 2
    assert result.summary["pitch"]["stem"] == "lead.flac"
    assert read_json(bench.package / "manifest.json")["tools"]["leadVocalModel"].startswith("mel_band_roformer_karaoke")
    # The package still carries the full vocal stem.
    work = bench.paths.work / SONG_ID
    assert (bench.package / "vocals.flac").read_bytes() == (work / "separate" / "vocals.flac").read_bytes()
