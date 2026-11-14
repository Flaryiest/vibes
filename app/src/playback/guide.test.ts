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
