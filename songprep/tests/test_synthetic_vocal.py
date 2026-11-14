"""A synthesized vocal with known notes goes through stages 5, 6 and 8 and comes back."""

from __future__ import annotations

import copy

import numpy as np
import pytest

from songprep import analysis, notes, pitch

ONSET_TOLERANCE_S = 0.06
DURATION_TOLERANCE_S = 0.08


def test_pitch_curve_shape(song, song_f0):
    assert song_f0["hopS"] == pytest.approx(0.016)
    assert len(song_f0["hz"]) == len(song_f0["conf"]) == len(song.audio) // 256
    hz = np.asarray(song_f0["hz"])
    conf = np.asarray(song_f0["conf"])
    assert np.all(hz[conf < 0.5] == 0), "unvoiced frames must have hz 0"
    assert np.all(hz[conf >= 0.5] > 0)
    # The silence before the first note is unvoiced; the first note (A3, 220 Hz) is voiced and in tune.
    assert not np.any(hz[: int(0.4 / 0.016)] > 0)
    first = hz[int(0.6 / 0.016) : int(0.8 / 0.016)]
    assert np.all(first > 0)
    assert abs(1200 * np.log2(np.median(first) / 220.0)) < 10


def test_notes_recovered(song, song_notes):
    truth = song.notes
    assert len(song_notes) == len(truth), [(n["t"], n["midi"], n["text"]) for n in song_notes]
    for expected, found in zip(truth, song_notes):
        label = f"note {expected['id']} ({expected['text']} at {expected['t']} s)"
        assert found["midi"] == expected["midi"], label
        assert abs(found["t"] - expected["t"]) <= ONSET_TOLERANCE_S, label
        assert abs(found["d"] - expected["d"]) <= DURATION_TOLERANCE_S, label
        assert abs(found["cents"]) <= 15, label
        assert found["text"] == expected["text"], label
        assert (found["line"], found["word"]) == (expected["line"], expected["word"]), label
        assert found["kind"] == "normal"
    assert [n["id"] for n in song_notes] == list(range(len(song_notes)))


def test_notes_do_not_overlap(song_notes):
    for a, b in zip(song_notes, song_notes[1:]):
        assert a["t"] + a["d"] <= b["t"] + 1e-6


def test_vibrato_is_one_note(song, song_notes):
    hold = [n for n in song_notes if n["text"] == "hold"]
    assert len(hold) == 1 and hold[0]["midi"] == 64 and hold[0]["d"] == pytest.approx(1.2, abs=DURATION_TOLERANCE_S)
    # The word after it has no continuation notes either.
    index = song_notes.index(hold[0])
    assert song_notes[index + 1]["text"] == "me"


def test_slide_belongs_to_its_note(song, song_notes):
    truth = next(n for n in song.notes if n["text"] == "me")
    found = [n for n in song_notes if n["line"] == truth["line"] and n["word"] == truth["word"]]
    assert len(found) == 1, "the slide must not become a note of its own"
    assert found[0]["midi"] == 62
    assert abs(found[0]["t"] - truth["t"]) <= ONSET_TOLERANCE_S, "the note starts where the slide starts"


def test_word_with_two_pitches_gets_a_continuation(song_notes):
    now = [n for n in song_notes if n["line"] == 1 and n["word"] == 2]
    assert [n["text"] for n in now] == ["now", "~"]
    assert [n["midi"] for n in now] == [60, 57]


def test_phrase_splitting(song, song_notes):
    assert [n["phrase"] for n in song_notes] == [n["phrase"] for n in song.notes]
    listed = analysis.phrases(song_notes)
    assert len(listed) == 7
    # Line 3 ("oh ... yeah") has a 0.8 s rest inside it, so it is two phrases.
    line3 = [p for p in listed if p["line"] == 3]
    assert [p["text"] for p in line3] == ["oh", "yeah"]
    # Every other line is one phrase.
    for line in (0, 1, 2, 4, 5):
        assert len([p for p in listed if p["line"] == line]) == 1
    assert listed[1]["text"] == "hold me now" and listed[1]["midi"] == [64, 62, 60, 57]


def test_repeated_phrases_grouped(song_notes):
    groups = analysis.group_phrases(analysis.phrases(song_notes))
    # Phrases 0 and 2 have the same words and pitches. Phrase 5 has the same words on other pitches.
    assert [0, 2] in groups
    assert [5] in groups
    assert sorted(p for g in groups for p in g) == list(range(7))
    assert len(groups) == 6


def test_range_and_typical_range(song, song_notes):
    # Lowest note of 150 ms or longer is "oh" (G3, 55); highest is "yeah" (G4, 67).
    # The 100 ms note at D3 (50) is too short to count.
    assert min(n["midi"] for n in song_notes) == 50
    assert analysis.vocal_range(song_notes) == {"lowMidi": 55, "highMidi": 67}
    assert analysis.typical_range(song_notes) == {"lowMidi": 57, "highMidi": 64}
    assert analysis.typical_range(song_notes) == analysis.typical_range(song.notes)


def _with_wrong_octave(f0: dict, note: dict, factor: float) -> dict:
    changed = copy.deepcopy(f0)
    hop = changed["hopS"]
    for i in range(int(note["t"] / hop) - 1, int((note["t"] + note["d"]) / hop) + 2):
        changed["hz"][i] = round(changed["hz"][i] * factor, 2)
    return changed


@pytest.mark.parametrize("factor", [0.5, 2.0])
def test_octave_error_is_corrected(song, song_f0, factor):
    """A tracker octave error on one note is caught by the neighbors and fixed from the audio."""
    target = song.notes[2]  # third "la", C4
    broken = _with_wrong_octave(song_f0, target, factor)
    without_audio, stats_blind = notes.extract_notes(broken, song.lyrics, None)
    assert without_audio[2]["midi"] == target["midi"] + (12 if factor > 1 else -12)
    assert stats_blind.octave_flagged >= 1 and stats_blind.octave_corrected == 0

    fixed, stats = notes.extract_notes(broken, song.lyrics, song.audio, song.sample_rate)
    assert fixed[2]["midi"] == target["midi"]
    assert stats.octave_corrected == 1
    assert [n["midi"] for n in fixed] == [n["midi"] for n in song.notes]


def test_real_octave_leap_is_kept(song, song_f0):
    """"yeah" really is an octave above "oh"; the check flags it and the audio clears it."""
    found, stats = notes.extract_notes(song_f0, song.lyrics, song.audio, song.sample_rate)
    yeah = next(n for n in found if n["text"] == "yeah")
    assert yeah["midi"] == 67
    assert stats.octave_flagged >= 1 and stats.octave_corrected == 0


def test_midi_hz_round_trip():
    assert pitch.midi_to_hz(69) == pytest.approx(440.0)
    assert pitch.hz_to_midi(np.array([261.6256]))[0] == pytest.approx(60.0, abs=1e-3)
    assert np.isnan(pitch.hz_to_midi(np.array([0.0]))[0])
