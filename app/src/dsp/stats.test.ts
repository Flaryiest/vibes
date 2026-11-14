import { describe, expect, it } from "vitest";
import { median, percentile } from "./stats";

describe("stats", () => {
  it("takes the median of odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns NaN for an empty list", () => {
    expect(median([])).toBeNaN();
    expect(percentile([], 0.5)).toBeNaN();
  });

  it("interpolates percentiles", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 0.1)).toBeCloseTo(14, 6);
  });

  it("does not reorder its input", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});
