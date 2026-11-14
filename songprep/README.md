# songprep

Turns one song audio file into a song package: a folder in `songs/<id>/` with the
vocal and instrumental stems, the melody as timed notes, word-timed lyrics, beats
and the original singer's pitch curve. The practice app reads that folder. The
format is in `schema/song-package.schema.json` and `app/src/song/types.ts`;
the design is section 4 of `docs/superpowers/specs/2026-11-13-singing-trainer-design.md`.

Run once per song. The tool never downloads music: the audio file must already be on disk.

## Install

Needs macOS on Apple Silicon, [uv](https://docs.astral.sh/uv/) and ffmpeg
(`brew install uv ffmpeg`). `brew install rubberband` is only needed for `render-key`.

```sh
cd songprep
uv sync               # Python 3.12 and songprep itself (small: numpy, scipy, SwiftF0)
uv run songprep doctor
```

`doctor` builds the four heavy tool environments on its first run and says what
is missing. The first import then downloads the models it needs.

| Downloaded on first use | Size | Where |
|---|---|---|
| Tool environments (four, each with its own PyTorch or MLX) | 4.1 GB | uv's cache, `~/.cache/uv` |
| Separation model `model_bs_roformer_ep_317_sdr_12.9755.ckpt` | 639 MB | `data/models/audio-separator/` |
| Alignment model, English wav2vec2 | 378 MB | `data/models/torch/` |
| Beat model `beat_this-final0.ckpt` | 81 MB | `data/models/torch/` |
| Transcription model `whisper-large-v3-turbo`, only if no lyrics are found | 1.5 GB | `data/models/huggingface/` |
| Lead-vocal model, only with `--lead-only` | 913 MB | `data/models/audio-separator/` |

Everything songprep writes is git-ignored: packages in `songs/`, the stage cache in
`data/songprep-work/`, models in `data/models/`.

## Commands

### import

```sh
uv run songprep import ~/Music/sailor-song.flac --artist "Gigi Perez" --title "Sailor Song"
uv run songprep import song.mp3 --artist "A" --title "B" --lyrics words.txt
```

| Option | Meaning |
|---|---|
| `--artist`, `--title` | Required. They also form the id: `gigi-perez-sailor-song` |
| `--lyrics FILE` | The words, as plain text (one sung line per line) or `.lrc` (timed lines). With this option nothing is sent over the network |
| `--language en` | Language of the lyrics, for the aligner and the transcriber |
| `--lead-only` | Strip backing vocals before the pitch and note stages; for songs with harmonies |
| `--force STAGE` | Re-run a stage even though its inputs are unchanged. Repeatable, or comma-separated; `all` forces everything |
| `--no-lrclib` | Skip the LRCLIB lookup and transcribe instead (not in the spec; useful offline) |
| `--fmin`, `--fmax` | Pitch range the tracker may report, in Hz. Default 65 to 1050 |

Without `--lyrics`, the import asks lrclib.net for the words. That request carries
the artist, the title and the duration in whole seconds, with the User-Agent
`songprep/0.1`, and nothing else. If LRCLIB has no match, the vocal stem is
transcribed and the manifest is marked `lyricsNeedReview`. Transcribed lyrics get
roughly one word in five wrong on sung vocals, so supply the words when you can.

Plain-text lyrics should list every sung line, with repeated choruses written out.
Lines in brackets such as `[Chorus]` are ignored.

Importing the same artist and title again updates the package in place.
`notes.json`, the file the note editor saves, is never overwritten;
`notes.auto.json` always is.

### render-key

```sh
uv run songprep render-key gigi-perez-sailor-song --semitones 3
```

Writes `instrumental_k+3.flac` into the package with Rubber Band's R3 engine and
adds `3` to `bakedKeys` in the manifest. The file has exactly the original's length.

### doctor

```sh
uv run songprep doctor              # checks everything; builds missing tool environments
uv run songprep doctor --skip-tools # quick; starts none of the heavy tools
```

## What each stage does

Each stage is cached under `data/songprep-work/<id>/` by a hash of its inputs: the
parameters, the tool versions and the content of the files it reads. An unchanged
stage is skipped. A stage whose result did not change does not disturb the stages after it.

| # | Stage | What happens | Tool |
|---|---|---|---|
| 1 | `decode` | Any input to 44.1 kHz stereo WAV; SHA-256 of the source file | ffmpeg |
| 2 | `separate` | Vocal and instrumental stems, FLAC. With `--lead-only`, a second pass takes the backing vocals out of the stem used for pitch | `audio-separator` 0.48.0, BS-RoFormer ep_317, on the GPU |
| 3 | `lyrics` | The words: `--lyrics` file, else LRCLIB, else transcription. For timed sources, one global shift onto this audio is estimated from vocal onsets | `mlx-whisper` 0.4.3 with `whisper-large-v3-turbo` for the fallback |
| 4 | `align` | Start and end of every word, aligned line by line inside each line's time window. Plain text has no line times, so a first pass aligns the whole text against the whole stem to find them | WhisperX 3.8.6 alignment module, wav2vec2, CPU |
| 5 | `pitch` | The singer's pitch curve from the vocal stem at 16 kHz mono, one value per 16 ms | SwiftF0 0.3.0 |
| 6 | `notes` | The pitch curve cut into notes inside each word (below) | songprep |
| 7 | `beats` | Beats and downbeats from the instrumental; tempo checked against 70 to 180 BPM and the grid doubled or halved if outside | `beat_this` 1.1.0 |
| 8 | `analysis` | Phrases, repeated-phrase groups, range, typical range | songprep |
| 9 | `package` | Everything written to a temporary folder, then moved into `songs/<id>/` in one step; `songs/index.json` regenerated | songprep |

The heavy tools need different PyTorch versions, so none is a dependency of
songprep. Each runs as `uv tool run --from <tool>==<version> ...` in its own
environment. The versions are pinned in `src/songprep/runner.py`.

### Notes (stage 6)

1. The pitch curve is median-filtered over 5 frames (64 ms). Frames with confidence under 0.5 are ignored.
2. A word starts as one note at the confidence-weighted median pitch.
3. A word splits where the pitch moves more than 0.8 semitones and stays for 110 ms.
4. Notes with the same rounded pitch less than 70 ms apart merge. Pieces under 90 ms are absorbed. A slide into a note, and the fall at the end of a word, belong to the note.
5. A note more than 9 semitones from the median of its eight neighbors is tested an octave up and down. It moves if the audio's harmonics say so, or if it runs straight into a note it would then match. A real octave leap stays.
6. Pitch is rounded to a whole MIDI number; the remainder is kept in `cents`.
7. A new phrase starts at each lyric line and after any gap over 0.5 s.

Notes are not snapped to a key. Two things follow from how speech aligners treat
singing: a word's notes run from its aligned start for as long as the voice keeps
sounding (aligned word ends come far too early on held notes), and a word with no
voiced sound gets no note.

Expect to correct notes in the editor for every song.

### Package

```
songs/<id>/
  manifest.json      instrumental.flac    vocals.flac
  notes.auto.json    notes.json           lyrics.json
  beats.json         f0.json              peaks.json
```

- Times in `lyrics.json` are in this audio's timeline. `offsetS` records the shift that was applied to the lyric source's times to get there; it is 0 for plain text and transcriptions.
- A note's `line` and `word` point at `lyrics.lines[line].words[word]`.
- `peaks.json` is the waveform overview for the editor: `{hopS, vocals: {min, max}, instrumental: {min, max}}`, one pair per 20 ms.
- Repeated-phrase groups are computed and kept in `data/songprep-work/<id>/analysis.json`. The `Manifest` type has no field for them, so they are not in the package.

## How long it takes

Measured once on this machine (MacBook Pro, Apple M4, 16 GB) for the 4:22 test song, with the words supplied as a file:

| Stage | Time |
|---|---|
| decode | under 1 s |
| separate | 7 min 35 s |
| lyrics (from a file) | under 1 s |
| align | 14 s |
| pitch | 1 s |
| notes, analysis, package | under 1 s together |
| beats | 4 s |
| **Whole import** | **about 8 minutes** |

Separation is nearly all of it. That one run may include one-time setup, so later songs can be faster. Importing the same song again skips every stage whose inputs have not changed, so a re-run after supplying corrected lyrics should take about 20 seconds (alignment and notes only); that was not timed.

Not timed: the LRCLIB lookup and the transcription fallback. Neither has been run on real audio yet; both are covered only by the unit tests with stand-ins for the network and the model.

## Tests

```sh
uv run pytest                  # about 6 s; no network, no models
uv run pytest -m integration   # runs the real tools on a synthetic clip; slow
```

The unit tests synthesize a vocal with known notes and check that stages 5, 6 and 8
recover them, and run the whole import with stand-ins for the heavy tools, checking
the package against the JSON Schema.

## Troubleshooting

| Problem | What to do |
|---|---|
| A stage fails | The message names the stage and prints the exact command that failed; the full output is in `data/songprep-work/<id>/logs/`. Earlier stages stay cached: fix the cause and run the same import again |
| `beat_this` cannot download its model (HTTP 500 from cloud.cp.jku.at) | The host throttles some networks. Download `final0.ckpt` from the [project's cloud space](https://cloud.cp.jku.at/index.php/s/7ik4RrBKTS273gp) on another network and save it as `data/models/torch/hub/checkpoints/beat_this-final0.ckpt` (SHA-256 `8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331`) |
| Separation is very slow or the Mac stalls | It uses the GPU and several GB of memory. Close other heavy apps. Expect about seven and a half minutes for a four-minute song on an M4 with 16 GB. |
| Wrong words, or lines aligned to the wrong place | Give the exact words with `--lyrics`, every repeat written out. `align.json` in the work folder lists each line's window and confidence |
| Lyrics from LRCLIB are for another version of the song | Pass your own with `--lyrics`, or `--no-lrclib` to transcribe |
| The melody has many notes an octave off, or harmonies leak into it | Narrow the tracker with `--fmin` and `--fmax`, or use `--lead-only` |
| Beat grid at half or double speed | The import already folds tempo into 70 to 180 BPM; beyond that, use the halve and double control in the editor |
| A tool environment is broken | `uv cache clean` removes all cached environments; `songprep doctor` rebuilds them |
| Start over for one song | Delete `data/songprep-work/<id>/`. Delete `songs/<id>/` as well only if you want to lose your corrected `notes.json` |
