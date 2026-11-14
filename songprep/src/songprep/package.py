"""Stage 9: write the package folder atomically and regenerate `songs/index.json`.

The package is built in a temporary folder next to its destination and moved
into place with one rename (or one atomic exchange when a package is already
there), so the web app never sees a half-written package.

`notes.json` holds the user's corrections and is never overwritten: an
existing one is carried over as it is. Only a first import creates it, as a
copy of `notes.auto.json`.
"""

from __future__ import annotations

import ctypes
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

from .cache import read_json, write_json_atomic

NOTES = "notes.json"
NOTES_AUTO = "notes.auto.json"
PACKAGE_FILES = [
    "manifest.json", "instrumental.flac", "vocals.flac", NOTES_AUTO, NOTES,
    "lyrics.json", "beats.json", "f0.json", "peaks.json",
]  # fmt: skip
BAKED_KEY = re.compile(r"^instrumental_k([+-]\d+)\.flac$")


def baked_key_name(semitones: int) -> str:
    return f"instrumental_k{semitones:+d}.flac"


def baked_keys(folder: Path) -> list[int]:
    """Semitone shifts that have a pre-rendered instrumental in `folder`."""
    keys = []
    if folder.is_dir():
        for item in folder.iterdir():
            match = BAKED_KEY.match(item.name)
            if match:
                keys.append(int(match.group(1)))
    return sorted(keys)


def exchange(a: Path, b: Path) -> bool:
    """Atomically swap two paths. False when the platform cannot do it."""
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        if sys.platform == "darwin":
            function = libc.renamex_np
            function.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
            function.restype = ctypes.c_int
            return function(os.fsencode(a), os.fsencode(b), 0x2) == 0  # RENAME_SWAP
        if sys.platform.startswith("linux"):
            function = libc.renameat2
            function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
            function.restype = ctypes.c_int
            return function(-100, os.fsencode(a), -100, os.fsencode(b), 0x2) == 0  # AT_FDCWD, RENAME_EXCHANGE
    except (AttributeError, OSError):
        pass
    return False


def clean_leftovers(songs_dir: Path, song_id: str) -> None:
    """Remove temporary folders left by an interrupted run."""
    if not songs_dir.is_dir():
        return
    for item in songs_dir.iterdir():
        if item.name.startswith(f".{song_id}.tmp-") or item.name.startswith(f".{song_id}.old-"):
            shutil.rmtree(item, ignore_errors=True)


def install_package(
    songs_dir: Path,
    song_id: str,
    build: Callable[[Path], None],
    *,
    keep_extra_files: bool = True,
) -> Path:
    """Build a package with `build(folder)` and move it to `songs_dir/song_id`.

    `build` writes every generated file except `notes.json`. Files of an existing
    package that `build` did not write (baked key variants) are carried over when
    `keep_extra_files` is true; `notes.json` is always carried over.
    """
    songs_dir.mkdir(parents=True, exist_ok=True)
    clean_leftovers(songs_dir, song_id)
    final = songs_dir / song_id
    staging = Path(tempfile.mkdtemp(prefix=f".{song_id}.tmp-", dir=songs_dir))
    try:
        build(staging)
        if (staging / NOTES).exists():
            raise RuntimeError("the package builder must not write notes.json")
        if final.is_dir():
            for item in final.iterdir():
                target = staging / item.name
                if target.exists() or not (item.name == NOTES or keep_extra_files):
                    continue
                if item.is_dir():
                    shutil.copytree(item, target)
                else:
                    shutil.copy2(item, target)
        if not (staging / NOTES).exists():
            shutil.copy2(staging / NOTES_AUTO, staging / NOTES)
        os.chmod(staging, 0o755)
        if final.exists():
            if exchange(staging, final):
                shutil.rmtree(staging, ignore_errors=True)  # now holds the previous package
            else:
                old = songs_dir / f".{song_id}.old-{os.getpid()}"
                os.rename(final, old)
                os.rename(staging, final)
                shutil.rmtree(old, ignore_errors=True)
        else:
            os.rename(staging, final)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return final


def write_index(songs_dir: Path) -> list[dict[str, Any]]:
    """Regenerate `songs/index.json`: one `{id, title, artist, durationS}` per package."""
    entries = []
    if songs_dir.is_dir():
        for folder in sorted(songs_dir.iterdir()):
            manifest_path = folder / "manifest.json"
            if folder.name.startswith(".") or not manifest_path.is_file():
                continue
            try:
                manifest = read_json(manifest_path)
                entries.append(
                    {
                        "id": str(manifest["id"]),
                        "title": str(manifest["title"]),
                        "artist": str(manifest["artist"]),
                        "durationS": float(manifest["durationS"]),
                    }
                )
            except (ValueError, KeyError, TypeError, OSError):
                continue  # a broken package must not hide the others
    entries.sort(key=lambda e: (e["artist"].lower(), e["title"].lower(), e["id"]))
    songs_dir.mkdir(parents=True, exist_ok=True)
    write_json_atomic(songs_dir / "index.json", entries)
    return entries
