"""`songprep import`: the nine stages of spec section 4.2, each cached by its inputs."""

from __future__ import annotations

import json
import shutil
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

import soundfile

from . import __version__, align, analysis, audio, beats, lyrics, notes, package, pitch
from .cache import STAGES, StageCache, file_hash, read_json, write_json_atomic
from .paths import Paths, song_id
from .runner import (
    BEAT_MODEL,
    LEAD_VOCAL_MODEL,
    SEPARATION_MODEL,
    SEPARATION_OVERLAP,
    TOOLS,
    TRANSCRIBE_MODEL,
    StageError,
    program_version,
    run,
    tool_command,
    tool_env,
)

# Bump when a stage's logic changes in a way that should invalidate cached results.
STAGE_VERSIONS = {"decode": 1, "separate": 2, "lyrics": 2, "align": 1, "pitch": 1, "notes": 2, "beats": 2, "analysis": 2, "package": 1}


@dataclass
class ImportOptions:
    audio: Path
    artist: str
    title: str
    lyrics: Path | None = None
    language: str = "en"
    lead_only: bool = False
    force: set[str] = field(default_factory=set)
    no_lrclib: bool = False
    fmin: float = pitch.DEFAULT_FMIN
    fmax: float = pitch.DEFAULT_FMAX


@dataclass
class ImportResult:
    song_id: str
    package: Path
    manifest: dict[str, Any]
    timings: list[dict[str, Any]]
    summary: dict[str, Any]


def _stage(name: str, fn: Callable[[], dict[str, Any] | None]) -> Callable[[], dict[str, Any] | None]:
    """Turn any error inside a stage into a StageError that names the stage."""

    def wrapped() -> dict[str, Any] | None:
        try:
            return fn()
        except StageError:
            raise
        except Exception as error:  # noqa: BLE001 - every failure must name its stage
            raise StageError(name, f"{type(error).__name__}: {error}") from error

    return wrapped


def separate_command(wav: Path, out_dir: Path, models: Path, model: str, names: dict[str, str]) -> list[str]:
    return tool_command(
        "audio-separator", wav,
        "--model_filename", model,
        "--model_file_dir", models / "audio-separator",
        "--output_format", "FLAC",
        "--sample_rate", str(audio.SAMPLE_RATE),
        "--output_dir", out_dir,
        "--mdxc_overlap", str(SEPARATION_OVERLAP),
        "--custom_output_names", json.dumps(names),
    )  # fmt: skip


def run_import(options: ImportOptions, paths: Paths, log: Callable[[str], None] = print) -> ImportResult:
    source = options.audio.expanduser().resolve()
    if not source.is_file():
        raise StageError("decode", f"audio file not found: {source}")
    if options.lyrics is not None and not options.lyrics.expanduser().is_file():
        raise StageError("lyrics", f"lyrics file not found: {options.lyrics}")
    unknown = options.force - set(STAGES) - {"all"}
    if unknown:
        raise StageError("import", f"unknown stage for --force: {', '.join(sorted(unknown))}. Stages: {', '.join(STAGES)}")

    try:
        sid = song_id(options.artist, options.title)
    except ValueError as error:
        raise StageError("import", str(error)) from error
    work = paths.song_work(sid)
    logs = work / "logs"
    cache = StageCache(work, force=set(options.force), log=log)
    env = tool_env(paths.models)
    log(f"song id: {sid}")
    log(f"work folder: {work}")

    # 1. Decode
    source_hash = file_hash(source)
    wav = work / "source.wav"

    def do_decode() -> dict[str, Any]:
        audio.decode(source, wav, logs / "decode.log")
        return {"durationS": round(audio.duration_s(wav), 3)}

    cache.run(
        "decode",
        {"v": STAGE_VERSIONS["decode"], "source": source_hash, "args": audio.decode_command(Path("in"), Path("out"))},
        [wav],
        _stage("decode", do_decode),
    )
    duration = float(cache.details("decode").get("durationS") or audio.duration_s(wav))
    wav_hash = file_hash(wav)

    # 2. Separate
    sep_dir = work / "separate"
    vocals, instrumental = sep_dir / "vocals.flac", sep_dir / "instrumental.flac"

    def do_separate() -> dict[str, Any]:
        sep_dir.mkdir(parents=True, exist_ok=True)
        for stale in (vocals, instrumental):
            stale.unlink(missing_ok=True)
        command = separate_command(wav, sep_dir, paths.models, SEPARATION_MODEL, {"Vocals": "vocals", "Instrumental": "instrumental"})
        run("separate", command, env=env, log=logs / "separate.log")
        for stem in (vocals, instrumental):
            if not stem.exists():
                raise StageError("separate", f"audio-separator did not write {stem.name}", command, logs / "separate.log")
            info = soundfile.info(str(stem))
            if info.samplerate != audio.SAMPLE_RATE:
                raise StageError("separate", f"{stem.name} is {info.samplerate} Hz, expected {audio.SAMPLE_RATE}", command)
        levels = audio.match_stem_levels(wav, vocals, instrumental)
        if not levels["matched"]:
            log("[separate] the stems do not add up to the mix; their levels were left as the separator wrote them")
        return {"model": SEPARATION_MODEL, "overlap": SEPARATION_OVERLAP, "levels": levels}

    cache.run(
        "separate",
        {"v": STAGE_VERSIONS["separate"], "wav": wav_hash, "tool": TOOLS["audio-separator"].requirement, "model": SEPARATION_MODEL, "overlap": SEPARATION_OVERLAP},
        [vocals, instrumental],
        _stage("separate", do_separate),
    )
    vocals_hash = file_hash(vocals)

    # 2b. Optional: strip backing vocals for the pitch and note stages.
    pitch_stem = vocals
    if options.lead_only:
        lead_dir = work / "lead"
        lead = lead_dir / "lead.flac"
        if "separate" in options.force:
            cache.force.add("lead")

        def do_lead() -> dict[str, Any]:
            lead_dir.mkdir(parents=True, exist_ok=True)
            lead.unlink(missing_ok=True)
            command = separate_command(vocals, lead_dir, paths.models, LEAD_VOCAL_MODEL, {"Vocals": "lead", "Instrumental": "backing"})
            run("separate", command, env=env, log=logs / "lead.log")
            if not lead.exists():
                raise StageError("separate", "the lead-vocal pass did not write lead.flac", command, logs / "lead.log")
            return {"model": LEAD_VOCAL_MODEL}

        cache.run(
            "lead",
            {"v": STAGE_VERSIONS["separate"], "vocals": vocals_hash, "tool": TOOLS["audio-separator"].requirement, "model": LEAD_VOCAL_MODEL, "overlap": SEPARATION_OVERLAP},
            [lead],
            _stage("separate", do_lead),
        )
        pitch_stem = lead

    # 3. Lyrics text
    lyrics_text_path = work / "lyrics_text.json"
    lyrics_file = options.lyrics.expanduser().resolve() if options.lyrics else None

    def do_lyrics() -> dict[str, Any]:
        details: dict[str, Any] = {}
        found: dict[str, Any] | None = None
        if lyrics_file is not None:
            found = lyrics.read_lyrics_file(lyrics_file)
        else:
            if options.no_lrclib:
                details["lrclib"] = "skipped (--no-lrclib)"
            else:
                found, status = lyrics.fetch_lrclib(options.artist, options.title, duration)
                details["lrclib"] = status
                log(f"[lyrics] LRCLIB: {status}")
            if found is None:
                log(f"[lyrics] transcribing the vocal stem with {TRANSCRIBE_MODEL}; the text will need review")
                out_dir = work / "transcribe"
                out_dir.mkdir(parents=True, exist_ok=True)
                command = lyrics.transcribe_command(vocals, out_dir, options.language)
                run("lyrics", command, env=env, log=logs / "transcribe.log")
                transcript_path = out_dir / "transcript.json"
                if not transcript_path.exists():
                    raise StageError("lyrics", "mlx_whisper did not write transcript.json", command, logs / "transcribe.log")
                found = lyrics.lyrics_from_transcript(read_json(transcript_path))
                mono, rate = audio.read_mono(vocals)
                activity = lyrics.vocal_activity(audio.rms_envelope(mono, rate, 0.02))
                found["lines"], dropped = lyrics.drop_silent_lines(found["lines"], activity, 0.02)
                if dropped:
                    details["droppedSilentLines"] = dropped
                    log(f"[lyrics] dropped {len(dropped)} transcribed line(s) where the vocal stem is silent: {dropped}")
                if not found["lines"]:
                    raise StageError("lyrics", "the transcription is empty; supply the words with --lyrics", command)
        offset = 0.0
        if found["timed"] and found["source"] != "transcribed":
            mono, rate = audio.read_mono(vocals)
            activity = lyrics.vocal_activity(audio.rms_envelope(mono, rate, 0.02))
            offset, info = lyrics.estimate_offset([line["t0"] for line in found["lines"]], activity, 0.02)
            lyrics.apply_offset(found, offset)
            details["offsetFit"] = info
        found["offsetS"] = offset
        found["language"] = options.language
        write_json_atomic(lyrics_text_path, found)
        details.update({"source": found["source"], "timed": found["timed"], "lines": len(found["lines"]), "offsetS": offset})
        return details

    cache.run(
        "lyrics",
        {
            "v": STAGE_VERSIONS["lyrics"],
            "file": file_hash(lyrics_file) if lyrics_file else None,
            "timedFile": lyrics_file.suffix.lower() if lyrics_file else None,
            "artist": options.artist,
            "title": options.title,
            "duration": int(round(duration)),
            "language": options.language,
            "noLrclib": options.no_lrclib,
            "vocals": vocals_hash,
            "transcriber": [TOOLS["mlx-whisper"].requirement, TRANSCRIBE_MODEL],
        },
        [lyrics_text_path],
        _stage("lyrics", do_lyrics),
    )
    lyrics_text = read_json(lyrics_text_path)

    # 4. Word timing
    lyrics_path, align_path = work / "lyrics.json", work / "align.json"

    def do_align() -> dict[str, Any]:
        spec_path, out_path = work / "align_in.json", work / "align_out.json"
        out_path.unlink(missing_ok=True)
        spec = {"audio": str(vocals), "language": options.language, "lines": align.line_windows(lyrics_text, duration)}
        write_json_atomic(spec_path, spec)
        command = align.align_command(spec_path, out_path)
        run("align", command, env=env, log=logs / "align.log")
        if not out_path.exists():
            raise StageError("align", "the alignment worker did not write its output", command, logs / "align.log")
        built, diagnostics = align.build_lyrics(read_json(out_path), lyrics_text.get("offsetS", 0.0), duration)
        if not built["lines"]:
            raise StageError("align", "no lyric line could be aligned", command, logs / "align.log")
        write_json_atomic(lyrics_path, built)
        write_json_atomic(align_path, diagnostics)
        return {k: diagnostics[k] for k in ("model", "globalPass", "lines", "words", "wordsNotPlaced")} | {
            "lowScoreLines": len(diagnostics["lowScoreLines"])
        }

    cache.run(
        "align",
        {
            "v": STAGE_VERSIONS["align"],
            "lyrics": file_hash(lyrics_text_path),
            "vocals": vocals_hash,
            "worker": file_hash(align.WORKER),
            "tool": TOOLS["whisperx"].requirement,
            "language": options.language,
        },
        [lyrics_path, align_path],
        _stage("align", do_align),
    )

    # 5. Pitch
    mono16k, f0_path = work / "vocals16k.wav", work / "f0.json"

    def do_pitch() -> dict[str, Any]:
        run("pitch", audio.mono16k_command(pitch_stem, mono16k), log=logs / "pitch.log")
        f0 = pitch.track_pitch_file(str(mono16k), options.fmin, options.fmax)
        write_json_atomic(f0_path, f0, compact=True)
        voiced = sum(1 for v in f0["hz"] if v > 0)
        return {"frames": len(f0["hz"]), "voicedFrames": voiced, "stem": pitch_stem.name}

    from importlib.metadata import version as package_version

    swift_version = package_version("swift-f0")
    cache.run(
        "pitch",
        {"v": STAGE_VERSIONS["pitch"], "stem": file_hash(pitch_stem), "fmin": options.fmin, "fmax": options.fmax, "swift-f0": swift_version},
        [mono16k, f0_path],
        _stage("pitch", do_pitch),
    )

    # 6. Notes
    notes_path = work / "notes.auto.json"
    params = notes.NoteParams()

    def do_notes() -> dict[str, Any]:
        samples, rate = audio.read_mono(mono16k)
        found, stats = notes.extract_notes(read_json(f0_path), read_json(lyrics_path), samples, rate, params)
        if not found:
            raise StageError("notes", "no notes were found: check the vocal stem and the lyric timing")
        write_json_atomic(notes_path, found)
        return {
            "notes": stats.notes,
            "words": stats.words,
            "wordsWithoutNotes": stats.words_without_notes,
            "octaveFlagged": stats.octave_flagged,
            "octaveCorrected": stats.octave_corrected,
        }

    cache.run(
        "notes",
        {
            "v": STAGE_VERSIONS["notes"],
            "f0": file_hash(f0_path),
            "lyrics": file_hash(lyrics_path),
            "audio": file_hash(mono16k),
            "params": asdict(params),
        },
        [notes_path],
        _stage("notes", do_notes),
    )

    # 7. Beats
    raw_beats, beats_path = work / "instrumental.beats", work / "beats.json"

    def do_beats() -> dict[str, Any]:
        raw_beats.unlink(missing_ok=True)
        command = beats.beat_command(instrumental, raw_beats)
        run("beats", command, env=env, log=logs / "beats.log")
        if not raw_beats.exists():
            raise StageError("beats", "beat_this did not write its output", command, logs / "beats.log")
        built = beats.build_beats(raw_beats.read_text(encoding="utf-8"))
        if len(built["beats"]) < 2:
            raise StageError("beats", "beat_this found fewer than two beats", command, logs / "beats.log")
        write_json_atomic(beats_path, built)
        if built["tempoAdjusted"] != "none":
            log(f"[beats] tracker tempo {built['trackerBpm']} BPM is outside 70-180; beat grid {built['tempoAdjusted']}")
        if any(built["regularized"].values()):
            log(f"[beats] the tracker changed between beat levels; grid made even: {built['regularized']}")
        if built["evenShare"] < 0.9:
            log(f"[beats] only {built['evenShare']:.0%} of beat intervals are within 10% of the tempo; check the grid in the editor")
        return {k: built[k] for k in ("bpm", "trackerBpm", "tempoAdjusted", "regularized", "evenShare")} | {
            "beats": len(built["beats"]),
            "downbeats": len(built["downbeats"]),
        }

    cache.run(
        "beats",
        {"v": STAGE_VERSIONS["beats"], "instrumental": file_hash(instrumental), "tool": TOOLS["beat_this"].requirement, "model": BEAT_MODEL},
        [raw_beats, beats_path],
        _stage("beats", do_beats),
    )

    # 8. Analysis
    analysis_path = work / "analysis.json"

    def do_analysis() -> dict[str, Any]:
        result = analysis.analyze(read_json(notes_path), read_json(lyrics_path))
        result["bpm"] = read_json(beats_path)["bpm"]
        write_json_atomic(analysis_path, result)
        repeated = [g for g in result["phraseGroups"] if len(g) > 1]
        return {
            "range": result["range"],
            "typicalRange": result["typicalRange"],
            "phrases": len(result["phrases"]),
            "phraseGroups": len(result["phraseGroups"]),
            "repeatedGroups": len(repeated),
        }

    cache.run(
        "analysis",
        {"v": STAGE_VERSIONS["analysis"], "notes": file_hash(notes_path), "lyrics": file_hash(lyrics_path), "beats": file_hash(beats_path)},
        [analysis_path],
        _stage("analysis", do_analysis),
    )

    # 9. Package
    final = paths.package(sid)
    analysed = read_json(analysis_path)
    beat_data = read_json(beats_path)
    previous_manifest = read_json(final / "manifest.json") if (final / "manifest.json").is_file() else None
    same_source = previous_manifest is not None and previous_manifest.get("sourceHash") == f"sha256:{source_hash}"
    if previous_manifest is not None and not same_source:
        log("[package] the source audio differs from the package already in songs/; its notes.json is kept, baked keys are dropped")

    tools: dict[str, str] = {
        "songprep": __version__,
        "ffmpeg": (program_version(["ffmpeg", "-version"]) or "unknown").removeprefix("ffmpeg version ").split(" ")[0],
        "audio-separator": TOOLS["audio-separator"].version,
        "separationModel": SEPARATION_MODEL,
        "whisperx": TOOLS["whisperx"].version,
        "alignModel": str(cache.details("align").get("model") or "unknown"),
        "swift-f0": swift_version,
        "beat_this": TOOLS["beat_this"].version,
        "beatModel": BEAT_MODEL,
    }
    if options.lead_only:
        tools["leadVocalModel"] = LEAD_VOCAL_MODEL
    if lyrics_text["source"] == "transcribed":
        tools["mlx-whisper"] = TOOLS["mlx-whisper"].version
        tools["transcribeModel"] = TRANSCRIBE_MODEL

    manifest: dict[str, Any] = {
        "schema": 1,
        "id": sid,
        "title": options.title,
        "artist": options.artist,
        "durationS": round(duration, 3),
        "sampleRate": audio.SAMPLE_RATE,
        "sourceHash": f"sha256:{source_hash}",
        "tools": tools,
        "lyricsSource": lyrics_text["source"],
        "lyricsNeedReview": bool(lyrics_text["needReview"]),
        "bpm": beat_data["bpm"],
        "range": analysed["range"],
        "typicalRange": analysed["typicalRange"],
        "bakedKeys": package.baked_keys(final) if same_source else [],
    }

    def build(folder: Path) -> None:
        shutil.copy2(vocals, folder / "vocals.flac")
        shutil.copy2(instrumental, folder / "instrumental.flac")
        shutil.copy2(notes_path, folder / package.NOTES_AUTO)
        shutil.copy2(lyrics_path, folder / "lyrics.json")
        shutil.copy2(f0_path, folder / "f0.json")
        write_json_atomic(folder / "beats.json", {"beats": beat_data["beats"], "downbeats": beat_data["downbeats"]})
        write_json_atomic(
            folder / "peaks.json",
            {"hopS": 0.02, "vocals": audio.peaks(vocals, 0.02), "instrumental": audio.peaks(instrumental, 0.02)},
            compact=True,
        )
        write_json_atomic(folder / "manifest.json", manifest)

    def do_package() -> dict[str, Any]:
        had_notes = (final / package.NOTES).is_file()
        package.install_package(paths.songs, sid, build, keep_extra_files=same_source)
        size = sum(f.stat().st_size for f in final.iterdir() if f.is_file())
        return {"folder": str(final), "bytes": size, "notesJson": "kept" if had_notes else "created from notes.auto.json"}

    cache.run(
        "package",
        {
            "v": STAGE_VERSIONS["package"],
            "manifest": manifest,
            "files": [file_hash(p) for p in (vocals, instrumental, notes_path, lyrics_path, f0_path, beats_path)],
        },
        [final / name for name in package.PACKAGE_FILES],
        _stage("package", do_package),
    )
    package.write_index(paths.songs)

    timings = [{"stage": r.name, "ran": r.ran, "seconds": round(r.seconds, 2)} for r in cache.results]
    write_json_atomic(work / "timings.json", timings)
    summary = {
        "lyrics": cache.details("lyrics"),
        "align": cache.details("align"),
        "pitch": cache.details("pitch"),
        "notes": cache.details("notes"),
        "beats": cache.details("beats"),
        "analysis": cache.details("analysis"),
        "package": cache.details("package"),
    }
    return ImportResult(sid, final, manifest, timings, summary)
