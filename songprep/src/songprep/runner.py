"""Run external programs, and the heavy tools in their own isolated environments.

audio-separator, whisperx, beat_this and mlx-whisper need different PyTorch
versions, so none of them is a dependency of songprep. Each runs through
`uv tool run`, which builds and caches one environment per tool.
"""

from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

TOOL_PYTHON = "3.12"
# Resolve each tool's dependencies as they were on the day the pipeline was verified.
RESOLVE_BEFORE = "2026-11-15T00:00:00Z"

SEPARATION_MODEL = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
# Overlapping windows per position. The model's own default is 4, which takes twice as long
# (14 min 24 s against 7 min 10 s for a 4 min 22 s song on an M4) for stems that differ by
# -35 dB and a pitch curve that agrees within 20 cents on 99.7% of frames.
SEPARATION_OVERLAP = 2
LEAD_VOCAL_MODEL = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt"
TRANSCRIBE_MODEL = "mlx-community/whisper-large-v3-turbo"
BEAT_MODEL = "final0"


@dataclass(frozen=True)
class Tool:
    name: str
    requirement: str
    command: str
    extra: tuple[str, ...] = ()

    @property
    def version(self) -> str:
        return self.requirement.split("==")[-1]


TOOLS: dict[str, Tool] = {
    # 0.48.0 imports audioread without declaring it, so it is added here.
    "audio-separator": Tool("audio-separator", "audio-separator[cpu]==0.48.0", "audio-separator", ("audioread",)),
    "whisperx": Tool("whisperx", "whisperx==3.8.6", "python"),
    # torchaudio 2.9+ reads files through torchcodec, which beat-this does not install;
    # with soundfile present, beat_this falls back to it.
    "beat_this": Tool("beat_this", "beat-this==1.1.0", "beat_this", ("soundfile",)),
    "mlx-whisper": Tool("mlx-whisper", "mlx-whisper==0.4.3", "mlx_whisper"),
}


class StageError(Exception):
    """A stage failed. Carries the stage name and the exact command, when there was one."""

    def __init__(self, stage: str, message: str, command: list[str] | None = None, log: Path | None = None):
        super().__init__(message)
        self.stage = stage
        self.message = message
        self.command = command
        self.log = log

    def command_text(self) -> str | None:
        return shlex.join(self.command) if self.command else None


def tool_command(tool: str, *args: str | os.PathLike[str]) -> list[str]:
    spec = TOOLS[tool]
    command = ["uv", "tool", "run", "--python", TOOL_PYTHON, "--exclude-newer", RESOLVE_BEFORE, "--from", spec.requirement]
    for extra in spec.extra:
        command += ["--with", extra]
    command.append(spec.command)
    command += [os.fspath(a) for a in args]
    return command


def tool_env(models: Path) -> dict[str, str]:
    """Environment for the tools: keep every model download under one folder."""
    env = dict(os.environ)
    models.mkdir(parents=True, exist_ok=True)
    env["HF_HOME"] = str(models / "huggingface")
    env["TORCH_HOME"] = str(models / "torch")
    env["NLTK_DATA"] = str(models / "nltk_data")
    env["AUDIO_SEPARATOR_MODEL_DIR"] = str(models / "audio-separator")
    env["HF_HUB_DISABLE_TELEMETRY"] = "1"
    env["DO_NOT_TRACK"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    return env


@dataclass
class RunResult:
    command: list[str]
    seconds: float
    output: str = field(repr=False, default="")


def run(
    stage: str,
    command: list[str],
    *,
    log: Path | None = None,
    env: dict[str, str] | None = None,
    cwd: Path | None = None,
) -> RunResult:
    """Run a command; on failure raise StageError with the exact command line."""
    if shutil.which(command[0], path=(env or os.environ).get("PATH")) is None:
        raise StageError(stage, f"{command[0]} was not found on PATH", command)
    started = time.perf_counter()
    try:
        process = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            env=env,
            cwd=cwd,
            stdin=subprocess.DEVNULL,
        )
    except OSError as error:
        raise StageError(stage, f"could not start {command[0]}: {error}", command) from error
    seconds = time.perf_counter() - started
    if log is not None:
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_text(f"$ {shlex.join(command)}\n\n{process.stdout}", encoding="utf-8")
    if process.returncode != 0:
        tail = "\n".join(process.stdout.strip().splitlines()[-15:])
        raise StageError(stage, f"exit code {process.returncode}\n{tail}", command, log)
    return RunResult(command, seconds, process.stdout)


def program_version(command: list[str]) -> str | None:
    """First line of a program's version output, or None when it is not installed."""
    if shutil.which(command[0]) is None:
        return None
    try:
        process = subprocess.run(command, capture_output=True, text=True, errors="replace", timeout=120, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired):
        return None
    text = (process.stdout or process.stderr).strip()
    return text.splitlines()[0] if text else None
