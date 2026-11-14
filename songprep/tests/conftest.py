from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import synth  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO / "schema" / "song-package.schema.json"


@pytest.fixture(scope="session")
def song() -> synth.Song:
    return synth.demo_song()


@pytest.fixture(scope="session")
def song_f0(song: synth.Song) -> dict:
    from songprep import pitch

    return pitch.track_pitch(song.audio, song.sample_rate)


@pytest.fixture(scope="session")
def song_notes(song: synth.Song, song_f0: dict) -> list[dict]:
    from songprep import notes

    found, _stats = notes.extract_notes(song_f0, song.lyrics, song.audio, song.sample_rate)
    return found


@pytest.fixture(scope="session")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def validate(schema: dict):
    """validate(value, "manifest") checks `value` against `#/$defs/manifest`."""
    from jsonschema import Draft202012Validator

    Draft202012Validator.check_schema(schema)

    def check(value, definition: str | None = None) -> None:
        target = schema if definition is None else {"$ref": f"#/$defs/{definition}", "$defs": schema["$defs"]}
        errors = sorted(Draft202012Validator(target).iter_errors(value), key=lambda e: list(e.path))
        if errors:
            first = errors[0]
            raise AssertionError(f"{definition or 'package'}: {first.message} at {list(first.path)}")

    return check
