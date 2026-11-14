# First Practice Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app usable for daily pitch practice: find the learner's range, then run listen-then-sing exercises fitted to it, score each one, adapt the difficulty and remember progress.

**Architecture:** Pure TypeScript modules for scoring, exercise generation, difficulty and range analysis, all unit-tested. One repetition is orchestrated by a small async runner on top of the existing audio engine: play the guide voice, capture the response, track its pitch, score it. Screens are thin and share one audio engine through a React context.

**Tech Stack:** As the audio lab, plus Dexie (IndexedDB) for storage and React Router for the four screens.

**Spec:** `docs/superpowers/specs/2026-11-13-singing-trainer-design.md`, build phase 1 (sections 2.1, 5.6–5.9, 5.13).

**Built before the lab results are in.** These choices are the spec's defaults and sit behind small interfaces, so the lab results can change them without rework:

- Scoring uses the band-restricted McLeod tracker with a 4096-sample window (`trackPitch`). SwiftF0 may replace it later behind the same `F0Track` type.
- Every exercise is listen-then-sing with nothing playing during the response, so it needs no latency calibration and works on speakers and headphones alike.
- Levels 1–4 only (single notes, two-note steps, three-note patterns). Song-derived levels arrive with songs.
- The guide voice uses an open "ah" rather than the spec's "oo": brighter, so low notes carry on laptop speakers.

**Status (2026-11-14):** Tasks 1-10 are built, tested and committed on `audio-lab` (126 unit tests, 3 end-to-end tests). Task 11 needs the learner at the machine.

**Two additions made while building:**

- The engine reports "running" only once microphone audio is actually arriving, and fails with a clear message after three seconds if none does (`app/src/audio/engine.ts`).
- End-to-end tests run one at a time (`workers: 1` in `app/playwright.config.ts`). Two headless browsers sharing the fake microphone stalled each other's audio clock.

## Global Constraints

- Everything in the audio lab plan's Global Constraints still applies.
- Screens follow the design tokens in `app/src/index.css`: navy field, chalk text, brass only for the learner's voice and for "in tune", coral only for warnings. No cards, shadows or gradients. Sentence case. One primary button per view.
- In tune means within ±50 cents; close means within ±100; a note within ±50 cents of the target moved by exactly one octave is reported as an octave error, never as a hit or a plain miss.
- A note with under half of its steady portion voiced is "not scored" and never counts as wrong.
- Difficulty steps up at 90% first-try success and down below 70%, judged over the last 20 first tries once there are at least 10.
- Nothing plays through the speakers while the response is being captured.
- If the live microphone is not the built-in one, practice is blocked.

## File Structure

| File | Responsibility |
|---|---|
| `app/src/pitch/track.ts` | Pitch track of a recording (`F0Track`) |
| `app/src/scoring/notes.ts` | Score target notes against a track |
| `app/src/scoring/feedback.ts` | One plain sentence per result |
| `app/src/practice/exercises.ts` | Range profile, levels, exercise generation |
| `app/src/practice/ladder.ts` | Difficulty and display-mode adaptation |
| `app/src/practice/rangeFinder.ts` | Speaking pitch, lowest and highest held notes, profile |
| `app/src/practice/history.ts` | Days practiced |
| `app/src/practice/repetition.ts` | Timing and running of one listen-then-sing repetition |
| `app/src/playback/guide.ts` | Guide voice synthesizer |
| `app/src/store/db.ts` | Profile, skill and attempts in IndexedDB |
| `app/src/ui/engine.tsx`, `app/src/ui/AudioGate.tsx` | Shared audio engine and its start prompt |
| `app/src/ui/Shell.tsx`, `app/src/ui/App.tsx` | Navigation and routes |
| `app/src/ui/Today.tsx`, `app/src/ui/Range.tsx`, `app/src/ui/Practice.tsx`, `app/src/ui/PracticeCanvas.tsx` | Screens |
| `app/src/ui/Lab.tsx` | Rewritten to use the shared engine |
| `app/e2e/lab.spec.ts`, `app/e2e/practice.spec.ts` | End-to-end tests |

---

### Task 1: Pitch track of a recording

**Files:**
- Create: `app/src/pitch/track.ts`
- Test: `app/src/pitch/track.test.ts`

**Interfaces:**
- Consumes: `createBandMpm`, `Band` from `./bandMpm`.
- Produces:
  - `type F0Track = { hopS: number; t0: number; hz: Float32Array; clarity: Float32Array }`. `hz[i]` is 0 where no pitch was found. Frame `i` is centered `t0 + i * hopS` seconds after the start of the recording.
  - `type TrackOptions = { windowSize?: number; hop?: number; clarityMin?: number; rmsMin?: number }` (defaults 4096, 512, 0.5, 0)
  - `trackPitch(pcm: Float32Array, sampleRate: number, band: Band, options?: TrackOptions): F0Track`

- [x] **Step 1: Write the failing test**

`app/src/pitch/track.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { centsBetween } from "../dsp/music";
import { harmonicTone } from "../dsp/synth";
import { trackPitch } from "./track";

const BAND = { minHz: 55, maxHz: 700 };

describe("trackPitch", () => {
  it("tracks a held note frame by frame", () => {
    const track = trackPitch(harmonicTone({ hz: 98, seconds: 1, sampleRate: 48000 }), 48000, BAND);
    expect(track.hz.length).toBe(Math.floor((48000 - 4096) / 512) + 1);
    for (const hz of track.hz) expect(Math.abs(centsBetween(hz, 98))).toBeLessThan(10);
  });

  it("places frame times at window centers", () => {
    const track = trackPitch(new Float32Array(48000), 48000, BAND);
    expect(track.t0).toBeCloseTo(2048 / 48000, 9);
    expect(track.hopS).toBeCloseTo(512 / 48000, 9);
  });

  it("marks silence and quiet sound as unvoiced", () => {
    const silent = trackPitch(new Float32Array(48000), 48000, BAND);
    expect(Array.from(silent.hz).every((hz) => hz === 0)).toBe(true);
    const quiet = harmonicTone({ hz: 98, seconds: 1, sampleRate: 48000, level: 0.001 });
    const gated = trackPitch(quiet, 48000, BAND, { rmsMin: 0.01 });
    expect(Array.from(gated.hz).every((hz) => hz === 0)).toBe(true);
  });

  it("returns an empty track for a recording shorter than one window", () => {
    expect(trackPitch(new Float32Array(1000), 48000, BAND).hz.length).toBe(0);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run in `app/`: `pnpm test src/pitch/track.test.ts`
Expected: FAIL, cannot resolve `./track`.

- [x] **Step 3: Implement**

`app/src/pitch/track.ts`:

```ts
import { createBandMpm, type Band } from "./bandMpm";

/**
 * Pitch over time for a recording. `hz[i]` is 0 where no pitch was found.
 * Frame `i` is centered `t0 + i * hopS` seconds after the start of the recording.
 */
export type F0Track = { hopS: number; t0: number; hz: Float32Array; clarity: Float32Array };

export type TrackOptions = { windowSize?: number; hop?: number; clarityMin?: number; rmsMin?: number };

/** Tracks the pitch of a finished recording. Steadier than the live line because it uses a longer window. */
export function trackPitch(pcm: Float32Array, sampleRate: number, band: Band, options: TrackOptions = {}): F0Track {
  const { windowSize = 4096, hop = 512, clarityMin = 0.5, rmsMin = 0 } = options;
  const detect = createBandMpm(windowSize, sampleRate, band);
  const count = pcm.length >= windowSize ? Math.floor((pcm.length - windowSize) / hop) + 1 : 0;
  const hz = new Float32Array(count);
  const clarity = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const window = pcm.subarray(i * hop, i * hop + windowSize);
    let sum = 0;
    for (let j = 0; j < windowSize; j++) sum += window[j] * window[j];
    const estimate = detect(window);
    clarity[i] = estimate.clarity;
    const loudEnough = Math.sqrt(sum / windowSize) >= rmsMin;
    if (estimate.hz !== null && estimate.clarity >= clarityMin && loudEnough) hz[i] = estimate.hz;
  }
  return { hopS: hop / sampleRate, t0: windowSize / 2 / sampleRate, hz, clarity };
}
```

- [x] **Step 4: Run it to verify it passes**

Run in `app/`: `pnpm test src/pitch/track.test.ts && pnpm typecheck`
Expected: 4 tests pass, no type errors.

- [x] **Step 5: Commit**

```bash
git add app/src/pitch/track.ts app/src/pitch/track.test.ts
git commit -m "feat: pitch track of a recording"
```

---

### Task 2: Scoring and feedback

**Files:**
- Create: `app/src/scoring/notes.ts`, `app/src/scoring/feedback.ts`
- Test: `app/src/scoring/notes.test.ts`, `app/src/scoring/feedback.test.ts`

**Interfaces:**
- Consumes: `F0Track`; `median`; `midiToHz`.
- Produces:
  - `type TargetNote = { id: number; t: number; d: number; midi: number }`. `t` and `d` are seconds; `t` is on the same time axis as the track.
  - `type Outcome = "hit" | "close" | "miss" | "octave" | "unscored"`
  - `type NoteResult = { id: number; outcome: Outcome; cents: number | null; spreadCents: number | null; voicedFraction: number }`
  - `scoreNotes(track: F0Track, targets: TargetNote[], offsetS?: number): NoteResult[]`
  - `bestOffset(track: F0Track, targets: TargetNote[], maxShiftS?: number, stepS?: number): number`
  - `scoreResponse(track: F0Track, targets: TargetNote[], maxShiftS?: number): { offsetS: number; notes: NoteResult[] }`
  - `isSuccess(results: NoteResult[]): boolean | null` (null when any note was not scored)
  - `describeResult(results: NoteResult[]): string`

- [x] **Step 1: Write the failing tests**

`app/src/scoring/notes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { F0Track } from "../pitch/track";
import { isSuccess, scoreNotes, scoreResponse, type NoteResult, type TargetNote } from "./notes";

const HOP = 512 / 48000;
const A2 = 110; // MIDI 45
const CSHARP3 = 138.591; // MIDI 49

/** A track that follows `segments`: [seconds, hz] pairs, with hz 0 for silence. */
function track(segments: [number, number][]): F0Track {
  const hz: number[] = [];
  for (const [seconds, value] of segments) {
    for (let i = 0; i < Math.round(seconds / HOP); i++) hz.push(value);
  }
  return { hopS: HOP, t0: 0, hz: Float32Array.from(hz), clarity: new Float32Array(hz.length).fill(1) };
}

const shifted = (hz: number, cents: number) => hz * 2 ** (cents / 1200);
const note = (t: number, d: number, midi: number, id = 0): TargetNote => ({ id, t, d, midi });

/** Scores one 1.5-second A2 target against a singer who holds `hz`. */
const single = (hz: number): NoteResult =>
  scoreNotes(
    track([
      [0.5, 0],
      [1.5, hz],
    ]),
    [note(0.5, 1.5, 45)],
  )[0];

describe("scoreNotes", () => {
  it("scores a note sung on pitch as a hit", () => {
    const result = single(A2);
    expect(result.outcome).toBe("hit");
    expect(result.cents).toBeCloseTo(0, 3);
    expect(result.voicedFraction).toBe(1);
    expect(result.spreadCents).toBeCloseTo(0, 3);
  });

  it("reports the signed error", () => {
    const result = single(shifted(A2, -30));
    expect(result.outcome).toBe("hit");
    expect(result.cents).toBeCloseTo(-30, 2);
  });

  it("grades by distance", () => {
    expect(single(shifted(A2, 70)).outcome).toBe("close");
    expect(single(shifted(A2, -300)).outcome).toBe("miss");
  });

  it("reports an octave error separately", () => {
    const result = single(A2 / 2);
    expect(result.outcome).toBe("octave");
    expect(result.cents).toBeCloseTo(-1200, 2);
  });

  it("does not score a note that was mostly silent", () => {
    const mostlySilent = track([
      [0.5, 0],
      [0.4, A2],
      [1.1, 0],
    ]);
    expect(scoreNotes(mostlySilent, [note(0.5, 1.5, 45)])[0]).toMatchObject({ outcome: "unscored", cents: null });
  });

  it("does not score a note that lies beyond the recording", () => {
    const result = scoreNotes(track([[1, A2]]), [note(5, 1, 45)])[0];
    expect(result).toMatchObject({ outcome: "unscored", voicedFraction: 0 });
  });
});

describe("scoreResponse", () => {
  const targets = [note(0.5, 1, 45, 0), note(1.5, 1, 49, 1)];

  it("scores two notes sung in time", () => {
    const sung = track([
      [0.5, 0],
      [1, A2],
      [1, CSHARP3],
    ]);
    const { notes } = scoreResponse(sung, targets);
    expect(notes.map((n) => n.outcome)).toEqual(["hit", "hit"]);
  });

  it("allows a late start within the shift limit", () => {
    const late = track([
      [1.1, 0],
      [1, A2],
      [1, CSHARP3],
    ]);
    expect(scoreNotes(late, targets)[0].outcome).toBe("unscored");
    const { offsetS, notes } = scoreResponse(late, targets, 0.3);
    expect(offsetS).toBeGreaterThan(0.1);
    expect(notes.map((n) => n.outcome)).toEqual(["hit", "hit"]);
  });

  it("prefers no shift when the timing is already right", () => {
    const sung = track([
      [0.5, 0],
      [1, A2],
      [1, CSHARP3],
    ]);
    expect(scoreResponse(sung, targets).offsetS).toBe(0);
  });
});

describe("isSuccess", () => {
  const result = (outcome: NoteResult["outcome"]): NoteResult => ({
    id: 0,
    outcome,
    cents: 0,
    spreadCents: 0,
    voicedFraction: 1,
  });

  it("is true only when every note is a hit", () => {
    expect(isSuccess([result("hit"), result("hit")])).toBe(true);
    expect(isSuccess([result("hit"), result("close")])).toBe(false);
    expect(isSuccess([result("octave")])).toBe(false);
  });

  it("is null when a note was not scored", () => {
    expect(isSuccess([result("hit"), result("unscored")])).toBeNull();
  });
});
```

`app/src/scoring/feedback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeResult } from "./feedback";
import type { NoteResult, Outcome } from "./notes";

const result = (outcome: Outcome, cents: number | null, id = 0): NoteResult => ({
  id,
  outcome,
  cents,
  spreadCents: cents === null ? null : 5,
  voicedFraction: cents === null ? 0.2 : 1,
});

describe("describeResult", () => {
  it("praises a note within 25 cents", () => {
    expect(describeResult([result("hit", 12)])).toBe("Right on it.");
  });

  it("says in tune for a hit further out", () => {
    expect(describeResult([result("hit", 40), result("hit", -35, 1)])).toBe("In tune.");
  });

  it("mentions a consistent lean", () => {
    expect(describeResult([result("hit", -40), result("hit", -38, 1)])).toBe("In tune, leaning flat.");
    expect(describeResult([result("hit", 45)])).toBe("In tune, leaning sharp.");
  });

  it("describes a near miss on a single note in cents", () => {
    expect(describeResult([result("close", -70)])).toBe("A little flat, by 70 cents.");
    expect(describeResult([result("close", 82)])).toBe("A little sharp, by 82 cents.");
  });

  it("describes a far miss in semitones", () => {
    expect(describeResult([result("miss", -310)])).toBe("Too low by about 3 semitones.");
    expect(describeResult([result("miss", 120)])).toBe("Too high by about 1 semitone.");
  });

  it("names the octave", () => {
    expect(describeResult([result("octave", -1195)])).toBe("Right note, one octave too low.");
    expect(describeResult([result("octave", 1210)])).toBe("Right note, one octave too high.");
  });

  it("points at the worst note of several", () => {
    const results = [result("hit", 5), result("close", 80, 1), result("miss", -250, 2)];
    expect(describeResult(results)).toBe("Third note too low by about 3 semitones.");
  });

  it("asks for more sound when notes were not heard", () => {
    expect(describeResult([result("unscored", null)])).toBe("Didn't hear you. Sing a little louder and hold the note.");
    expect(describeResult([result("hit", 3), result("unscored", null, 1)])).toBe(
      "Didn't catch every note. Hold each one for its full length.",
    );
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run in `app/`: `pnpm test src/scoring`
Expected: FAIL, cannot resolve `./notes` and `./feedback`.

- [x] **Step 3: Implement**

`app/src/scoring/notes.ts`:

```ts
import { midiToHz } from "../dsp/music";
import { median } from "../dsp/stats";
import type { F0Track } from "../pitch/track";

/** A note to sing. `t` and `d` are seconds, on the same time axis as the track being scored. */
export type TargetNote = { id: number; t: number; d: number; midi: number };

export type Outcome = "hit" | "close" | "miss" | "octave" | "unscored";

export type NoteResult = {
  id: number;
  outcome: Outcome;
  /** Signed median error against the target. Negative is flat. */
  cents: number | null;
  /** How much the pitch wandered while the note was held. */
  spreadCents: number | null;
  voicedFraction: number;
};

/** The part of a note that is judged: after the start has settled, before the release. */
function steadySpan(note: TargetNote): [number, number] {
  return [note.t + Math.max(0.08, 0.15 * note.d), note.t + 0.9 * note.d];
}

/** Indexes of the track frames inside a note's steady span, clamped to the track. */
function frameSpan(track: F0Track, note: TargetNote, offsetS: number): [number, number] {
  const [start, end] = steadySpan(note);
  const first = Math.max(0, Math.ceil((start + offsetS - track.t0) / track.hopS));
  const last = Math.min(track.hz.length - 1, Math.floor((end + offsetS - track.t0) / track.hopS));
  return [first, last];
}

function classify(cents: number): Outcome {
  const size = Math.abs(cents);
  if (size <= 50) return "hit";
  if (size <= 100) return "close";
  if (Math.abs(size - 1200) <= 50) return "octave";
  return "miss";
}

/** Scores each target against the track. `offsetS` shifts the targets later (positive) or earlier. */
export function scoreNotes(track: F0Track, targets: TargetNote[], offsetS = 0): NoteResult[] {
  return targets.map((note) => {
    const [start, end] = steadySpan(note);
    const [first, last] = frameSpan(track, note, offsetS);
    const expected = Math.max(1, Math.floor((end - start) / track.hopS));
    const targetHz = midiToHz(note.midi);
    const cents: number[] = [];
    for (let i = first; i <= last; i++) {
      if (track.hz[i] > 0) cents.push(1200 * Math.log2(track.hz[i] / targetHz));
    }
    const voicedFraction = Math.min(1, cents.length / expected);
    if (voicedFraction < 0.5) {
      return { id: note.id, outcome: "unscored", cents: null, spreadCents: null, voicedFraction };
    }
    const center = median(cents);
    const mean = cents.reduce((sum, c) => sum + c, 0) / cents.length;
    const spreadCents = Math.sqrt(cents.reduce((sum, c) => sum + (c - mean) ** 2, 0) / cents.length);
    return { id: note.id, outcome: classify(center), cents: center, spreadCents, voicedFraction };
  });
}

/** How well the targets line up with the singing at a given shift: frames near the target count most. */
function overlap(track: F0Track, targets: TargetNote[], offsetS: number): number {
  let matching = 0;
  let voiced = 0;
  for (const note of targets) {
    const [first, last] = frameSpan(track, note, offsetS);
    const targetHz = midiToHz(note.midi);
    for (let i = first; i <= last; i++) {
      if (track.hz[i] <= 0) continue;
      voiced++;
      if (Math.abs(1200 * Math.log2(track.hz[i] / targetHz)) <= 100) matching++;
    }
  }
  return matching * 1000 + voiced;
}

/**
 * The shift, within ±`maxShiftS`, at which the targets best line up with the
 * singing. A singer who starts slightly early or late is not marked wrong for
 * it. Ties go to the smallest shift.
 */
export function bestOffset(track: F0Track, targets: TargetNote[], maxShiftS = 0.15, stepS = 0.01): number {
  let best = 0;
  let bestScore = -1;
  const steps = Math.round(maxShiftS / stepS);
  for (let k = 0; k <= steps; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const shift = sign * k * stepS;
      const score = overlap(track, targets, shift);
      if (score > bestScore) {
        bestScore = score;
        best = shift;
      }
    }
  }
  return best;
}

export function scoreResponse(
  track: F0Track,
  targets: TargetNote[],
  maxShiftS = 0.15,
): { offsetS: number; notes: NoteResult[] } {
  const offsetS = bestOffset(track, targets, maxShiftS);
  return { offsetS, notes: scoreNotes(track, targets, offsetS) };
}

/** True when every note was hit; null when any note was not scored, so the attempt does not count. */
export function isSuccess(results: NoteResult[]): boolean | null {
  if (results.some((r) => r.outcome === "unscored")) return null;
  return results.every((r) => r.outcome === "hit");
}
```

`app/src/scoring/feedback.ts`:

```ts
import type { NoteResult } from "./notes";

const ORDINALS = ["First", "Second", "Third", "Fourth"];

function describeMiss(cents: number): string {
  const size = Math.abs(cents);
  if (size <= 100) return `a little ${cents < 0 ? "flat" : "sharp"}, by ${Math.round(size)} cents`;
  const semitones = Math.round(size / 100);
  return `too ${cents < 0 ? "low" : "high"} by about ${semitones} semitone${semitones === 1 ? "" : "s"}`;
}

/** One plain sentence about a repetition, leading with what matters most. */
export function describeResult(results: NoteResult[]): string {
  const scored = results.filter((r) => r.outcome !== "unscored");
  if (scored.length === 0) return "Didn't hear you. Sing a little louder and hold the note.";
  if (scored.length < results.length) return "Didn't catch every note. Hold each one for its full length.";

  const octave = scored.find((r) => r.outcome === "octave");
  if (octave) return `Right note, one octave too ${octave.cents! < 0 ? "low" : "high"}.`;

  const off = scored.filter((r) => r.outcome !== "hit");
  if (off.length === 0) {
    const worst = Math.max(...scored.map((r) => Math.abs(r.cents!)));
    if (worst <= 25) return "Right on it.";
    const mean = scored.reduce((sum, r) => sum + r.cents!, 0) / scored.length;
    if (Math.abs(mean) > 25) return `In tune, leaning ${mean < 0 ? "flat" : "sharp"}.`;
    return "In tune.";
  }

  const worst = off.reduce((a, b) => (Math.abs(b.cents!) > Math.abs(a.cents!) ? b : a));
  const text = describeMiss(worst.cents!);
  if (results.length === 1) return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  return `${ORDINALS[results.indexOf(worst)] ?? "One"} note ${text}.`;
}
```

- [x] **Step 4: Run them to verify they pass**

Run in `app/`: `pnpm test src/scoring && pnpm typecheck`
Expected: 19 tests pass, no type errors.

- [x] **Step 5: Commit**

```bash
git add app/src/scoring
git commit -m "feat: note scoring and plain-language feedback"
```

---

### Task 3: Exercises and the difficulty ladder

**Files:**
- Create: `app/src/practice/exercises.ts`, `app/src/practice/ladder.ts`
- Test: `app/src/practice/exercises.test.ts`, `app/src/practice/ladder.test.ts`

**Interfaces:**
- Consumes: `TargetNote`.
- Produces:
  - `type RangeProfile = { speakingMidi: number; comfortLow: number; comfortHigh: number }` (whole MIDI numbers)
  - `type Level = 1 | 2 | 3 | 4`, `LEVEL_NAMES: Record<Level, string>`
  - `type Exercise = { level: Level; notes: TargetNote[]; lengthS: number }`. Note times are seconds from the start of the exercise.
  - `makeExercise(level: Level, range: RangeProfile, random?: () => number): Exercise`
  - `type DisplayMode = "live" | "after" | "blind"`, `MODE_NAMES: Record<DisplayMode, string>`
  - `type Skill = { level: Level; mode: DisplayMode; recent: boolean[] }`, `initialSkill(): Skill`
  - `recordAttempt(skill: Skill, success: boolean): { skill: Skill; change: "up" | "down" | null }`

- [x] **Step 1: Write the failing tests**

`app/src/practice/exercises.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeExercise, type RangeProfile } from "./exercises";

/** Repeatable values in [0, 1). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const RANGE: RangeProfile = { speakingMidi: 45, comfortLow: 40, comfortHigh: 57 };
const many = (level: 1 | 2 | 3 | 4, range = RANGE) => {
  const random = seeded(level);
  return Array.from({ length: 300 }, () => makeExercise(level, range, random));
};

describe("makeExercise", () => {
  it("level 1 is one long note within three semitones of the speaking pitch", () => {
    for (const exercise of many(1)) {
      expect(exercise.notes.length).toBe(1);
      expect(exercise.notes[0].d).toBe(1.6);
      expect(Math.abs(exercise.notes[0].midi - 45)).toBeLessThanOrEqual(3);
    }
  });

  it("level 1 stays inside the range when the speaking pitch is near its edge", () => {
    for (const exercise of many(1, { speakingMidi: 41, comfortLow: 40, comfortHigh: 57 })) {
      expect(exercise.notes[0].midi).toBeGreaterThanOrEqual(40);
    }
  });

  it("level 2 uses the whole comfortable range", () => {
    const midis = many(2).map((exercise) => exercise.notes[0].midi);
    expect(Math.min(...midis)).toBe(40);
    expect(Math.max(...midis)).toBe(57);
  });

  it("level 3 is two joined notes one to four semitones apart", () => {
    for (const exercise of many(3)) {
      const [first, second] = exercise.notes;
      expect(exercise.notes.length).toBe(2);
      const interval = Math.abs(second.midi - first.midi);
      expect(interval).toBeGreaterThanOrEqual(1);
      expect(interval).toBeLessThanOrEqual(4);
      expect(second.t).toBeCloseTo(first.t + first.d, 9);
      for (const n of exercise.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(40);
        expect(n.midi).toBeLessThanOrEqual(57);
      }
    }
  });

  it("level 4 is three notes moving by whole steps in one direction", () => {
    for (const exercise of many(4)) {
      const midis = exercise.notes.map((n) => n.midi);
      expect(midis.length).toBe(3);
      const step = midis[1] - midis[0];
      expect(Math.abs(step)).toBe(2);
      expect(midis[2] - midis[1]).toBe(step);
      expect(Math.min(...midis)).toBeGreaterThanOrEqual(40);
      expect(Math.max(...midis)).toBeLessThanOrEqual(57);
      expect(exercise.lengthS).toBeCloseTo(0.3 + 3 * 0.8 + 0.2, 9);
    }
  });

  it("falls back to two notes when the range is too narrow for a pattern", () => {
    const exercise = makeExercise(4, { speakingMidi: 45, comfortLow: 44, comfortHigh: 46 }, seeded(9));
    expect(exercise.notes.length).toBe(2);
  });

  it("numbers the notes in order", () => {
    expect(makeExercise(4, RANGE, seeded(2)).notes.map((n) => n.id)).toEqual([0, 1, 2]);
  });
});
```

`app/src/practice/ladder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialSkill, recordAttempt, type Skill } from "./ladder";

/** Applies a run of attempts and returns the final skill and every change along the way. */
function play(start: Skill, attempts: boolean[]) {
  let skill = start;
  const changes: ("up" | "down")[] = [];
  for (const success of attempts) {
    const outcome = recordAttempt(skill, success);
    skill = outcome.skill;
    if (outcome.change) changes.push(outcome.change);
  }
  return { skill, changes };
}

const hits = (n: number) => Array<boolean>(n).fill(true);
const misses = (n: number) => Array<boolean>(n).fill(false);

describe("recordAttempt", () => {
  it("starts on level 1 with the pitch line shown", () => {
    expect(initialSkill()).toEqual({ level: 1, mode: "live", recent: [] });
  });

  it("does not judge before ten attempts", () => {
    const { skill, changes } = play(initialSkill(), hits(9));
    expect(changes).toEqual([]);
    expect(skill.recent.length).toBe(9);
  });

  it("steps through the display modes, then to the next level", () => {
    const first = play(initialSkill(), hits(10));
    expect(first.skill).toEqual({ level: 1, mode: "after", recent: [] });
    expect(first.changes).toEqual(["up"]);
    expect(play(first.skill, hits(10)).skill).toMatchObject({ level: 1, mode: "blind" });
    expect(play(initialSkill(), hits(30)).skill).toMatchObject({ level: 2, mode: "live" });
  });

  it("steps down below 70 percent", () => {
    const start: Skill = { level: 2, mode: "live", recent: [] };
    const { skill, changes } = play(start, [...hits(6), ...misses(4)]);
    expect(changes).toEqual(["down"]);
    expect(skill).toEqual({ level: 1, mode: "blind", recent: [] });
  });

  it("holds between 70 and 90 percent", () => {
    const { skill, changes } = play(initialSkill(), [...hits(8), ...misses(2)]);
    expect(changes).toEqual([]);
    expect(skill.level).toBe(1);
  });

  it("stays at the bottom and at the top", () => {
    expect(play(initialSkill(), misses(15)).skill).toMatchObject({ level: 1, mode: "live" });
    const top: Skill = { level: 4, mode: "blind", recent: [] };
    expect(play(top, hits(15)).skill).toMatchObject({ level: 4, mode: "blind" });
  });

  it("looks at the last twenty attempts only", () => {
    const { skill } = play(initialSkill(), [...misses(2), ...hits(7), ...misses(1), ...hits(15)]);
    expect(skill.recent.length).toBeLessThanOrEqual(20);
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run in `app/`: `pnpm test src/practice`
Expected: FAIL, cannot resolve `./exercises` and `./ladder`.

- [x] **Step 3: Implement**

`app/src/practice/exercises.ts`:

```ts
import type { TargetNote } from "../scoring/notes";

/** The learner's measured range, in whole MIDI note numbers. */
export type RangeProfile = { speakingMidi: number; comfortLow: number; comfortHigh: number };

export type Level = 1 | 2 | 3 | 4;

export const LEVEL_NAMES: Record<Level, string> = {
  1: "Single notes near your speaking voice",
  2: "Single notes across your range",
  3: "Two-note steps",
  4: "Three-note patterns",
};

/** Note times are seconds from the start of the exercise. */
export type Exercise = { level: Level; notes: TargetNote[]; lengthS: number };

const LEAD_S = 0.3;
const TAIL_S = 0.2;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** A whole number from `low` to `high` inclusive. */
const pick = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1));

function sequence(level: Level, midis: number[], each: number): Exercise {
  const notes = midis.map((midi, id) => ({ id, t: LEAD_S + id * each, d: each, midi }));
  return { level, notes, lengthS: LEAD_S + midis.length * each + TAIL_S };
}

/** Builds one exercise that lies entirely inside the learner's comfortable range. */
export function makeExercise(level: Level, range: RangeProfile, random: () => number = Math.random): Exercise {
  const low = range.comfortLow;
  const high = range.comfortHigh;
  if (level === 1) return sequence(1, [clamp(range.speakingMidi + pick(random, -3, 3), low, high)], 1.6);
  if (level === 2) return sequence(2, [pick(random, low, high)], 1.6);
  if (level === 3 || high - low < 4) {
    const first = pick(random, low, high);
    const step = pick(random, 1, 4) * (random() < 0.5 ? -1 : 1);
    const inRange = first + step >= low && first + step <= high;
    return sequence(3, [first, inRange ? first + step : clamp(first - step, low, high)], 1.0);
  }
  const start = pick(random, low, high - 4);
  const rising = random() < 0.5;
  return sequence(4, rising ? [start, start + 2, start + 4] : [start + 4, start + 2, start], 0.8);
}
```

`app/src/practice/ladder.ts`:

```ts
import type { Level } from "./exercises";

/** Whether the learner sees their pitch while singing, only afterwards, or not at all. */
export type DisplayMode = "live" | "after" | "blind";

export const MODE_NAMES: Record<DisplayMode, string> = {
  live: "Pitch line shown while you sing",
  after: "Pitch line shown after you sing",
  blind: "No pitch line",
};

/** `recent` holds first-try results, newest last. */
export type Skill = { level: Level; mode: DisplayMode; recent: boolean[] };

const MODES: DisplayMode[] = ["live", "after", "blind"];
const WINDOW = 20;
const MIN_ATTEMPTS = 10;
const TOP = 11;

export const initialSkill = (): Skill => ({ level: 1, mode: "live", recent: [] });

/** Position on the ladder: 0 is level 1 with the line shown, 11 is level 4 with no line. */
const rung = (skill: Skill) => (skill.level - 1) * 3 + MODES.indexOf(skill.mode);

const atRung = (n: number): Skill => ({ level: (Math.floor(n / 3) + 1) as Level, mode: MODES[n % 3], recent: [] });

/**
 * Records one first-try result. Once at least ten are in, 90% success moves up
 * one rung and under 70% moves down one. Each level is practiced with the
 * pitch line shown, then shown afterwards, then hidden, before the next level.
 */
export function recordAttempt(skill: Skill, success: boolean): { skill: Skill; change: "up" | "down" | null } {
  const recent = [...skill.recent, success].slice(-WINDOW);
  if (recent.length >= MIN_ATTEMPTS) {
    const rate = recent.filter(Boolean).length / recent.length;
    const position = rung(skill);
    if (rate >= 0.9 && position < TOP) return { skill: atRung(position + 1), change: "up" };
    if (rate < 0.7 && position > 0) return { skill: atRung(position - 1), change: "down" };
  }
  return { skill: { ...skill, recent }, change: null };
}
```

- [x] **Step 4: Run them to verify they pass**

Run in `app/`: `pnpm test src/practice && pnpm typecheck`
Expected: 14 tests pass, no type errors.

- [x] **Step 5: Commit**

```bash
git add app/src/practice
git commit -m "feat: exercise generation and difficulty ladder"
```

---

### Task 4: Range finder analysis and practice history

**Files:**
- Create: `app/src/practice/rangeFinder.ts`, `app/src/practice/history.ts`
- Test: `app/src/practice/rangeFinder.test.ts`, `app/src/practice/history.test.ts`

**Interfaces:**
- Consumes: `F0Track`; `hzToMidi`, `midiToHz`; `median`; `RangeProfile`.
- Produces:
  - `speakingPitch(track: F0Track): number | null` (MIDI; null when under half a second was voiced)
  - `lowestHeld(track: F0Track, holdS?: number): number | null`, `highestHeld(track: F0Track, holdS?: number): number | null` (MIDI)
  - `type ProfileResult = { ok: true; profile: RangeProfile } | { ok: false; reason: string }`
  - `buildProfile(speaking: number, low: number, high: number): ProfileResult`
  - `daysPracticed(isoTimes: string[]): number` (distinct local calendar days)

- [x] **Step 1: Write the failing tests**

`app/src/practice/rangeFinder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { midiToHz } from "../dsp/music";
import type { F0Track } from "../pitch/track";
import { buildProfile, highestHeld, lowestHeld, speakingPitch } from "./rangeFinder";

const HOP = 512 / 48000;

/** A track that follows `segments`: [seconds, MIDI note] pairs, with null for silence. */
function track(segments: [number, number | null][]): F0Track {
  const hz: number[] = [];
  for (const [seconds, midi] of segments) {
    for (let i = 0; i < Math.round(seconds / HOP); i++) hz.push(midi === null ? 0 : midiToHz(midi));
  }
  return { hopS: HOP, t0: 0, hz: Float32Array.from(hz), clarity: new Float32Array(hz.length).fill(1) };
}

describe("speakingPitch", () => {
  it("is the typical pitch of the voiced parts", () => {
    const spoken = track([
      [0.4, 46],
      [0.3, null],
      [0.6, 45],
      [0.2, 43],
    ]);
    expect(speakingPitch(spoken)).toBeCloseTo(45, 3);
  });

  it("is null when too little was voiced", () => {
    expect(speakingPitch(track([[0.3, 45]]))).toBeNull();
  });
});

describe("lowestHeld and highestHeld", () => {
  const glide = track([
    [1, 50],
    [1, 45],
    [0.4, 40],
    [0.1, 36],
    [1, null],
  ]);

  it("finds the lowest note held for a quarter of a second", () => {
    expect(lowestHeld(glide)).toBeCloseTo(40, 3);
  });

  it("ignores a brief dip below it", () => {
    expect(lowestHeld(glide)).not.toBeCloseTo(36, 3);
  });

  it("finds the highest note held", () => {
    expect(highestHeld(glide)).toBeCloseTo(50, 3);
  });

  it("is null without enough sound", () => {
    expect(lowestHeld(track([[0.1, 45]]))).toBeNull();
    expect(highestHeld(track([[1, null]]))).toBeNull();
  });
});

describe("buildProfile", () => {
  it("rounds to whole notes", () => {
    expect(buildProfile(45.3, 39.6, 57.4)).toEqual({
      ok: true,
      profile: { speakingMidi: 45, comfortLow: 40, comfortHigh: 57 },
    });
  });

  it("keeps the speaking pitch inside the range", () => {
    const result = buildProfile(38, 40, 57);
    expect(result.ok && result.profile.speakingMidi).toBe(40);
  });

  it("rejects a range under five semitones", () => {
    const result = buildProfile(45, 44, 47);
    expect(result.ok).toBe(false);
  });
});
```

`app/src/practice/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { daysPracticed } from "./history";

describe("daysPracticed", () => {
  it("counts distinct calendar days", () => {
    const monday = new Date(2026, 10, 9, 18, 0).toISOString();
    const mondayLater = new Date(2026, 10, 9, 21, 30).toISOString();
    const wednesday = new Date(2026, 10, 11, 7, 15).toISOString();
    expect(daysPracticed([monday, mondayLater, wednesday])).toBe(2);
  });

  it("is zero with no practice", () => {
    expect(daysPracticed([])).toBe(0);
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run in `app/`: `pnpm test src/practice/rangeFinder.test.ts src/practice/history.test.ts`
Expected: FAIL, cannot resolve `./rangeFinder` and `./history`.

- [x] **Step 3: Implement**

`app/src/practice/rangeFinder.ts`:

```ts
import { hzToMidi } from "../dsp/music";
import { median } from "../dsp/stats";
import type { F0Track } from "../pitch/track";
import type { RangeProfile } from "./exercises";

const voicedMidi = (track: F0Track): number[] =>
  Array.from(track.hz)
    .filter((hz) => hz > 0)
    .map(hzToMidi);

/** The typical pitch of a spoken clip as a MIDI number, or null when under half a second was voiced. */
export function speakingPitch(track: F0Track): number | null {
  const midi = voicedMidi(track);
  return midi.length * track.hopS < 0.5 ? null : median(midi);
}

/** The lowest pitch held for `holdS` seconds in total, so a brief dip or crack is ignored. */
export function lowestHeld(track: F0Track, holdS = 0.25): number | null {
  const midi = voicedMidi(track).sort((a, b) => a - b);
  const frames = Math.ceil(holdS / track.hopS);
  return midi.length < frames ? null : midi[frames - 1];
}

/** The highest pitch held for `holdS` seconds in total. */
export function highestHeld(track: F0Track, holdS = 0.25): number | null {
  const midi = voicedMidi(track).sort((a, b) => a - b);
  const frames = Math.ceil(holdS / track.hopS);
  return midi.length < frames ? null : midi[midi.length - frames];
}

export type ProfileResult = { ok: true; profile: RangeProfile } | { ok: false; reason: string };

/** Turns the three measurements into a profile. No voice-type label: at 18 the voice is still settling. */
export function buildProfile(speaking: number, low: number, high: number): ProfileResult {
  const comfortLow = Math.round(low);
  const comfortHigh = Math.round(high);
  if (comfortHigh - comfortLow < 5) {
    return {
      ok: false,
      reason: "That range is under five semitones. Try the slides again, going a little lower and a little higher.",
    };
  }
  const speakingMidi = Math.min(comfortHigh, Math.max(comfortLow, Math.round(speaking)));
  return { ok: true, profile: { speakingMidi, comfortLow, comfortHigh } };
}
```

`app/src/practice/history.ts`:

```ts
/** How many distinct local calendar days the given times fall on. */
export function daysPracticed(isoTimes: string[]): number {
  return new Set(isoTimes.map((iso) => new Date(iso).toDateString())).size;
}
```

- [x] **Step 4: Run them to verify they pass**

Run in `app/`: `pnpm test src/practice && pnpm typecheck`
Expected: all practice tests pass (26 in total), no type errors.

- [x] **Step 5: Commit**

```bash
git add app/src/practice
git commit -m "feat: range finder analysis and practice history"
```

---

### Task 5: Storage

**Files:**
- Create: `app/src/store/db.ts`
- Test: `app/src/store/db.test.ts`

**Interfaces:**
- Consumes: `RangeProfile`, `Level`; `Skill`, `DisplayMode`, `initialSkill`; `NoteResult`. Packages `dexie` and (tests only) `fake-indexeddb`, both already installed.
- Produces:
  - `type AttemptRow = { id: number; at: string; level: Level; mode: DisplayMode; targets: number[]; results: NoteResult[]; firstTry: boolean; success: boolean | null }`
  - `db` (the Dexie database, exported for tests)
  - `loadProfile(): Promise<RangeProfile | null>`, `saveProfile(profile: RangeProfile): Promise<void>`
  - `loadSkill(): Promise<Skill>` (the initial skill when none is saved), `saveSkill(skill: Skill): Promise<void>`
  - `addAttempt(attempt: Omit<AttemptRow, "id">): Promise<void>`, `attemptsSince(iso: string): Promise<AttemptRow[]>`

- [x] **Step 1: Write the failing test**

`app/src/store/db.test.ts`:

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initialSkill } from "../practice/ladder";
import { addAttempt, attemptsSince, db, loadProfile, loadSkill, saveProfile, saveSkill, type AttemptRow } from "./db";

const attempt = (at: string): Omit<AttemptRow, "id"> => ({
  at,
  level: 1,
  mode: "live",
  targets: [45],
  results: [{ id: 0, outcome: "hit", cents: 4, spreadCents: 6, voicedFraction: 1 }],
  firstTry: true,
  success: true,
});

beforeEach(async () => {
  await Promise.all([db.profile.clear(), db.skill.clear(), db.attempts.clear()]);
});

describe("store", () => {
  it("has no profile until one is saved", async () => {
    expect(await loadProfile()).toBeNull();
  });

  it("round-trips the profile, keeping only the latest", async () => {
    await saveProfile({ speakingMidi: 45, comfortLow: 40, comfortHigh: 57 });
    await saveProfile({ speakingMidi: 46, comfortLow: 41, comfortHigh: 58 });
    expect(await loadProfile()).toEqual({ speakingMidi: 46, comfortLow: 41, comfortHigh: 58 });
  });

  it("starts with the initial skill and remembers changes", async () => {
    expect(await loadSkill()).toEqual(initialSkill());
    await saveSkill({ level: 2, mode: "after", recent: [true, false] });
    expect(await loadSkill()).toEqual({ level: 2, mode: "after", recent: [true, false] });
  });

  it("returns attempts on or after a given time", async () => {
    await addAttempt(attempt("2026-11-10T10:00:00.000Z"));
    await addAttempt(attempt("2026-11-12T10:00:00.000Z"));
    const found = await attemptsSince("2026-11-11T00:00:00.000Z");
    expect(found.map((a) => a.at)).toEqual(["2026-11-12T10:00:00.000Z"]);
    expect(found[0].results[0].outcome).toBe("hit");
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run in `app/`: `pnpm test src/store`
Expected: FAIL, cannot resolve `./db`.

- [x] **Step 3: Implement**

`app/src/store/db.ts`:

```ts
import Dexie, { type EntityTable } from "dexie";
import type { Level, RangeProfile } from "../practice/exercises";
import { initialSkill, type DisplayMode, type Skill } from "../practice/ladder";
import type { NoteResult } from "../scoring/notes";

type ProfileRow = RangeProfile & { id: "me"; measuredAt: string };
type SkillRow = Skill & { id: "foundation" };

/** One sung repetition. `targets` are the MIDI notes asked for. */
export type AttemptRow = {
  id: number;
  at: string;
  level: Level;
  mode: DisplayMode;
  targets: number[];
  results: NoteResult[];
  firstTry: boolean;
  success: boolean | null;
};

export const db = new Dexie("singing-trainer") as Dexie & {
  profile: EntityTable<ProfileRow, "id">;
  skill: EntityTable<SkillRow, "id">;
  attempts: EntityTable<AttemptRow, "id">;
};

db.version(1).stores({ profile: "id", skill: "id", attempts: "++id, at" });

export async function loadProfile(): Promise<RangeProfile | null> {
  const row = await db.profile.get("me");
  if (!row) return null;
  return { speakingMidi: row.speakingMidi, comfortLow: row.comfortLow, comfortHigh: row.comfortHigh };
}

export async function saveProfile(profile: RangeProfile): Promise<void> {
  await db.profile.put({ ...profile, id: "me", measuredAt: new Date().toISOString() });
}

export async function loadSkill(): Promise<Skill> {
  const row = await db.skill.get("foundation");
  return row ? { level: row.level, mode: row.mode, recent: row.recent } : initialSkill();
}

export async function saveSkill(skill: Skill): Promise<void> {
  await db.skill.put({ ...skill, id: "foundation" });
}

export async function addAttempt(attempt: Omit<AttemptRow, "id">): Promise<void> {
  await db.attempts.add(attempt);
}

export async function attemptsSince(iso: string): Promise<AttemptRow[]> {
  return db.attempts.where("at").aboveOrEqual(iso).toArray();
}
```

- [x] **Step 4: Run it to verify it passes**

Run in `app/`: `pnpm test src/store && pnpm typecheck`
Expected: 4 tests pass, no type errors.

- [x] **Step 5: Commit**

```bash
git add app/src/store app/package.json pnpm-lock.yaml
git commit -m "feat: local storage for profile, skill and attempts"
```

---

### Task 6: Guide voice and one repetition

**Files:**
- Create: `app/src/playback/guide.ts`, `app/src/practice/repetition.ts`
- Test: `app/src/playback/guide.test.ts`, `app/src/practice/repetition.test.ts`

**Interfaces:**
- Consumes: `AudioEngine` (`ctx`, `beginCapture`); `trackPitch`, `F0Track`; `Band`; `scoreResponse`, `isSuccess`, `NoteResult`; `Exercise`; `midiToHz`.
- Produces:
  - `type GuideNote = { t: number; d: number; midi: number }`
  - `envelope(start: number, d: number): { attackEnd: number; releaseStart: number; end: number }`
  - `playGuide(ctx: AudioContext, notes: GuideNote[], startAt: number, volume?: number): { endTime: number; stop: () => void }`
  - `type Repetition = { exercise: Exercise; listenAt: number; singAt: number; endAt: number }` (audio-clock seconds)
  - `scheduleRepetition(now: number, exercise: Exercise): Repetition`
  - `type RepetitionResult = { repetition: Repetition; notes: NoteResult[]; offsetS: number; success: boolean | null }`
  - `runRepetition(engine: AudioEngine, exercise: Exercise, options: { band: Band; rmsMin?: number; onScheduled?: (repetition: Repetition) => void }): Promise<RepetitionResult>`

- [x] **Step 1: Write the failing tests**

`app/src/playback/guide.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { envelope } from "./guide";

describe("envelope", () => {
  it("fades in over 20 ms and out over the last 60 ms", () => {
    const shape = envelope(1, 1);
    expect(shape.attackEnd).toBeCloseTo(1.02, 9);
    expect(shape.releaseStart).toBeCloseTo(1.94, 9);
    expect(shape.end).toBeCloseTo(2, 9);
  });
});
```

`app/src/practice/repetition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Exercise } from "./exercises";
import { scheduleRepetition } from "./repetition";

const exercise: Exercise = { level: 1, notes: [{ id: 0, t: 0.3, d: 1.6, midi: 45 }], lengthS: 2.1 };

describe("scheduleRepetition", () => {
  const repetition = scheduleRepetition(100, exercise);

  it("starts the guide shortly after now", () => {
    expect(repetition.listenAt).toBeCloseTo(100.25, 9);
  });

  it("leaves a silent gap between the guide and the response", () => {
    const guideEnds = repetition.listenAt + exercise.lengthS;
    expect(repetition.singAt - guideEnds).toBeCloseTo(0.5, 9);
  });

  it("ends after the response plus a short tail", () => {
    expect(repetition.endAt).toBeCloseTo(repetition.singAt + exercise.lengthS + 0.35, 9);
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run in `app/`: `pnpm test src/playback src/practice/repetition.test.ts`
Expected: FAIL, cannot resolve `./guide` and `./repetition`.

- [x] **Step 3: Implement**

`app/src/playback/guide.ts`:

```ts
import { midiToHz } from "../dsp/music";

export type GuideNote = { t: number; d: number; midi: number };

const ATTACK_S = 0.02;
const RELEASE_S = 0.06;

/**
 * Resonances of an open "ah". Brighter than "oo", so the lowest notes still
 * carry on laptop speakers, which reproduce little below about 150 Hz.
 */
const FORMANTS = [
  { hz: 700, q: 5, gain: 1 },
  { hz: 1150, q: 7, gain: 0.5 },
  { hz: 2500, q: 9, gain: 0.2 },
];

export function envelope(start: number, d: number): { attackEnd: number; releaseStart: number; end: number } {
  return { attackEnd: start + ATTACK_S, releaseStart: start + d - RELEASE_S, end: start + d };
}

/**
 * Sings `notes` in a plain voice-like tone, always at the written pitch, so the
 * model is in the learner's own octave. Note times are relative to `startAt`,
 * which is a time on the audio clock.
 */
export function playGuide(
  ctx: AudioContext,
  notes: GuideNote[],
  startAt: number,
  volume = 0.9,
): { endTime: number; stop: () => void } {
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  const oscillators: OscillatorNode[] = [];
  let endTime = startAt;

  for (const note of notes) {
    const start = startAt + note.t;
    const { attackEnd, releaseStart, end } = envelope(start, note.d);
    const oscillator = ctx.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = midiToHz(note.midi);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, start);
    shape.gain.linearRampToValueAtTime(1, attackEnd);
    shape.gain.setValueAtTime(1, releaseStart);
    shape.gain.linearRampToValueAtTime(0, end);
    for (const formant of FORMANTS) {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = formant.hz;
      filter.Q.value = formant.q;
      const level = ctx.createGain();
      level.gain.value = formant.gain;
      oscillator.connect(filter).connect(level).connect(shape);
    }
    shape.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
    oscillators.push(oscillator);
    endTime = Math.max(endTime, end);
  }

  const release = () => master.disconnect();
  const timer = setTimeout(release, Math.max(0, endTime - ctx.currentTime + 0.2) * 1000);
  return {
    endTime,
    stop: () => {
      clearTimeout(timer);
      for (const oscillator of oscillators) {
        try {
          oscillator.stop();
        } catch {
          // Already stopped.
        }
      }
      release();
    },
  };
}
```

`app/src/practice/repetition.ts`:

```ts
import type { AudioEngine } from "../audio/engine";
import type { Band } from "../pitch/bandMpm";
import { trackPitch } from "../pitch/track";
import { playGuide } from "../playback/guide";
import { isSuccess, scoreResponse, type NoteResult } from "../scoring/notes";
import type { Exercise } from "./exercises";

/** When each part of a repetition happens, in seconds on the audio clock. */
export type Repetition = { exercise: Exercise; listenAt: number; singAt: number; endAt: number };

export type RepetitionResult = {
  repetition: Repetition;
  notes: NoteResult[];
  offsetS: number;
  success: boolean | null;
};

const START_DELAY_S = 0.25;
/** Silence between the guide and the response, so the guide has died away before the microphone is scored. */
const GAP_S = 0.5;
const TAIL_S = 0.35;
const PRE_ROLL_S = 0.35;
/** A learner following a visual cue may start late; this much is forgiven. */
const MAX_SHIFT_S = 0.3;

/** Listen first, then sing the same thing back, with nothing playing during the response. */
export function scheduleRepetition(now: number, exercise: Exercise): Repetition {
  const listenAt = now + START_DELAY_S;
  const singAt = listenAt + exercise.lengthS + GAP_S;
  return { exercise, listenAt, singAt, endAt: singAt + exercise.lengthS + TAIL_S };
}

const until = (ctx: AudioContext, time: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, time - ctx.currentTime) * 1000));

/** Plays the guide, records the response and scores it. */
export async function runRepetition(
  engine: AudioEngine,
  exercise: Exercise,
  options: { band: Band; rmsMin?: number; onScheduled?: (repetition: Repetition) => void },
): Promise<RepetitionResult> {
  const ctx = engine.ctx;
  const repetition = scheduleRepetition(ctx.currentTime, exercise);
  playGuide(ctx, exercise.notes, repetition.listenAt);
  options.onScheduled?.(repetition);

  await until(ctx, repetition.singAt - PRE_ROLL_S);
  const capture = engine.beginCapture();
  await until(ctx, repetition.endAt);
  const { pcm, sampleRate, startFrame } = capture.end();

  // Put the targets on the recording's own time axis.
  const recordingStart = startFrame / sampleRate;
  const track = trackPitch(pcm, sampleRate, options.band, { rmsMin: options.rmsMin });
  const targets = exercise.notes.map((note) => ({ ...note, t: note.t + repetition.singAt - recordingStart }));
  const { offsetS, notes } = scoreResponse(track, targets, MAX_SHIFT_S);
  return { repetition, notes, offsetS, success: isSuccess(notes) };
}
```

- [x] **Step 4: Run them to verify they pass**

Run in `app/`: `pnpm test && pnpm typecheck`
Expected: all tests pass, no type errors.

- [x] **Step 5: Commit**

```bash
git add app/src/playback app/src/practice/repetition.ts app/src/practice/repetition.test.ts
git commit -m "feat: guide voice and listen-then-sing repetition"
```

---

### Task 7: Shared audio engine and its start prompt

**Files:**
- Create: `app/src/ui/engine.tsx`, `app/src/ui/AudioGate.tsx`
- Modify: `app/src/ui/lab/styles.ts` (replace with the version below, which adds `headlineClass`)

**Interfaces:**
- Consumes: `AudioEngine`, `EngineInfo`.
- Produces:
  - `type EngineStatus = "idle" | "starting" | "running" | "error"`
  - `fakeMic: boolean` (true when the page was opened with `?mic=fake`)
  - `EngineProvider` component; `useEngine(): { engine: AudioEngine | null; info: EngineInfo | null; status: EngineStatus; error: string; start: () => Promise<void> }`
  - `AudioGate` component: `{ prompt: string; requireBuiltIn?: boolean; children: (engine: AudioEngine, info: EngineInfo) => ReactNode }`. Shows the prompt and a "Start audio" button until the engine runs, then renders its children. With `requireBuiltIn` (the default) it shows a warning instead when the live microphone is not the built-in one.
  - `headlineClass: string`

- [x] **Step 1: Write the files**

`app/src/ui/lab/styles.ts`:

```ts
/** The main action on a screen: chalk on navy. Brass is reserved for the voice. */
export const buttonClass =
  "rounded-md bg-chalk px-3.5 py-1.5 text-sm font-medium text-deep transition-opacity hover:opacity-90 disabled:opacity-40";

/** A secondary action, set as a text link. */
export const quietButtonClass =
  "text-sm text-mist underline underline-offset-4 transition-colors hover:text-chalk disabled:opacity-40";

export const inputClass =
  "w-full rounded-md border border-rule bg-transparent px-2.5 py-1.5 text-sm text-chalk placeholder:text-mist/60";

/** The one large line of text that says what a screen is for or what to do now. */
export const headlineClass = "max-w-2xl text-4xl leading-tight [font-stretch:87%]";

export const tableClass = "w-full text-left text-sm tabular-nums";
export const headCellClass = "whitespace-nowrap pb-2 pr-6 font-normal text-mist";
export const cellClass = "whitespace-nowrap py-1 pr-6 align-top";
/** A cell whose text may wrap, for long labels. */
export const wrapCellClass = "py-1 pr-6 align-top";
export const noteClass = "max-w-prose text-sm text-mist";
```

`app/src/ui/engine.tsx`:

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { AudioEngine, type EngineInfo } from "../audio/engine";

export type EngineStatus = "idle" | "starting" | "running" | "error";

type EngineState = {
  engine: AudioEngine | null;
  info: EngineInfo | null;
  status: EngineStatus;
  error: string;
  start: () => Promise<void>;
};

const EngineContext = createContext<EngineState | null>(null);

/** "?mic=fake" lets the end-to-end tests use Chrome's fake microphone. */
export const fakeMic = new URLSearchParams(location.search).get("mic") === "fake";

function explain(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it in Chrome's site settings for this page, then reload.";
  }
  return cause instanceof Error ? cause.message : String(cause);
}

/** Holds the one audio engine that every screen shares. */
export function EngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [error, setError] = useState("");

  async function start() {
    if (status === "starting" || status === "running") return;
    setStatus("starting");
    try {
      const created = new AudioEngine(fakeMic ? { micPattern: /Fake.*Input/i } : {});
      const started = await created.start();
      created.onDeviceChange(setInfo);
      setEngine(created);
      setInfo(started);
      setStatus("running");
    } catch (cause) {
      setError(explain(cause));
      setStatus("error");
    }
  }

  return <EngineContext.Provider value={{ engine, info, status, error, start }}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineState {
  const state = useContext(EngineContext);
  if (!state) throw new Error("useEngine must be used inside EngineProvider.");
  return state;
}
```

`app/src/ui/AudioGate.tsx`:

```tsx
import type { ReactNode } from "react";
import type { AudioEngine, EngineInfo } from "../audio/engine";
import { useEngine } from "./engine";
import { buttonClass, headlineClass } from "./lab/styles";

/** Asks for the microphone once, then shows its children. The browser only starts audio from a click. */
export function AudioGate({
  prompt,
  requireBuiltIn = true,
  children,
}: {
  prompt: string;
  /** When true, nothing is shown unless the live microphone is the MacBook's own. */
  requireBuiltIn?: boolean;
  children: (engine: AudioEngine, info: EngineInfo) => ReactNode;
}) {
  const { engine, info, status, error, start } = useEngine();
  if (engine && info) {
    if (requireBuiltIn && !info.micIsBuiltIn) {
      return (
        <p className="max-w-lg pt-[18vh] text-signal">
          The microphone in use is not the MacBook's own, so scores would be unreliable. Close System Settings › Sound
          and any call apps, then reload this page.
        </p>
      );
    }
    return <>{children(engine, info)}</>;
  }
  return (
    <div className="pt-[18vh]">
      <p className={headlineClass}>{prompt}</p>
      <button onClick={start} disabled={status === "starting"} className={`mt-8 ${buttonClass}`}>
        Start audio
      </button>
      {status === "error" && <p className="mt-6 max-w-lg text-signal">{error}</p>}
    </div>
  );
}
```

- [x] **Step 2: Type-check**

Run in `app/`: `pnpm typecheck && pnpm test`
Expected: no type errors; all tests still pass. Nothing uses these files yet.

- [x] **Step 3: Commit**

```bash
git add app/src/ui
git commit -m "feat: shared audio engine and start prompt"
```

---

### Task 8: Range screen

**Files:**
- Create: `app/src/ui/Range.tsx`

**Interfaces:**
- Consumes: `AudioGate`; `AudioEngine.beginCapture`; `trackPitch`, `F0Track`; `speakingPitch`, `lowestHeld`, `highestHeld`, `buildProfile`; `saveProfile`; `PitchCanvas`; `midiToName`; `useNavigate` from `react-router`.
- Produces: the `Range` component. It records three six-second clips (speaking voice, slide down, slide up), shows each measured note, and saves the profile.

- [x] **Step 1: Write the screen**

`app/src/ui/Range.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import type { AudioEngine } from "../audio/engine";
import { midiToName } from "../dsp/music";
import { trackPitch, type F0Track } from "../pitch/track";
import { buildProfile, highestHeld, lowestHeld, speakingPitch } from "../practice/rangeFinder";
import { saveProfile } from "../store/db";
import { AudioGate } from "./AudioGate";
import { PitchCanvas } from "./PitchCanvas";
import { buttonClass, headlineClass, quietButtonClass } from "./lab/styles";

const SECONDS = 6;
const BAND = { minHz: 55, maxHz: 700 };

type Step = { label: string; instruction: string; measure: (track: F0Track) => number | null };

const STEPS: Step[] = [
  {
    label: "Speaking voice",
    instruction: "Count out loud from ten down to one, in your normal voice.",
    measure: speakingPitch,
  },
  {
    label: "Lowest note",
    instruction: "On “ah”, slide down slowly to the lowest note that still sounds clear, and hold it.",
    measure: lowestHeld,
  },
  {
    label: "Highest note",
    instruction: "On “ah”, slide up slowly to the highest note that takes no effort, and hold it. Stop before it strains.",
    measure: highestHeld,
  },
];

function Finder({ engine }: { engine: AudioEngine }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<number[]>([]);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState("");

  const step: Step | undefined = STEPS[values.length];
  const outcome = values.length === STEPS.length ? buildProfile(values[0], values[1], values[2]) : null;
  const headline = step
    ? step.instruction
    : outcome === null
      ? ""
      : outcome.ok
        ? `${midiToName(outcome.profile.comfortLow)} to ${midiToName(outcome.profile.comfortHigh)}.`
        : outcome.reason;

  async function record() {
    if (!step) return;
    setProblem("");
    setRecording(true);
    const capture = engine.beginCapture();
    await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));
    const { pcm, sampleRate } = capture.end();
    setRecording(false);
    // A strict clarity gate keeps breathy or creaky sound at the edges out of the measurement.
    const value = step.measure(trackPitch(pcm, sampleRate, BAND, { clarityMin: 0.8 }));
    if (value === null) setProblem("Didn't hear enough to measure. Try again, a little louder.");
    else setValues([...values, value]);
  }

  async function save() {
    if (!outcome?.ok) return;
    await saveProfile(outcome.profile);
    navigate("/");
  }

  function startOver() {
    setValues([]);
    setProblem("");
  }

  return (
    <div className="pt-12">
      <p className="text-sm text-mist">{step ? `Step ${values.length + 1} of ${STEPS.length}` : "Your range"}</p>
      <p className={`mt-3 min-h-[2.5em] ${headlineClass}`}>{headline}</p>
      <div className="mt-8 flex items-center gap-5">
        {step && (
          <button onClick={record} disabled={recording} className={buttonClass}>
            {recording ? "Recording" : `Record ${SECONDS} seconds`}
          </button>
        )}
        {outcome?.ok && (
          <button onClick={save} className={buttonClass}>
            Save range
          </button>
        )}
        {values.length > 0 && !recording && (
          <button onClick={startOver} className={quietButtonClass}>
            Start over
          </button>
        )}
      </div>
      {problem && <p className="mt-6 text-signal">{problem}</p>}
      <div className="mt-10">
        <PitchCanvas engine={engine} />
      </div>
      {values.length > 0 && (
        <dl className="mt-8 grid max-w-sm grid-cols-2 gap-y-1.5 text-sm">
          {values.map((value, i) => (
            <div key={STEPS[i].label} className="contents">
              <dt className="text-mist">{STEPS[i].label}</dt>
              <dd>{midiToName(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function Range() {
  return (
    <AudioGate prompt="Find the notes you can sing comfortably. It takes about a minute.">
      {(engine) => <Finder engine={engine} />}
    </AudioGate>
  );
}
```

- [x] **Step 2: Type-check**

Run in `app/`: `pnpm typecheck`
Expected: no type errors. The screen becomes reachable in Task 10.

- [x] **Step 3: Commit**

```bash
git add app/src/ui/Range.tsx
git commit -m "feat: range finder screen"
```

---

### Task 9: Practice screen

**Files:**
- Create: `app/src/ui/PracticeCanvas.tsx`, `app/src/ui/Practice.tsx`

**Interfaces:**
- Consumes: `AudioGate`, `fakeMic`; `runRepetition`, `Repetition`; `makeExercise`, `LEVEL_NAMES`, `RangeProfile`; `recordAttempt`, `initialSkill`, `MODE_NAMES`, `Skill`; `describeResult`; `NoteResult`; `noiseGate`; `addAttempt`, `loadProfile`, `loadSkill`, `saveSkill`; `midiToHz`, `hzToMidi`; `PitchFrame`; `Link`, `useLocation` from `react-router`.
- Produces:
  - `PracticeCanvas` component: `{ engine: AudioEngine; repetition: Repetition | null; showTrace: boolean; results: NoteResult[] | null }`. One repetition laid out left to right: the notes to hear, then the same notes to sing, with a moving playhead and (when `showTrace`) the learner's pitch.
  - `Practice` component. Opened with router state `{ autostart: true }` it begins as soon as the engine runs. `?fixed=<midi>` pins every exercise to one note, for the end-to-end test.

- [x] **Step 1: Write the canvas**

`app/src/ui/PracticeCanvas.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { AudioEngine } from "../audio/engine";
import { hzToMidi } from "../dsp/music";
import type { PitchFrame } from "../pitch/smoother";
import type { Repetition } from "../practice/repetition";
import type { NoteResult } from "../scoring/notes";

type View = { repetition: Repetition | null; showTrace: boolean; results: NoteResult[] | null };

/**
 * One repetition, left to right: outlined notes to listen to, then filled notes
 * to sing, with a playhead moving across. The learner's pitch is drawn in brass
 * when `showTrace` is set, and a note that was hit turns brass.
 */
export function PracticeCanvas({ engine, repetition, showTrace, results }: View & { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ repetition, showTrace, results });

  useEffect(() => {
    view.current = { repetition, showTrace, results };
  }, [repetition, showTrace, results]);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const token = (name: string) => getComputedStyle(canvas).getPropertyValue(name).trim();
    const colors = { rule: token("--color-rule"), chalk: token("--color-chalk"), brass: token("--color-brass") };

    const frames: PitchFrame[] = [];
    const unsubscribe = engine.onFrame((frame) => {
      frames.push(frame);
      while (frame.t - frames[0].t > 15) frames.shift();
    });

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let animation = 0;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas;
      g.clearRect(0, 0, width, height);
      const current = view.current;
      if (current.repetition) {
        const { exercise, listenAt, singAt, endAt } = current.repetition;
        const midis = exercise.notes.map((note) => note.midi);
        const low = Math.min(...midis) - 5;
        const high = Math.max(...midis) + 5;
        const x = (t: number) => ((t - listenAt) / (endAt - listenAt)) * width;
        const y = (midi: number) => height - ((midi - low) / (high - low)) * height;

        // One hairline per semitone.
        g.lineWidth = ratio;
        g.strokeStyle = colors.rule;
        g.globalAlpha = 0.35;
        for (let midi = low; midi <= high; midi++) {
          const py = Math.round(y(midi)) + 0.5;
          g.beginPath();
          g.moveTo(0, py);
          g.lineTo(width, py);
          g.stroke();
        }

        // The line between listening and singing.
        g.globalAlpha = 1;
        const divide = Math.round(x(singAt - 0.25)) + 0.5;
        g.beginPath();
        g.moveTo(divide, 0);
        g.lineTo(divide, height);
        g.stroke();

        // Each note is one semitone tall: singing inside the bar is in tune.
        const bar = (start: number, note: { t: number; d: number; midi: number }) => {
          const left = x(start + note.t);
          const top = y(note.midi + 0.5);
          g.beginPath();
          g.roundRect(left, top, x(start + note.t + note.d) - left, y(note.midi - 0.5) - top, 4 * ratio);
        };
        for (const note of exercise.notes) {
          bar(listenAt, note);
          g.globalAlpha = 0.5;
          g.strokeStyle = colors.chalk;
          g.stroke();

          const hit = current.results?.find((r) => r.id === note.id)?.outcome === "hit";
          bar(singAt, note);
          g.globalAlpha = hit ? 0.45 : 0.14;
          g.fillStyle = hit ? colors.brass : colors.chalk;
          g.fill();
        }
        g.globalAlpha = 1;

        // The learner's voice, only during the response.
        if (current.showTrace) {
          g.strokeStyle = colors.brass;
          g.lineWidth = 2 * ratio;
          g.lineJoin = "round";
          g.lineCap = "round";
          let previous: PitchFrame | null = null;
          g.beginPath();
          for (const frame of frames) {
            if (frame.hz === null || frame.t < singAt - 0.3 || frame.t > endAt) {
              previous = null;
              continue;
            }
            const px = x(frame.t);
            const py = y(hzToMidi(frame.hz));
            if (previous && frame.t - previous.t <= 0.04) g.lineTo(px, py);
            else g.moveTo(px, py);
            previous = frame;
          }
          g.stroke();
        }

        // The playhead.
        const now = engine.ctx.currentTime;
        if (now >= listenAt && now <= endAt) {
          const px = Math.round(x(now)) + 0.5;
          g.strokeStyle = colors.chalk;
          g.globalAlpha = 0.6;
          g.lineWidth = ratio;
          g.beginPath();
          g.moveTo(px, 0);
          g.lineTo(px, height);
          g.stroke();
          g.globalAlpha = 1;
        }
      }
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);

    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(animation);
    };
  }, [engine]);

  return <canvas ref={ref} role="img" aria-label="The notes to sing, and your pitch" className="block h-64 w-full" />;
}
```

- [x] **Step 2: Write the screen**

`app/src/ui/Practice.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import type { AudioEngine } from "../audio/engine";
import { midiToHz } from "../dsp/music";
import { noiseGate } from "../lab/measure";
import { LEVEL_NAMES, makeExercise, type RangeProfile } from "../practice/exercises";
import { MODE_NAMES, initialSkill, recordAttempt, type Skill } from "../practice/ladder";
import { runRepetition, type Repetition } from "../practice/repetition";
import { describeResult } from "../scoring/feedback";
import type { NoteResult } from "../scoring/notes";
import { addAttempt, loadProfile, loadSkill, saveSkill } from "../store/db";
import { AudioGate } from "./AudioGate";
import { fakeMic } from "./engine";
import { PracticeCanvas } from "./PracticeCanvas";
import { buttonClass, headlineClass, quietButtonClass } from "./lab/styles";

/** "?fixed=45" pins every exercise to one note, for the end-to-end test. */
const fixedNote = new URLSearchParams(location.search).get("fixed");
const SESSION_S = 10 * 60;
const MAX_TRIES = 3;
/** The loudness gate never rises above this, so a noisy room reading cannot silence the singer. */
const MAX_GATE = 0.02;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Phase = "ready" | "room" | "listen" | "sing" | "result" | "done";
type Tally = { exercises: number; firstTry: number };

const summarize = (tally: Tally) =>
  `${tally.exercises} ${tally.exercises === 1 ? "exercise" : "exercises"}, ${tally.firstTry} right first time`;

function Drill({
  engine,
  profile,
  startSkill,
  autostart,
}: {
  engine: AudioEngine;
  profile: RangeProfile;
  startSkill: Skill;
  autostart: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [skill, setSkill] = useState(startSkill);
  const [repetition, setRepetition] = useState<Repetition | null>(null);
  const [results, setResults] = useState<NoteResult[] | null>(null);
  const [message, setMessage] = useState("");
  const [tally, setTally] = useState<Tally>({ exercises: 0, firstTry: 0 });
  // Each run gets a number; a run stops as soon as it is no longer the latest.
  const session = useRef(0);

  async function run() {
    const id = ++session.current;
    const alive = () => session.current === id;
    await wait(0);
    if (!alive()) return;

    setTally({ exercises: 0, firstTry: 0 });
    let current = skill;
    let rmsMin = 0;
    if (!fakeMic) {
      setPhase("room");
      const levels: number[] = [];
      const unsubscribe = engine.onFrame((frame) => levels.push(frame.rms));
      await wait(1200);
      unsubscribe();
      if (!alive()) return;
      rmsMin = Math.min(noiseGate(levels), MAX_GATE);
      engine.setRmsGate(rmsMin);
    }
    // Wide enough to recognize a note sung an octave away from the target.
    const band = {
      minHz: Math.max(55, midiToHz(profile.comfortLow - 14)),
      maxHz: Math.min(700, midiToHz(profile.comfortHigh + 14)),
    };
    const startedAt = Date.now();
    let exercise = makeExercise(current.level, profile);
    let tries = 1;

    while (alive()) {
      setResults(null);
      const outcome = await runRepetition(engine, exercise, {
        band,
        rmsMin,
        onScheduled: (scheduled) => {
          setRepetition(scheduled);
          setPhase("listen");
          const untilSinging = (scheduled.singAt - engine.ctx.currentTime) * 1000;
          setTimeout(() => {
            if (alive()) setPhase("sing");
          }, untilSinging);
        },
      });
      if (!alive()) return;

      let text = describeResult(outcome.notes);
      void addAttempt({
        at: new Date().toISOString(),
        level: exercise.level,
        mode: current.mode,
        targets: exercise.notes.map((note) => note.midi),
        results: outcome.notes,
        firstTry: tries === 1,
        success: outcome.success,
      });
      // Only the first try at an exercise counts toward moving up or down.
      if (tries === 1 && outcome.success !== null) {
        const hit = outcome.success;
        const next = recordAttempt(current, hit);
        current = next.skill;
        void saveSkill(current);
        setSkill(current);
        setTally((t) => ({ exercises: t.exercises + 1, firstTry: t.firstTry + (hit ? 1 : 0) }));
        if (next.change === "up") text += " Moving up a step.";
        if (next.change === "down") text += " Stepping back to make it easier.";
      }
      setResults(outcome.notes);
      setMessage(text);
      setPhase("result");
      await wait(outcome.success ? 1500 : 2400);
      if (!alive()) return;
      if ((Date.now() - startedAt) / 1000 >= SESSION_S) break;

      // A missed exercise is repeated, up to three tries, before moving on.
      if (outcome.success === true || tries >= MAX_TRIES) {
        exercise = makeExercise(current.level, profile);
        tries = 1;
      } else {
        tries++;
      }
    }
    if (alive()) setPhase("done");
  }

  function finish() {
    session.current++;
    setPhase("done");
  }

  useEffect(() => {
    if (autostart) void run();
    return () => {
      session.current++;
    };
    // Runs once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = phase === "listen" || phase === "sing" || phase === "result";
  const headlines: Record<Phase, string> = {
    ready: "Ten minutes of pitch matching.",
    room: "Stay quiet for a moment.",
    listen: "Listen",
    sing: "Sing",
    result: message,
    done: "Done for now.",
  };
  const showTrace = skill.mode === "live" || (skill.mode === "after" && phase === "result");

  return (
    <div className="pt-12">
      <p className="text-sm text-mist">
        {LEVEL_NAMES[skill.level]}. {MODE_NAMES[skill.mode]}.
      </p>
      <p aria-live="polite" data-testid="practice-headline" className={`mt-3 min-h-[2.5em] ${headlineClass}`}>
        {headlines[phase]}
      </p>

      {phase === "ready" && (
        <>
          <p className="max-w-prose text-mist">
            You hear a note, then sing it back as the line crosses the second bar. Each one is scored as soon as you
            finish.
          </p>
          <button onClick={run} className={`mt-8 ${buttonClass}`}>
            Start practice
          </button>
        </>
      )}

      {active && (
        <>
          <PracticeCanvas
            engine={engine}
            repetition={repetition}
            showTrace={showTrace}
            results={phase === "result" ? results : null}
          />
          <div className="mt-6 flex items-center justify-between text-sm text-mist">
            <span className="tabular-nums">{summarize(tally)}</span>
            <button onClick={finish} className={quietButtonClass}>
              Finish
            </button>
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <p className="tabular-nums text-mist">{summarize(tally)}.</p>
          <div className="mt-8 flex items-center gap-5">
            <button onClick={run} className={buttonClass}>
              Practice again
            </button>
            <Link to="/" className={quietButtonClass}>
              Back to today
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export function Practice() {
  const autostart = Boolean((useLocation().state as { autostart?: boolean } | null)?.autostart);
  const [loaded, setLoaded] = useState<{ profile: RangeProfile | null; skill: Skill } | null>(null);

  useEffect(() => {
    if (fixedNote) {
      const midi = Number(fixedNote);
      setLoaded({ profile: { speakingMidi: midi, comfortLow: midi, comfortHigh: midi }, skill: initialSkill() });
      return;
    }
    void Promise.all([loadProfile(), loadSkill()]).then(([profile, skill]) => setLoaded({ profile, skill }));
  }, []);

  if (!loaded) return null;
  const { profile, skill } = loaded;
  if (!profile) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Find your range before practicing.</p>
        <p className="mt-3 max-w-lg text-mist">Exercises are fitted to the notes you can sing comfortably.</p>
        <Link to="/range" className={`mt-8 inline-block ${buttonClass}`}>
          Find my range
        </Link>
      </div>
    );
  }
  return (
    <AudioGate prompt="Turn on the microphone to practice.">
      {(engine) => <Drill engine={engine} profile={profile} startSkill={skill} autostart={autostart} />}
    </AudioGate>
  );
}
```

- [x] **Step 3: Type-check**

Run in `app/`: `pnpm typecheck`
Expected: no type errors.

- [x] **Step 4: Commit**

```bash
git add app/src/ui/PracticeCanvas.tsx app/src/ui/Practice.tsx
git commit -m "feat: practice screen with listen-then-sing exercises"
```

---

### Task 10: Home screen, navigation and end-to-end tests

**Files:**
- Create: `app/src/ui/Today.tsx`, `app/src/ui/Shell.tsx`, `app/e2e/practice.spec.ts`
- Modify (replace with the versions below): `app/src/ui/App.tsx`, `app/src/ui/Lab.tsx`, `app/e2e/lab.spec.ts`

**Interfaces:**
- Consumes: every screen; `EngineProvider`, `useEngine`, `EngineStatus`; `AudioGate`; the lab panels; `loadProfile`, `loadSkill`, `attemptsSince`; `daysPracticed`; `BrowserRouter`, `Routes`, `Route`, `NavLink`, `Outlet`, `Link` from `react-router`.
- Produces: routes `/` (Today), `/practice`, `/range`, `/lab`. The status text in the header carries `data-testid="engine-status"` and `data-state`.

- [x] **Step 1: Write the screens and routes**

`app/src/ui/Today.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { midiToName } from "../dsp/music";
import { LEVEL_NAMES, type RangeProfile } from "../practice/exercises";
import { daysPracticed } from "../practice/history";
import { MODE_NAMES, type Skill } from "../practice/ladder";
import { attemptsSince, loadProfile, loadSkill } from "../store/db";
import { useEngine } from "./engine";
import { buttonClass, headlineClass } from "./lab/styles";

type Summary = { profile: RangeProfile | null; skill: Skill; days: number };

export function Today() {
  const { start } = useEngine();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000);
    weekAgo.setHours(0, 0, 0, 0);
    void Promise.all([loadProfile(), loadSkill(), attemptsSince(weekAgo.toISOString())]).then(
      ([profile, skill, attempts]) => setSummary({ profile, skill, days: daysPracticed(attempts.map((a) => a.at)) }),
    );
  }, []);

  if (!summary) return null;
  const { profile, skill, days } = summary;

  if (!profile) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Start by finding your range.</p>
        <p className="mt-3 max-w-lg text-mist">
          Two slides and a few spoken words, about a minute. Every exercise is then fitted to your voice.
        </p>
        <Link to="/range" className={`mt-8 inline-block ${buttonClass}`}>
          Find my range
        </Link>
      </div>
    );
  }

  const facts: [string, string][] = [
    ["Your range", `${midiToName(profile.comfortLow)} to ${midiToName(profile.comfortHigh)}`],
    ["Working on", LEVEL_NAMES[skill.level]],
    ["Feedback", MODE_NAMES[skill.mode]],
    ["Last seven days", `${days} ${days === 1 ? "day" : "days"} practiced`],
  ];

  return (
    <div className="pt-[18vh]">
      <p className={headlineClass}>Ten minutes of pitch matching.</p>
      {/* The click both turns the microphone on and opens the session, so practice starts in one step. */}
      <Link
        to="/practice"
        state={{ autostart: true }}
        onClick={() => void start()}
        className={`mt-8 inline-block ${buttonClass}`}
      >
        Start practice
      </Link>
      <dl className="mt-16 grid max-w-xl grid-cols-[10rem_1fr] gap-y-1.5 border-t border-rule pt-8 text-sm">
        {facts.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-mist">{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

`app/src/ui/Shell.tsx`:

```tsx
import { NavLink, Outlet } from "react-router";
import { useEngine, type EngineStatus } from "./engine";

const STATUS_TEXT: Record<EngineStatus, string> = {
  idle: "",
  starting: "Starting",
  running: "Listening",
  error: "Microphone off",
};

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? "font-medium text-chalk" : "text-mist transition-colors hover:text-chalk";

/** The frame around every screen: navigation on the left, microphone status on the right. */
export function Shell() {
  const { status } = useEngine();
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 pb-24 pt-8 sm:px-10">
      <header className="flex items-baseline justify-between text-sm">
        <nav aria-label="Main" className="flex gap-7">
          <NavLink to="/" end className={linkClass}>
            Today
          </NavLink>
          <NavLink to="/practice" className={linkClass}>
            Practice
          </NavLink>
          <NavLink to="/range" className={linkClass}>
            Range
          </NavLink>
          <NavLink to="/lab" className={linkClass}>
            Audio lab
          </NavLink>
        </nav>
        <span data-testid="engine-status" data-state={status} className="text-mist">
          {STATUS_TEXT[status]}
        </span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

`app/src/ui/App.tsx`:

```tsx
import { BrowserRouter, Route, Routes } from "react-router";
import { isChromium } from "./browser";
import { EngineProvider } from "./engine";
import { Lab } from "./Lab";
import { headlineClass } from "./lab/styles";
import { Practice } from "./Practice";
import { Range } from "./Range";
import { Shell } from "./Shell";
import { Today } from "./Today";

type BrandedNavigator = Navigator & { userAgentData?: { brands: { brand: string }[] } };

export function App() {
  const nav = navigator as BrandedNavigator;
  if (!isChromium(nav.userAgentData?.brands, nav.userAgent)) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 pt-[30vh] sm:px-10">
        <p className={headlineClass}>Open this in Google Chrome.</p>
        <p className="mt-3 max-w-lg text-mist">Safari and Firefox have audio bugs that break pitch scoring.</p>
      </main>
    );
  }
  return (
    <BrowserRouter>
      <EngineProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Today />} />
            <Route path="practice" element={<Practice />} />
            <Route path="range" element={<Range />} />
            <Route path="lab" element={<Lab />} />
          </Route>
        </Routes>
      </EngineProvider>
    </BrowserRouter>
  );
}
```

`app/src/ui/Lab.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { AudioEngine } from "../audio/engine";
import { describePitch } from "../dsp/music";
import { AudioGate } from "./AudioGate";
import { PitchCanvas } from "./PitchCanvas";
import { CalibrationPanel } from "./lab/CalibrationPanel";
import { ChecksPanel } from "./lab/ChecksPanel";
import { ClipPanel } from "./lab/ClipPanel";
import { LeakagePanel } from "./lab/LeakagePanel";
import { StatusPanel } from "./lab/StatusPanel";

/** The current note, large, with the raw numbers beside it and the pitch line beneath. */
function LiveReadout({ engine }: { engine: AudioEngine }) {
  const readoutRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLSpanElement>(null);
  const octaveRef = useRef<HTMLSpanElement>(null);
  const hzRef = useRef<HTMLSpanElement>(null);
  const centsRef = useRef<HTMLSpanElement>(null);
  const clarityRef = useRef<HTMLSpanElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      // Written straight to the DOM so the pitch stream never enters React state.
      engine.onFrame((frame) => {
        const readout = readoutRef.current;
        if (!readout) return;
        const pitch = frame.hz === null ? null : describePitch(frame.hz);
        readout.dataset.voiced = String(pitch !== null);
        // Between notes the last note stays on screen, dimmed, so the display does not jump.
        if (pitch) {
          letterRef.current!.textContent = pitch.name.slice(0, -1);
          octaveRef.current!.textContent = pitch.name.slice(-1);
        }
        hzRef.current!.textContent = pitch ? `${frame.hz!.toFixed(1)} Hz` : "";
        centsRef.current!.textContent = pitch ? `${pitch.cents < 0 ? "−" : "+"}${Math.abs(pitch.cents)} cents` : "";
        clarityRef.current!.textContent = `clarity ${frame.clarity.toFixed(2)}`;
        levelRef.current!.textContent =
          frame.rms > 0 ? `−${Math.abs(Math.round(20 * Math.log10(frame.rms)))} dB` : "silent";
      }),
    [engine],
  );

  return (
    <section aria-label="Live pitch" className="pb-12 pt-12">
      <div
        ref={readoutRef}
        data-voiced="false"
        className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pb-6 transition-colors data-[voiced=false]:text-mist/50"
      >
        <p data-testid="pitch-name" className="text-[9rem] font-medium leading-[0.85] tracking-tight [font-stretch:75%]">
          <span ref={letterRef}>&nbsp;</span>
          <span ref={octaveRef} className="relative top-[0.1em] ml-1 text-[0.36em] tracking-normal text-mist" />
        </p>
        <p className="grid grid-cols-[5.5rem_5.5rem_6.5rem_4.5rem] pb-2 text-right text-sm tabular-nums text-mist">
          <span ref={hzRef} />
          <span ref={centsRef} />
          <span ref={clarityRef} />
          <span ref={levelRef} />
        </p>
      </div>
      <PitchCanvas engine={engine} />
    </section>
  );
}

export function Lab() {
  return (
    <AudioGate
      prompt="Check that the microphone hears you and the pitch line follows your voice."
      requireBuiltIn={false}
    >
      {(engine, info) => (
        <div data-panels>
          <LiveReadout engine={engine} />
          <StatusPanel info={info} />
          <CalibrationPanel engine={engine} info={info} />
          <ClipPanel engine={engine} />
          <LeakagePanel engine={engine} />
          <ChecksPanel />
        </div>
      )}
    </AudioGate>
  );
}
```

- [x] **Step 2: Write the end-to-end tests**

`app/e2e/lab.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("the lab hears a 110 Hz tone as A2", async ({ page }) => {
  await page.goto("/lab?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(page.getByTestId("engine-status")).toHaveAttribute("data-state", "running", { timeout: 15_000 });
  await expect(page.getByTestId("pitch-name")).toHaveText("A2", { timeout: 15_000 });
});
```

`app/e2e/practice.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("a new learner is sent to find their range", async ({ page }) => {
  await page.goto("/?mic=fake");
  await expect(page.getByText("Start by finding your range.")).toBeVisible();
  await page.getByRole("link", { name: "Find my range" }).click();
  await expect(page).toHaveURL(/\/range/);
});

test("an exercise on A2 is scored as in tune when the microphone hears A2", async ({ page }) => {
  // The fake microphone plays a steady 110 Hz, which is the note asked for.
  await page.goto("/practice?mic=fake&fixed=45");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  const headline = page.getByTestId("practice-headline");
  await expect(headline).toHaveText("Listen", { timeout: 10_000 });
  await expect(headline).toHaveText("Sing", { timeout: 10_000 });
  await expect(headline).toHaveText(/Right on it\.|In tune/, { timeout: 15_000 });
  await expect(page.getByText("1 exercise, 1 right first time")).toBeVisible();
});
```

- [x] **Step 3: Run everything**

Run in `app/`: `pnpm test && pnpm build && pnpm e2e`
Expected: all unit tests pass, the build succeeds, and `3 passed` for the end-to-end tests.

- [x] **Step 4: Commit**

```bash
git add app
git commit -m "feat: home screen, navigation and end-to-end practice test"
```

---

### Task 11: Try it with a real voice

Needs the learner at the machine. Run in `app/`: `pnpm dev`, then open `http://localhost:4747` in Chrome.

- [ ] **Step 1: Find the range.** Follow the three steps. Check that the three notes shown look plausible for a deep voice (speaking somewhere around G2–C3) and that "Save range" returns to the home screen with the range listed.
- [ ] **Step 2: Practice.** Click "Start practice" and do ten exercises. Check that the guide note is clearly audible and in a comfortable octave, that "Listen" and "Sing" change at the right moments, that the brass line appears while singing, and that the sentence after each exercise matches what happened (try singing deliberately low once, and an octave low once).
- [ ] **Step 3: Note anything off** (guide too quiet, too little time to sing, wrong verdicts) so the constants in `playback/guide.ts` and `practice/repetition.ts` can be tuned.

