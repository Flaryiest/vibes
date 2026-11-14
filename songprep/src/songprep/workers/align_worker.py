"""Word timing with the WhisperX alignment module (wav2vec2 on CPU).

This file runs inside the isolated whisperx environment, not inside songprep:

    uv tool run --from whisperx==<version> python align_worker.py --input in.json --output out.json

Input JSON:  {"audio": path, "language": "en",
              "lines": [{"text": str, "start": float | null, "end": float | null,
                         "anchor": float | null}, ...]}
             start/end: the line's time window; anchor: when the line is expected to begin.
Output JSON: {"lines": [{"text", "start", "end", "words": [{"text", "start", "end", "score"}]}],
              "model": str, "globalPass": bool, "versions": {...}}

Each line is aligned inside its own time window. When the lines carry no
times (plain-text lyrics), a first pass aligns the whole text against the whole
stem to find each line's window: the wav2vec2 output is computed in 20 s pieces
(the full stem at once would not fit in memory) and joined, then one CTC forced
alignment runs over all of it.
"""

from __future__ import annotations

import argparse
import json
import sys

FRAME_S = 0.02  # wav2vec2 output step: 320 samples at 16 kHz
SAMPLES_PER_FRAME = 320


def clean_token(token: str) -> str:
    """Keep what a character aligner can use: letters, digits and apostrophes."""
    return "".join(ch for ch in token.replace("’", "'") if ch.isalnum() or ch == "'")


def emissions(model, model_type: str, audio, chunk_s: float = 20.0, context_s: float = 1.0):
    """Log-probabilities for the whole signal, one row per 20 ms."""
    import torch

    chunk = int(chunk_s * 16000) // SAMPLES_PER_FRAME * SAMPLES_PER_FRAME
    context = int(context_s * 16000) // SAMPLES_PER_FRAME * SAMPLES_PER_FRAME
    total = len(audio)
    parts = []
    with torch.inference_mode():
        for start in range(0, total, chunk):
            a = max(0, start - context)
            b = min(total, start + chunk + context + 80)
            wave = torch.from_numpy(audio[a:b]).unsqueeze(0)
            if wave.shape[1] < 400:
                wave = torch.nn.functional.pad(wave, (0, 400 - wave.shape[1]))
            out = model(wave)[0] if model_type == "torchaudio" else model(wave).logits
            out = torch.log_softmax(out, dim=-1)[0]
            left = (start - a) // SAMPLES_PER_FRAME
            parts.append(out[left : left + chunk // SAMPLES_PER_FRAME])
    return torch.cat(parts)


def blank_id(dictionary: dict[str, int]) -> int:
    for char, code in dictionary.items():
        if char in ("[pad]", "<pad>"):
            return code
    return 0


def global_windows(model, metadata, audio, lines, pad_before: float = 0.5, pad_after: float = 0.75):
    """Give every line a time window by aligning all the text against the whole stem."""
    import torch
    import torchaudio

    dictionary = metadata["dictionary"]
    blank = blank_id(dictionary)
    separator = dictionary.get("|")
    emission = emissions(model, metadata["type"], audio)

    targets: list[int] = []
    spans: list[tuple[int, int, int] | None] = []  # per word: (line, first token, last token + 1)
    for line_index, line in enumerate(lines):
        for token in line["clean"]:
            codes = [dictionary[c] for c in token.lower() if c in dictionary and dictionary[c] != blank and c != "|"]
            if not codes:
                continue
            if targets and separator is not None and separator != blank:
                targets.append(separator)
            spans.append((line_index, len(targets), len(targets) + len(codes)))
            targets.extend(codes)
    if not targets:
        raise SystemExit("none of the lyric text can be aligned with this language's model")
    if len(targets) >= emission.shape[0]:
        raise SystemExit("the lyrics are longer than the audio can hold")

    aligned, scores = torchaudio.functional.forced_align(
        emission.unsqueeze(0), torch.tensor([targets], dtype=torch.int32), blank=blank
    )
    token_spans = torchaudio.functional.merge_tokens(aligned[0], scores[0].exp())
    if len(token_spans) != len(targets):
        raise SystemExit("forced alignment returned an unexpected number of tokens")

    duration = len(audio) / 16000.0
    bounds: dict[int, list[float]] = {}
    for span in spans:
        line_index, first, last = span
        start, end = token_spans[first].start * FRAME_S, token_spans[last - 1].end * FRAME_S
        if line_index in bounds:
            bounds[line_index][1] = end
        else:
            bounds[line_index] = [start, end]

    known = sorted(bounds)
    for position, line_index in enumerate(known):
        start, end = bounds[line_index]
        window_start = start - pad_before
        window_end = end + pad_after
        if position > 0:
            window_start = max(window_start, bounds[known[position - 1]][1] - 0.1)
        if position + 1 < len(known):
            window_end = min(window_end, bounds[known[position + 1]][0] + 0.25)
        lines[line_index]["start"] = max(0.0, min(window_start, start))
        lines[line_index]["end"] = min(duration, max(window_end, end + 0.1))
        lines[line_index]["anchor"] = start
    # A line with nothing alignable takes the gap between its neighbors.
    for line_index, line in enumerate(lines):
        if line_index in bounds:
            continue
        before = [bounds[i][1] for i in known if i < line_index]
        after = [bounds[i][0] for i in known if i > line_index]
        line["start"] = before[-1] if before else 0.0
        line["end"] = after[0] if after else duration


def align_line(align, model, metadata, audio_tensor, line, duration: float):
    """Word times for one line inside its window."""
    start = max(0.0, float(line["start"]))
    end = min(duration, float(line["end"]))
    tokens = line["tokens"]
    words = [{"text": token, "start": None, "end": None, "score": None} for token in tokens]
    usable = [i for i, token in enumerate(line["clean"]) if token]
    if not usable or end - start < 0.05:
        return words
    text = " ".join(line["clean"][i] for i in usable)
    result = align([{"start": start, "end": end, "text": text}], model, metadata, audio_tensor, "cpu")
    found = result.get("word_segments", [])
    if len(found) != len(usable):
        return words
    for index, segment in zip(usable, found):
        if "start" in segment and "end" in segment:
            words[index]["start"] = round(float(segment["start"]), 3)
            words[index]["end"] = round(float(segment["end"]), 3)
            words[index]["score"] = round(float(segment.get("score", 0.0)), 3)
    return words


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    with open(args.input, encoding="utf-8") as handle:
        spec = json.load(handle)

    import logging
    from importlib.metadata import version

    import torch
    from whisperx.alignment import DEFAULT_ALIGN_MODELS_HF, DEFAULT_ALIGN_MODELS_TORCH, align, load_align_model
    from whisperx.audio import load_audio

    logging.getLogger("whisperx").setLevel(logging.ERROR)
    torch.set_grad_enabled(False)
    language = spec["language"]
    audio = load_audio(spec["audio"])
    duration = len(audio) / 16000.0
    model, metadata = load_align_model(language, "cpu")
    model.eval()
    model_name = DEFAULT_ALIGN_MODELS_TORCH.get(language) or DEFAULT_ALIGN_MODELS_HF.get(language) or "unknown"

    lines = spec["lines"]
    for line in lines:
        line["tokens"] = line["text"].split()
        line["clean"] = [clean_token(token) for token in line["tokens"]]

    global_pass = any(line.get("start") is None or line.get("end") is None for line in lines)
    if global_pass:
        global_windows(model, metadata, audio, lines)

    audio_tensor = torch.from_numpy(audio)
    out_lines = []
    previous_end = None
    for index, line in enumerate(lines):
        # A window opens before its line, so the first word could be matched to the end of
        # the line before. Start no earlier than where that line's last word was found, but
        # never later than 0.3 s before the time this line is expected at.
        if previous_end is not None:
            limit = previous_end
            if line.get("anchor") is not None:
                limit = min(limit, float(line["anchor"]) - 0.3)
            line["start"] = min(max(float(line["start"]), limit), float(line["end"]) - 0.5)
        words = align_line(align, model, metadata, audio_tensor, line, duration)
        ends = [word["end"] for word in words if word["end"] is not None]
        if ends:
            previous_end = max(ends)
        out_lines.append({"text": line["text"], "start": round(float(line["start"]), 3), "end": round(float(line["end"]), 3), "words": words})
        print(f"aligned line {index + 1}/{len(lines)}", file=sys.stderr, flush=True)

    result = {
        "lines": out_lines,
        "model": model_name,
        "globalPass": global_pass,
        "versions": {"whisperx": version("whisperx"), "torch": torch.__version__},
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
