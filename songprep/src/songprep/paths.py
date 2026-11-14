"""Where songprep reads and writes.

Everything lives under the repository root (the folder that contains
`songprep/`), unless overridden:

- `songs/`               song packages (SONGPREP_SONGS_DIR)
- `data/songprep-work/`  per-song stage cache (SONGPREP_WORK_DIR)
- `data/models/`         model weights downloaded by the tools (SONGPREP_MODELS_DIR)
"""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path


def repo_root() -> Path:
    env = os.environ.get("SONGPREP_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    # src/songprep/paths.py -> songprep/ -> repository root
    return Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Paths:
    root: Path
    songs: Path
    work: Path
    models: Path

    def song_work(self, song_id: str) -> Path:
        return self.work / song_id

    def package(self, song_id: str) -> Path:
        return self.songs / song_id


def default_paths(
    songs_dir: str | os.PathLike[str] | None = None,
    work_dir: str | os.PathLike[str] | None = None,
    models_dir: str | os.PathLike[str] | None = None,
) -> Paths:
    root = repo_root()

    def pick(arg: str | os.PathLike[str] | None, env: str, default: Path) -> Path:
        value = arg or os.environ.get(env)
        return Path(value).expanduser().resolve() if value else default

    return Paths(
        root=root,
        songs=pick(songs_dir, "SONGPREP_SONGS_DIR", root / "songs"),
        work=pick(work_dir, "SONGPREP_WORK_DIR", root / "data" / "songprep-work"),
        models=pick(models_dir, "SONGPREP_MODELS_DIR", root / "data" / "models"),
    )


def slugify(text: str) -> str:
    """ "Gigi Perez" + "Sailor Song" -> "gigi-perez-sailor-song"."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug


def song_id(artist: str, title: str) -> str:
    slug = slugify(f"{artist} {title}")
    if not slug:
        raise ValueError("artist and title must contain at least one letter or digit")
    return slug
