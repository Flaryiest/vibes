"""`songprep render-key`: pre-render the instrumental in another key with Rubber Band.

Rubber Band is GPL and stays a separate program: it is only ever run as a
command. The result is `instrumental_k+3.flac` (for +3 semitones) inside the
package, and the shift is added to `bakedKeys` in the manifest.
"""

from __future__ import annotations

import math
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable

import soundfile

from .cache import read_json, write_json_atomic
from .package import baked_key_name, baked_keys
from .paths import Paths
from .runner import StageError, run


PRE_GAIN = 0.5  # 6 dB of headroom while shifting; restored afterwards


def rubberband_command(source: Path, dest: Path, semitones: int) -> list[str]:
    # -3: the R3 "finer" engine; --centre-focus keeps centre-panned parts (bass, kick) solid.
    # --ignore-clipping: do not let rubberband lower the level on its own; the level is set below.
    return ["rubberband", "-q", "-3", "--centre-focus", "--ignore-clipping", "--pitch", str(semitones), str(source), str(dest)]


def render_key(song_id: str, semitones: int, paths: Paths, log: Callable[[str], None] = print) -> dict[str, Any]:
    stage = "render-key"
    if semitones == 0 or not -12 <= semitones <= 12:
        raise StageError(stage, "--semitones must be a whole number from -12 to 12, and not 0")
    folder = paths.package(song_id)
    manifest_path = folder / "manifest.json"
    instrumental = folder / "instrumental.flac"
    if not manifest_path.is_file() or not instrumental.is_file():
        raise StageError(stage, f"no package for '{song_id}' in {paths.songs}; run songprep import first")
    if shutil.which("rubberband") is None:
        raise StageError(stage, "the rubberband program is not installed; install it with: brew install rubberband")

    target = folder / baked_key_name(semitones)
    logs = paths.song_work(song_id) / "logs"
    with tempfile.TemporaryDirectory(prefix="songprep-key-") as scratch_name:
        scratch = Path(scratch_name)
        source_wav, shifted_wav = scratch / "in.wav", scratch / "out.wav"
        run(
            stage,
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(instrumental), "-af", f"volume={PRE_GAIN}", "-c:a", "pcm_f32le", str(source_wav)],
        )
        log(f"shifting the instrumental by {semitones:+d} semitones with Rubber Band R3 ...")
        result = run(stage, rubberband_command(source_wav, shifted_wav, semitones), log=logs / "render-key.log")
        frames = soundfile.info(str(source_wav)).frames
        # Back to the original's level, unless the shifted audio would then clip.
        peak = 0.0
        with soundfile.SoundFile(str(shifted_wav)) as handle:
            for block in handle.blocks(blocksize=1 << 18, dtype="float32"):
                peak = max(peak, float(abs(block).max()) if len(block) else 0.0)
        gain = min(1.0 / PRE_GAIN, 0.999 / max(peak, 1e-9))
        level_db = 20 * math.log10(gain * PRE_GAIN)
        if level_db < -0.05:
            log(f"the shifted instrumental is {-level_db:.1f} dB quieter than the original, to avoid clipping")
        # Same length as the original, to the sample, so the two stay in step.
        staged = folder / f".{target.name}.tmp{os.getpid()}"
        try:
            run(
                stage,
                [
                    "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(shifted_wav),
                    "-af", f"volume={gain:.6f},apad=whole_len={frames},atrim=end_sample={frames}",
                    "-c:a", "flac", "-sample_fmt", "s16", "-map_metadata", "-1", "-f", "flac", str(staged),
                ],  # fmt: skip
            )
            if soundfile.info(str(staged)).frames != frames:
                raise StageError(stage, "the shifted file does not have the original's length")
            os.replace(staged, target)
        finally:
            staged.unlink(missing_ok=True)

    manifest = read_json(manifest_path)
    manifest["bakedKeys"] = baked_keys(folder)
    write_json_atomic(manifest_path, manifest)
    log(f"wrote {target}")
    return {"file": str(target), "bakedKeys": manifest["bakedKeys"], "seconds": round(result.seconds, 1), "levelDb": round(level_db, 2)}
