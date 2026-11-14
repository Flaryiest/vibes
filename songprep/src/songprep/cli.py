"""The `songprep` command: import, render-key, doctor."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from .cache import STAGES
from .paths import default_paths
from .runner import StageError

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def note_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="songprep", description="Turn one song audio file into a song package for the singing-practice app.")
    parser.add_argument("--version", action="version", version=f"songprep {__version__}")
    folders = argparse.ArgumentParser(add_help=False)
    folders.add_argument("--songs-dir", help="where packages are written (default: <repo>/songs)")
    folders.add_argument("--work-dir", help="stage cache (default: <repo>/data/songprep-work)")
    folders.add_argument("--models-dir", help="model downloads (default: <repo>/data/models)")
    commands = parser.add_subparsers(dest="command", required=True)

    imp = commands.add_parser("import", parents=[folders], help="import one audio file", description="Import one audio file (FLAC, WAV, M4A or MP3) as a song package.")
    imp.add_argument("audio", type=Path, help="audio file already on disk")
    imp.add_argument("--artist", required=True)
    imp.add_argument("--title", required=True)
    imp.add_argument("--lyrics", type=Path, help="lyrics as plain text (.txt) or timed lines (.lrc); avoids any network call")
    imp.add_argument("--language", default="en", help="two-letter language of the lyrics (default: en)")
    imp.add_argument("--lead-only", action="store_true", help="strip backing vocals before the pitch and note stages")
    imp.add_argument(
        "--force", action="append", default=[], metavar="STAGE",
        help=f"re-run a stage even if its inputs are unchanged; repeatable or comma-separated. Stages: {', '.join(STAGES)}, all",
    )  # fmt: skip
    imp.add_argument("--no-lrclib", action="store_true", help="do not ask lrclib.net; go straight to transcription when no --lyrics file is given")
    imp.add_argument("--fmin", type=float, default=None, help="lowest pitch the tracker may report, Hz (default: 65)")
    imp.add_argument("--fmax", type=float, default=None, help="highest pitch the tracker may report, Hz (default: 1050)")

    key = commands.add_parser("render-key", parents=[folders], help="pre-render the instrumental in another key", description="Add a baked key variant of the instrumental to a package (uses the rubberband program).")
    key.add_argument("song_id")
    key.add_argument("--semitones", type=int, required=True, help="whole semitones, -12 to 12")

    doctor = commands.add_parser("doctor", parents=[folders], help="check tools, models and disk space")
    doctor.add_argument("--skip-tools", action="store_true", help="do not start the heavy tools (faster; needs no network)")
    return parser


def _print_import_summary(result) -> None:
    manifest, summary = result.manifest, result.summary
    print()
    print(f"Package: {result.package}")
    print(f"  duration     {manifest['durationS']:.1f} s")
    lyrics = summary["lyrics"]
    review = " (needs review)" if manifest["lyricsNeedReview"] else ""
    print(f"  lyrics       {manifest['lyricsSource']}{review}: {summary['align'].get('lines')} lines, {summary['align'].get('words')} words, offset {lyrics.get('offsetS', 0):+.2f} s")
    low = summary["align"].get("lowScoreLines", 0)
    if low:
        print(f"               {low} line(s) aligned with low confidence; see align.json in the work folder")
    notes = summary["notes"]
    print(f"  notes        {notes.get('notes')} from {notes.get('words')} words ({notes.get('wordsWithoutNotes')} words had no pitch; octave check flagged {notes.get('octaveFlagged')}, corrected {notes.get('octaveCorrected')})")
    low_midi, high_midi = manifest["range"]["lowMidi"], manifest["range"]["highMidi"]
    typical = manifest["typicalRange"]
    print(f"  range        {note_name(low_midi)}-{note_name(high_midi)} (MIDI {low_midi}-{high_midi}); typical {note_name(typical['lowMidi'])}-{note_name(typical['highMidi'])}")
    analysis = summary["analysis"]
    print(f"  phrases      {analysis.get('phrases')} in {analysis.get('phraseGroups')} groups ({analysis.get('repeatedGroups')} repeated)")
    beats = summary["beats"]
    print(f"  tempo        {manifest['bpm']} BPM, {beats.get('beats')} beats, {beats.get('downbeats')} downbeats")
    print(f"  notes.json   {summary['package'].get('notesJson')}")
    print()
    print("Stage timings")
    total = 0.0
    for row in result.timings:
        state = "ran" if row["ran"] else "cached"
        if row["ran"]:
            total += row["seconds"]
        print(f"  {row['stage']:<9} {row['seconds']:>7.1f} s  {state}")
    print(f"  {'this run':<9} {total:>7.1f} s")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    paths = default_paths(args.songs_dir, args.work_dir, args.models_dir)
    try:
        if args.command == "import":
            from .pipeline import ImportOptions, run_import
            from .pitch import DEFAULT_FMAX, DEFAULT_FMIN

            force = {name.strip() for value in args.force for name in value.split(",") if name.strip()}
            options = ImportOptions(
                audio=args.audio,
                artist=args.artist,
                title=args.title,
                lyrics=args.lyrics,
                language=args.language,
                lead_only=args.lead_only,
                force=force,
                no_lrclib=args.no_lrclib,
                fmin=args.fmin if args.fmin is not None else DEFAULT_FMIN,
                fmax=args.fmax if args.fmax is not None else DEFAULT_FMAX,
            )
            _print_import_summary(run_import(options, paths))
            return 0
        if args.command == "render-key":
            from .renderkey import render_key

            result = render_key(args.song_id, args.semitones, paths)
            print(f"baked keys: {result['bakedKeys']} ({result['seconds']} s)")
            return 0
        if args.command == "doctor":
            from .doctor import run_doctor

            return run_doctor(paths, check_tools=not args.skip_tools)
    except StageError as error:
        print(f"\nsongprep: stage '{error.stage}' failed: {error.message}", file=sys.stderr)
        if error.command:
            print(f"\nThe command that failed:\n  {error.command_text()}", file=sys.stderr)
        if error.log:
            print(f"\nFull output: {error.log}", file=sys.stderr)
        if args.command == "import":
            print("\nEarlier stages stay cached. Fix the problem and run the same command again.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\ninterrupted; finished stages stay cached", file=sys.stderr)
        return 130
    return 2


if __name__ == "__main__":
    sys.exit(main())
