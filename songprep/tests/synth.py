"""A synthetic "vocal" with known notes, for testing stages 5 to 8.

Harmonic tones (ten partials, 1/k amplitudes) with short gaps between them,
vibrato on one long note, one slide into a note, a two-note word, a repeated
phrase, a long rest inside a line and one very short low note.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

SR = 16000


@dataclass
class Tone:
    midi: float
    dur: float
    vibrato: tuple[float, float] | None = None  # (rate in Hz, extent in semitones)
    slide_from: float | None = None  # glide up or down from this pitch
    slide_s: float = 0.1


@dataclass
class Word:
    text: str
    tones: list[Tone]
    gap_before: float = 0.08


@dataclass
class Line:
    text: str
    words: list[Word]
    gap_before: float = 0.4


@dataclass
class Song:
    audio: np.ndarray
    sample_rate: int
    notes: list[dict] = field(default_factory=list)  # ground truth, same fields as notes.json
    lyrics: dict = field(default_factory=dict)  # lyrics.json as an aligner would give it


def _tone(tone: Tone, sr: int) -> np.ndarray:
    count = int(round(tone.dur * sr))
    t = np.arange(count) / sr
    midi = np.full(count, float(tone.midi))
    if tone.slide_from is not None:
        ramp = np.clip(t / tone.slide_s, 0.0, 1.0)
        midi = tone.slide_from + (tone.midi - tone.slide_from) * ramp
    if tone.vibrato is not None:
        rate, extent = tone.vibrato
        onset = np.clip((t - 0.15) / 0.15, 0.0, 1.0)  # vibrato fades in, as singers do
        midi = midi + extent * onset * np.sin(2 * np.pi * rate * t)
    hz = 440.0 * 2.0 ** ((midi - 69.0) / 12.0)
    phase = 2 * np.pi * np.cumsum(hz) / sr
    out = np.zeros(count)
    for k in range(1, 11):
        if k * hz.max() < sr * 0.45:
            out += np.sin(k * phase) / k
    return out


def _fade(signal: np.ndarray, sr: int, ms: float = 15.0) -> np.ndarray:
    n = min(int(sr * ms / 1000.0), len(signal) // 2)
    if n > 0:
        ramp = 0.5 - 0.5 * np.cos(np.pi * np.arange(n) / n)
        signal[:n] *= ramp
        signal[-n:] *= ramp[::-1]
    return signal


def build(lines: list[Line], sr: int = SR, lead_in: float = 0.5, tail: float = 0.6, level: float = 0.25) -> Song:
    pieces: list[np.ndarray] = [np.zeros(int(lead_in * sr))]
    now = lead_in
    notes: list[dict] = []
    lyric_lines: list[dict] = []
    phrase = 0
    for line_index, line in enumerate(lines):
        words_out = []
        for word_index, word in enumerate(line.words):
            gap = line.gap_before if word_index == 0 else word.gap_before
            if not (line_index == 0 and word_index == 0):
                pieces.append(np.zeros(int(round(gap * sr))))
                now += int(round(gap * sr)) / sr
                if notes and (word_index == 0 or gap > 0.5):
                    phrase += 1
            word_start = now
            # A word's tones are joined without a gap: one voiced stretch, several pitches.
            chunk = _fade(np.concatenate([_tone(tone, sr) for tone in word.tones]), sr)
            pieces.append(chunk)
            for tone_index, tone in enumerate(word.tones):
                notes.append(
                    {
                        "id": len(notes),
                        "t": round(now, 4),
                        "d": round(tone.dur, 4),
                        "midi": int(round(tone.midi)),
                        "cents": 0.0,
                        "text": word.text if tone_index == 0 else "~",
                        "word": word_index,
                        "line": line_index,
                        "phrase": phrase,
                        "kind": "normal",
                    }
                )
                now += int(round(tone.dur * sr)) / sr
            # Like a speech aligner: the start is about right, the end comes far too early.
            words_out.append({"t0": round(max(0.0, word_start - 0.02), 3), "t1": round(word_start + 0.12, 3), "text": word.text})
        lyric_lines.append({"t0": words_out[0]["t0"], "t1": words_out[-1]["t1"], "text": line.text, "words": words_out})
    pieces.append(np.zeros(int(tail * sr)))
    audio = (level * np.concatenate(pieces)).astype(np.float32)
    return Song(audio, sr, notes, {"offsetS": 0.0, "lines": lyric_lines})


def _plain(text: str, midis: list[float], dur: float = 0.35) -> Line:
    return Line(text, [Word(w, [Tone(m, dur)]) for w, m in zip(text.split(), midis)])


def demo_song() -> Song:
    """Seven phrases; phrases 0 and 2 repeat; phrase 5 has the same words on other pitches."""
    lines = [
        _plain("la la la la", [57, 59, 60, 62]),
        Line(
            "hold me now",
            [
                Word("hold", [Tone(64, 1.2, vibrato=(5.5, 0.4))]),
                Word("me", [Tone(62, 0.5, slide_from=59, slide_s=0.1)]),
                Word("now", [Tone(60, 0.4), Tone(57, 0.5)]),
            ],
        ),
        _plain("la la la la", [57, 59, 60, 62]),
        Line("oh yeah", [Word("oh", [Tone(55, 0.4)]), Word("yeah", [Tone(67, 0.6)], gap_before=0.8)]),
        _plain("la la la la", [57, 57, 62, 64]),
        Line("it", [Word("it", [Tone(50, 0.1)])]),
    ]
    return build(lines)
