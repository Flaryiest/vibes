"""The JSON Schema is valid, rejects malformed packages, and matches `app/src/song/types.ts`."""

from __future__ import annotations

import copy
import re
from pathlib import Path

import pytest

from conftest import REPO

TYPES_TS = REPO / "app" / "src" / "song" / "types.ts"

MANIFEST = {
    "schema": 1,
    "id": "gigi-perez-sailor-song",
    "title": "Sailor Song",
    "artist": "Gigi Perez",
    "durationS": 211.4,
    "sampleRate": 44100,
    "sourceHash": "sha256:" + "0" * 64,
    "tools": {"songprep": "0.1.0"},
    "lyricsSource": "lrclib",
    "lyricsNeedReview": False,
    "bpm": 95.0,
    "range": {"lowMidi": 56, "highMidi": 68},
    "typicalRange": {"lowMidi": 58, "highMidi": 66},
    "bakedKeys": [3, -2],
}
NOTE = {"id": 0, "t": 12.5, "d": 0.4, "midi": 60, "cents": -12.5, "text": "sail", "word": 0, "line": 0, "phrase": 0, "kind": "normal"}
LYRICS = {"offsetS": 0.1, "lines": [{"t0": 12.5, "t1": 14.0, "text": "sail away", "words": [{"t0": 12.5, "t1": 13.0, "text": "sail"}, {"t0": 13.0, "t1": 14.0, "text": "away"}]}]}
BEATS = {"beats": [0.5, 1.13, 1.76], "downbeats": [0.5]}
F0 = {"hopS": 0.016, "hz": [0, 220.0, 221.5], "conf": [0.1, 0.9, 0.95]}


def test_examples_are_valid(validate):
    validate(MANIFEST, "manifest")
    validate([NOTE, {**NOTE, "id": 1, "text": "~", "kind": "rap"}, {**NOTE, "id": 2, "kind": "free"}], "notes")
    validate(LYRICS, "lyrics")
    validate(BEATS, "beats")
    validate(F0, "f0")
    validate({"manifest": MANIFEST, "notes": [NOTE], "lyrics": LYRICS, "beats": BEATS, "f0": F0})
    validate([], "notes")
    validate([{"id": "a", "title": "T", "artist": "A", "durationS": 1.5}], "songIndex")


def broken(value, path: list, change):
    """A copy of `value` with one field changed (or removed when `change` is ...)."""
    out = copy.deepcopy(value)
    target = out
    for key in path[:-1]:
        target = target[key]
    if change is ...:
        del target[path[-1]]
    else:
        target[path[-1]] = change
    return out


@pytest.mark.parametrize(
    "definition, value",
    [
        ("manifest", broken(MANIFEST, ["schema"], 2)),
        ("manifest", broken(MANIFEST, ["bpm"], ...)),
        ("manifest", broken(MANIFEST, ["lyricsSource"], "genius")),
        ("manifest", broken(MANIFEST, ["lyricsNeedReview"], "no")),
        ("manifest", broken(MANIFEST, ["range", "lowMidi"], 56.5)),
        ("manifest", broken(MANIFEST, ["range", "highMidi"], ...)),
        ("manifest", broken(MANIFEST, ["tools", "songprep"], 1)),
        ("manifest", broken(MANIFEST, ["bakedKeys"], [1.5])),
        ("manifest", broken(MANIFEST, ["id"], "Not A Slug")),
        ("manifest", {**MANIFEST, "phraseGroups": []}),
        ("notes", [broken(NOTE, ["kind"], "spoken")]),
        ("notes", [broken(NOTE, ["midi"], 60.5)]),
        ("notes", [broken(NOTE, ["d"], 0)]),
        ("notes", [broken(NOTE, ["t"], -1)]),
        ("notes", [broken(NOTE, ["phrase"], ...)]),
        ("notes", [{**NOTE, "lyric": "x"}]),
        ("notes", {"notes": [NOTE]}),
        ("lyrics", broken(LYRICS, ["offsetS"], ...)),
        ("lyrics", broken(LYRICS, ["lines", 0, "words", 0, "t1"], ...)),
        ("lyrics", broken(LYRICS, ["lines", 0, "words"], "sail away")),
        ("beats", broken(BEATS, ["downbeats"], ...)),
        ("beats", broken(BEATS, ["beats"], ["0.5"])),
        ("f0", broken(F0, ["hopS"], 0)),
        ("f0", broken(F0, ["hz"], [-1])),
        ("f0", broken(F0, ["conf"], [1.5])),
        ("songIndex", [{"id": "a", "title": "T", "artist": "A"}]),
    ],
)
def test_malformed_values_are_rejected(validate, definition, value):
    with pytest.raises(AssertionError):
        validate(value, definition)


def ts_fields(source: str, name: str) -> dict[str, str]:
    """Top-level fields of `export type <name> = { ... }` and their declared types."""
    match = re.search(rf"export type {name} = \{{", source)
    assert match, f"type {name} not found in types.ts"
    depth, start, i = 1, match.end(), match.end()
    while depth:
        depth += {"{": 1, "}": -1}.get(source[i], 0)
        i += 1
    body = re.sub(r"/\*.*?\*/", "", source[start : i - 1], flags=re.S)
    fields: dict[str, str] = {}
    depth, current = 0, ""
    for char in body + ";":
        if char in "{[(":
            depth += 1
        elif char in "}])":
            depth -= 1
        if char == ";" and depth == 0:
            if ":" in current:
                key, kind = current.split(":", 1)
                fields[key.strip().rstrip("?")] = " ".join(kind.split())
            current = ""
        else:
            current += char
    return fields


@pytest.mark.skipif(not TYPES_TS.is_file(), reason="app/src/song/types.ts is not in this checkout")
def test_schema_matches_the_app_types(schema):
    source = TYPES_TS.read_text(encoding="utf-8")
    defs = schema["$defs"]
    for type_name, definition in (("Manifest", "manifest"), ("Note", "note"), ("Lyrics", "lyrics"), ("Beats", "beats"), ("F0", "f0"), ("SongIndexEntry", "songIndexEntry"), ("SongPackage", None)):
        target = schema if definition is None else defs[definition]
        fields = ts_fields(source, type_name)
        assert set(target["properties"]) == set(fields), f"{type_name}: schema and types.ts list different fields"
        assert set(target["required"]) == set(fields), f"{type_name}: every field in types.ts is required"
        assert target["additionalProperties"] is False

    manifest = ts_fields(source, "Manifest")
    assert manifest["schema"] == "1" and defs["manifest"]["properties"]["schema"] == {"const": 1}
    assert set(re.findall(r'"(\w+)"', manifest["lyricsSource"])) == set(defs["manifest"]["properties"]["lyricsSource"]["enum"])
    kinds = re.search(r"export type NoteKind = ([^;]+);", source).group(1)
    assert set(re.findall(r'"(\w+)"', kinds)) == set(defs["note"]["properties"]["kind"]["enum"])
    # Nested shapes: range objects, lyric lines and words.
    assert set(defs["midiRange"]["properties"]) == set(re.findall(r"(\w+): number", manifest["range"]))
    line = defs["lyrics"]["properties"]["lines"]["items"]
    assert set(line["properties"]) == {"t0", "t1", "text", "words"} and set(line["required"]) == set(line["properties"])
    assert set(defs["timedText"]["properties"]) == {"t0", "t1", "text"}
    for name in ("t0: number", "t1: number", "text: string", "words:"):
        assert name in ts_fields(source, "Lyrics")["lines"]
