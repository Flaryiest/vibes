import { describe, expect, it } from "vitest";
import { CHIRP_OFFSETS_S, summarize, type ChirpResult } from "./calibration";

const heard = (delays: number[]): ChirpResult[] => delays.map((delayMs) => ({ delayMs, score: 0.9 }));

describe("summarize", () => {
  it("accepts a tight set of delays", () => {
    const result = summarize(heard([150.1, 150.3, 149.9, 150.0, 150.2, 150.1, 149.8, 150.4]));
    expect(result.accepted).toBe(true);
    expect(result.roundTripMs).toBeCloseTo(150.1, 6);
    expect(result.spreadMs).toBeCloseTo(0.4, 6);
  });

  it("tolerates one outlier", () => {
    const result = summarize(heard([150.1, 150.3, 149.9, 150.0, 150.2, 150.1, 149.8, 190]));
    expect(result.accepted).toBe(true);
    expect(result.roundTripMs).toBeCloseTo(150.1, 6);
  });

  it("rejects a scattered set", () => {
    const result = summarize(heard([150, 150, 150, 150, 150, 150, 170, 190]));
    expect(result.accepted).toBe(false);
    expect(result.spreadMs).toBeCloseTo(20, 6);
  });

  it("rejects when fewer than six chirps were heard", () => {
    const chirps = [...heard([150, 150, 150, 150]), ...[1, 2, 3, 4].map((delayMs) => ({ delayMs, score: 0.1 }))];
    expect(summarize(chirps)).toMatchObject({ accepted: false, roundTripMs: null, spreadMs: null });
  });
});

describe("CHIRP_OFFSETS_S", () => {
  it("spaces chirps further apart than the longest delay searched", () => {
    for (let i = 1; i < CHIRP_OFFSETS_S.length; i++) {
      expect(CHIRP_OFFSETS_S[i] - CHIRP_OFFSETS_S[i - 1]).toBeGreaterThan(0.65);
    }
  });
});
