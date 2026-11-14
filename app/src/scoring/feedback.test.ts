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
