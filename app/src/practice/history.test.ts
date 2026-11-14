import { describe, expect, it } from "vitest";
import { daysPracticed } from "./history";

describe("daysPracticed", () => {
  it("counts distinct calendar days", () => {
    const monday = new Date(2026, 10, 9, 18, 0).toISOString();
    const mondayLater = new Date(2026, 10, 9, 21, 30).toISOString();
    const wednesday = new Date(2026, 10, 11, 7, 15).toISOString();
    expect(daysPracticed([monday, mondayLater, wednesday])).toBe(2);
  });

  it("is zero with no practice", () => {
    expect(daysPracticed([])).toBe(0);
  });
});
