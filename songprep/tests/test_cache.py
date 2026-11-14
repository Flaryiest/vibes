"""Stage caching: unchanged work is skipped; changed inputs, missing outputs and --force re-run."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from songprep import analysis, notes, pitch
from songprep.cache import StageCache, file_hash, inputs_hash, read_json, write_json_atomic


def make(tmp_path: Path, force: set[str] | None = None) -> StageCache:
    return StageCache(tmp_path / "work", force=force or set(), log=lambda _message: None)


def test_unchanged_stage_is_skipped(tmp_path):
    calls = []
    out = tmp_path / "work" / "out.txt"

    def stage() -> None:
        calls.append(1)
        out.write_text("result")

    assert make(tmp_path).run("pitch", {"a": 1}, [out], stage).ran is True
    assert make(tmp_path).run("pitch", {"a": 1}, [out], stage).ran is False  # a new process sees the record on disk
    assert len(calls) == 1


def test_changed_inputs_rerun(tmp_path):
    calls = []
    out = tmp_path / "work" / "out.txt"

    def stage() -> None:
        calls.append(1)
        out.write_text("result")

    make(tmp_path).run("pitch", {"a": 1}, [out], stage)
    assert make(tmp_path).run("pitch", {"a": 2}, [out], stage).ran is True
    assert make(tmp_path).run("pitch", {"a": 2}, [out], stage).ran is False
    assert len(calls) == 2


def test_missing_output_reruns(tmp_path):
    calls = []
    out = tmp_path / "work" / "out.txt"

    def stage() -> None:
        calls.append(1)
        out.write_text("result")

    make(tmp_path).run("pitch", {"a": 1}, [out], stage)
    out.unlink()
    assert make(tmp_path).run("pitch", {"a": 1}, [out], stage).ran is True
    assert len(calls) == 2


def test_force_reruns_only_that_stage(tmp_path):
    calls: list[str] = []
    first, second = tmp_path / "work" / "first.txt", tmp_path / "work" / "second.txt"

    def run_both(cache: StageCache) -> None:
        cache.run("pitch", {"a": 1}, [first], lambda: (calls.append("pitch"), first.write_text("f0"))[0])
        cache.run("notes", {"f0": file_hash(first)}, [second], lambda: (calls.append("notes"), second.write_text("notes"))[0])

    run_both(make(tmp_path))
    run_both(make(tmp_path, {"pitch"}))
    # pitch ran again; it wrote the same bytes, so notes was still fresh.
    assert calls == ["pitch", "notes", "pitch"]
    run_both(make(tmp_path, {"all"}))
    assert calls == ["pitch", "notes", "pitch", "pitch", "notes"]


def test_upstream_change_reruns_downstream(tmp_path):
    calls: list[str] = []
    first, second = tmp_path / "work" / "first.txt", tmp_path / "work" / "second.txt"

    def run_both(cache: StageCache, value: str) -> None:
        cache.run("pitch", {"value": value}, [first], lambda: (calls.append("pitch"), first.write_text(value))[0])
        cache.run("notes", {"f0": file_hash(first)}, [second], lambda: (calls.append("notes"), second.write_text("notes"))[0])

    run_both(make(tmp_path), "one")
    run_both(make(tmp_path), "one")
    run_both(make(tmp_path), "two")
    assert calls == ["pitch", "notes", "pitch", "notes"]


def test_failed_stage_is_not_recorded_and_keeps_earlier_stages(tmp_path):
    first, second = tmp_path / "work" / "first.txt", tmp_path / "work" / "second.txt"
    calls: list[str] = []

    def good() -> None:
        calls.append("pitch")
        first.write_text("f0")

    def bad() -> None:
        calls.append("notes")
        second.write_text("half")
        raise RuntimeError("boom")

    cache = make(tmp_path)
    cache.run("pitch", {"a": 1}, [first], good)
    with pytest.raises(RuntimeError):
        cache.run("notes", {"a": 1}, [second], bad)
    again = make(tmp_path)
    assert again.run("pitch", {"a": 1}, [first], good).ran is False, "the earlier stage stays cached"
    assert again.record("notes") is None, "the failed stage left no record, although it wrote a file"
    with pytest.raises(RuntimeError):
        again.run("notes", {"a": 1}, [second], bad)
    assert calls == ["pitch", "notes", "notes"]


def test_stage_that_forgets_an_output_is_an_error(tmp_path):
    with pytest.raises(RuntimeError, match="without writing"):
        make(tmp_path).run("pitch", {}, [tmp_path / "work" / "never.txt"], lambda: None)


def test_real_stages_are_cached(tmp_path, song):
    """Stages 5, 6 and 8 on the synthetic vocal: the second run does no work."""
    import soundfile

    work = tmp_path / "work"
    work.mkdir()
    wav = work / "vocals16k.wav"
    soundfile.write(str(wav), song.audio, song.sample_rate, subtype="PCM_16")
    lyrics_path = work / "lyrics.json"
    write_json_atomic(lyrics_path, song.lyrics)
    f0_path, notes_path, analysis_path = work / "f0.json", work / "notes.auto.json", work / "analysis.json"
    counts = {"pitch": 0, "notes": 0, "analysis": 0}

    def run_all(force: set[str] = frozenset(), fmax: float = 1050.0) -> list[bool]:
        cache = StageCache(work, force=set(force), log=lambda _m: None)

        def do_pitch() -> None:
            counts["pitch"] += 1
            write_json_atomic(f0_path, pitch.track_pitch_file(str(wav), fmax=fmax), compact=True)

        def do_notes() -> None:
            counts["notes"] += 1
            audio, rate = soundfile.read(str(wav), dtype="float32")
            found, _ = notes.extract_notes(read_json(f0_path), read_json(lyrics_path), audio, rate)
            write_json_atomic(notes_path, found)

        def do_analysis() -> None:
            counts["analysis"] += 1
            write_json_atomic(analysis_path, analysis.analyze(read_json(notes_path)))

        return [
            cache.run("pitch", {"stem": file_hash(wav), "fmax": fmax}, [f0_path], do_pitch).ran,
            cache.run("notes", {"f0": file_hash(f0_path), "lyrics": file_hash(lyrics_path)}, [notes_path], do_notes).ran,
            cache.run("analysis", {"notes": file_hash(notes_path)}, [analysis_path], do_analysis).ran,
        ]

    assert run_all() == [True, True, True]
    assert [n["midi"] for n in read_json(notes_path)] == [n["midi"] for n in song.notes]
    assert run_all() == [False, False, False]
    assert counts == {"pitch": 1, "notes": 1, "analysis": 1}
    # Forcing notes re-runs it; its output is identical, so analysis stays cached.
    assert run_all(force={"notes"}) == [False, True, False]
    # A changed lyric file re-runs notes and, because the notes change, analysis.
    changed = json.loads(lyrics_path.read_text())
    changed["lines"][0]["words"][0]["text"] = "na"
    write_json_atomic(lyrics_path, changed)
    assert run_all() == [False, True, True]
    assert counts == {"pitch": 1, "notes": 3, "analysis": 2}


def test_inputs_hash_is_order_independent():
    assert inputs_hash({"a": 1, "b": [1, 2]}) == inputs_hash({"b": [1, 2], "a": 1})
    assert inputs_hash({"a": 1}) != inputs_hash({"a": 2})


def test_write_json_atomic_leaves_no_temp_file(tmp_path):
    target = tmp_path / "deep" / "value.json"
    write_json_atomic(target, {"a": [1, 2, 3]})
    assert read_json(target) == {"a": [1, 2, 3]}
    assert [p.name for p in target.parent.iterdir()] == ["value.json"]
