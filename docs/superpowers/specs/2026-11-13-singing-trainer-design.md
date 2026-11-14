# Singing trainer: technical specification

- **Date:** 2026-11-13
- **Status:** draft for review. Nothing is built yet.
- **Evidence:** `reports/Fastest way to learn singing.md`, plus notes in `research_notes/Fastest way to learn singing/` and `research_notes/Song first singing app spec/`
- **Replaces:** the earlier general-skills draft of this file

## 1. Goal and constraints

**Goal.** Get one person from never having sung to performing a few chosen songs well enough that friends are impressed, as fast as possible. The songs, in order: Gigi Perez "Sailor Song", then Justin Bieber "Beauty and a Beat" and Ed Sheeran "Shape of You".

| Constraint | Value |
|---|---|
| Learner | 18, deep voice, no music knowledge, has never sung |
| Practice time | 30–60 minutes a day |
| Machine | MacBook Pro, Apple M4, 16 GB, macOS 26.6 |
| Listening | AirPods, or the built-in speakers |
| Microphone | Always the MacBook's built-in microphone |
| Browser | Chrome only (section 5.3 explains why) |
| Daily friction | One click to open, one click to start; nothing to decide |
| One-time friction | Acceptable: one terminal command and a short correction pass per song |

**Terms.**

- **Cent:** one hundredth of the gap between neighboring piano keys. Within ±50 cents is the research standard for "in tune".
- **Semitone:** the gap between neighboring piano keys (100 cents). An **octave** is 12 semitones.
- **Note names and MIDI numbers:** C4 is the middle of a piano and is MIDI number 60; each semitone up adds 1. A deep male voice sits roughly between E2 (40) and E4 (64).
- **Stem:** one isolated part of a recording, such as the vocal alone or the instruments alone.
- **Phrase:** a stretch of melody sung on one breath, usually one lyric line.

## 2. The method the app implements

### 2.1 Rules taken from the research

| Finding | Strength | Rule in the app |
|---|---|---|
| Out-of-tune singing in untrained adults is a voice-control problem, not a hearing one (97% pitch matching with a slider, 59% by voice) | Strong | Practice is singing at targets. No listening-only drills |
| Seeing pitch gives fast gains, but the advantage faded over 10 weeks once the display was removed | Mixed | Show the pitch line, then hide it; judge progress only with it hidden |
| Poor-pitch singers got worse when the correct notes played along with them | Moderate | Listen first, then sing. The guide melody never plays while the mic is being scored |
| Beginners match a voice in their own octave far better than a piano, and their own earlier voice best of all | Moderate | Guide sounds are voice-like and in the learner's octave; later, his own best takes |
| How errors are handled predicts next-day quality better than time or repetitions (stop, isolate, slow down, repeat correctly) | Moderate, from pianists | A missed note triggers an automatic micro-drill before the phrase continues |
| Untrained singers are about as accurate as professionals at slow tempo | Moderate | New phrases start at 80% speed |
| Ordinary listeners judge tuning mostly by the size of the jumps between notes; they tolerate about 50 cents on voices | Moderate | Score both note error and jump (interval) error; green zone ±50 cents, gold zone ±25 |
| Liking is predicted by perceived pitch accuracy, a full tone, and clean note starts; listeners notice sagging note endings more than scooped starts | Moderate | After accuracy: steady long notes, clean endings, on-time entries |
| A 24-hour gap and sleep improve retention; continuing past the first clean attempt improves it further | Moderate, from keyboard tasks | "Clean" on one day is not enough; a phrase is "solid" only after clean attempts on three different days |
| No study tests a daily dose; fatigue appears after 60 continuous minutes | Weak | Short blocks with rests; start at 30 minutes |

### 2.2 Learning one phrase

Every phrase climbs the same ladder. One repetition is a **call** (the guide sings the phrase over the backing track) followed by a **response** (the same bars again, backing only, the learner sings).

| Step | Sung on | Speed | Pitch display | To move up |
|---|---|---|---|---|
| 1. Listen | Nothing | 100% | Original singer's pitch curve and lyrics | 2 listens, first visit only |
| 2. Speak | Lyrics, spoken in rhythm | 80% | Lyrics highlighted in time | 2 passes, not scored |
| 3. Melody | "doo" | 80% | Live line | 2 clean repetitions |
| 4. Words, slow | Lyrics | 80% | Live line | 2 clean repetitions |
| 5. Words, full speed | Lyrics | 100% | Live line | 2 clean repetitions |
| 6. Hidden | Lyrics | 100% | Revealed after the phrase ends | 2 clean repetitions |
| 7. Blind | Lyrics | 100% | None; summary after the set. No call, response only | 3 clean repetitions in a row |

- **Clean repetition:** at least 90% of scored notes within ±50 cents, no miss on any note 300 ms or longer, no note in the wrong octave.
- **Phrase states:** `new` → `learning` (steps 1–6) → `clean` (passed step 7 once) → `solid` (passed step 7 on three different days).
- **Error rule:** if the same note misses on two repetitions in a row, the app drops into a micro-drill on just the jump into that note (previous note, then this note), at 80% speed, guide then response, until three hits in a row. It then returns to the phrase. If 90 seconds pass without three hits, the note is marked "sticky" and becomes tomorrow's first target.
- **Rotation:** at most 3 minutes on one phrase, then rotate among up to three active phrases.
- **Repeated phrases:** phrases with the same lyrics and the same notes share one progress record, so a chorus line is learned once.
- **Order within a song:** chorus phrases first, because they repeat most and are usually highest; then verses.

### 2.3 The daily session

Generated automatically. Default 30 minutes.

| Block | Minutes | Content |
|---|---|---|
| Warm-up | 4 | Breathing (in for 4, hiss out for 8) for 45 seconds; lip-trill or hum glides following a curve for 2 minutes; five single notes from today's song key |
| Foundation | 8, shrinking | Pitch-matching drills (section 5.8). 8 minutes while the pitch check is under 80%, 4 minutes from 80–90%, 2 minutes above 90% |
| Rest | 1 | Water |
| Song work | 12–18 | Phrase ladder. Picks, in order: yesterday's worst phrase, the next unlearned phrase, one older clean phrase for review |
| Run-through | 3–4 | One recorded take of everything learned so far, backing only, display hidden. Scored and saved |
| Cool-down | 1 | Descending glide; throat check-in (fine / tired / hoarse) and effort (1–5); best phrase today and one fix for tomorrow |

- **Weeks 1–2:** 30 minutes. Extend only while check-ins stay "fine".
- **45 minutes:** longer song work with a second rest.
- **60 minutes:** two sessions at different times of day. The second is song work and a run-through only.
- **Minimum session, 5 minutes:** glides plus one phrase. Counts toward the weekly goal.
- **Quiet session:** humming, lip trills, listening and speaking lyrics, for days when singing out loud is not possible or the throat is tired.
- The warm-up glides double as a daily range measurement at no extra cost.

### 2.4 Across weeks

| Phase | Rough timing | Focus | Exit |
|---|---|---|---|
| Setup | Day 1 | Calibration, range finder, baseline pitch check, key choice for song 1, a raw "time capsule" take of the chorus | Done once |
| A. Find the note | Weeks 1–2 | Foundation drills dominate; chorus phrases to steps 3–5 | Pitch check at 80% |
| B. Build the song | Weeks 2–5 | Song work dominates; every phrase to `clean` | One full blind take at 85% in tune |
| C. Make it impressive | Weeks 4–8 | Polish metrics (section 2.5); performance ladder: audio take, video take, one friend, small group | Performance-ready (below) |
| Next song | After C | Song 1 drops to one maintenance take every few days | |

**Performance-ready** means three full blind takes, on three different days, each meeting the targets in section 2.5.

The timings are planning estimates. No study has followed adult beginners for months; teacher and learner reports cluster around weeks to two months of daily work for one well-chosen song, with later songs faster.

### 2.5 What "impressive" means, in numbers

Targets are provisional and will be tuned on real takes. Only the first two rows have direct research support.

| Metric | Target | Basis |
|---|---|---|
| Notes within ±50 cents | 90% or more | Researchers' threshold for an accurate singer |
| Average note error | 30 cents or less | Accurate singers average about 27 |
| Average jump (interval) error | 30 cents or less | Best single predictor of lay ratings; threshold inferred |
| Steadiness of notes 600 ms or longer | Spread of 25 cents or less | Inferred |
| Sag at the end of long notes | 30 cents or less | Listeners are sensitive to note endings; threshold inferred |
| Entries on time | 80% of note starts within ±80 ms | Inferred; no singing-specific study exists |
| Overall flat or sharp bias | Within ±20 cents | Inferred |

Ranked by audible return per hour for this learner: the right key with no strain; steady long notes with clean endings; confident on-time entries; fixed breath points; two or three planned loud/soft contrasts. Vibrato and riffs are out of scope.

### 2.6 The three songs

Published vocal ranges for these songs disagree by whole octaves between sites, so every figure below is provisional until measured from the isolated vocal at import.

| | Sailor Song | Shape of You | Beauty and a Beat |
|---|---|---|---|
| Key | B major | C♯ minor | A minor |
| Tempo | 95 BPM | 96 BPM | 128 BPM |
| Likely lead range (inferred) | G♯3–G♯4, one octave | G♯3–B4 | Mostly B3–G4, peaks to A4 |
| Rap or spoken parts | None | Fast, near-spoken verses | Full rap verse |
| Suggested keying for a deep voice (inferred) | Sing an octave below, track raised 2–4 semitones | Sing an octave below, track unchanged | Sing an octave below, track raised 3–4 semitones |
| Hardest parts (inferred) | Chorus: highest, loudest, long back-to-back lines; bare arrangement exposes pitch | Rhythm and breath in wordy verses; lowest notes | Repeated chorus hook at the top; 128 BPM syncopation; the rap |

Sailor Song is a sound first choice: one octave of range, slow, structurally simple, and it suits a low voice. Key it by the chorus, not the verse. On difficulty, Shape of You is the gentler second song and Beauty and a Beat the poorest fit for a low voice (see section 8).

## 3. System overview

```
audio file ─► songprep (Python CLI, once per song)
                separate → lyrics → align → pitch → notes → beats → package
                        │
                        ▼
              songs/<id>/   FLAC stems + JSON
                        │
                        ▼
local server (Node, 127.0.0.1:4747) ──► React app in Chrome
  serves the app and songs,               ├─ audio engine: mic, playback, calibration
  writes note edits and backups           ├─ practice: phrase ladder, drills, planner
                                          ├─ scoring
                                          └─ storage: IndexedDB
```

**Repository layout.**

| Path | Contents |
|---|---|
| `app/` | Vite + React + TypeScript single-page app |
| `server/` | Small Node server: static files plus four API routes |
| `songprep/` | Python import CLI, managed with `uv` |
| `schema/` | JSON Schema for the song package |
| `songs/` | Song packages. Git-ignored; never committed or shared |
| `data/` | Backups. Git-ignored |

**Why these boundaries.**

- Heavy machine-learning tools stay in a separate command-line program. In-browser vocal separation needs a ~172 MB model download and special security headers, has no published speed figures, and its best models carry non-commercial licenses.
- A local server, started at login, removes the daily "start the dev server" step and lets the app write note corrections and backups to disk.
- No cloud, no account, no service worker. The app is served from localhost, which Chrome treats as secure, so the microphone works without HTTPS.

## 4. Song import (`songprep`)

### 4.1 Commands

```
songprep import <audio-file> --artist "Gigi Perez" --title "Sailor Song"
                [--lyrics lyrics.txt|.lrc] [--language en] [--lead-only] [--force <stage>]
songprep render-key <song-id> --semitones 3        # optional baked key variant
songprep doctor                                    # check tools, models, disk space
```

The input is an audio file already on disk (FLAC, WAV, M4A or MP3). The tool does not download music.

### 4.2 Stages

Each stage is cached by a hash of its inputs and can be re-run alone with `--force`. Heavy tools run as subprocesses in their own isolated environments (`uv tool run`), because their PyTorch version requirements conflict.

| # | Stage | Tool | Output |
|---|---|---|---|
| 1 | Decode | `ffmpeg` to 44.1 kHz stereo WAV; hash the source | working copy |
| 2 | Separate | `audio-separator` with `model_bs_roformer_ep_317_sdr_12.9755.ckpt` | `vocals.flac`, `instrumental.flac` |
| 3 | Lyrics text | `--lyrics` file if given; else LRCLIB (`/api/get` with artist, title, duration); else `mlx-whisper` large-v3 on the vocal stem, flagged "needs review" | lines with start times |
| 4 | Word timing | WhisperX alignment module (wav2vec2, CPU), run per line inside that line's time window | word start and end times |
| 5 | Pitch | SwiftF0 on the vocal stem, 16 kHz mono | `f0.json` |
| 6 | Notes | Segmentation (section 4.4) | `notes.auto.json` |
| 7 | Beats | `beat_this` on the instrumental | `beats.json` |
| 8 | Analysis | Phrases, repeated-phrase groups, range and typical range | `manifest.json` fields |
| 9 | Package | Write to a temp folder, then rename; regenerate `songs/index.json` | `songs/<id>/` |

- `--lead-only` adds a pass that strips backing vocals before stages 5–6, for songs with harmonies.
- Stage 3 sends the artist, title and duration to lrclib.net. Supplying `--lyrics` avoids any network call.
- Transcribing lyrics from audio gets roughly one word in five wrong on sung vocals, so it is the last resort.

### 4.3 Package format

```
songs/<id>/
  manifest.json      instrumental.flac    vocals.flac
  notes.auto.json    notes.json           lyrics.json
  beats.json         f0.json              peaks.json
```

`notes.auto.json` is the tool's raw output. `notes.json` is the corrected version the app uses; re-running import never overwrites it.

```ts
// manifest.json
type Manifest = {
  schema: 1;
  id: string;                 // slug, e.g. "gigi-perez-sailor-song"
  title: string; artist: string;
  durationS: number; sampleRate: 44100;
  sourceHash: string;
  tools: Record<string, string>;        // tool and model versions
  lyricsSource: "file" | "lrclib" | "transcribed";
  lyricsNeedReview: boolean;
  bpm: number;
  range: { lowMidi: number; highMidi: number };          // notes 150 ms or longer
  typicalRange: { lowMidi: number; highMidi: number };   // duration-weighted 10th–90th percentile
  bakedKeys: number[];                                    // semitone shifts with a pre-rendered file
};

// notes.json and notes.auto.json
type Note = {
  id: number;
  t: number;        // start, seconds, in the original recording
  d: number;        // duration, seconds
  midi: number;     // integer pitch as sung in the original
  cents: number;    // original singer's offset from that pitch
  text: string;     // syllable or word; "~" continues the previous syllable
  word: number; line: number; phrase: number;
  kind: "normal" | "rap" | "free";      // rap: timing only; free: not scored
};

// lyrics.json
type Lyrics = {
  offsetS: number;  // global correction between lyric source and this audio
  lines: { t0: number; t1: number; text: string;
           words: { t0: number; t1: number; text: string }[] }[];
};

// beats.json
type Beats = { beats: number[]; downbeats: number[] };   // seconds

// f0.json: the original singer's pitch curve, for display and octave checks
type F0 = { hopS: number; hz: number[]; conf: number[] };   // hz 0 = unvoiced
```

Phrases are derived, not stored separately: a phrase is the set of notes sharing a `phrase` number. A 4-minute package is roughly 50–60 MB.

### 4.4 Turning the vocal into notes

1. Median-filter the pitch curve over 60 ms. Discard frames with confidence under 0.5.
2. Inside each aligned word, start with one note at the confidence-weighted median pitch.
3. Split a word into several notes when the smoothed pitch moves more than 0.8 semitones and stays there for at least 110 ms.
4. Merge neighboring notes with the same rounded pitch separated by less than 70 ms. Absorb fragments shorter than 90 ms into the longer neighbor. Treat a slide into a note as part of that note.
5. Octave check: flag any note more than 9 semitones from the running median of its neighbors and test it one octave up and down.
6. Round to an integer MIDI pitch; keep the fractional part in `cents`.
7. Phrase boundaries: lyric line breaks, plus any gap between notes longer than 0.5 s.
8. Group phrases whose lyrics match and whose pitches agree within one semitone note for note.

Notes are not snapped to the song's key. That would delete deliberate off-key passing notes.

No published accuracy figure exists for any tool on this task, so **every song needs a correction pass in the note editor** (section 5.11). The planning assumption is 15–30 minutes per song; phase 2 measures the real figure on Sailor Song.

### 4.5 Failures

| Situation | Behavior |
|---|---|
| A stage fails | Stop, keep earlier stages cached, print the stage and the exact command that failed |
| No LRCLIB match | Fall back to transcription; mark `lyricsNeedReview` |
| Lyric timing offset from this audio | Estimate a global offset from vocal onsets; store it in `lyrics.offsetS`; adjustable in the editor |
| Beat tracker returns half or double tempo | Check against a 70–180 BPM prior; "halve / double" control in the editor |
| Package half-written | Cannot happen; written to a temp folder and renamed |

### 4.6 Tools

Versions are as found during research and must be confirmed at install.

| Tool | Version | License | Note |
|---|---|---|---|
| `audio-separator[cpu]` | 0.48.0 | MIT | The `[cpu]` extra is the Apple Silicon one; uses Metal |
| BS-RoFormer weights | ep_317 | Not verified | Local personal use only |
| `swift-f0` | 0.3.0 | MIT | Same tracker scores the learner's takes |
| `whisperx` | current | BSD-2 | Alignment module only; CPU |
| `mlx-whisper` | current | MIT | Fallback transcription only |
| `beat_this` | current | Check | Installed from GitHub |
| Rubber Band CLI | 4.0.0 | GPL | Only for `render-key`; stays a separate program |

**Fallback.** If custom note extraction proves too costly to tune, run UltraSinger (MIT) unmodified and import its output. It is CPU-only on macOS and publishes no accuracy figures.

## 5. Web app

### 5.1 Stack

| Concern | Choice |
|---|---|
| Shell | Vite 8, React 19, TypeScript, React Router |
| State | Zustand for session and settings; the pitch stream never enters React state |
| Styling | Tailwind 4 |
| Live pitch | `pitchy` 4.1 (McLeod method) in a Web Worker |
| Scoring pitch | SwiftF0 model on `onnxruntime-web`, in a Web Worker |
| Key and tempo change | `signalsmith-stretch` (MIT, official AudioWorklet build) |
| Note arithmetic | `tonal` |
| Storage | Dexie on IndexedDB |
| Charts | Hand-drawn SVG; a chart library only if needed |
| Server | Node 22, Hono |
| Tests | Vitest, Playwright with Chrome's fake-microphone flags, pytest for `songprep` |

Not used: `pitchfinder`, `aubio`, `essentia.js` (GPL or AGPL); TensorFlow.js pitch models and `soundfont-player` (stale); any service worker.

### 5.2 Modules

Only `ui/` imports React. Everything in `practice/` is a pure state machine driven by events, so it can be unit-tested without audio.

| Module | Responsibility | Depends on |
|---|---|---|
| `audio/engine` | One `AudioContext`; pinned mic; capture worklet; frame stream | Browser |
| `audio/routes` | Detect and track the listening route; guard against the AirPods mic | `audio/engine` |
| `audio/calibration` | Measure round-trip delay per route | `audio/engine` |
| `pitch/live` | Worker: sample chunks to live pitch frames | `pitchy` |
| `pitch/score` | Worker: recorded audio to a pitch track | `onnxruntime-web` |
| `playback/transport` | Play stems with key, tempo and loop; map song time to clock time | `signalsmith-stretch` |
| `playback/guide` | Voice-like guide tone; visual and audible count-in | Browser |
| `song/package` | Load and validate a package; derive phrases | `schema/` |
| `song/key` | Recommend key shift and octave | `song/package` |
| `scoring` | Pitch track plus targets to note, phrase and take results; feedback sentences | none |
| `practice/phraseLoop` | The ladder in section 2.2 | `scoring` |
| `practice/drills` | Foundation drills and difficulty adaptation | `scoring` |
| `practice/planner` | Build today's session | `store` |
| `practice/rangeFinder`, `practice/pitchCheck` | Range measurement; the periodic benchmark | `scoring` |
| `store` | Database, backup and restore | Dexie |
| `ui` | Screens; the pitch canvas | everything above |

Core interfaces:

```ts
// audio/engine
type PitchFrame = { t: number; hz: number | null; clarity: number; rms: number };  // t: clock seconds at window center
type Route = { kind: "headphones" | "speakers"; outputLabel: string; inputLabel: string; roundTripMs: number | null };

interface AudioEngine {
  start(): Promise<void>;                       // must be called from a click
  readonly ctx: AudioContext;
  readonly route: Route;
  onRouteChange(cb: (r: Route) => void): () => void;
  onFrame(cb: (f: PitchFrame) => void): () => void;      // called outside React
  beginCapture(): CaptureHandle;                // audio kept for scoring and saving
}
interface CaptureHandle { end(): Promise<{ pcm16k: Float32Array; startCtxTime: number; recording: ArrayBuffer; mime: string }>; }

// pitch/score
type F0Track = { hopS: number; t0: number; hz: Float32Array; conf: Float32Array };   // hz 0 = unvoiced
interface F0Tracker { analyze(pcm16k: Float32Array): Promise<F0Track>; }

// playback/transport
interface Transport {
  load(pkg: SongPackage, settings: SongSettings): Promise<void>;
  play(o: { fromS: number; toS: number; rate: number; loop?: boolean; vocalGain: number }): { startCtxTime: number };
  songTimeAt(ctxTime: number): number;
  ctxTimeAt(songTime: number): number;
  stop(): void;
}

// scoring
type TargetNote = { id: number; t: number; d: number; midi: number; kind: "normal" | "rap" | "free" };
type NoteResult = {
  id: number;
  outcome: "hit" | "close" | "miss" | "octave" | "unscored";
  cents: number | null;        // signed median error
  spreadCents: number | null;  // steadiness
  endDriftCents: number | null;
  onsetMs: number | null;      // signed; positive = late
  voicedFraction: number;
};
function scoreNotes(track: F0Track, targets: TargetNote[], o: { offsetS: number; searchMs: number }): NoteResult[];
```

### 5.3 Audio engine

**Browser.** Chrome is required. Safari dips the volume for 2–3 seconds on the first microphone capture after launch even with processing off, and cannot choose an output device for Web Audio. Firefox has an open bug on macOS 26 in which page audio can go silent while a microphone is open. The app shows a blocking message in other browsers.

**One clock.** A single `AudioContext({ latencyHint: "interactive" })` handles playback and capture, so both share one timeline. Every captured block is stamped with the context's frame counter.

**Opening the microphone.** Done once per app launch, on the first click, before any audio plays:

1. Call `getUserMedia({ audio: true })` to obtain permission, then stop that track immediately. macOS makes AirPods the default input when they connect, so this throwaway call may briefly open the AirPods microphone; doing it before playback keeps the glitch inaudible.
2. Call `enumerateDevices()`. Ignore entries whose id is `"default"` or whose label starts with "Default". Pick the input whose label matches `/MacBook.*Microphone/i`.
3. Open the real stream:
   ```ts
   { audio: { deviceId: { exact: builtInId }, echoCancellation: false,
              noiseSuppression: false, autoGainControl: false, channelCount: 1 } }
   ```
4. Read back `track.getSettings()` and log what was applied. If any processing flag is still on, show a warning.
5. Keep this one stream open for the whole session.

**AirPods microphone guard.** Apple documents that AirPods drop to a low-quality mode only while something is using their microphone. If the live track's label is not the built-in microphone, scoring is blocked and the app explains why. Help text: close System Settings › Sound and any call apps while practicing.

**Capture path.** `MediaStreamSource → AudioWorkletNode` (not connected to the speakers). The worklet copies each block into a ring buffer and posts 512-sample chunks, with their starting frame number, to two workers: the live detector, and a recorder that keeps 16 kHz audio for the scoring tracker. A `MediaRecorder` on the same stream produces the saved file (WebM/Opus).

**Routes.** A route is the pair of output label and input label.

| | Headphones (AirPods) | Speakers |
|---|---|---|
| Detection | Default output label contains a known headphone name, or the user's toggle | Otherwise |
| Listen-then-sing repetitions | Scored; backing plays under the response | Scored; speakers are silent during the response, with a visual beat |
| Sing-along and run-through takes | Scored | Allowed but marked "not scored" |
| Why | Nothing leaks into the mic | The backing track leaks into the mic; browser echo cancellation is reported to fade long held notes |

The user's toggle is the authority, because no browser API reports whether an output is Bluetooth. Phase 0 measures how bad speaker leakage is on this machine and may relax the speaker rule.

**Device changes.** On `devicechange` (debounced 500 ms), on the mic track ending, or on a change in `ctx.outputLatency`: re-enumerate, refresh the route, and mark its calibration stale. Chrome fires several events per physical change and none when only the system default changes, so the route is also re-checked at the start of every session.

**Calibration.** The singer hears the track late by the output delay, and the voice reaches the app late by the input delay. Their sum is what an acoustic loopback measures, and it is the single number subtracted from capture times.

1. Headphones: the app asks the user to hold one AirPod against the microphone, with a live level meter to find the spot. Speakers: nothing to hold.
2. Play 8 short chirps at irregular gaps.
3. Cross-correlate the captured audio with the chirp; take the median delay.
4. Accept if the spread across chirps is under 5 ms; otherwise ask to repeat.
5. Store `roundTripMs` under the route key.

`ctx.outputLatency` is used only to detect change; it has a record of under-reporting. Published AirPods delays run from about 126 ms to 274 ms by model and none were measured on a Mac, so no default is assumed.

### 5.4 Pitch detection

**Live line (for display).**

| Parameter | Value |
|---|---|
| Method | McLeod, via `pitchy` |
| Window | 2048 samples (about 43 ms at 48 kHz) |
| Hop | 512 samples |
| Accepted band | Learner's absolute range widened by 4 semitones each way; never below 55 Hz or above 700 Hz |
| Gates | Clarity 0.5 or more; loudness above the calibrated noise floor plus 10 dB |
| Smoothing | Median of 5 frames |
| Octave guard | A jump of 1100–1300 cents lasting under 60 ms is treated as a detector error and held |
| Timestamp | Center of the window |

A 2048-sample window holds under three cycles of the lowest bass note (C2, 65 Hz), which is marginal. If phase 0 shows instability, the fallback is an in-house McLeod implementation that restricts the search to the learner's band.

**Scoring pass (for numbers).** Scores are computed after each repetition or take from the recorded audio, using SwiftF0: the same tracker that produced the song's reference notes, so both sides share one tracker's biases. It has among the lowest octave-error rates in the one published comparison, which was written by SwiftF0's own author and has no low-voice breakdown. It needs 176 ms of look-ahead, which rules it out for the live line but not for scoring. It ships as a 135 KB model plus about 4.6 MB of runtime, served locally. Fallback if the browser port misbehaves: `pitchy` with a 4096-sample window. Phase 0 compares both on the learner's own low notes and picks one.

### 5.5 Playback

- Stems are decoded once to audio buffers. Roughly 180 MB of memory for two stereo stems.
- **Song settings** per song: `trackShift` (semitones applied to the audio, −6 to +6), `octaveDrop` (0 or 1), `backingGainDb`, `lyricOffsetS`.
- **Target pitch** for every note: `midi + trackShift − 12 × octaveDrop`.
- **Tempo:** 80% for slow steps, 100% otherwise. The stretcher's stated sweet spot is 75% and up.
- **Signal path:** instrumental and original vocal each go through a stretch node scheduled with identical rate and shift. At 100% speed with zero shift, or with a baked key variant available, the stretcher is bypassed and plain buffer playback is used.
- **Clock mapping:** at a constant rate `r`, `songTime = fromS + (ctxTime − startCtxTime − stretchLatency) × r`. Phase 0 verifies this mapping, and that two stretch nodes stay in sync, by playing a click track through the stretcher and measuring it.
- **Backing level** defaults low. Singers unconsciously push their voice over loud accompaniment.

### 5.6 Guide voice

A small built-in synthesizer: a band-limited sawtooth through three vowel filters ("oo"), 20 ms fade-in and 60 ms fade-out, no vibrato, always in the learner's octave. It sings the call in the phrase ladder and all foundation drill targets. The original vocal is available at step 1 and on a "hear the original" button; shifted far from its own key it sounds unnatural, so it is not the model for pitch.

Phase 5 adds an own-voice bank: the learner's in-tune takes of a phrase replace the synthesizer as the call.

### 5.7 Scoring

**Aligning time.** Capture time minus `roundTripMs`, then mapped to song time through the transport. A constant extra offset of up to ±150 ms per repetition is allowed (the value that maximizes voiced overlap with the targets), so a slightly early or late delivery is not scored as wrong notes.

**Per note.**

1. Search for the sung onset within ±120 ms of the target start: the first run of at least 60 ms of confident frames.
2. The steady portion runs from the later of 80 ms or 15% into the note, to 10% before its end.
3. `cents`: median error over the steady portion against the target pitch.
4. `spreadCents`: standard deviation over the steady portion. `endDriftCents`: the median of the last 30% minus the median of the rest, for notes 600 ms or longer.
5. Outcome:

| Outcome | Rule |
|---|---|
| `unscored` | Under half the steady frames are confident. Never shown as wrong |
| `hit` | Within ±50 cents (shown gold within ±25) |
| `close` | Within ±100 cents |
| `octave` | Within ±50 cents of the target moved by exactly one octave |
| `miss` | Anything else |

Octaves are never folded. A right note in the wrong octave is its own outcome, and a brief octave jump inside an otherwise correct note is treated as a detector error.

**Per phrase and take.** Percent of scored notes hit; average absolute error; signed bias; average interval error between consecutive notes; steadiness and end drift over long notes; percent of onsets within ±80 ms. `rap` notes count toward timing only; `free` notes are ignored.

**Feedback sentences** are produced by fixed rules from these numbers, lead with what went best, and give one correction. Examples: "Most of this sat about 30 cents flat." "Right notes, one octave too low." "Line 3 comes in about 150 ms late." "Long notes sag at the end." No language model is involved; current audio models judge pitch worse than the detector does.

### 5.8 Foundation drills

All drills are call-and-response with the guide voice. Each level moves through display modes live → revealed after → blind.

| Level | Content |
|---|---|
| F1 | Single notes within 3 semitones of speaking pitch |
| F2 | Single notes across the comfortable range, widening to a full octave |
| F3 | Two-note steps and small jumps |
| F4 | Three- and four-note patterns from the current song's scale, in its chosen key |
| F5 | The current song's most common three- and four-note fragments |

Difficulty moves up one notch when first-attempt hits over the last 20 attempts reach 90%, and down below 70%. These thresholds are a design choice; no singing study has tested a target success rate.

**Pitch check.** 10 single notes and 6 four-note patterns, 34 notes, display hidden, in the learner's own range, after the warm-up. Run on day 1 and every two weeks; the first two runs are labeled calibration. For orientation only: on the research protocol this is modeled on, adults without lessons averaged 68% of notes in tune and adults with lessons 87%.

### 5.9 Range finder

1. Count backward from ten in a normal voice: gives speaking pitch.
2. Hold a comfortable "oo".
3. Glide down to the lowest note that still sounds clean.
4. Glide up to the highest note that takes no effort.
5. Note where the voice flips into a lighter sound, if it does.

Stored: `speakingMidi`, `comfortLow`, `comfortHigh`, `absLow`, `absHigh`, `flipMidi`. No voice-type label is stored; at 18 the adult voice type cannot yet be called. Daily warm-up glides refine the comfortable range as a rolling median.

### 5.10 Key recommendation

For each `trackShift` from −6 to +6 and each `octaveDrop` in {0, 1}:

- **Cost** = sum over notes of duration × penalty, where the penalty is zero between `comfortLow + 2` and `comfortHigh − 3`, rises linearly outside that band, and is very large outside the absolute range; plus a small term for the size of `trackShift`.
- **Rule:** the highest repeated chorus note should sit 2–4 semitones under `comfortHigh`, and the lowest note 2–3 above `comfortLow`. If both cannot hold, protect the top.
- Shifts beyond ±4 semitones are penalized because the audio starts to sound processed.

The key picker shows the three best options with highest note, lowest note and percent of time in the comfortable band, each playable on the spot. The learner confirms by ear.

### 5.11 Note editor

A piano roll drawn over the original singer's pitch curve and the vocal waveform.

- Drag a note to change pitch or timing; split; merge; delete; shift by an octave; snap to the measured pitch.
- Edit syllable text; mark notes as `rap` or `free`; set phrase breaks; merge repeated phrases.
- Global lyric offset; halve or double the beat grid.
- Play back the guide voice against the isolated vocal, looped by phrase, to check by ear.
- Saves `notes.json` through the server. Any change to a phrase's notes resets that phrase's progress.

### 5.12 Screens

| Screen | Contents |
|---|---|
| Today | "Start today's session" button; this week's practice days against a goal of 5 of 7; the current song's mastery map; the learner's own "after X, I practice" sentence |
| Session | Runs the blocks in order with no choices; pause and resume; the pitch canvas |
| Songs | Imported songs; key picker; mastery map (phrases colored by state); open the editor |
| Progress | Per song: blind run-through score as dots with a rolling median of three, and time-capsule takes side by side. Overall: pitch check trend, range over time |
| Setup | First-run flow; route toggle; recalibrate; re-run range finder |
| Settings | Session length, backup and restore |
| Lab | Raw live pitch, level meter, calibration numbers. Built in phase 0, kept for troubleshooting |

**Pitch canvas.** A 2D canvas redrawn each animation frame from a mutable buffer. Time runs left to right with "now" at 30% of the width; pitch runs vertically across the phrase's range plus 3 semitones each way. It draws target bars with their syllables and one pitch line, colored by error. Nothing else.

**First run.** Chrome check → microphone permission and pinning → route choice → calibration → level and low-note check → range finder → baseline pitch check → pick song and key → time-capsule take. About 20 minutes, once.

**Habit design.** A weekly goal with slack instead of an unbroken streak; the 5-minute minimum session; no points or badges; progress shown only against the learner's own earlier results.

### 5.13 Storage

IndexedDB tables:

| Table | Key fields |
|---|---|
| `profile` | Range values, practice cue, session length |
| `routes` | Route key, `roundTripMs`, measured date, stale flag |
| `songSettings` | Song id, `trackShift`, `octaveDrop`, `backingGainDb`, status |
| `phraseProgress` | Song id, phrase group, step, state, clean days, sticky notes, last practiced |
| `attempts` | Session id, song or drill reference, step, display mode, tempo, per-note results |
| `takes` | Song id, date, section, route, metrics, starred |
| `takeAudio` | Take id, MIME type, bytes |
| `sessions` | Date, blocks completed, duration, effort, throat |
| `pitchChecks` | Date, per-note results, percent in tune, average error |
| `rangeChecks` | Date, low, high |

- **Retention:** all metrics are kept. Audio is kept for starred takes, time capsules, and each day's best take per song; other audio is dropped after 14 days.
- **Backup:** after every session the app sends a JSON export (no audio) to the server, which keeps the last 30 in `data/backups/`. Restore is in Settings. This protects against cleared browser data.
- `navigator.storage.persist()` is requested on first run.

### 5.14 Local server

Bound to `127.0.0.1:4747` only.

| Route | Purpose |
|---|---|
| `GET /` and assets | The built app |
| `GET /songs/index.json`, `GET /songs/<id>/*` | Song packages, with range requests |
| `PUT /api/songs/<id>/notes` | Write `notes.json` atomically |
| `POST /api/backup`, `GET /api/backups`, `GET /api/backups/<name>` | Backups |

In development the Vite dev server mounts the same routes. In daily use the server runs as a login item (a launchd agent), installed by an explicit `pnpm run install-agent`, and the app is installed from Chrome as a Dock icon.

### 5.15 Failure handling

| Situation | Behavior |
|---|---|
| Not Chrome | Blocking message |
| Microphone permission denied or built-in mic not found | Explain how to fix it; nothing else runs |
| Live mic is not the built-in one | Block scoring; explain |
| A processing flag could not be turned off | Warn; continue |
| Calibration missing or stale for the current route | Timed scoring disabled until recalibrated; listen-then-sing on speakers still works |
| Input too quiet or room too noisy | Prompt before the repetition starts |
| Too few confident frames | Note is `unscored`, never `miss`; if over 40% of a repetition is unscored, the repetition is not counted |
| Song package fails validation | Song shown as broken with the reason; other songs unaffected |
| Tab closed mid-session | Resume from the last finished block |
| Throat check-in "hoarse" | Next session defaults to quiet mode and suggests a rest day; hoarseness lasting three weeks shows a note to see a doctor |

## 6. Testing

| Layer | What is tested |
|---|---|
| Signal code (Vitest) | Synthetic tones at 65.4, 82.4, 98 and 130.8 Hz and up: steady, gliding, with the fundamental attenuated 20–30 dB (imitating a laptop mic), with added noise. Assert pitch error and no octave flips, for both detectors |
| Scoring (Vitest) | Synthetic pitch tracks against known targets: perfect, uniformly flat, one octave down, late by 100 ms, with dropouts |
| Practice logic (Vitest) | Phrase ladder transitions, error rule, rotation, drill adaptation, planner output for given histories, key recommendation for given ranges |
| Package loading (Vitest) | A fixture package validates; malformed ones fail with a clear reason |
| `songprep` (pytest) | A synthesized "vocal" with known notes goes through stages 5–8 and the notes come back within tolerance; stage caching; atomic write |
| End to end (Playwright) | Chrome with a WAV file as the microphone: a synthesized perfect take scores 95% or more, a flat take scores low, an octave-down take is flagged as such |
| Regression | Recordings of the learner's own lowest notes, captured in phase 0 |

## 7. Build phases

Each phase ends with something usable. Phase 1 is enough to start practicing.

| Phase | Builds | Done when |
|---|---|---|
| 0. Audio lab | Lab screen: pinned mic, live pitch line, level meter, calibration, stretch test. Runs the checks below | Every check has a recorded result and a decision |
| 1. Core practice | Audio engine, guide voice, range finder, foundation drills with fading display, scoring, a fixed 15-minute session, storage | Daily pitch-matching practice works on AirPods and on speakers |
| 2. Songs | `songprep`, package loading, playback with key and tempo, key picker, note editor | Sailor Song is imported, corrected, keyed, and plays back with a guide voice that matches the original by ear |
| 3. Phrase ladder | Section 2.2 in full, mastery map, run-through takes, time capsules | A phrase can be taken from `new` to `clean`; a take is recorded and scored |
| 4. Daily flow | Planner, Today, Progress, pitch check, check-ins, backups, login-item server, Dock install | One click opens the app and one click starts a fully planned session |
| 5. Polish | Steadiness, timing and loudness feedback; original-versus-learner pitch overlay; performance ladder; own-voice guide bank; baked key variants | A take is graded against every target in section 2.5 |

**Phase 0 checks.** Several design decisions rest on bug reports and old measurements, so each is verified on this machine first.

| # | Check | Pass | If it fails |
|---|---|---|---|
| 1 | Processing flags read back as off in Chrome | All three false | Warn in app; investigate |
| 2 | With AirPods connected and the built-in mic pinned, playback stays full quality | No audible change; label is built-in | Revisit pinning steps |
| 3 | Calibration repeatability on each route, and again after 20 minutes | Spread under 5 ms; drift under 10 ms | Recalibrate each session; widen timing tolerance |
| 4 | Lowest sustained notes tracked by both detectors | Octave errors under 2% of frames | Restricted-band McLeod; larger window |
| 5 | Mic signal at 65–130 Hz | Harmonics clearly above the noise floor | Recommend a headset mic for the lowest notes |
| 6 | Speaker leakage: backing playing, nobody singing | Under 5% of frames read as voiced | Keep the speaker rule in 5.3 |
| 7 | Stretcher: sync between two nodes, clock mapping, sound at +2 to +4 semitones and 80% speed | In sync within 2 ms; acceptable by ear | Bake key variants at import; simpler tempo change |
| 8 | SwiftF0 in the browser on a 10-second clip | Under 1 second; matches the Python output | Use the 4096-sample McLeod scorer |

## 8. Open decisions

| Decision | Recommendation |
|---|---|
| Second song | Shape of You before Beauty and a Beat. It fits a low voice with no key change and has no rap |
| The rap in Beauty and a Beat | Decide when you get there: rap it (timing only is scored), cut it, or hand it to a friend |
| Audio files | Buy the three tracks. Clean source audio directly improves vocal separation, and so the reference melody |
| A human check | One lesson around weeks 3–4. The app hears pitch and timing only; it cannot see posture, breathing or tension |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Extracted notes need heavy correction | The editor is a first-class feature; phase 2 measures the real effort on Sailor Song; UltraSinger is the fallback |
| Low notes unstable through the laptop mic | Phase 0 checks 4 and 5; two detectors; fallbacks listed |
| AirPods delay drifts or changes on reconnect | Calibration is per route and invalidated on any device change; ±150 ms per-repetition slack |
| Speaker mode is second-class | Stated plainly in the app; listen-then-sing still fully works |
| Dependence on the pitch display | Ladder steps 6 and 7; every take and the pitch check are blind |
| Strain the app cannot hear | Check-ins, time limits, quiet mode, and the one lesson |
| Targets and timelines are untested | Marked provisional; recalibrate after the first month of real data |
| Python tool version conflicts | Each heavy tool runs in its own environment |

## 10. Not in scope

Phone support, accounts, cloud sync, notifications, points or badges, vibrato and riff training, voice-quality metrics (unreliable on consumer mics), AI coaching, downloading music, in-browser vocal separation, importing community karaoke files.
