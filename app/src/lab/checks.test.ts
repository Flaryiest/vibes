import { describe, expect, it } from "vitest";
import { CHECKS, allDecided, exportResults, upsert, type CheckResult } from "./checks";

const result = (id: CheckResult["id"], decision = "keep as designed"): CheckResult => ({
  id,
  status: "pass",
  value: "measured",
  decision,
  at: "2026-11-14T10:00:00.000Z",
});

describe("checks", () => {
  it("defines the six checks this plan covers", () => {
    expect(CHECKS.map((check) => check.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("replaces an earlier result for the same check and keeps them in order", () => {
    const results = upsert(upsert(upsert([], result(3)), result(1)), { ...result(3), value: "second run" });
    expect(results.map((r) => r.id)).toEqual([1, 3]);
    expect(results[1].value).toBe("second run");
  });

  it("is decided only when every check has a decision", () => {
    const all = CHECKS.reduce<CheckResult[]>((acc, check) => upsert(acc, result(check.id)), []);
    expect(allDecided(all)).toBe(true);
    expect(allDecided(all.slice(1))).toBe(false);
    expect(allDecided(upsert(all, result(2, "  ")))).toBe(false);
  });

  it("exports every check with its result, or null when not yet run", () => {
    const exported = JSON.parse(exportResults([result(1)], "MacBook Pro M4"));
    expect(exported.machine).toBe("MacBook Pro M4");
    expect(exported.checks.length).toBe(6);
    expect(exported.checks[0].result.value).toBe("measured");
    expect(exported.checks[1].result).toBeNull();
  });
});
