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
