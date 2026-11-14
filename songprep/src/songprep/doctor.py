"""`songprep doctor`: check the programs, tool environments, models and disk space."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable

from .paths import Paths
from .runner import (
    BEAT_MODEL,
    LEAD_VOCAL_MODEL,
    SEPARATION_MODEL,
    TOOLS,
    TRANSCRIBE_MODEL,
    program_version,
    tool_command,
    tool_env,
)

OK, WARN, FAIL = "ok", "warn", "FAIL"
MIN_FREE_GB = 10.0


def folder_bytes(folder: Path) -> int:
    total = 0
    if folder.is_dir():
        for root, _dirs, files in os.walk(folder):
            for name in files:
                try:
                    total += os.lstat(os.path.join(root, name)).st_size
                except OSError:
                    pass
    return total


def _size(count: int) -> str:
    return f"{count / 1e9:.2f} GB" if count >= 1e9 else f"{count / 1e6:.0f} MB"


def _find(folder: Path, pattern: str) -> Path | None:
    return next(iter(sorted(folder.rglob(pattern))), None) if folder.is_dir() else None


def run_doctor(paths: Paths, log: Callable[[str], None] = print, check_tools: bool = True) -> int:
    rows: list[tuple[str, str, str]] = []

    def add(status: str, name: str, detail: str) -> None:
        rows.append((status, name, detail))
        log(f"  [{status:>4}] {name}: {detail}")

    log("Programs")
    version = sys.version_info
    add(OK if version[:2] == (3, 12) else WARN, "python", f"{version.major}.{version.minor}.{version.micro} (pinned: 3.12)")
    uv = program_version(["uv", "--version"])
    add(OK if uv else FAIL, "uv", uv or "not found; install with: brew install uv")
    ffmpeg = program_version(["ffmpeg", "-version"])
    add(OK if ffmpeg else FAIL, "ffmpeg", (ffmpeg or "not found; install with: brew install ffmpeg")[:60])
    rubberband = program_version(["rubberband", "--version"])
    add(OK if rubberband else WARN, "rubberband", rubberband or "not found; only render-key needs it (brew install rubberband)")

    log("Pitch tracker (inside songprep)")
    try:
        import numpy as np
        from importlib.metadata import version as package_version

        from .pitch import track_pitch

        t = np.arange(16000) / 16000.0
        f0 = track_pitch((0.3 * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32), 16000)
        voiced = [hz for hz in f0["hz"] if hz > 0]
        median = float(np.median(voiced)) if voiced else 0.0
        good = abs(median - 220.0) < 3.0
        add(OK if good else FAIL, "swift-f0", f"{package_version('swift-f0')}; a 220 Hz test tone reads {median:.1f} Hz")
    except Exception as error:  # noqa: BLE001
        add(FAIL, "swift-f0", f"{type(error).__name__}: {error}")

    log("Tool environments (built on first use; each is isolated)")
    if check_tools and uv:
        env = tool_env(paths.models)
        probes = {
            "audio-separator": ["--version"],
            "whisperx": ["-c", "import whisperx, torch; print('whisperx ok, torch', torch.__version__)"],
            "beat_this": ["--help"],
            "mlx-whisper": ["--help"],
        }
        for name, args in probes.items():
            command = tool_command(name, *args)
            started = time.perf_counter()
            try:
                process = subprocess.run(command, capture_output=True, text=True, errors="replace", env=env, timeout=1800, stdin=subprocess.DEVNULL)
                seconds = time.perf_counter() - started
                lines = (process.stdout or "").strip().splitlines()
                first = lines[-1][:50] if name in ("audio-separator", "whisperx") and lines else "starts"
                if process.returncode == 0:
                    add(OK, name, f"{TOOLS[name].requirement} ({first}; {seconds:.0f} s)")
                else:
                    tail = (process.stderr or process.stdout or "").strip().splitlines()[-1:]
                    add(FAIL, name, f"exit {process.returncode}: {' '.join(tail)[:120]}")
            except (OSError, subprocess.TimeoutExpired) as error:
                add(FAIL, name, f"{type(error).__name__}: {error}")
    else:
        add(WARN, "tools", "not checked")

    log(f"Models in {paths.models} (downloaded on first use)")
    separator = paths.models / "audio-separator"
    for label, filename, needed in (
        ("separation model", SEPARATION_MODEL, "import"),
        ("lead-vocal model", LEAD_VOCAL_MODEL, "--lead-only"),
    ):
        path = separator / filename
        if path.is_file():
            add(OK, label, f"{filename} ({_size(path.stat().st_size)})")
        else:
            add(WARN, label, f"{filename} not downloaded yet (needed for {needed})")
    wav2vec = _find(paths.models / "torch", "wav2vec2*")
    add(OK if wav2vec else WARN, "alignment model", f"{wav2vec.name} ({_size(wav2vec.stat().st_size)})" if wav2vec else "not downloaded yet (English wav2vec2, about 360 MB)")
    beat = _find(paths.models / "torch", f"*{BEAT_MODEL}*")
    add(OK if beat else WARN, "beat model", f"{beat.name} ({_size(beat.stat().st_size)})" if beat else "not downloaded yet (about 80 MB)")
    whisper = paths.models / "huggingface" / "hub" / ("models--" + TRANSCRIBE_MODEL.replace("/", "--"))
    if whisper.is_dir():
        add(OK, "transcription model", f"{TRANSCRIBE_MODEL} ({_size(folder_bytes(whisper))})")
    else:
        add(WARN, "transcription model", f"{TRANSCRIBE_MODEL} not downloaded yet (about 1.6 GB; only used when no lyrics are found)")
    add(OK, "models total", _size(folder_bytes(paths.models)))

    log("Folders and disk")
    for label, folder in (("songs", paths.songs), ("work", paths.work)):
        try:
            folder.mkdir(parents=True, exist_ok=True)
            probe = folder / f".doctor-{os.getpid()}"
            probe.write_text("ok")
            probe.unlink()
            add(OK, f"{label} folder", f"{folder} ({_size(folder_bytes(folder))})")
        except OSError as error:
            add(FAIL, f"{label} folder", f"{folder}: {error}")
    free_gb = shutil.disk_usage(paths.root if paths.root.exists() else Path.home()).free / 1e9
    add(OK if free_gb >= MIN_FREE_GB else WARN, "free disk space", f"{free_gb:.0f} GB (a first run downloads about 8 GB of tools and models; each song uses about 0.2 GB)")

    failures = [name for status, name, _ in rows if status == FAIL]
    warnings = [name for status, name, _ in rows if status == WARN]
    if failures:
        log(f"\n{len(failures)} problem(s): {', '.join(failures)}")
        return 1
    log(f"\nReady. {len(warnings)} note(s)." if warnings else "\nReady.")
    return 0
