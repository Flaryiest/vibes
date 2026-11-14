import { describe, expect, it } from "vitest";
import { isChromium } from "./browser";

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

describe("isChromium", () => {
  it("accepts Chrome by its brand list", () => {
    const brands = [{ brand: "Not)A;Brand" }, { brand: "Chromium" }, { brand: "Google Chrome" }];
    expect(isChromium(brands, "")).toBe(true);
  });

  it("rejects Safari, which has no brand list", () => {
    expect(isChromium(undefined, SAFARI)).toBe(false);
  });

  it("rejects Firefox", () => {
    expect(isChromium(undefined, FIREFOX)).toBe(false);
  });

  it("falls back to the user agent when brands are missing", () => {
    expect(isChromium(undefined, CHROME)).toBe(true);
  });
});
