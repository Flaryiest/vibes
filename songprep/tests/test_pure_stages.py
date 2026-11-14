"""Unit tests for the pure parts of each stage, on hand-made data."""

from __future__ import annotations

import numpy as np
import pytest

import soundfile

from songprep import align, analysis, audio, beats, lyrics, notes
from songprep.paths import slugify, song_id

HOP = 0.016


def f0_from(midi_by_frame: list[float | None]) -> dict:
    hz = [0.0 if m is None else round(440.0 * 2 ** ((m - 69) / 12), 3) for m in midi_by_frame]
    return {"hopS": HOP, "hz": hz, "conf": [0.0 if m is None else 0.9 for m in midi_by_frame]}


def one_word(frames: int, text: str = "la") -> dict:
    end = frames * HOP
    return {"offsetS": 0.0, "lines": [{"t0": 0.0, "t1": end, "text": text, "words": [{"t0": 0.0, "t1": end, "text": text}]}]}


def frames(ms: float) -> int:
    return int(round(ms / 1000 / HOP))


# --- notes: section 4.4 -------------------------------------------------------------


def test_sustained_change_splits_a_word():
    curve = [60.0] * frames(400) + [62.0] * frames(400)
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [(n["midi"], n["text"]) for n in found] == [(60, "la"), (62, "~")]
    assert found[1]["t"] == pytest.approx(0.4, abs=HOP)


def test_change_shorter_than_110_ms_does_not_split():
    curve = [60.0] * frames(300) + [62.0] * frames(80) + [60.0] * frames(300)
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [n["midi"] for n in found] == [60]
    assert found[0]["d"] == pytest.approx(len(curve) * HOP, abs=HOP)


def test_change_of_less_than_0_8_semitones_does_not_split():
    curve = [60.0] * frames(400) + [60.7] * frames(400)
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert len(found) == 1


def test_vibrato_does_not_split():
    t = np.arange(frames(1500)) * HOP
    curve = list(64.0 + 0.5 * np.sin(2 * np.pi * 5.5 * t))
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [n["midi"] for n in found] == [64]
    assert abs(found[0]["cents"]) <= 10


def test_same_pitch_across_a_short_dropout_is_one_note():
    curve = [60.0] * frames(300) + [None] * 3 + [60.2] * frames(300)  # 48 ms pause
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert len(found) == 1 and found[0]["midi"] == 60
    assert found[0]["d"] == pytest.approx(len(curve) * HOP, abs=HOP)


def test_pause_of_70_ms_or_more_separates_notes():
    curve = [60.0] * frames(300) + [None] * 6 + [60.0] * frames(300)  # 96 ms pause
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [(n["midi"], n["text"]) for n in found] == [(60, "la"), (60, "~")]


def test_fragment_between_two_notes_is_absorbed():
    # 64 ms at an in-between pitch is not a note: it is the way into the next one.
    curve = [60.0] * frames(500) + [61.5] * 4 + [63.0] * frames(300)
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [n["midi"] for n in found] == [60, 63]
    assert sum(n["d"] for n in found) == pytest.approx(len(curve) * HOP, abs=HOP)
    assert found[1]["t"] == pytest.approx(0.5, abs=HOP), "the next note starts where the pitch left the first"
    assert abs(found[1]["cents"]) <= 5, "the fragment must not pull the pitch"


def test_fragment_at_the_start_is_absorbed():
    curve = [58.5] * 3 + [60.0] * frames(400)  # 48 ms scoop from below
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [n["midi"] for n in found] == [60]
    assert found[0]["t"] == 0.0 and abs(found[0]["cents"]) <= 5


def test_stray_blip_is_dropped():
    curve = [60.0] * frames(400) + [None] * frames(150) + [72.0] * 2 + [None] * 5
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [n["midi"] for n in found] == [60]
    assert found[0]["d"] == pytest.approx(0.4, abs=HOP)


def test_slide_into_a_note_is_part_of_that_note():
    glide = list(np.linspace(57.0, 61.8, frames(130)))  # slow enough to be tracked as its own piece
    curve = glide + [62.0] * frames(500)
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [n["midi"] for n in found] == [62]
    assert found[0]["t"] == 0.0
    assert abs(found[0]["cents"]) <= 5, "the slide must not pull the pitch"


def test_fall_at_the_end_of_a_word_stays_with_its_note():
    fall = list(np.linspace(59.0, 52.5, 7)) + [52.0] * 7  # 112 ms of glide, then 112 ms where it lands
    curve = [60.0] * frames(500) + fall
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [n["midi"] for n in found] == [60]
    assert found[0]["d"] == pytest.approx(len(curve) * HOP, abs=HOP)
    assert abs(found[0]["cents"]) <= 5


def test_short_note_before_a_fall_is_kept():
    fall = list(np.linspace(57.0, 51.5, 6)) + [51.0] * 7
    curve = [60.0] * frames(500) + [58.0] * 9 + fall  # 144 ms at 58, then the voice falls away
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [n["midi"] for n in found] == [60, 58], "the fall joins the 58; the 58 stays a note"


def test_short_last_note_with_a_steady_pitch_is_kept():
    curve = [60.0] * frames(500) + [58.0] * 12  # 192 ms, no glide
    found, _ = notes.extract_notes(f0_from(curve), one_word(len(curve)))
    assert [(n["midi"], n["text"]) for n in found] == [(60, "la"), (58, "~")]


def test_another_sound_after_the_word_is_not_part_of_it():
    # A held high tone (an instrument left in the stem) starts as the word ends.
    for pause in (0, 2):
        curve = [56.0] * frames(400) + [None] * pause + [72.0] * frames(2000)
        words = one_word(len(curve))
        words["lines"][0]["words"][0]["t1"] = 0.2
        found, _ = notes.extract_notes(f0_from(curve), words)
        assert [n["midi"] for n in found] == [56], f"pause of {pause} frames"
        assert found[0]["d"] == pytest.approx(0.4, abs=HOP)


def test_melisma_after_the_aligned_end_is_kept():
    curve = [56.0] * frames(400) + [60.0] * frames(400) + [58.0] * frames(400)
    words = one_word(len(curve))
    words["lines"][0]["words"][0]["t1"] = 0.2
    found, _ = notes.extract_notes(f0_from(curve), words)
    assert [(n["midi"], n["text"]) for n in found] == [(56, "la"), (60, "~"), (58, "~")]


def _three_words(middle: list[float | None]) -> tuple[dict, dict]:
    """Words at A3 on both sides of `middle`, each word 400 ms after a 96 ms pause."""
    side = [57.0] * frames(400) + [None] * 6
    curve = side * 3 + middle + [None] * 6 + side * 3
    words, t = [], 0.0
    for index in range(7):
        length = len(middle) if index == 3 else frames(400)
        words.append({"t0": round(t, 3), "t1": round(t + length * HOP, 3), "text": f"w{index}"})
        t += (length + 6) * HOP
    return f0_from(curve), {"offsetS": 0.0, "lines": [{"t0": 0.0, "t1": t, "text": "x", "words": words}]}


def test_octave_drop_inside_a_held_note_is_corrected_without_audio():
    # Creaky voice at the end of a held note reads an octave low, with no gap and no glide.
    f0, lyric = _three_words([57.0] * frames(600) + [45.0] * frames(250))
    found, stats = notes.extract_notes(f0, lyric, None)
    assert [n["midi"] for n in found] == [57] * 7, "the low piece is moved up and joins its note"
    assert found[3]["d"] == pytest.approx(0.85, abs=2 * HOP)
    assert stats.octave_flagged == 1 and stats.octave_corrected == 1


def test_octave_drop_after_the_aligned_end_is_cut_off():
    # Past the word's aligned end a jump of more than 9 semitones ends the word, octave or not.
    f0, lyric = _three_words([57.0] * frames(600) + [45.0] * frames(250))
    lyric["lines"][0]["words"][3]["t1"] = lyric["lines"][0]["words"][3]["t0"] + 0.1
    found, stats = notes.extract_notes(f0, lyric, None)
    assert [n["midi"] for n in found] == [57] * 7
    assert found[3]["d"] == pytest.approx(0.6, abs=HOP)
    assert stats.octave_flagged == 0


def test_octave_leap_after_a_pause_is_not_touched_without_audio():
    f0, lyric = _three_words([69.0] * frames(600))  # a whole word sung an octave up
    found, stats = notes.extract_notes(f0, lyric, None)
    assert [n["midi"] for n in found] == [57, 57, 57, 69, 57, 57, 57]
    assert stats.octave_flagged == 1 and stats.octave_corrected == 0


def test_word_end_is_set_by_the_voice_not_the_aligner():
    curve = [60.0] * frames(900) + [None] * frames(300)
    words = one_word(len(curve))
    words["lines"][0]["words"][0]["t1"] = 0.1  # the aligner says the word ends after 100 ms
    found, _ = notes.extract_notes(f0_from(curve), words)
    assert len(found) == 1 and found[0]["d"] == pytest.approx(0.9, abs=HOP)


def test_voicing_just_before_the_aligned_start_belongs_to_the_word():
    curve = [None] * 20 + [60.0] * frames(400)
    words = one_word(len(curve))
    words["lines"][0]["words"][0]["t0"] = 20 * HOP + 0.08  # aligned 80 ms late
    found, _ = notes.extract_notes(f0_from(curve), words)
    assert found[0]["t"] == pytest.approx(20 * HOP, abs=1e-6)


def test_next_word_bounds_the_previous_one():
    curve = [60.0] * frames(400) + [62.0] * frames(400)  # sung without a break
    boundary = frames(400) * HOP
    lyric = {
        "offsetS": 0.0,
        "lines": [{"t0": 0.0, "t1": 0.8, "text": "a b", "words": [{"t0": 0.0, "t1": 0.1, "text": "a"}, {"t0": boundary, "t1": boundary + 0.1, "text": "b"}]}],
    }
    found, _ = notes.extract_notes(f0_from(curve), lyric)
    assert [(n["midi"], n["text"], n["word"]) for n in found] == [(60, "a", 0), (62, "b", 1)]


def test_word_without_pitch_gets_no_note():
    curve = [None] * frames(300) + [60.0] * frames(300)
    lyric = {
        "offsetS": 0.0,
        "lines": [{"t0": 0.0, "t1": 0.6, "text": "sh la", "words": [{"t0": 0.0, "t1": 0.2, "text": "sh"}, {"t0": 0.3, "t1": 0.6, "text": "la"}]}],
    }
    found, stats = notes.extract_notes(f0_from(curve), lyric)
    assert [n["text"] for n in found] == ["la"]
    assert stats.words == 2 and stats.words_without_notes == 1


def test_low_confidence_frames_are_ignored():
    f0 = f0_from([60.0] * frames(400))
    f0["conf"] = [0.4] * len(f0["conf"])
    found, _ = notes.extract_notes(f0, one_word(len(f0["hz"])))
    assert found == []


def test_rounding_keeps_the_remainder_in_cents():
    found, _ = notes.extract_notes(f0_from([60.3] * frames(400)), one_word(frames(400)))
    assert found[0]["midi"] == 60 and found[0]["cents"] == pytest.approx(30, abs=1)
    found, _ = notes.extract_notes(f0_from([59.6] * frames(400)), one_word(frames(400)))
    assert found[0]["midi"] == 60 and found[0]["cents"] == pytest.approx(-40, abs=1)


def test_phrase_boundaries_at_line_breaks_and_long_gaps():
    def word(t0: float, text: str) -> dict:
        return {"t0": t0, "t1": t0 + 0.1, "text": text}

    curve: list[float | None] = []
    for start, length in ((0.0, 0.3), (0.4, 0.3), (1.4, 0.3), (1.8, 0.3)):
        curve += [None] * (frames(start * 1000) - len(curve))
        curve += [60.0] * frames(length * 1000)
    lyric = {
        "offsetS": 0.0,
        "lines": [
            {"t0": 0.0, "t1": 1.7, "text": "a b c", "words": [word(0.0, "a"), word(0.4, "b"), word(1.4, "c")]},
            {"t0": 1.8, "t1": 2.1, "text": "d", "words": [word(1.8, "d")]},
        ],
    }
    found, _ = notes.extract_notes(f0_from(curve), lyric)
    # a-b: 0.1 s apart, same phrase. b-c: 0.7 s apart, new phrase. c-d: new line, new phrase.
    assert [(n["text"], n["phrase"]) for n in found] == [("a", 0), ("b", 0), ("c", 1), ("d", 2)]


def test_median_filter_spans_about_60_ms():
    assert notes.median_frames(60.0, 0.016) == 5  # 5 frames: 64 ms between first and last
    assert notes.median_frames(60.0, 0.010) == 7
    smooth = notes.smooth_pitch(np.array([60.0, 60.0, 72.0, 60.0, 60.0, np.nan, 60.0]), 5)
    assert smooth[2] == 60.0, "a one-frame spike is removed"
    assert np.isnan(smooth[5]), "unvoiced frames stay unvoiced"


def test_weighted_median_follows_the_confident_frames():
    values = np.array([60.0, 60.0, 62.0])
    assert notes.weighted_median(values, np.array([1.0, 1.0, 1.0])) == 60.0
    assert notes.weighted_median(values, np.array([0.1, 0.1, 1.0])) == 62.0


# --- analysis -------------------------------------------------------------------------


def _note(i: int, t: float, d: float, midi: int, text: str = "la", phrase: int = 0, line: int = 0, kind: str = "normal") -> dict:
    return {"id": i, "t": t, "d": d, "midi": midi, "cents": 0, "text": text, "word": 0, "line": line, "phrase": phrase, "kind": kind}


def test_range_ignores_notes_under_150_ms():
    listed = [_note(0, 0, 0.1, 40), _note(1, 1, 0.15, 55), _note(2, 2, 0.5, 60), _note(3, 3, 0.149, 80)]
    assert analysis.vocal_range(listed) == {"lowMidi": 55, "highMidi": 60}


def test_range_ignores_free_and_rap_notes():
    listed = [_note(0, 0, 0.5, 40, kind="free"), _note(1, 1, 0.5, 55), _note(2, 2, 0.5, 60), _note(3, 3, 0.5, 80, kind="rap")]
    assert analysis.vocal_range(listed) == {"lowMidi": 55, "highMidi": 60}


def test_typical_range_is_duration_weighted():
    # 5% of the time at 50, 90% at 60, 5% at 70: both percentiles land on 60.
    assert analysis.typical_range([_note(0, 0, 0.5, 50), _note(1, 1, 9.0, 60), _note(2, 11, 0.5, 70)]) == {"lowMidi": 60, "highMidi": 60}
    # 20% at 55, 60% at 60, 20% at 65: the 10th percentile is 55, the 90th is 65.
    assert analysis.typical_range([_note(0, 0, 2.0, 55), _note(1, 2, 6.0, 60), _note(2, 8, 2.0, 65)]) == {"lowMidi": 55, "highMidi": 65}
    # Many short high notes weigh less than one long low note.
    many = [_note(i, i, 0.1, 72) for i in range(5)] + [_note(9, 9, 9.5, 60)]
    assert analysis.typical_range(many) == {"lowMidi": 60, "highMidi": 60}


def test_grouping_needs_matching_words_and_pitches():
    def phrase(number: int, words: list[str], midis: list[int]) -> list[dict]:
        return [_note(number * 10 + i, number * 10 + i, 0.4, m, w, phrase=number, line=number) for i, (w, m) in enumerate(zip(words, midis))]

    listed = (
        phrase(0, ["Hey", "hey,", "I'm", "ok"], [60, 62, 64, 62])
        + phrase(1, ["hey", "hey", "im", "OK!"], [60, 63, 64, 61])  # same words; every pitch within a semitone
        + phrase(2, ["hey", "hey", "I'm", "ok"], [60, 64, 64, 62])  # second note is two semitones off
        + phrase(3, ["hey", "hey", "I'm", "fine"], [60, 62, 64, 62])  # other words
        + phrase(4, ["hey", "hey", "I'm"], [60, 62, 64])  # fewer notes
    )
    assert analysis.group_phrases(analysis.phrases(listed)) == [[0, 1], [2], [3], [4]]


def test_phrase_text_includes_words_that_got_no_note():
    lyric = {
        "offsetS": 0.0,
        "lines": [
            {"t0": 0, "t1": 4, "text": "What's yours and mine", "words": [{"t0": i, "t1": i + 0.5, "text": t} for i, t in enumerate(["What's", "yours", "and", "mine"])]},
            {"t0": 10, "t1": 14, "text": "What's yours and mine", "words": [{"t0": 10 + i, "t1": 10.5 + i, "text": t} for i, t in enumerate(["What's", "yours", "and", "mine"])]},
        ],
    }

    def note(i, t, midi, text, word, line, phrase):
        return {"id": i, "t": t, "d": 0.4, "midi": midi, "cents": 0, "text": text, "word": word, "line": line, "phrase": phrase, "kind": "normal"}

    # First time through, "What's" was whispered and has no note.
    listed = [note(0, 1, 56, "yours", 1, 0, 0), note(1, 2, 58, "and", 2, 0, 0), note(2, 3, 58, "mine", 3, 0, 0)]
    listed += [note(3, 11, 56, "yours", 1, 1, 1), note(4, 12, 58, "and", 2, 1, 1), note(5, 13, 58, "mine", 3, 1, 1)]
    assert [p["text"] for p in analysis.phrases(listed)] == ["yours and mine", "yours and mine"]
    with_lyrics = analysis.phrases(listed, lyric)
    assert [p["text"] for p in with_lyrics] == ["What's yours and mine", "What's yours and mine"]
    assert analysis.group_phrases(with_lyrics) == [[0, 1]]
    # A line split in two by a rest: each half keeps its own words.
    split = [note(0, 0, 56, "What's", 0, 0, 0), note(1, 3, 58, "mine", 3, 0, 1)]
    assert [p["text"] for p in analysis.phrases(split, lyric)] == ["What's", "mine"]


def test_continuation_notes_do_not_change_the_phrase_text():
    listed = [_note(0, 0, 0.3, 60, "now"), _note(1, 0.3, 0.3, 57, "~")]
    assert analysis.phrases(listed)[0]["text"] == "now"


# --- beats ------------------------------------------------------------------------------


def _grid(bpm: float, count: int, per_bar: int = 4) -> str:
    step = 60.0 / bpm
    return "".join(f"{0.5 + i * step:.3f}\t{i % per_bar + 1}\n" for i in range(count))


def test_beats_parsed_with_downbeats():
    built = beats.build_beats(_grid(120, 16))
    assert built["bpm"] == 120.0 and built["tempoAdjusted"] == "none"
    assert len(built["beats"]) == 16
    assert built["downbeats"] == [0.5, 2.5, 4.5, 6.5]


def test_half_tempo_is_doubled():
    built = beats.build_beats(_grid(48, 9))
    assert built["trackerBpm"] == 48.0 and built["bpm"] == 96.0 and built["tempoAdjusted"] == "doubled"
    assert len(built["beats"]) == 17
    assert set(built["downbeats"]) <= set(built["beats"])


def test_double_tempo_is_halved_keeping_downbeats():
    built = beats.build_beats(_grid(200, 16))
    assert built["trackerBpm"] == 200.0 and built["bpm"] == 100.0 and built["tempoAdjusted"] == "halved"
    assert len(built["beats"]) == 8
    assert built["downbeats"] and set(built["downbeats"]) <= set(built["beats"])


def test_tempo_inside_the_prior_is_left_alone():
    for bpm in (70, 95, 128, 180):
        assert beats.build_beats(_grid(bpm, 12))["tempoAdjusted"] == "none"


def _rows(times: list[float], per_bar: int = 4, first: int = 0) -> str:
    return "".join(f"{t:.3f}\t{(first + i) % per_bar + 1}\n" for i, t in enumerate(times))


def test_even_grid_is_left_exactly_as_tracked():
    built = beats.build_beats(_grid(96, 40))
    assert built["regularized"] == {"beatsAdded": 0, "beatsRemoved": 0, "downbeatsAdded": 0}
    assert len(built["beats"]) == 40 and len(built["downbeats"]) == 10 and built["evenShare"] == 1.0


def test_section_tracked_at_half_speed_is_filled_in():
    # 20 beats 0.7 s apart, then 80 beats 0.35 s apart: the tracker changed level part-way.
    slow = [1.0 + 0.7 * i for i in range(20)]
    fast = [slow[-1] + 0.7 + 0.35 * i for i in range(80)]
    built = beats.build_beats(_rows(slow) + _rows(fast))
    steps = np.diff(built["beats"])
    assert built["regularized"]["beatsAdded"] == 20
    assert np.allclose(steps, 0.35, atol=0.002) and len(built["beats"]) == 120
    assert built["bpm"] == pytest.approx(171.4, abs=0.2) and built["evenShare"] == 1.0
    # Bars: the slow part had a downbeat every 4 slow beats (8 steps now); they become 4 steps like the rest.
    index = {t: i for i, t in enumerate(built["beats"])}
    assert set(np.diff([index[t] for t in built["downbeats"]])) == {4}
    assert built["regularized"]["downbeatsAdded"] == 5


def test_missed_beat_is_filled_in():
    times = [0.5 * i for i in range(30)]
    del times[11]
    built = beats.build_beats(_rows(times))
    assert built["regularized"]["beatsAdded"] == 1 and len(built["beats"]) == 30
    assert np.allclose(np.diff(built["beats"]), 0.5)


def test_short_burst_of_double_time_is_thinned_but_downbeats_stay():
    times = [0.5 * i for i in range(20)] + [9.75, 10.0, 10.25, 10.5] + [10.5 + 0.5 * i for i in range(1, 20)]
    built = beats.build_beats(_rows(times, first=1))  # numbered so the two extra beats are not downbeats
    assert built["regularized"]["beatsRemoved"] == 2
    assert np.allclose(np.diff(built["beats"]), 0.5)
    # A downbeat is never removed, even when it sits between two short steps.
    rows = _rows(times, first=1).splitlines()
    rows[20] = "9.750\t1"
    kept = beats.build_beats("\n".join(rows) + "\n")
    assert 9.75 in kept["beats"] and 9.75 in kept["downbeats"]


def test_irregular_gap_is_not_filled():
    times = [0.5 * i for i in range(20)] + [9.5 + 1.3 + 0.5 * i for i in range(20)]  # a 1.3 s hole: 2.6 steps
    built = beats.build_beats(_rows(times))
    assert built["regularized"]["beatsAdded"] == 0 and len(built["beats"]) == 40


# --- lyrics -----------------------------------------------------------------------------


def test_plain_lyrics_skip_blank_lines_and_section_labels():
    text = "[Verse 1]\nI never thought   I'd see the day\n\n(x2)\n  Hey hey, I'm ok\n[Chorus x 2]\n"
    assert [line["text"] for line in lyrics.parse_plain(text)] == ["I never thought I'd see the day", "Hey hey, I'm ok"]
    assert all(line["t0"] is None for line in lyrics.parse_plain(text))


def test_lrc_lines_are_timed_and_sorted():
    text = "[ar:Someone]\n[00:12.50]first line\n[00:20.00]\n[01:02.25][00:30.00]<00:30.10>again <00:30.90>now\n"
    parsed = lyrics.parse_lrc(text)
    assert [(line["t0"], line["text"]) for line in parsed] == [(12.5, "first line"), (30.0, "again now"), (62.25, "again now")]
    assert parsed[0]["tNext"] == 20.0, "an empty time tag ends the line before it"
    assert parsed[1]["tNext"] == 62.25 and parsed[2]["tNext"] is None


def test_lrc_offset_tag():
    assert lyrics.parse_lrc("[offset:+500]\n[00:10.00]a\n")[0]["t0"] == 9.5


def test_lrclib_request_carries_only_artist_title_and_duration():
    url = lyrics.lrclib_url("Gigi Perez", "Sailor Song", 211.4)
    assert url == "https://lrclib.net/api/get?artist_name=Gigi+Perez&track_name=Sailor+Song&duration=211"
    assert lyrics.USER_AGENT == "songprep/0.1"


def test_lrclib_record_handling():
    synced, _ = lyrics.lyrics_from_lrclib({"syncedLyrics": "[00:01.00]a b\n[00:05.00]c d\n", "plainLyrics": "a b\nc d\n"})
    assert synced["source"] == "lrclib" and synced["timed"] and not synced["needReview"]
    plain, _ = lyrics.lyrics_from_lrclib({"syncedLyrics": None, "plainLyrics": "a b\nc d\n"})
    assert plain["timed"] is False and len(plain["lines"]) == 2
    assert lyrics.lyrics_from_lrclib({"instrumental": True})[0] is None
    assert lyrics.lyrics_from_lrclib({"syncedLyrics": "", "plainLyrics": ""})[0] is None


def test_transcript_becomes_lines_marked_for_review():
    transcript = {
        "segments": [
            {"start": 1.0, "end": 3.0, "text": " Hey hey I'm ok", "no_speech_prob": 0.01},
            {"start": 3.5, "end": 4.0, "text": " thanks for watching", "no_speech_prob": 0.9},
            {"start": 5.0, "end": 7.5, "text": " I don't need this", "no_speech_prob": 0.1},
            {"start": 8.0, "end": 8.0, "text": " ", "no_speech_prob": 0.1},
        ]
    }
    found = lyrics.lyrics_from_transcript(transcript)
    assert found["source"] == "transcribed" and found["needReview"] is True
    assert [(line["text"], line["t0"], line["t1"]) for line in found["lines"]] == [("Hey hey I'm ok", 1.0, 3.0), ("I don't need this", 5.0, 7.5)]


def test_transcribed_lines_over_silence_are_dropped():
    hop = 0.02
    activity = np.zeros(int(30 / hop), dtype=bool)
    activity[int(10 / hop) : int(14 / hop)] = True
    activity[int(16 / hop) : int(19 / hop)] = True
    lines = [
        {"text": "Thank you.", "t0": 2.0, "tNext": 10.0, "t1": 2.4},  # invented over the silent intro
        {"text": "Hey hey I'm ok", "t0": 10.0, "tNext": 16.0, "t1": 14.0},
        {"text": "I don't need this", "t0": 15.5, "tNext": 25.0, "t1": 19.5},  # voice for most of it
        {"text": "Thanks for watching", "t0": 25.0, "tNext": None, "t1": 27.0},
    ]
    kept, dropped = lyrics.drop_silent_lines(lines, activity, hop)
    assert [line["text"] for line in kept] == ["Hey hey I'm ok", "I don't need this"]
    assert dropped == ["Thank you.", "Thanks for watching"]
    assert kept[0]["tNext"] == 15.5 and kept[1]["tNext"] is None


def test_offset_between_lyrics_and_audio_is_found():
    hop = 0.02
    true_starts = [2.0, 6.5, 11.0, 15.2, 21.0, 26.4]
    activity = np.zeros(int(32 / hop), dtype=bool)
    for start in true_starts:
        activity[int(start / hop) : int((start + 2.5) / hop)] = True
    for shift in (-1.36, 0.8, 2.5):
        estimate, _ = lyrics.estimate_offset([t - shift for t in true_starts], activity, hop)
        assert estimate == pytest.approx(shift, abs=0.05)
    estimate, _ = lyrics.estimate_offset(true_starts, activity, hop)
    assert estimate == 0.0
    # A small misfit is left alone: the per-line alignment absorbs it.
    estimate, _ = lyrics.estimate_offset([t - 0.02 for t in true_starts], activity, hop)
    assert estimate == 0.0


# --- alignment tidy-up ----------------------------------------------------------------


def test_line_windows():
    timed = {"lines": [{"text": "a", "t0": 10.0, "tNext": 14.0, "t1": None}, {"text": "b", "t0": 14.0, "tNext": None, "t1": None}]}
    windows = align.line_windows(timed, 20.0)
    assert (windows[0]["start"], windows[0]["end"]) == (9.0, 15.0)
    assert (windows[1]["start"], windows[1]["end"]) == (13.0, 20.0)
    transcribed = {"lines": [{"text": "a", "t0": 10.0, "tNext": 14.0, "t1": 12.0}]}
    assert (align.line_windows(transcribed, 20.0)[0]["start"], align.line_windows(transcribed, 20.0)[0]["end"]) == (9.5, 12.5)
    untimed = {"lines": [{"text": "a", "t0": None, "tNext": None, "t1": None}]}
    assert align.line_windows(untimed, 20.0) == [{"text": "a", "start": None, "end": None, "anchor": None}]
    assert [w["anchor"] for w in windows] == [10.0, 14.0]


def test_worker_output_becomes_ordered_lyrics():
    worker = {
        "model": "TEST",
        "globalPass": False,
        "lines": [
            {
                "text": "one 2 three",
                "start": 0.5,
                "end": 4.0,
                "words": [
                    {"text": "one", "start": 1.0, "end": 1.4, "score": 0.9},
                    {"text": "2", "start": None, "end": None, "score": None},  # digits cannot be aligned
                    {"text": "three", "start": 2.0, "end": 2.6, "score": 0.8},
                ],
            },
            {
                "text": "four five",
                "start": 2.0,
                "end": 6.0,
                "words": [
                    {"text": "four", "start": 2.5, "end": 3.0, "score": 0.7},  # overlaps "three"
                    {"text": "five", "start": 2.4, "end": 3.5, "score": 0.7},  # runs backwards
                ],
            },
        ],
    }
    built, diagnostics = align.build_lyrics(worker, 0.25, 10.0)
    assert built["offsetS"] == 0.25
    words = [w for line in built["lines"] for w in line["words"]]
    assert [w["text"] for w in words] == ["one", "2", "three", "four", "five"]
    assert words[1]["t0"] == 1.4 and words[1]["t1"] == 2.0, "the unplaced word fills the gap between its neighbors"
    starts = [w["t0"] for w in words]
    assert starts == sorted(starts)
    for a, b in zip(words, words[1:]):
        assert a["t1"] <= b["t0"]
    assert all(w["t1"] >= w["t0"] for w in words)
    assert built["lines"][0]["t0"] == 1.0 and built["lines"][1]["text"] == "four five"
    assert diagnostics["wordsNotPlaced"] == 1 and diagnostics["words"] == 5


# --- ids --------------------------------------------------------------------------------


def test_song_id():
    assert song_id("Gigi Perez", "Sailor Song") == "gigi-perez-sailor-song"
    assert song_id("Beyoncé", "Déjà Vu (feat. Jay-Z)") == "beyonce-deja-vu-feat-jay-z"
    assert slugify("  --Hello,   World!--  ") == "hello-world"
    with pytest.raises(ValueError):
        song_id("???", "!!!")


# --- stems ------------------------------------------------------------------------------


def _stems(tmp_path, vocal_gain: float, instrumental_gain: float):
    rate = 44100
    t = np.arange(rate * 3) / rate
    vocals = np.stack([0.5 * np.sin(2 * np.pi * 220 * t), 0.4 * np.sin(2 * np.pi * 220 * t + 0.3)], axis=1)
    rng = np.random.default_rng(1)
    instrumental = 0.1 * rng.standard_normal((len(t), 2))
    paths = [tmp_path / name for name in ("source.wav", "vocals.flac", "instrumental.flac")]
    soundfile.write(str(paths[0]), vocals + instrumental, rate, subtype="FLOAT")
    soundfile.write(str(paths[1]), vocals * vocal_gain, rate, format="FLAC", subtype="PCM_16")
    soundfile.write(str(paths[2]), instrumental * instrumental_gain, rate, format="FLAC", subtype="PCM_16")
    return paths


def test_separately_normalized_stems_are_put_back_on_one_scale(tmp_path):
    # Each stem was scaled on its own, as audio-separator does: the balance is off by 2 dB.
    source, vocals, instrumental = _stems(tmp_path, 0.81, 0.65)
    info = audio.match_stem_levels(source, vocals, instrumental)
    assert info["matched"] and info["fitSnrDb"] > 60
    assert info["vocalsInMix"] == pytest.approx(1 / 0.81, rel=1e-3) and info["instrumentalInMix"] == pytest.approx(1 / 0.65, rel=1e-3)
    mix, _ = soundfile.read(str(source), dtype="float64")
    voc, _ = soundfile.read(str(vocals), dtype="float64")
    ins, _ = soundfile.read(str(instrumental), dtype="float64")
    assert max(np.abs(voc).max(), np.abs(ins).max()) <= 0.851, "the louder stem peaks at the headroom"
    total = voc + ins
    assert np.abs(total - info["mixGain"] * mix).max() < 1e-3, "vocals + instrumental is the mix again, at one gain"
    assert info["mixGain"] <= 1.0


def test_stems_already_on_one_scale_are_not_rewritten(tmp_path):
    source, vocals, instrumental = _stems(tmp_path, 1.0, 1.0)
    before = vocals.read_bytes()
    info = audio.match_stem_levels(source, vocals, instrumental)
    assert info["matched"] and info["mixGain"] == 1.0
    assert vocals.read_bytes() == before


def test_stems_that_do_not_rebuild_the_mix_are_left_alone(tmp_path):
    source, vocals, instrumental = _stems(tmp_path, 0.81, 0.65)
    rate = 44100
    other = 0.1 * np.random.default_rng(2).standard_normal((rate * 3, 2))
    soundfile.write(str(instrumental), other, rate, format="FLAC", subtype="PCM_16")
    before = (vocals.read_bytes(), instrumental.read_bytes())
    info = audio.match_stem_levels(source, vocals, instrumental)
    assert info["matched"] is False and info["fitSnrDb"] < 30
    assert (vocals.read_bytes(), instrumental.read_bytes()) == before
