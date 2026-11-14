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
