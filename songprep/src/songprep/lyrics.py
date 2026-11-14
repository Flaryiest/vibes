"""Stage 3: the lyric text, as lines with start times when the source has them.

Sources, in order: a `--lyrics` file (.txt or .lrc), LRCLIB, then transcription
of the vocal stem. Only the artist, title and duration are sent to lrclib.net.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np

from .runner import TRANSCRIBE_MODEL, tool_command

LRCLIB_URL = "https://lrclib.net/api/get"
USER_AGENT = "songprep/0.1"

_TIME_TAG = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]")
_WORD_TAG = re.compile(r"<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>")
_META_TAG = re.compile(r"^\[([a-zA-Z#]+):(.*)\]\s*$")
_SECTION = re.compile(r"^\s*[\[(][^\])]*[\])]\s*$")


def _line(text: str, t0: float | None = None, t_next: float | None = None, t1: float | None = None) -> dict[str, Any]:
    return {"text": " ".join(text.split()), "t0": t0, "tNext": t_next, "t1": t1}


def parse_plain(text: str) -> list[dict[str, Any]]:
    """Plain lyrics: one sung line per text line. Blank lines and section labels
    such as "[Chorus]" or "(x2)" are skipped."""
    lines = []
    for raw in text.splitlines():
        cleaned = raw.strip()
        if not cleaned or _SECTION.match(cleaned):
            continue
        lines.append(_line(cleaned))
    return lines


def parse_lrc(text: str) -> list[dict[str, Any]]:
    """LRC: `[mm:ss.xx]words`. A time tag with no words ends the line before it."""
    offset_s = 0.0
    stamps: list[tuple[float, str]] = []
    for raw in text.splitlines():
        raw = raw.strip()
        meta = _META_TAG.match(raw)
        if meta and not _TIME_TAG.match(raw):
            if meta.group(1).lower() == "offset":
                try:
                    # LRC convention: a positive offset makes the lyrics appear earlier.
                    offset_s = -float(meta.group(2).strip()) / 1000.0
                except ValueError:
                    pass
            continue
        times = []
        position = 0
        while True:
            match = _TIME_TAG.match(raw, position)
            if not match:
                break
            seconds = float(match.group(2).replace(":", "."))
            times.append(int(match.group(1)) * 60 + seconds)
            position = match.end()
        if not times:
            continue
        words = _WORD_TAG.sub(" ", raw[position:]).strip()
        for time in times:
            stamps.append((time, words))
    stamps.sort(key=lambda item: item[0])
    lines = []
    for index, (time, words) in enumerate(stamps):
        if not words or _SECTION.match(words):
            continue
        following = stamps[index + 1][0] if index + 1 < len(stamps) else None
        lines.append(_line(words, max(0.0, time + offset_s), None if following is None else max(0.0, following + offset_s)))
    return lines


def read_lyrics_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    timed = path.suffix.lower() == ".lrc" or bool(_TIME_TAG.search(text[:2000]))
    lines = parse_lrc(text) if timed else parse_plain(text)
    if not lines:
        raise ValueError(f"no lyric lines found in {path}")
    return {"source": "file", "needReview": False, "timed": timed, "lines": lines}


def lrclib_url(artist: str, title: str, duration_s: float) -> str:
    query = {"artist_name": artist, "track_name": title, "duration": str(int(round(duration_s)))}
    return f"{LRCLIB_URL}?{urllib.parse.urlencode(query)}"


def fetch_lrclib(artist: str, title: str, duration_s: float, timeout_s: float = 20.0) -> tuple[dict[str, Any] | None, str]:
    """Ask LRCLIB for lyrics. Returns (lyrics or None, what happened)."""
    request = urllib.request.Request(lrclib_url(artist, title, duration_s), headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            record = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return None, "no match" if error.code == 404 else f"HTTP {error.code}"
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
        return None, f"request failed: {error}"
    return lyrics_from_lrclib(record)


def lyrics_from_lrclib(record: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    if record.get("instrumental"):
        return None, "LRCLIB marks this track as instrumental"
    synced = record.get("syncedLyrics")
    if synced:
        lines = parse_lrc(synced)
        if lines:
            return {"source": "lrclib", "needReview": False, "timed": True, "lines": lines}, "line-synced lyrics"
    plain = record.get("plainLyrics")
    if plain:
        lines = parse_plain(plain)
        if lines:
            return {"source": "lrclib", "needReview": False, "timed": False, "lines": lines}, "plain lyrics"
    return None, "the LRCLIB record has no lyrics"


def transcribe_command(vocals: Path, out_dir: Path, language: str) -> list[str]:
    return tool_command(
        "mlx-whisper", vocals,
        "--model", TRANSCRIBE_MODEL,
        "--task", "transcribe",
        "--language", language,
        "--condition-on-previous-text", "False",
        "--word-timestamps", "True",
        "--hallucination-silence-threshold", "2",
        "--output-format", "json",
        "--output-dir", out_dir,
        "--output-name", "transcript",
        "--verbose", "False",
    )  # fmt: skip


def lyrics_from_transcript(transcript: dict[str, Any]) -> dict[str, Any]:
    """Whisper segments become lyric lines, timed by the transcriber."""
    lines = []
    for segment in transcript.get("segments", []):
        text = " ".join(str(segment.get("text", "")).split())
        if not text or float(segment.get("no_speech_prob", 0.0)) > 0.6:
            continue
        start, end = float(segment["start"]), float(segment["end"])
        if end <= start:
            continue
        if lines and lines[-1]["tNext"] is None:
            lines[-1]["tNext"] = start
        lines.append(_line(text, start, None, end))
    return {"source": "transcribed", "needReview": True, "timed": True, "lines": lines}


def vocal_activity(rms: np.ndarray) -> np.ndarray:
    """True where the vocal stem is sounding."""
    if len(rms) == 0:
        return np.zeros(0, dtype=bool)
    loud = float(np.percentile(rms, 95))
    return rms > max(loud * 0.1, 1e-4)


def drop_silent_lines(lines: list[dict[str, Any]], activity: np.ndarray, hop_s: float, min_share: float = 0.2) -> tuple[list[dict[str, Any]], list[str]]:
    """Remove transcribed lines that sit where the vocal stem is silent.

    A speech recognizer invents text over silence ("Thank you." in an
    instrumental intro). A line stays when the voice sounds for at least
    `min_share` of its span. Returns (kept lines, dropped texts).
    """
    kept, dropped = [], []
    for line in lines:
        a, b = int(line["t0"] / hop_s), max(int(line["t1"] / hop_s), int(line["t0"] / hop_s) + 1)
        span = activity[a:b]
        if len(span) and float(span.mean()) >= min_share:
            kept.append(line)
        else:
            dropped.append(line["text"])
    for line, following in zip(kept, kept[1:]):
        line["tNext"] = following["t0"]
    if kept:
        kept[-1]["tNext"] = None
    return kept, dropped


def estimate_offset(
    line_starts: list[float], activity: np.ndarray, hop_s: float, search_s: float = 5.0, min_gain: float = 0.08
) -> tuple[float, dict[str, float]]:
    """Global shift that best puts lyric line starts on vocal onsets (spec section 4.5).

    For each candidate shift, score how much more the voice sounds in the 0.4 s
    after each line start than in the 0.4 s before it. The shift is kept only
    when it clearly beats no shift at all.
    """
    if len(line_starts) < 3 or len(activity) == 0:
        return 0.0, {"score": 0.0, "scoreAtZero": 0.0}
    cumulative = np.concatenate([[0.0], np.cumsum(activity.astype(np.float64))])
    window = max(1, int(round(0.4 / hop_s)))
    starts = np.asarray(line_starts, dtype=np.float64)

    def score(offset: float) -> float:
        centers = np.round((starts + offset) / hop_s).astype(int)
        centers = centers[(centers - window >= 0) & (centers + window < len(cumulative))]
        if len(centers) == 0:
            return -1.0
        after = cumulative[centers + window] - cumulative[centers]
        before = cumulative[centers] - cumulative[centers - window]
        return float((after - before).mean() / window)

    offsets = np.arange(-search_s, search_s + 1e-9, hop_s)
    scores = np.array([score(o) for o in offsets])
    best = int(np.argmax(scores))
    at_zero = score(0.0)
    info = {"score": round(float(scores[best]), 3), "scoreAtZero": round(at_zero, 3)}
    if scores[best] - at_zero < min_gain:
        return 0.0, info
    return round(float(offsets[best]), 3), info


def apply_offset(lyrics: dict[str, Any], offset_s: float) -> None:
    for line in lyrics["lines"]:
        for key in ("t0", "tNext", "t1"):
            if line.get(key) is not None:
                line[key] = round(max(0.0, line[key] + offset_s), 3)
