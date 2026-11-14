"""Checks that start the real tools. Slow, and the first run downloads environments and models.

    uv run pytest -m integration
"""

from __future__ import annotations

import shutil
import subprocess

import numpy as np
import pytest
import soundfile

from songprep import beats
from songprep.paths import default_paths
from songprep.runner import TOOLS, tool_command, tool_env

pytestmark = [pytest.mark.integration, pytest.mark.skipif(shutil.which("uv") is None, reason="uv is not installed")]


@pytest.mark.parametrize(
    "tool, args",
    [
        ("audio-separator", ["--version"]),
        ("whisperx", ["-c", "import whisperx.alignment, torchaudio; assert hasattr(torchaudio.functional, 'forced_align')"]),
        ("beat_this", ["--help"]),
        ("mlx-whisper", ["--help"]),
    ],
)
def test_tool_environment_starts(tool, args):
    process = subprocess.run(tool_command(tool, *args), capture_output=True, text=True, env=tool_env(default_paths().models), timeout=1800)
    assert process.returncode == 0, f"{TOOLS[tool].requirement}: {process.stderr[-400:]}"


def test_beat_this_finds_a_click_track(tmp_path):
    rate, bpm, seconds = 44100, 100.0, 30
    signal = np.zeros(rate * seconds, dtype=np.float32)
    click = (0.6 * np.sin(2 * np.pi * 1000 * np.arange(882) / rate) * np.hanning(882)).astype(np.float32)
    for i in range(int(seconds * bpm / 60)):
        start = int(i * 60 / bpm * rate)
        signal[start : start + 882] += click * (1.0 if i % 4 == 0 else 0.6)
    wav = tmp_path / "clicks.wav"
    soundfile.write(str(wav), signal, rate, subtype="PCM_16")
    out = tmp_path / "clicks.beats"
    process = subprocess.run(beats.beat_command(wav, out), capture_output=True, text=True, env=tool_env(default_paths().models), timeout=1800)
    assert process.returncode == 0, process.stderr[-400:]
    built = beats.build_beats(out.read_text())
    assert built["bpm"] == pytest.approx(bpm, abs=1.0)
    assert len(built["beats"]) >= 40
