# /// script
# requires-python = ">=3.10"
# dependencies = ["swift-f0[audio]", "numpy"]
# ///
"""Print SwiftF0 statistics for held-note clips saved from the audio lab.

Usage: uv run tools/f0_compare.py clip1.wav [clip2.wav ...]
"""
import sys

import numpy as np
from swift_f0 import SwiftF0


def summarize(detector: SwiftF0, path: str) -> str:
    result = detector.detect_file(path, fmin=55, fmax=700)
    voiced = result.confidence >= 0.5
    frames = len(result.pitch_hz)
    if not voiced.any():
        return f"{path}: {frames} frames, none voiced"
    hz = result.pitch_hz[voiced]
    median_hz = float(np.median(hz))
    cents = 1200 * np.log2(hz / median_hz)
    octave = (np.abs(cents) >= 1100) & (np.abs(cents) <= 1300)
    near = cents[np.abs(cents) < 600]
    spread = float(np.percentile(near, 90) - np.percentile(near, 10))
    return (
        f"{path}: {frames} frames, voiced {100 * voiced.mean():.1f}%, "
        f"median {median_hz:.2f} Hz, octave errors {100 * octave.mean():.2f}% of voiced, "
        f"spread {spread:.1f} cents"
    )


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    detector = SwiftF0()
    for path in sys.argv[1:]:
        print(summarize(detector, path))


if __name__ == "__main__":
    main()
