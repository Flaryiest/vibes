"""Stage 7: beats and downbeats from `beat_this`, with a tempo sanity check."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from .runner import BEAT_MODEL, RunResult, run, tool_command

BPM_LOW = 70.0
BPM_HIGH = 180.0


def beat_command(audio: Path, output: Path) -> list[str]:
    # --gpu -1: CPU. The flag only selects a CUDA device, and CPU takes a few seconds per song.
    return tool_command("beat_this", audio, "--output", output, "--model", BEAT_MODEL, "--gpu", "-1")


def track_beats(audio: Path, output: Path, env: dict[str, str], log: Path | None = None) -> RunResult:
    return run("beats", beat_command(audio, output), env=env, log=log)


def parse_beats(text: str) -> tuple[list[float], list[float]]:
    """Read a `.beats` file: one `time<TAB>position-in-bar` per line; position 1 is a downbeat."""
    beats: list[float] = []
    downbeats: list[float] = []
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        time = float(parts[0])
        beats.append(time)
        if len(parts) > 1 and int(float(parts[1])) == 1:
            downbeats.append(time)
    return beats, downbeats


def bpm_of(beats: list[float]) -> float:
    if len(beats) < 2:
        return 0.0
    interval = float(np.median(np.diff(np.asarray(beats, dtype=np.float64))))
    return 60.0 / interval if interval > 0 else 0.0


def fit_tempo_prior(beats: list[float], downbeats: list[float]) -> tuple[list[float], list[float], str]:
    """Half- and double-tempo check against a 70-180 BPM prior (spec section 4.5).

    A grid slower than 70 BPM gets a beat added halfway between each pair; a grid
    faster than 180 BPM keeps every second beat, chosen so downbeats stay on the
    grid. Returns the grid and what was done: "none", "doubled" or "halved".
    """
    bpm = bpm_of(beats)
    if bpm <= 0:
        return beats, downbeats, "none"
    # 1% slack: beat times are rounded, so a 180 BPM grid can read as 180.2.
    if bpm < BPM_LOW * 0.99 and bpm * 2 <= BPM_HIGH * 1.01:
        doubled: list[float] = []
        for a, b in zip(beats, beats[1:]):
            doubled += [a, (a + b) / 2.0]
        doubled.append(beats[-1])
        return doubled, downbeats, "doubled"
    if bpm > BPM_HIGH * 1.01 and bpm / 2 >= BPM_LOW * 0.99:
        down = set(downbeats)
        offsets = [sum(1 for t in beats[o::2] if t in down) for o in (0, 1)]
        offset = 0 if offsets[0] >= offsets[1] else 1
        kept = beats[offset::2]
        kept_set = set(kept)
        return kept, [t for t in downbeats if t in kept_set], "halved"
    return beats, downbeats, "none"


def regularize_grid(beats: list[float], downbeats: list[float], tolerance: float = 0.1) -> tuple[list[float], list[float], dict[str, int]]:
    """Bring the whole grid to one metrical level.

    A tracker can follow the beat in one section and the half-beat in another
    (on the test song: 0.70 s steps for the first 100 s, 0.35 s after). The
    commonest step wins. A step two, three or four times as long gets evenly
    spaced beats added inside it; two neighboring half-length steps are joined,
    unless the beat between them is a downbeat. Bars are then brought to the
    commonest length by adding downbeats inside bars that are a multiple of it.
    """
    counts = {"beatsAdded": 0, "beatsRemoved": 0, "downbeatsAdded": 0}
    if len(beats) < 8:
        return beats, downbeats, counts
    steps = np.diff(np.asarray(beats, dtype=np.float64))
    typical = float(np.median(steps))
    if typical <= 0:
        return beats, downbeats, counts
    down = set(downbeats)
    out = [beats[0]]
    i = 0
    while i < len(steps):
        ratio = steps[i] / typical
        multiple = int(round(ratio))
        if 2 <= multiple <= 4 and abs(ratio - multiple) <= tolerance * multiple:
            for k in range(1, multiple):
                out.append(beats[i] + steps[i] * k / multiple)
            counts["beatsAdded"] += multiple - 1
            out.append(beats[i + 1])
            i += 1
        elif (
            i + 1 < len(steps)
            and abs(ratio - 0.5) <= tolerance
            and abs(steps[i + 1] / typical - 0.5) <= tolerance
            and beats[i + 1] not in down
        ):
            counts["beatsRemoved"] += 1
            out.append(beats[i + 2])
            i += 2
        else:
            out.append(beats[i + 1])
            i += 1

    kept = set(out)
    bars = sorted(t for t in down if t in kept)
    if len(bars) >= 3:
        index = {t: n for n, t in enumerate(out)}
        lengths = [index[b] - index[a] for a, b in zip(bars, bars[1:])]
        usual = max(set(lengths), key=lengths.count)
        if usual >= 2:
            filled = [bars[0]]
            for a, b, length in zip(bars, bars[1:], lengths):
                if length > usual and length % usual == 0:
                    for n in range(index[a] + usual, index[b], usual):
                        filled.append(out[n])
                        counts["downbeatsAdded"] += 1
                filled.append(b)
            bars = filled
    return out, bars, counts


def build_beats(raw_text: str) -> dict[str, Any]:
    """`beats.json` content plus the tempo and the adjustments made."""
    beats, downbeats = parse_beats(raw_text)
    raw_bpm = bpm_of(beats)
    beats, downbeats, regular = regularize_grid(beats, downbeats)
    beats, downbeats, adjusted = fit_tempo_prior(beats, downbeats)
    steps = np.diff(np.asarray(beats, dtype=np.float64)) if len(beats) > 1 else np.zeros(0)
    typical = float(np.median(steps)) if len(steps) else 0.0
    even = float(np.mean(np.abs(steps - typical) <= 0.1 * typical)) if typical > 0 else 0.0
    return {
        "beats": [round(t, 3) for t in beats],
        "downbeats": [round(t, 3) for t in downbeats],
        "bpm": round(bpm_of(beats), 1),
        "trackerBpm": round(raw_bpm, 1),
        "tempoAdjusted": adjusted,
        "regularized": regular,
        "evenShare": round(even, 3),
    }
