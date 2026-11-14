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

describe("scoreNotes: how a long note ends", () => {
  it("reports no drift for a long note held steady", () => {
    expect(single(A2).endDriftCents).toBeCloseTo(0, 3);
  });

  it("reports a negative drift when the end of a long note sags", () => {
    // The steady portion of this note runs from 0.725 s to 1.85 s; its last 30% starts at 1.5125 s.
    const sagging = track([
      [0.5, 0],
      [1, A2],
      [0.5, shifted(A2, -40)],
    ]);
    const result = scoreNotes(sagging, [note(0.5, 1.5, 45)])[0];
    expect(result.endDriftCents).toBeCloseTo(-40, 2);
    expect(result.cents).toBeCloseTo(0, 2);
  });

  it("reports a positive drift when the end rises", () => {
    const rising = track([
      [0.5, 0],
      [1, A2],
      [0.5, shifted(A2, 25)],
    ]);
    expect(scoreNotes(rising, [note(0.5, 1.5, 45)])[0].endDriftCents).toBeCloseTo(25, 2);
  });

  it("measures drift from 0.6 seconds up, and not below", () => {
    const sung = track([
      [0.5, 0],
      [2, A2],
    ]);
    expect(scoreNotes(sung, [note(0.5, 0.6, 45)])[0].endDriftCents).toBeCloseTo(0, 3);
    expect(scoreNotes(sung, [note(0.5, 0.5, 45)])[0].endDriftCents).toBeNull();
  });

  it("follows the offset", () => {
    const late = track([
      [0.7, 0],
      [1, A2],
      [0.5, shifted(A2, -40)],
    ]);
    expect(scoreNotes(late, [note(0.5, 1.5, 45)], 0.2)[0].endDriftCents).toBeCloseTo(-40, 2);
  });

  it("has no drift for a note that was not scored", () => {
    const result = scoreNotes(track([[1, A2]]), [note(5, 1, 45)])[0];
    expect(result.endDriftCents).toBeNull();
  });
});

describe("scoreNotes: when a note starts", () => {
  /** The onset of a 1-second A2 target at 0.5 s, when the singer starts at `startS`. */
  const onset = (startS: number, offsetS = 0): number | null | undefined =>
    scoreNotes(
      track([
        [startS, 0],
        [1.5, A2],
      ]),
      [note(0.5, 1, 45)],
      offsetS,
    )[0].onsetMs;

  it("is about zero for a note started on time", () => {
    expect(Math.abs(onset(0.5)!)).toBeLessThan(11);
  });

  it("is positive for a late start and negative for an early one", () => {
    expect(onset(0.6)!).toBeGreaterThan(89);
    expect(onset(0.6)!).toBeLessThan(111);
    expect(onset(0.4)!).toBeGreaterThan(-111);
    expect(onset(0.4)!).toBeLessThan(-89);
  });

  it("looks up to 250 ms after the target start", () => {
    expect(onset(0.7)!).toBeGreaterThan(189);
    expect(onset(0.8)).toBeNull();
  });

  it("looks no further than 120 ms before the target start", () => {
    expect(onset(0.3)).toBeNull();
  });

  it("is measured from the shifted target", () => {
    expect(Math.abs(onset(0.7, 0.2)!)).toBeLessThan(11);
  });

  it("ignores a sound shorter than 60 ms", () => {
    const blip = track([
      [0.45, 0],
      [0.03, A2],
      [0.12, 0],
      [1.5, A2],
    ]);
    const result = scoreNotes(blip, [note(0.5, 1, 45)])[0];
    expect(result.onsetMs!).toBeGreaterThan(89);
    expect(result.onsetMs!).toBeLessThan(111);
  });

  it("finds no start when the voice carries over from the note before", () => {
    const legato = track([
      [0.5, 0],
      [1, A2],
      [1, CSHARP3],
    ]);
    const results = scoreNotes(legato, [note(0.5, 1, 45, 0), note(1.5, 1, 49, 1)]);
    expect(Math.abs(results[0].onsetMs!)).toBeLessThan(11);
    expect(results[1].onsetMs).toBeNull();
  });

  it("finds no start when the recording begins with the voice already sounding", () => {
    expect(scoreNotes(track([[2, A2]]), [note(0.05, 1, 45)])[0].onsetMs).toBeNull();
  });

  it("reports the start of a note too short-lived to score", () => {
    const cutOff = track([
      [0.5, 0],
      [0.2, A2],
      [1.3, 0],
    ]);
    const result = scoreNotes(cutOff, [note(0.5, 1.5, 45)])[0];
    expect(result.outcome).toBe("unscored");
    expect(Math.abs(result.onsetMs!)).toBeLessThan(11);
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
