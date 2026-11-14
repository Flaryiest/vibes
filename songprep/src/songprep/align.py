"""Stage 4: word start and end times, from the WhisperX alignment module.

The alignment itself runs in the whisperx environment (`workers/align_worker.py`).
This module chooses each line's time window and tidies the result into
`lyrics.json`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .runner import tool_command

WORKER = Path(__file__).resolve().parent / "workers" / "align_worker.py"

# Window around a timed line: from 1 s before it to 1 s after the next line starts.
PAD_S = 1.0
# Around a transcribed line, whose own start and end came from this audio.
TRANSCRIPT_PAD_S = 0.5
MAX_WINDOW_S = 45.0
MIN_WORD_S = 0.02


def align_command(spec_path: Path, out_path: Path) -> list[str]:
    return tool_command("whisperx", WORKER, "--input", spec_path, "--output", out_path)


def line_windows(lyrics: dict[str, Any], duration_s: float) -> list[dict[str, Any]]:
    """The worker's input lines. Untimed lines get no window; the worker finds one."""
    lines = []
    for line in lyrics["lines"]:
        if line.get("t0") is None:
            lines.append({"text": line["text"], "start": None, "end": None, "anchor": None})
            continue
        if line.get("t1") is not None:
            start, end = line["t0"] - TRANSCRIPT_PAD_S, line["t1"] + TRANSCRIPT_PAD_S
        else:
            start = line["t0"] - PAD_S
            end = (line["tNext"] if line.get("tNext") is not None else line["t0"] + 15.0) + PAD_S
        start = max(0.0, start)
        end = min(duration_s, max(end, start + 1.0), start + MAX_WINDOW_S)
        lines.append({"text": line["text"], "start": round(start, 3), "end": round(end, 3), "anchor": round(line["t0"], 3)})
    return lines


def _fill_missing(words: list[dict[str, Any]], start: float, end: float) -> int:
    """Give times to words the aligner could not place, between their placed neighbors."""
    missing = [i for i, w in enumerate(words) if w["start"] is None or w["end"] is None]
    if not missing:
        return 0
    index = 0
    while index < len(words):
        if words[index]["start"] is not None and words[index]["end"] is not None:
            index += 1
            continue
        run_end = index
        while run_end < len(words) and (words[run_end]["start"] is None or words[run_end]["end"] is None):
            run_end += 1
        left = words[index - 1]["end"] if index > 0 else start
        right = words[run_end]["start"] if run_end < len(words) else end
        right = max(right, left)
        step = (right - left) / (run_end - index)
        for offset, position in enumerate(range(index, run_end)):
            words[position]["start"] = left + step * offset
            words[position]["end"] = left + step * (offset + 1)
            words[position]["score"] = 0.0
        index = run_end
    return len(missing)


def build_lyrics(worker_output: dict[str, Any], offset_s: float, duration_s: float) -> tuple[dict[str, Any], dict[str, Any]]:
    """`lyrics.json` from the worker's output, plus alignment diagnostics.

    Times are in this audio's timeline. Word starts never run backwards and no
    word ends after the next one begins.
    """
    lines_out = []
    unplaced = 0
    low_score_lines = []
    previous_start = 0.0
    all_words: list[dict[str, Any]] = []
    for line_index, line in enumerate(worker_output["lines"]):
        words = [dict(w) for w in line["words"]]
        if not words:
            continue
        unplaced += _fill_missing(words, float(line["start"]), float(line["end"]))
        scores = [w["score"] for w in words if w.get("score") is not None]
        mean_score = sum(scores) / len(scores) if scores else 0.0
        if mean_score < 0.3:
            low_score_lines.append({"line": len(lines_out), "text": line["text"], "score": round(mean_score, 3)})
        tidy = []
        for word in words:
            start = min(max(float(word["start"]), previous_start), duration_s)
            end = min(max(float(word["end"]), start + MIN_WORD_S), max(duration_s, start + MIN_WORD_S))
            previous_start = start
            entry = {"t0": start, "t1": end, "text": word["text"]}
            tidy.append(entry)
            all_words.append(entry)
        lines_out.append({"text": line["text"], "words": tidy, "score": round(mean_score, 3)})
    for current, following in zip(all_words, all_words[1:]):
        if current["t1"] > following["t0"]:
            current["t1"] = max(following["t0"], current["t0"])
    lyrics_lines = []
    for line in lines_out:
        for word in line["words"]:
            word["t0"], word["t1"] = round(word["t0"], 3), round(word["t1"], 3)
        lyrics_lines.append(
            {"t0": line["words"][0]["t0"], "t1": line["words"][-1]["t1"], "text": line["text"], "words": line["words"]}
        )
    lyrics = {"offsetS": round(float(offset_s), 3), "lines": lyrics_lines}
    word_count = len(all_words)
    diagnostics = {
        "model": worker_output.get("model"),
        "globalPass": worker_output.get("globalPass"),
        "versions": worker_output.get("versions", {}),
        "lines": len(lyrics_lines),
        "words": word_count,
        "wordsNotPlaced": unplaced,
        "lineScores": [line["score"] for line in lines_out],
        "lowScoreLines": low_score_lines,
        "windows": [[line["start"], line["end"]] for line in worker_output["lines"]],
    }
    return lyrics, diagnostics
