"""The package write is atomic, keeps an existing notes.json, and regenerates index.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from songprep import package
from songprep.cache import read_json


def builder(version: str, fail: bool = False, seen: list | None = None, final: Path | None = None):
    def build(folder: Path) -> None:
        (folder / "manifest.json").write_text(json.dumps({"id": "a-song", "title": "Song", "artist": "A", "durationS": 12.5, "v": version}))
        (folder / "notes.auto.json").write_text(json.dumps([{"auto": version}]))
        (folder / "vocals.flac").write_bytes(b"flac-" + version.encode())
        if seen is not None and final is not None:
            # What a reader of songs/a-song would see while the new package is being built.
            seen.append(sorted(p.name for p in final.iterdir()) if final.exists() else None)
        if fail:
            raise RuntimeError("the build broke half way")
        (folder / "lyrics.json").write_text("{}")

    return build


def hidden(songs: Path) -> list[str]:
    return [p.name for p in songs.iterdir() if p.name.startswith(".")]


def test_first_import_copies_auto_notes(tmp_path):
    songs = tmp_path / "songs"
    final = package.install_package(songs, "a-song", builder("1"))
    assert final == songs / "a-song"
    assert read_json(final / "notes.json") == read_json(final / "notes.auto.json") == [{"auto": "1"}]
    assert hidden(songs) == [], "no temporary folder is left behind"


def test_reimport_keeps_notes_json_and_rewrites_auto(tmp_path):
    songs = tmp_path / "songs"
    final = package.install_package(songs, "a-song", builder("1"))
    corrected = '[{"corrected": "by hand"}]\n'
    (final / "notes.json").write_text(corrected)

    package.install_package(songs, "a-song", builder("2"))
    assert (final / "notes.json").read_text() == corrected, "the user's notes are never overwritten"
    assert read_json(final / "notes.auto.json") == [{"auto": "2"}], "the raw output is always rewritten"
    assert (final / "vocals.flac").read_bytes() == b"flac-2"
    assert hidden(songs) == []


def test_failed_build_leaves_no_package(tmp_path):
    songs = tmp_path / "songs"
    with pytest.raises(RuntimeError, match="half way"):
        package.install_package(songs, "a-song", builder("1", fail=True))
    assert not (songs / "a-song").exists()
    assert list(songs.iterdir()) == []


def test_failed_build_leaves_the_old_package_untouched(tmp_path):
    songs = tmp_path / "songs"
    final = package.install_package(songs, "a-song", builder("1"))
    (final / "notes.json").write_text("[1]")
    before = {p.name: p.read_bytes() for p in final.iterdir()}
    with pytest.raises(RuntimeError):
        package.install_package(songs, "a-song", builder("2", fail=True))
    assert {p.name: p.read_bytes() for p in final.iterdir()} == before
    assert hidden(songs) == []


def test_reader_never_sees_a_partial_package(tmp_path):
    songs = tmp_path / "songs"
    final = songs / "a-song"
    seen: list = []
    package.install_package(songs, "a-song", builder("1", seen=seen, final=final))
    assert seen == [None], "nothing is visible until the package is complete"
    complete = sorted(p.name for p in final.iterdir())
    assert complete == ["lyrics.json", "manifest.json", "notes.auto.json", "notes.json", "vocals.flac"]
    package.install_package(songs, "a-song", builder("2", seen=seen, final=final))
    assert seen[1] == complete, "during a re-import the old package stays whole"
    assert json.loads((final / "manifest.json").read_text())["v"] == "2"


def test_builder_must_not_write_notes_json(tmp_path):
    def build(folder: Path) -> None:
        builder("1")(folder)
        (folder / "notes.json").write_text("[]")

    with pytest.raises(RuntimeError, match="notes.json"):
        package.install_package(tmp_path / "songs", "a-song", build)


def test_baked_keys_are_carried_over_unless_the_source_changed(tmp_path):
    songs = tmp_path / "songs"
    final = package.install_package(songs, "a-song", builder("1"))
    (final / package.baked_key_name(3)).write_bytes(b"up")
    (final / package.baked_key_name(-2)).write_bytes(b"down")
    assert package.baked_keys(final) == [-2, 3]
    package.install_package(songs, "a-song", builder("2"))
    assert package.baked_keys(final) == [-2, 3]
    (final / "notes.json").write_text("[7]")
    package.install_package(songs, "a-song", builder("3"), keep_extra_files=False)
    assert package.baked_keys(final) == []
    assert (final / "notes.json").read_text() == "[7]", "notes.json is kept even then"


def test_leftovers_of_an_interrupted_run_are_removed(tmp_path):
    songs = tmp_path / "songs"
    (songs / ".a-song.tmp-abc").mkdir(parents=True)
    (songs / ".a-song.tmp-abc" / "vocals.flac").write_bytes(b"partial")
    (songs / ".other-song.tmp-xyz").mkdir()
    package.install_package(songs, "a-song", builder("1"))
    assert hidden(songs) == [".other-song.tmp-xyz"], "only this song's leftovers are removed"


@pytest.mark.skipif(not (sys.platform == "darwin" or sys.platform.startswith("linux")), reason="needs renamex_np or renameat2")
def test_exchange_swaps_two_folders(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir()
    b.mkdir()
    (a / "from-a").write_text("a")
    (b / "from-b").write_text("b")
    assert package.exchange(a, b) is True
    assert (a / "from-b").exists() and (b / "from-a").exists()


def test_index_lists_every_package(tmp_path, validate):
    songs = tmp_path / "songs"
    for song_id, title, artist, duration in (("b-two", "Two", "B", 200.0), ("a-one", "One", "A", 100.25)):
        (songs / song_id).mkdir(parents=True)
        (songs / song_id / "manifest.json").write_text(json.dumps({"id": song_id, "title": title, "artist": artist, "durationS": duration, "extra": 1}))
    (songs / "broken").mkdir()
    (songs / "broken" / "manifest.json").write_text("{not json")
    (songs / "empty").mkdir()
    (songs / ".a-one.tmp-zzz").mkdir()
    (songs / ".a-one.tmp-zzz" / "manifest.json").write_text(json.dumps({"id": "x", "title": "x", "artist": "x", "durationS": 1}))

    entries = package.write_index(songs)
    assert entries == [
        {"id": "a-one", "title": "One", "artist": "A", "durationS": 100.25},
        {"id": "b-two", "title": "Two", "artist": "B", "durationS": 200.0},
    ]
    assert read_json(songs / "index.json") == entries
    validate(entries, "songIndex")


def test_index_of_an_empty_folder_is_an_empty_array(tmp_path):
    assert package.write_index(tmp_path / "songs") == []
    assert read_json(tmp_path / "songs" / "index.json") == []
