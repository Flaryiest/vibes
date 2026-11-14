"""Stage 6: turn the pitch curve and the word timings into notes (spec section 4.4).

1. Median-filter the pitch curve over 60 ms; ignore frames with confidence under 0.5.
2. Inside each aligned word, start with one note at the confidence-weighted median pitch.
3. Split a word when the smoothed pitch moves more than 0.8 semitones and stays there
   for at least 110 ms.
4. Merge neighbors with the same rounded pitch separated by less than 70 ms; absorb
   fragments shorter than 90 ms into the longer neighbor; a slide into a note is part
   of that note. Inside one unbroken stretch of voicing a fragment between two notes
   is always the way into the second, so that is where it goes. The fall at the end
   of a word is treated the same way and stays with the note it falls from.
5. Octave check: a note more than 9 semitones from the running median of its neighbors
   is tested one octave up and down. It is moved when the audio's harmonics say so, or
   when it runs straight into a note it would then match; a real octave leap stays.
6. Round to a whole MIDI pitch and keep the remainder in `cents`.
7. Phrase boundaries: lyric line breaks, plus any gap between notes longer than 0.5 s.

Notes are not snapped to a key.

Word end times from a speech aligner are unreliable on held notes, so a word's
notes run from its aligned start for as long as the voice keeps sounding, up to
the next word's start.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Sequence

import numpy as np

from .pitch import hz_to_midi, midi_to_hz


@dataclass(frozen=True)
class NoteParams:
    confidence: float = 0.5
    median_ms: float = 60.0
    split_semitones: float = 0.8
    split_hold_ms: float = 110.0
    merge_gap_ms: float = 70.0
    min_note_ms: float = 90.0
    octave_flag_semitones: float = 9.0
    phrase_gap_s: float = 0.5
    # Voicing that begins up to this long before a word's aligned start belongs to the word.
    onset_snap_ms: float = 150.0
    # After a word's aligned end, the voice may pause this long and still be the same word.
    tail_gap_ms: float = 100.0
    # Past a word's aligned end, a jump this large is another sound (an instrument or a
    # backing voice left in the stem), not the same word.
    tail_leap_semitones: float = 9.0
    # A short piece whose pitch moves this far toward the next note is a slide into it.
    slide_semitones: float = 0.6
    slide_max_ms: float = 250.0
    # A short last piece of a word that spent a third of its time (and at least 45 ms) gliding
    # is the fall at the end of the note before it.
    fall_glide_fraction: float = 1 / 3
    fall_min_glide_ms: float = 45.0
    # A word whose only voiced stretch is shorter than this gets no note.
    min_only_note_ms: float = 45.0


@dataclass
class Segment:
    """A run of frames at one pitch. `core` holds the frames that define the pitch."""

    frames: list[int]
    core: list[int]
    pitch: float = math.nan
    word: int = -1

    @property
    def first(self) -> int:
        return self.frames[0]

    @property
    def last(self) -> int:
        return self.frames[-1]

    def __len__(self) -> int:
        return self.last - self.first + 1


@dataclass
class NoteStats:
    words: int = 0
    words_without_notes: int = 0
    octave_flagged: int = 0
    octave_corrected: int = 0
    notes: int = 0
    details: dict[str, Any] = field(default_factory=dict)


def weighted_median(values: np.ndarray, weights: np.ndarray) -> float:
    order = np.argsort(values, kind="stable")
    values, weights = np.asarray(values, dtype=np.float64)[order], np.asarray(weights, dtype=np.float64)[order]
    total = weights.sum()
    if total <= 0:
        return float(np.median(values))
    index = int(np.searchsorted(np.cumsum(weights), total / 2.0))
    return float(values[min(index, len(values) - 1)])


def median_frames(median_ms: float, hop_s: float) -> int:
    """Odd number of frames whose span is closest to `median_ms`."""
    frames = int(round(median_ms / 1000.0 / hop_s))
    if frames % 2 == 0:
        frames += 1
    return max(1, frames)


def smooth_pitch(midi: np.ndarray, frames: int) -> np.ndarray:
    """Running median over `frames` frames, using voiced frames only. NaN stays NaN."""
    if frames <= 1 or len(midi) == 0:
        return midi.copy()
    half = frames // 2
    padded = np.concatenate([np.full(half, np.nan), midi, np.full(half, np.nan)])
    windows = np.lib.stride_tricks.sliding_window_view(padded, frames)
    voiced = ~np.isnan(midi)
    out = np.full(midi.shape, np.nan)
    if voiced.any():
        out[voiced] = np.nanmedian(windows[voiced], axis=1)
    return out


def assign_frames(
    words: Sequence[tuple[float, float]], smooth: np.ndarray, hop_s: float, params: NoteParams
) -> list[list[int]]:
    """Voiced frame indices belonging to each word. `words` are (start, end), sorted by start.

    A word takes the voiced frames from its aligned start up to the next word's
    start. Past its aligned end it only keeps going while the voice keeps
    sounding: it stops at a pause of `tail_gap_ms`, or at a pitch jump of more
    than `tail_leap_semitones`.
    """
    voiced = ~np.isnan(smooth)
    count = len(voiced)
    snap = int(round(params.onset_snap_ms / 1000.0 / hop_s))
    tail_gap = max(1, int(round(params.tail_gap_ms / 1000.0 / hop_s)))
    claimed = -1
    result: list[list[int]] = []
    for k, (t0, t1) in enumerate(words):
        first = max(int(math.ceil(t0 / hop_s - 1e-9)), claimed + 1)
        limit = count if k + 1 == len(words) else min(count, int(math.ceil(words[k + 1][0] / hop_s - 1e-9)))
        aligned_end = int(math.ceil(t1 / hop_s - 1e-9))
        start = first
        if start < count and voiced[start]:
            while start - 1 > claimed and voiced[start - 1] and first - (start - 1) <= snap:
                start -= 1
        frames: list[int] = []
        gap = 0
        for i in range(start, limit):
            if voiced[i]:
                if frames and i >= aligned_end and abs(smooth[i] - smooth[frames[-1]]) > params.tail_leap_semitones:
                    break
                frames.append(i)
                gap = 0
            else:
                gap += 1
                if i >= aligned_end and gap >= tail_gap:
                    break
        if frames:
            claimed = frames[-1]
        result.append(frames)
    return result


def _hysteresis(frames: list[int], smooth: np.ndarray, threshold: float, hold: int) -> list[Segment]:
    """Step 3 on one stretch of voicing.

    The current note keeps frames within `threshold` of its level. Frames outside
    wait as candidates; once the last `hold` candidates sit together at a new
    level, a new note starts where the pitch left the old one, so the slide
    between the two belongs to the new note.
    """
    segments: list[Segment] = []
    current, core, candidates = [frames[0]], [frames[0]], []
    for frame in frames[1:]:
        level = float(np.median(smooth[core]))
        if abs(smooth[frame] - level) <= threshold:
            current.extend(candidates)
            candidates = []
            current.append(frame)
            core.append(frame)
            continue
        candidates.append(frame)
        if len(candidates) >= hold:
            tail = candidates[-hold:]
            new_level = float(np.median(smooth[tail]))
            if abs(new_level - level) > threshold and np.all(np.abs(smooth[tail] - new_level) <= threshold):
                segments.append(Segment(current, core))
                current, core, candidates = candidates, list(tail), []
    current.extend(candidates)
    segments.append(Segment(current, core))
    return segments


def _gap_s(a: Segment, b: Segment, hop_s: float) -> float:
    """Silence between two segments, in seconds."""
    return (b.first - a.last - 1) * hop_s


def _set_pitch(segment: Segment, midi: np.ndarray, conf: np.ndarray) -> None:
    core = np.asarray(segment.core)
    segment.pitch = weighted_median(midi[core], conf[core])


def _is_slide_into_next(segment: Segment, following: Segment, smooth: np.ndarray, hop_s: float, params: NoteParams) -> bool:
    """A short piece whose own level keeps moving toward the next note."""
    if len(segment) * hop_s >= params.slide_max_ms / 1000.0 or len(segment.core) < 3:
        return False
    x = np.asarray(segment.core, dtype=np.float64)
    slope = float(np.polyfit(x, smooth[segment.core], 1)[0])
    travel = slope * (x[-1] - x[0])
    toward = following.pitch - segment.pitch
    return abs(travel) >= params.slide_semitones and travel * toward > 0


def _is_fall_from_previous(segment: Segment, hop_s: float, params: NoteParams) -> bool:
    """A short last piece that spent much of its time gliding there: the voice falling away."""
    if len(segment) * hop_s >= params.slide_max_ms / 1000.0:
        return False
    gliding = len(segment.frames) - len(segment.core)
    return gliding * hop_s >= params.fall_min_glide_ms / 1000.0 and gliding >= params.fall_glide_fraction * len(segment.frames)


def segment_word(
    frames: list[int], midi: np.ndarray, smooth: np.ndarray, conf: np.ndarray, hop_s: float, params: NoteParams
) -> list[Segment]:
    """Steps 2 to 4 for one word: its voiced frames to a list of notes."""
    if not frames:
        return []
    hold = max(2, int(math.ceil(params.split_hold_ms / 1000.0 / hop_s - 1e-9)))
    merge_gap = params.merge_gap_ms / 1000.0
    min_note = params.min_note_ms / 1000.0

    # A pause of 70 ms or more always separates notes.
    stretches: list[list[int]] = [[frames[0]]]
    for previous, frame in zip(frames, frames[1:]):
        if (frame - previous - 1) * hop_s >= merge_gap:
            stretches.append([])
        stretches[-1].append(frame)

    segments: list[Segment] = []
    for stretch in stretches:
        segments.extend(_hysteresis(stretch, smooth, params.split_semitones, hold))
    for segment in segments:
        _set_pitch(segment, midi, conf)

    def join(target: Segment, other: Segment, *, pitch_from_both: bool) -> None:
        target.frames = sorted(target.frames + other.frames)
        if pitch_from_both:
            target.core = sorted(target.core + other.core)
            _set_pitch(target, midi, conf)

    changed = True
    fall_taken = False
    while changed and len(segments) > 1:
        changed = False
        # A slide into a note is part of that note.
        for i in range(len(segments) - 1):
            a, b = segments[i], segments[i + 1]
            if _gap_s(a, b, hop_s) < merge_gap and _is_slide_into_next(a, b, smooth, hop_s, params):
                join(b, a, pitch_from_both=False)
                del segments[i]
                changed = True
                break
        if changed:
            continue
        # The fall at the end of a word is part of the note before it. Once only: the note
        # that took the fall must not then look like a fall itself.
        if not fall_taken and _gap_s(segments[-2], segments[-1], hop_s) < merge_gap and _is_fall_from_previous(segments[-1], hop_s, params):
            join(segments[-2], segments[-1], pitch_from_both=False)
            del segments[-1]
            changed = fall_taken = True
            continue
        # Same rounded pitch, separated by less than 70 ms.
        for i in range(len(segments) - 1):
            a, b = segments[i], segments[i + 1]
            if _gap_s(a, b, hop_s) < merge_gap and round_midi(a.pitch) == round_midi(b.pitch):
                join(a, b, pitch_from_both=True)
                del segments[i + 1]
                changed = True
                break
        if changed:
            continue
        # Fragments shorter than 90 ms go to the longer neighbor.
        for i, segment in enumerate(segments):
            if len(segment) * hop_s >= min_note:
                continue
            neighbors = []
            if i > 0 and _gap_s(segments[i - 1], segment, hop_s) < merge_gap:
                neighbors.append(segments[i - 1])
            if i + 1 < len(segments) and _gap_s(segment, segments[i + 1], hop_s) < merge_gap:
                neighbors.append(segments[i + 1])
            if neighbors:
                join(max(neighbors, key=len), segment, pitch_from_both=False)
            del segments[i]  # with no neighbor it is a stray blip in a word that has real notes
            changed = True
            break

    if len(segments) == 1 and len(segments[0]) * hop_s < params.min_only_note_ms / 1000.0:
        return []
    return segments


def round_midi(pitch: float) -> int:
    return int(math.floor(pitch + 0.5))


def _band_peak(power: np.ndarray, freqs_step: float, hz: float, cents: float = 40.0) -> float:
    low = int(math.floor(hz * 2 ** (-cents / 1200.0) / freqs_step))
    high = int(math.ceil(hz * 2 ** (cents / 1200.0) / freqs_step))
    low, high = max(low, 1), min(high, len(power) - 1)
    return float(power[low : high + 1].max()) if high >= low else 0.0


def octave_evidence(audio: np.ndarray, sample_rate: int, start_s: float, end_s: float, midi: float) -> dict[str, float] | None:
    """How the spectrum of a note fits its pitch, an octave down and an octave up.

    `half` is the share of energy at odd multiples of half the pitch: near zero
    when the pitch is right, large when the true pitch is an octave lower.
    `odd` is the share of energy in the odd harmonics: near zero when the true
    pitch is an octave higher.
    """
    length = end_s - start_s
    middle = (start_s + end_s) / 2.0
    half_span = min(length * 0.4, 0.3)
    a, b = int((middle - half_span) * sample_rate), int((middle + half_span) * sample_rate)
    a, b = max(a, 0), min(b, len(audio))
    if b - a < int(0.048 * sample_rate):
        return None
    piece = np.asarray(audio[a:b], dtype=np.float64)
    piece = (piece - piece.mean()) * np.hanning(len(piece))
    size = 1 << int(math.ceil(math.log2(len(piece) * 4)))
    power = np.abs(np.fft.rfft(piece, size)) ** 2
    step = sample_rate / size
    hz = midi_to_hz(midi)
    top = min(4000.0, sample_rate * 0.45)
    harmonics = [m for m in range(1, 64) if m * hz <= top]
    odd = sum(_band_peak(power, step, m * hz) for m in harmonics if m % 2 == 1)
    even = sum(_band_peak(power, step, m * hz) for m in harmonics if m % 2 == 0)
    half = sum(_band_peak(power, step, k * hz / 2.0) for k in range(1, 16, 2) if k * hz / 2.0 <= top)
    whole = odd + even
    if whole <= 0:
        return None
    return {"half": half / (half + whole), "odd": odd / whole if even > 0 else 1.0}


def _touching_octave(segments: list[Segment], index: int, shift: float, hop_s: float, params: NoteParams) -> bool:
    """True when a note sits about an octave from a note it runs straight into or out of.

    A voice cannot jump an octave with no gap and no glide; a pitch tracker can
    (creaky voice at the end of a held note reads an octave low). Moved by
    `shift`, the note must land within 1.5 semitones of that neighbor.
    """
    segment = segments[index]
    merge_gap = params.merge_gap_ms / 1000.0
    for other_index in (index - 1, index + 1):
        if not 0 <= other_index < len(segments):
            continue
        other = segments[other_index]
        first, second = (other, segment) if other_index < index else (segment, other)
        if _gap_s(first, second, hop_s) >= merge_gap:
            continue
        if abs(segment.pitch - other.pitch) > params.octave_flag_semitones and abs(segment.pitch + shift - other.pitch) <= 1.5:
            return True
    return False


def octave_check(
    segments: list[Segment], hop_s: float, audio: np.ndarray | None, sample_rate: int, params: NoteParams
) -> tuple[int, int]:
    """Step 5. Returns (flagged, corrected).

    A flagged note is moved an octave toward its neighbors when the audio says
    so (see `octave_evidence`), or when it touches a note that it would then match.
    A real octave leap fails both tests and is left alone.
    """
    flagged = corrected = 0
    for i, segment in enumerate(segments):
        neighbors = [s.pitch for s in segments[max(0, i - 4) : i]] + [s.pitch for s in segments[i + 1 : i + 5]]
        if len(neighbors) < 3:
            continue
        median = float(np.median(neighbors))
        if abs(segment.pitch - median) <= params.octave_flag_semitones:
            continue
        flagged += 1
        shift = -12.0 if segment.pitch > median else 12.0
        if abs(segment.pitch + shift - median) >= abs(segment.pitch - median):
            continue
        supported = _touching_octave(segments, i, shift, hop_s, params)
        if not supported and audio is not None:
            evidence = octave_evidence(audio, sample_rate, segment.first * hop_s, (segment.last + 1) * hop_s, segment.pitch)
            supported = evidence is not None and ((shift < 0 and evidence["half"] > 0.15) or (shift > 0 and evidence["odd"] < 0.08))
        if supported:
            segment.pitch += shift
            corrected += 1
    return flagged, corrected


def merge_after_octave_check(segments: list[Segment], hop_s: float, params: NoteParams) -> list[Segment]:
    """A note moved by the octave check may now equal the note of the same word it touches."""
    merged: list[Segment] = []
    for segment in segments:
        previous = merged[-1] if merged else None
        if (
            previous is not None
            and previous.word == segment.word
            and _gap_s(previous, segment, hop_s) < params.merge_gap_ms / 1000.0
            and round_midi(previous.pitch) == round_midi(segment.pitch)
        ):
            if len(segment) > len(previous):
                previous.pitch, previous.core = segment.pitch, segment.core
            previous.frames = sorted(previous.frames + segment.frames)
        else:
            merged.append(segment)
    return merged


def extract_notes(
    f0: dict[str, Any],
    lyrics: dict[str, Any],
    audio: np.ndarray | None = None,
    sample_rate: int = 16000,
    params: NoteParams = NoteParams(),
) -> tuple[list[dict[str, Any]], NoteStats]:
    """Notes for `notes.auto.json`, with phrase numbers.

    `lyrics` is the `lyrics.json` structure. `audio` is the mono signal the pitch
    was tracked on; it is only used by the octave check, which is skipped without it.
    """
    hop_s = float(f0["hopS"])
    hz = np.asarray(f0["hz"], dtype=np.float64)
    conf = np.asarray(f0["conf"], dtype=np.float64)
    midi = hz_to_midi(np.where(conf >= params.confidence, hz, 0.0))
    smooth = smooth_pitch(midi, median_frames(params.median_ms, hop_s))

    flat: list[tuple[int, int, dict[str, Any]]] = []
    for line_index, line in enumerate(lyrics["lines"]):
        for word_index, word in enumerate(line["words"]):
            flat.append((line_index, word_index, word))
    flat.sort(key=lambda item: item[2]["t0"])

    stats = NoteStats(words=len(flat))
    word_frames = assign_frames([(w["t0"], w["t1"]) for _, _, w in flat], smooth, hop_s, params)
    segments: list[Segment] = []
    for index, frames in enumerate(word_frames):
        found = segment_word(frames, midi, smooth, conf, hop_s, params)
        if not found:
            stats.words_without_notes += 1
        for segment in found:
            segment.word = index
        segments.extend(found)

    stats.octave_flagged, stats.octave_corrected = octave_check(segments, hop_s, audio, sample_rate, params)
    if stats.octave_corrected:
        segments = merge_after_octave_check(segments, hop_s, params)

    notes: list[dict[str, Any]] = []
    phrase = 0
    previous_word = -1
    for segment in segments:
        line_index, word_index, word = flat[segment.word]
        start = segment.first * hop_s
        duration = len(segment) * hop_s
        if notes:
            last = notes[-1]
            if line_index != last["line"] or start - (last["t"] + last["d"]) > params.phrase_gap_s:
                phrase += 1
        whole = round_midi(segment.pitch)
        notes.append(
            {
                "id": len(notes),
                "t": round(start, 3),
                "d": round(duration, 3),
                "midi": whole,
                "cents": round((segment.pitch - whole) * 100.0, 1),
                "text": word["text"] if segment.word != previous_word else "~",
                "word": word_index,
                "line": line_index,
                "phrase": phrase,
                "kind": "normal",
            }
        )
        previous_word = segment.word
    stats.notes = len(notes)
    return notes, stats
