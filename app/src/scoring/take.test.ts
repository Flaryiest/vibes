import { describe, expect, it } from "vitest";
import { harmonicTone } from "../dsp/synth";
import { trackPitch } from "../pitch/track";
import { scoreNotes, type NoteResult, type Outcome } from "./notes";
import { describeTake, heardEnough, summarizeTake, type TakeMetrics } from "./take";

type Target = { id: number; midi: number; d: number };

const target = (id: number, midi = 45, d = 0.4): Target => ({ id, midi, d });

function outcomeOf(cents: number): Outcome {
  const size = Math.abs(cents);
  if (size <= 50) return "hit";
  if (size <= 100) return "close";
  return Math.abs(size - 1200) <= 50 ? "octave" : "miss";
}

/** A scored note that was `cents` off. */
const sung = (id: number, cents: number, extra: Partial<NoteResult> = {}): NoteResult => ({
  id,
  outcome: outcomeOf(cents),
  cents,
  spreadCents: 5,
  voicedFraction: 1,
  endDriftCents: null,
  onsetMs: null,
  ...extra,
});

const unheard = (id: number, extra: Partial<NoteResult> = {}): NoteResult => ({
  id,
  outcome: "unscored",
  cents: null,
  spreadCents: null,
  voicedFraction: 0,
  endDriftCents: null,
  onsetMs: null,
  ...extra,
});

describe("summarizeTake", () => {
  it("counts the notes that were scored and how many of them were in tune", () => {
    const metrics = summarizeTake(
      [sung(0, 10), sung(1, -40), sung(2, 70), sung(3, -300), unheard(4)],
      [0, 1, 2, 3, 4].map((id) => target(id)),
    );
    expect(metrics.totalNotes).toBe(5);
    expect(metrics.scoredNotes).toBe(4);
    expect(metrics.pctInTune).toBe(50);
  });

  it("averages the size of the error, and the error with its sign", () => {
    const metrics = summarizeTake([sung(0, 10), sung(1, -40), sung(2, -30)], [0, 1, 2].map((id) => target(id)));
    expect(metrics.meanAbsCents).toBeCloseTo(80 / 3, 6);
    expect(metrics.biasCents).toBeCloseTo(-20, 6);
  });

  it("compares each sung jump with the written one", () => {
    // Written: up 4, down 2. Sung: 30 cents narrow going up, 50 cents wide coming down.
    const metrics = summarizeTake(
      [sung(0, 10), sung(1, -20), sung(2, -70)],
      [target(0, 45), target(1, 49), target(2, 47)],
    );
    expect(metrics.intervalErrorCents).toBeCloseTo(40, 6);
  });

  it("measures no jump across a note that was not scored", () => {
    const metrics = summarizeTake(
      [sung(0, 0), unheard(1), sung(2, 40), sung(3, 30)],
      [0, 1, 2, 3].map((id) => target(id)),
    );
    expect(metrics.intervalErrorCents).toBeCloseTo(10, 6);
  });

  it("has no jump error when no two neighbouring notes were scored", () => {
    const metrics = summarizeTake([sung(0, 0), unheard(1), sung(2, 40)], [0, 1, 2].map((id) => target(id)));
    expect(metrics.intervalErrorCents).toBeNull();
  });

  it("judges steadiness and endings on notes of 0.6 seconds or longer only", () => {
    const metrics = summarizeTake(
      [
        sung(0, 0, { spreadCents: 40 }),
        sung(1, 0, { spreadCents: 10, endDriftCents: -50 }),
        sung(2, 0, { spreadCents: 20, endDriftCents: 10 }),
      ],
      [target(0, 45, 0.4), target(1, 45, 0.6), target(2, 45, 1.2)],
    );
    expect(metrics.steadinessCents).toBeCloseTo(15, 6);
    expect(metrics.endDriftCents).toBeCloseTo(-20, 6);
  });

  it("has no steadiness or ending when no long note was scored", () => {
    const metrics = summarizeTake([sung(0, 0), unheard(1)], [target(0, 45, 0.4), target(1, 45, 1.2)]);
    expect(metrics.steadinessCents).toBeNull();
    expect(metrics.endDriftCents).toBeNull();
  });

  it("counts the starts that were within 80 ms, out of those that were heard", () => {
    const metrics = summarizeTake(
      [
        sung(0, 0, { onsetMs: 20 }),
        sung(1, 0, { onsetMs: -80 }),
        sung(2, 0, { onsetMs: 140 }),
        sung(3, 0, { onsetMs: null }),
        unheard(4, { onsetMs: -100 }),
      ],
      [0, 1, 2, 3, 4].map((id) => target(id)),
    );
    expect(metrics.onTimePct).toBe(50);
  });

  it("has no timing when no start was heard", () => {
    expect(summarizeTake([sung(0, 0)], [target(0)]).onTimePct).toBeNull();
  });

  it("reads results written before drift and starts were measured", () => {
    const old: NoteResult = { id: 0, outcome: "hit", cents: 5, spreadCents: 8, voicedFraction: 1 };
    const metrics = summarizeTake([old], [target(0, 45, 1)]);
    expect(metrics).toMatchObject({ pctInTune: 100, steadinessCents: 8, endDriftCents: null, onTimePct: null });
  });

  it("has only counts when nothing was scored", () => {
    expect(summarizeTake([unheard(0), unheard(1)], [target(0), target(1)])).toEqual({
      scoredNotes: 0,
      totalNotes: 2,
      pctInTune: null,
      meanAbsCents: null,
      biasCents: null,
      intervalErrorCents: null,
      steadinessCents: null,
      endDriftCents: null,
      onTimePct: null,
    });
  });

  it("counts every target when there are no results at all", () => {
    expect(summarizeTake([], [target(0), target(1), target(2)])).toMatchObject({
      scoredNotes: 0,
      totalNotes: 3,
      pctInTune: null,
    });
  });

  it("summarizes a sung line from audio", () => {
    // Three notes with a breath before each: A2 on time, C♯3 started 120 ms late, A2 sagging at the end.
    const rate = 48000;
    const pcm = new Float32Array(rate * 5);
    const put = (hz: number, fromS: number, seconds: number) =>
      pcm.set(harmonicTone({ hz, seconds, sampleRate: rate }), Math.round(fromS * rate));
    put(110, 0.5, 0.8);
    put(138.591, 1.62, 0.68);
    put(110, 2.5, 0.65);
    put(110 * 2 ** (-60 / 1200), 3.15, 0.35);
    const track = trackPitch(pcm, rate, { minHz: 70, maxHz: 400 });
    const targets = [
      { id: 0, t: 0.5, d: 0.8, midi: 45 },
      { id: 1, t: 1.5, d: 0.8, midi: 49 },
      { id: 2, t: 2.5, d: 1, midi: 45 },
    ];
    const results = scoreNotes(track, targets);
    const metrics = summarizeTake(results, targets);

    expect(metrics.pctInTune).toBe(100);
    expect(metrics.scoredNotes).toBe(3);
    expect(metrics.meanAbsCents!).toBeLessThan(5);
    expect(metrics.intervalErrorCents!).toBeLessThan(5);
    expect(metrics.steadinessCents!).toBeLessThan(30);
    // The analysis window blurs each start by a few hundredths of a second.
    expect(Math.abs(results[0].onsetMs!)).toBeLessThan(40);
    expect(results[1].onsetMs!).toBeGreaterThan(80);
    expect(results[1].onsetMs!).toBeLessThan(130);
    expect(metrics.onTimePct).toBeCloseTo(200 / 3, 6);
    expect(results[2].endDriftCents!).toBeLessThan(-40);
    expect(results[0].endDriftCents!).toBeCloseTo(0, 0);
  });
});

/** A take that meets every target, with `changes` applied. */
const take = (changes: Partial<TakeMetrics> = {}): TakeMetrics => ({
  scoredNotes: 40,
  totalNotes: 40,
  pctInTune: 95,
  meanAbsCents: 18,
  biasCents: -4,
  intervalErrorCents: 15,
  steadinessCents: 12,
  endDriftCents: -8,
  onTimePct: 90,
  ...changes,
});

/** The sentences of a description. */
const sentences = (text: string): string[] => text.match(/[^.]+\./g)!.map((s) => s.trim());

describe("describeTake", () => {
  it("says so plainly when every target is met", () => {
    expect(describeTake(take())).toBe("This take meets every target.");
  });

  it("does not claim targets that could not be measured", () => {
    expect(describeTake(take({ steadinessCents: null, endDriftCents: null, onTimePct: null }))).toBe(
      "This take meets every target that could be measured.",
    );
  });

  it("says only that too little was heard when under 60% of notes were scored", () => {
    expect(describeTake(take({ scoredNotes: 23, biasCents: -45 }))).toBe("Too little of this was heard to judge.");
    expect(describeTake(take({ scoredNotes: 24, biasCents: -45 }))).not.toBe("Too little of this was heard to judge.");
    expect(describeTake(summarizeTake([], []))).toBe("Too little of this was heard to judge.");
  });

  it("shares that rule, so a screen can treat such a take the same way", () => {
    expect(heardEnough({ scoredNotes: 24, totalNotes: 40 })).toBe(true);
    expect(heardEnough({ scoredNotes: 23, totalNotes: 40 })).toBe(false);
    expect(heardEnough({ scoredNotes: 3, totalNotes: 5 })).toBe(true);
    expect(heardEnough({ scoredNotes: 0, totalNotes: 0 })).toBe(false);
  });

  it("gives two sentences: what went best, then one correction", () => {
    const text = describeTake(take({ biasCents: -31, meanAbsCents: 33, pctInTune: 88, endDriftCents: -40 }));
    expect(sentences(text)).toHaveLength(2);
    expect(sentences(text)[1]).toBe("Most of this sat about 30 cents flat.");
  });

  it("names a lean beyond 20 cents, flat or sharp", () => {
    expect(describeTake(take({ biasCents: 24 }))).toContain("Most of this sat about 25 cents sharp.");
    expect(describeTake(take({ biasCents: -21 }))).toContain("Most of this sat about 20 cents flat.");
    expect(describeTake(take({ biasCents: -20 }))).toBe("This take meets every target.");
  });

  it("names a whole take sung in the wrong octave", () => {
    const low = describeTake(take({ pctInTune: 0, meanAbsCents: 1195, biasCents: -1195 }));
    expect(low).toContain("Right notes, one octave too low.");
    expect(low).not.toContain("cents");
    expect(describeTake(take({ pctInTune: 0, meanAbsCents: 1210, biasCents: 1210 }))).toContain(
      "Right notes, one octave too high.",
    );
  });

  it("says only that the octave was wrong when nothing else went well either", () => {
    const text = describeTake(
      take({
        pctInTune: 0,
        meanAbsCents: 1200,
        biasCents: -1200,
        intervalErrorCents: 60,
        steadinessCents: 40,
        endDriftCents: -45,
        onTimePct: 30,
      }),
    );
    expect(text).toBe("Right notes, one octave too low.");
  });

  it("gives a large lean in semitones", () => {
    expect(describeTake(take({ pctInTune: 0, meanAbsCents: 290, biasCents: -290 }))).toContain(
      "Most of this sat about 3 semitones too low.",
    );
  });

  it("names the jumps when the interval error is above 30", () => {
    expect(sentences(describeTake(take({ intervalErrorCents: 34 })))[1]).toBe(
      "The jumps between notes are the thing to work on.",
    );
  });

  it("names sagging endings when the mean end drift is below -30", () => {
    expect(sentences(describeTake(take({ endDriftCents: -34 })))[1]).toBe("Long notes sag at the end.");
    expect(describeTake(take({ endDriftCents: 45 }))).toBe("This take meets every target.");
  });

  it("names wavering long notes when the spread is above 25", () => {
    expect(sentences(describeTake(take({ steadinessCents: 31 })))[1]).toBe("Long notes waver: hold them steady.");
  });

  it("names the entries when under 80% of starts are on time", () => {
    expect(sentences(describeTake(take({ onTimePct: 62 })))[1]).toBe("You are coming in off the beat on many lines.");
  });

  it("names accuracy when too few notes are in tune", () => {
    expect(sentences(describeTake(take({ pctInTune: 74, meanAbsCents: 41 })))[1]).toBe(
      "Landing each note is the thing to work on.",
    );
    expect(sentences(describeTake(take({ meanAbsCents: 36 })))[1]).toBe(
      "The notes are in tune but only just: aim for the middle of each one.",
    );
  });

  it("puts pitch before endings, steadiness and timing", () => {
    const everything = take({
      pctInTune: 60,
      meanAbsCents: 60,
      biasCents: -35,
      intervalErrorCents: 50,
      steadinessCents: 40,
      endDriftCents: -50,
      onTimePct: 50,
    });
    const second = (changes: Partial<TakeMetrics>) => sentences(describeTake({ ...everything, ...changes }))[1];
    expect(second({})).toBe("Most of this sat about 35 cents flat.");
    expect(second({ biasCents: 0 })).toBe("The jumps between notes are the thing to work on.");
    expect(second({ biasCents: 0, intervalErrorCents: 10 })).toBe("Landing each note is the thing to work on.");
    expect(second({ biasCents: 0, intervalErrorCents: 10, pctInTune: 95, meanAbsCents: 20 })).toBe(
      "Long notes sag at the end.",
    );
    expect(
      second({ biasCents: 0, intervalErrorCents: 10, pctInTune: 95, meanAbsCents: 20, endDriftCents: 0 }),
    ).toBe("Long notes waver: hold them steady.");
  });

  it("leads with whichever target was met by the widest margin", () => {
    const flat = { biasCents: -40 };
    expect(sentences(describeTake(take({ ...flat, pctInTune: 100 })))[0]).toBe("Every note was in tune.");
    expect(sentences(describeTake(take({ ...flat, pctInTune: 91, intervalErrorCents: 3 })))[0]).toBe(
      "The jumps between notes were accurate.",
    );
    expect(sentences(describeTake(take({ ...flat, pctInTune: 91, onTimePct: 100 })))[0]).toBe("You came in on time.");
    expect(sentences(describeTake(take({ ...flat, pctInTune: 91, steadinessCents: 2 })))[0]).toBe(
      "Long notes were steady.",
    );
    expect(
      sentences(describeTake(take({ ...flat, pctInTune: 91, intervalErrorCents: 29, steadinessCents: 24, onTimePct: 81, endDriftCents: 0 })))[0],
    ).toBe("Long notes held to the end.");
    expect(sentences(describeTake(take({ ...flat, pctInTune: 96, endDriftCents: -20 })))[0]).toBe(
      "Nearly every note was in tune.",
    );
  });

  it("leads with the share in tune when no target was met", () => {
    const text = describeTake(
      take({
        pctInTune: 41.4,
        meanAbsCents: 90,
        biasCents: -70,
        intervalErrorCents: 60,
        steadinessCents: 40,
        endDriftCents: -45,
        onTimePct: 30,
      }),
    );
    expect(text).toBe("41% of notes were in tune. Most of this sat about 70 cents flat.");
  });
});
