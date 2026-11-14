import { describe, expect, it } from "vitest";
import { burstTrack, energyCenters } from "./stretchCheck";

describe("burst track", () => {
  const track = burstTrack(48000, 3, 0.5);

  it("is silent between bursts", () => {
    expect(track[Math.round(0.25 * 48000)]).toBe(0);
    expect(track[Math.round(0.75 * 48000)]).toBe(0);
  });

  it("puts a burst at every interval", () => {
    const centers = energyCenters(track, 48000, [0.51, 1.01, 1.51, 2.01, 2.51]);
    centers.forEach((center, i) => expect(center).toBeCloseTo(0.51 + i * 0.5, 2));
  });

  it("reports nothing heard where there is silence", () => {
    expect(energyCenters(new Float32Array(48000), 48000, [0.5])[0]).toBeNaN();
  });
});
