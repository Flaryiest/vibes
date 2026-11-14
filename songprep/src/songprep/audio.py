"""Decoding with ffmpeg, reading audio, and the waveform overview."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile

from .runner import RunResult, run

SAMPLE_RATE = 44100
F0_SAMPLE_RATE = 16000


def decode_command(source: Path, dest: Path) -> list[str]:
    """Stage 1: any input format to 44.1 kHz stereo 16-bit WAV."""
    return [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source),
        "-map", "0:a:0", "-vn", "-ac", "2", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le",
        "-map_metadata", "-1", "-bitexact",
        str(dest),
    ]  # fmt: skip


def decode(source: Path, dest: Path, log: Path | None = None) -> RunResult:
    return run("decode", decode_command(source, dest), log=log)


def mono16k_command(source: Path, dest: Path) -> list[str]:
    """The pitch tracker's input: 16 kHz mono."""
    return [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source),
        "-ac", "1", "-ar", str(F0_SAMPLE_RATE), "-c:a", "pcm_s16le", "-map_metadata", "-1", "-bitexact",
        str(dest),
    ]  # fmt: skip


def duration_s(path: Path) -> float:
    info = soundfile.info(str(path))
    return info.frames / info.samplerate


def read_mono(path: Path) -> tuple[np.ndarray, int]:
    """Read a file as float32 mono."""
    data, rate = soundfile.read(str(path), dtype="float32", always_2d=True)
    return data.mean(axis=1), rate


def peaks(path: Path, hop_s: float = 0.02) -> dict[str, list[float]]:
    """Minimum and maximum of the mono signal in each `hop_s` window, for drawing a waveform."""
    mono, rate = read_mono(path)
    hop = max(1, int(round(hop_s * rate)))
    count = len(mono) // hop
    if count == 0:
        return {"min": [], "max": []}
    blocks = mono[: count * hop].reshape(count, hop)
    return {
        "min": [round(float(v), 3) for v in blocks.min(axis=1)],
        "max": [round(float(v), 3) for v in blocks.max(axis=1)],
    }


def rms_envelope(mono: np.ndarray, rate: int, hop_s: float = 0.02) -> np.ndarray:
    """RMS level of each `hop_s` window."""
    hop = max(1, int(round(hop_s * rate)))
    count = len(mono) // hop
    if count == 0:
        return np.zeros(0)
    blocks = mono[: count * hop].reshape(count, hop).astype(np.float64)
    return np.sqrt((blocks**2).mean(axis=1))


def stem_gains(mix: np.ndarray, vocals: np.ndarray, instrumental: np.ndarray, block: int = 1 << 20) -> tuple[float, float, float]:
    """Least-squares `a`, `b` with mix = a * vocals + b * instrumental, and the fit's SNR in dB."""
    gram = np.zeros((2, 2))
    right = np.zeros(2)
    energy = 0.0
    length = min(len(mix), len(vocals), len(instrumental))
    for start in range(0, length, block):
        m = mix[start : start + block].astype(np.float64).ravel()
        v = vocals[start : start + block].astype(np.float64).ravel()
        i = instrumental[start : start + block].astype(np.float64).ravel()
        gram += [[v @ v, v @ i], [v @ i, i @ i]]
        right += [v @ m, i @ m]
        energy += m @ m
    if energy <= 0 or abs(np.linalg.det(gram)) < 1e-12:
        return 1.0, 1.0, 0.0
    a, b = np.linalg.solve(gram, right)
    residual = energy - 2 * (a * right[0] + b * right[1]) + a * a * gram[0, 0] + 2 * a * b * gram[0, 1] + b * b * gram[1, 1]
    snr = 10 * np.log10(energy / max(residual, energy * 1e-12))
    return float(a), float(b), float(snr)


def match_stem_levels(source_wav: Path, vocals: Path, instrumental: Path, headroom: float = 0.85) -> dict[str, float | bool]:
    """Put both stems back on one scale, so that vocals + instrumental is the mix again.

    audio-separator peak-normalizes each stem on its own, which changes their
    balance (2 dB on the test song). The gain of each stem inside the mix is
    recovered by least squares; both stems are then rewritten at those gains
    times one common factor that keeps the louder one's peak at `headroom`
    (1.4 dB under full scale, which leaves room for a key-shifted copy).
    """
    mix, rate = soundfile.read(str(source_wav), dtype="float32", always_2d=True)
    voc, rate_v = soundfile.read(str(vocals), dtype="float32", always_2d=True)
    ins, rate_i = soundfile.read(str(instrumental), dtype="float32", always_2d=True)
    info: dict[str, float | bool] = {"matched": False}
    if not (rate == rate_v == rate_i) or voc.shape != ins.shape or voc.shape[1] != mix.shape[1] or abs(len(voc) - len(mix)) > rate // 10:
        return info
    a, b, snr = stem_gains(mix, voc, ins)
    info.update({"fitSnrDb": round(snr, 1), "vocalsInMix": round(a, 4), "instrumentalInMix": round(b, 4)})
    # A poor fit means the stems are not a plain split of the mix; leave them alone.
    if snr < 30.0 or a <= 0 or b <= 0:
        return info
    if abs(a - 1.0) < 1e-3 and abs(b - 1.0) < 1e-3:
        info.update({"vocalsGain": 1.0, "instrumentalGain": 1.0, "mixGain": 1.0, "matched": True})
        return info
    peak = max(a * float(np.abs(voc).max()), b * float(np.abs(ins).max()), 1e-9)
    common = min(1.0, headroom / peak)
    gain_v, gain_i = a * common, b * common
    info.update({"vocalsGain": round(gain_v, 4), "instrumentalGain": round(gain_i, 4), "mixGain": round(common, 4)})
    for path, data, gain in ((vocals, voc, gain_v), (instrumental, ins, gain_i)):
        staged = path.with_name(f".{path.name}.tmp")
        soundfile.write(str(staged), data * np.float32(gain), rate, format="FLAC", subtype="PCM_16")
        staged.replace(path)
    info["matched"] = True
    return info
