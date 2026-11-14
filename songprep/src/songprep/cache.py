"""Stage cache: a stage is skipped when the hash of its inputs is unchanged.

A stage declares its inputs (parameters, tool versions, and the content hashes
of the files it reads) and its output files. The record of the last successful
run is kept in `<work>/stages.json`. A stage runs again when its input hash
differs, an output file is missing, or it is forced. Downstream stages hash the
files they read, so they re-run only when an upstream result really changed.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

STAGES = ["decode", "separate", "lyrics", "align", "pitch", "notes", "beats", "analysis", "package"]


def file_hash(path: str | os.PathLike[str]) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def inputs_hash(inputs: dict[str, Any]) -> str:
    text = json.dumps(inputs, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_json_atomic(path: Path, value: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp{os.getpid()}")
    with open(tmp, "w", encoding="utf-8") as handle:
        if compact:
            json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(tmp, path)


def read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


@dataclass
class StageResult:
    name: str
    ran: bool
    seconds: float


@dataclass
class StageCache:
    work: Path
    force: set[str] = field(default_factory=set)
    log: Callable[[str], None] = print
    results: list[StageResult] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.work.mkdir(parents=True, exist_ok=True)
        self._path = self.work / "stages.json"
        self._state: dict[str, Any] = read_json(self._path) if self._path.exists() else {}

    def record(self, name: str) -> dict[str, Any] | None:
        return self._state.get(name)

    def is_fresh(self, name: str, key: str, outputs: Iterable[Path]) -> bool:
        record = self._state.get(name)
        if name in self.force or "all" in self.force:
            return False
        return bool(record) and record.get("key") == key and all(Path(p).exists() for p in outputs)

    def run(
        self,
        name: str,
        inputs: dict[str, Any],
        outputs: list[Path],
        fn: Callable[[], dict[str, Any] | None],
    ) -> StageResult:
        """Run `fn` unless the stage is fresh. `fn` may return details to keep in the record."""
        key = inputs_hash(inputs)
        if self.is_fresh(name, key, outputs):
            previous = self._state[name]
            self.log(f"[{name}] cached (ran in {previous.get('seconds', 0):.1f} s)")
            result = StageResult(name, False, float(previous.get("seconds", 0.0)))
            self.results.append(result)
            return result

        # Forget the old record first: an interrupted run must not look finished.
        if name in self._state:
            del self._state[name]
            write_json_atomic(self._path, self._state)
        self.log(f"[{name}] running ...")
        started = time.perf_counter()
        details = fn() or {}
        seconds = time.perf_counter() - started
        missing = [str(p) for p in outputs if not Path(p).exists()]
        if missing:
            raise RuntimeError(f"stage {name} finished without writing {', '.join(missing)}")
        self._state[name] = {
            "key": key,
            "seconds": round(seconds, 3),
            "finished": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "outputs": [str(p) for p in outputs],
            "details": details,
        }
        write_json_atomic(self._path, self._state)
        self.log(f"[{name}] done in {seconds:.1f} s")
        result = StageResult(name, True, seconds)
        self.results.append(result)
        return result

    def details(self, name: str) -> dict[str, Any]:
        record = self._state.get(name) or {}
        return record.get("details") or {}
