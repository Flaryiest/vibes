"""Stage 8: phrases, repeated-phrase groups, range and typical range."""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Sequence

RANGE_MIN_NOTE_S = 0.15


def phrases(notes: Sequence[dict[str, Any]], lyrics: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """One entry per phrase number, in order of appearance.

    A phrase's text is the words under its notes. With `lyrics`, it is taken from
    the lyric line instead, so a word that got no note (no pitch was found for
    it) still counts: the first phrase of a line starts at the line's first
    word and the last one ends at its last word.
    """
    by_number: dict[int, list[dict[str, Any]]] = {}
    for note in notes:
        by_number.setdefault(note["phrase"], []).append(note)
    ordered = sorted(by_number.items(), key=lambda item: item[1][0]["t"])
    result = []
    for position, (number, members) in enumerate(ordered):
        line = members[0]["line"]
        text = " ".join(n["text"] for n in members if n["text"] != "~")
        if lyrics is not None and line < len(lyrics["lines"]) and all(n["line"] == line for n in members):
            words = lyrics["lines"][line]["words"]
            first = min(n["word"] for n in members)
            last = max(n["word"] for n in members)
            if position == 0 or ordered[position - 1][1][0]["line"] != line:
                first = 0
            if position + 1 == len(ordered) or ordered[position + 1][1][0]["line"] != line:
                last = len(words) - 1
            text = " ".join(w["text"] for w in words[first : last + 1])
        result.append(
            {
                "phrase": number,
                "line": line,
                "t0": round(members[0]["t"], 3),
                "t1": round(members[-1]["t"] + members[-1]["d"], 3),
                "noteIds": [n["id"] for n in members],
                "midi": [n["midi"] for n in members],
                "text": text,
            }
        )
    return result


def normalize_text(text: str) -> str:
    """Lyrics compared without case, accents or punctuation."""
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("'", "").replace("’", "")
    return " ".join(re.sub(r"[^\w\s]", " ", text).split())


def group_phrases(phrase_list: Sequence[dict[str, Any]]) -> list[list[int]]:
    """Step 8 of section 4.4: phrases with matching lyrics whose pitches agree
    within one semitone, note for note. Returns groups of phrase numbers; a
    phrase that repeats nowhere is a group of one."""
    groups: list[list[dict[str, Any]]] = []
    for phrase in phrase_list:
        key = normalize_text(phrase["text"])
        for group in groups:
            first = group[0]
            if (
                normalize_text(first["text"]) == key
                and len(first["midi"]) == len(phrase["midi"])
                and all(abs(a - b) <= 1 for a, b in zip(first["midi"], phrase["midi"]))
            ):
                group.append(phrase)
                break
        else:
            groups.append([phrase])
    return [[p["phrase"] for p in group] for group in groups]


def _scored(notes: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    return [n for n in notes if n.get("kind", "normal") == "normal"]


def vocal_range(notes: Sequence[dict[str, Any]]) -> dict[str, int]:
    """Lowest and highest notes of 150 ms or longer."""
    pool = _scored(notes) or list(notes)
    if not pool:
        raise ValueError("no notes: cannot compute a range")
    long_notes = [n for n in pool if n["d"] >= RANGE_MIN_NOTE_S - 1e-9] or pool
    return {"lowMidi": min(n["midi"] for n in long_notes), "highMidi": max(n["midi"] for n in long_notes)}


def typical_range(notes: Sequence[dict[str, Any]]) -> dict[str, int]:
    """Duration-weighted 10th to 90th percentile of the pitches."""
    pool = _scored(notes) or list(notes)
    if not pool:
        raise ValueError("no notes: cannot compute a typical range")
    ordered = sorted(pool, key=lambda n: n["midi"])
    total = sum(n["d"] for n in ordered)

    def percentile(fraction: float) -> int:
        running = 0.0
        for note in ordered:
            running += note["d"]
            if running >= fraction * total - 1e-9:
                return note["midi"]
        return ordered[-1]["midi"]

    return {"lowMidi": percentile(0.10), "highMidi": percentile(0.90)}


def analyze(notes: Sequence[dict[str, Any]], lyrics: dict[str, Any] | None = None) -> dict[str, Any]:
    phrase_list = phrases(notes, lyrics)
    groups = group_phrases(phrase_list)
    return {
        "range": vocal_range(notes),
        "typicalRange": typical_range(notes),
        "phrases": phrase_list,
        "phraseGroups": groups,
    }
