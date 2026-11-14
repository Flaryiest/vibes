"""Stage 5: the original singer's pitch curve, tracked with SwiftF0.

SwiftF0 returns one pitch and one confidence per 16 ms frame; frame `i` is
centered on time `i * hopS`. A frame is voiced when its confidence is at least
0.5. In `f0.json`, `hz` is 0 for unvoiced frames.
"""

from __future__ import annotations

from typing import TypedDict

import numpy as np

CONFIDENCE_VOICED = 0.5
# Wide enough for any lead vocal: C2 to C6.
DEFAULT_FMIN = 65.0
DEFAULT_FMAX = 1050.0


class F0(TypedDict):
    hopS: float
    hz: list[float]
    conf: list[float]


def track_pitch(audio: np.ndarray, sample_rate: int, fmin: float = DEFAULT_FMIN, fmax: float = DEFAULT_FMAX) -> F0:
    from swift_f0 import SwiftF0

    result = SwiftF0().detect(audio, sample_rate, fmin=fmin, fmax=fmax)
    hop = float(result.timestamps[1] - result.timestamps[0]) if len(result.timestamps) > 1 else 0.016
    if len(result.timestamps) and abs(float(result.timestamps[0])) > 1e-9:
        raise RuntimeError("SwiftF0 timestamps no longer start at 0; f0.json assumes frame i is at i * hopS")
    voiced = (result.confidence >= CONFIDENCE_VOICED) & (result.pitch_hz > 0)
    hz = np.where(voiced, result.pitch_hz, 0.0)
    return {
        "hopS": round(hop, 6),
        "hz": [round(float(v), 2) for v in hz],
        "conf": [round(float(v), 3) for v in result.confidence],
    }


def track_pitch_file(path: str, fmin: float = DEFAULT_FMIN, fmax: float = DEFAULT_FMAX) -> F0:
    import soundfile

    audio, rate = soundfile.read(path, dtype="float32", always_2d=True)
    return track_pitch(audio, rate, fmin, fmax)


def hz_to_midi(hz: np.ndarray) -> np.ndarray:
    """MIDI note number as a float; NaN where hz is 0."""
    hz = np.asarray(hz, dtype=np.float64)
    out = np.full(hz.shape, np.nan)
    positive = hz > 0
    out[positive] = 69.0 + 12.0 * np.log2(hz[positive] / 440.0)
    return out


def midi_to_hz(midi: float) -> float:
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)
