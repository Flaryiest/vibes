import { describe, expect, it } from "vitest";
import { planSession, type PlanInput } from "./planner";

const base: PlanInput = { minutes: 30, pitchCheckPct: null, hasSong: true, canRunThrough: true, lastThroat: "fine" };
const kinds = (input: Partial<PlanInput>) => planSession({ ...base, ...input }).blocks.map((b) => b.kind);
const minutesOf = (input: Partial<PlanInput>, kind: string) =>
  planSession({ ...base, ...input }).blocks.find((b) => b.kind === kind)?.minutes;
const total = (input: Partial<PlanInput>) => planSession({ ...base, ...input }).blocks.reduce((sum, b) => sum + b.minutes, 0);

describe("planSession", () => {
  it("plans a full half hour in the spec's order", () => {
    expect(kinds({})).toEqual(["warmup", "foundation", "rest", "song", "runthrough", "checkin"]);
    expect(total({})).toBe(30);
  });

  it("shrinks pitch matching as the pitch check improves, giving the time to the song", () => {
    expect(minutesOf({ pitchCheckPct: 70 }, "foundation")).toBe(8);
    expect(minutesOf({ pitchCheckPct: 85 }, "foundation")).toBe(4);
    expect(minutesOf({ pitchCheckPct: 93 }, "foundation")).toBe(2);
    expect(minutesOf({ pitchCheckPct: 93 }, "song")).toBe(minutesOf({ pitchCheckPct: 70 }, "song")! + 6);
  });

  it("leaves out the run-through when it cannot be scored", () => {
    expect(kinds({ canRunThrough: false })).not.toContain("runthrough");
    expect(total({ canRunThrough: false })).toBe(30);
  });

  it("is all pitch matching when no song is set up", () => {
    expect(kinds({ hasSong: false })).toEqual(["warmup", "foundation", "checkin"]);
    expect(total({ hasSong: false })).toBe(30);
  });

  it("makes longer sessions longer on the song", () => {
    expect(total({ minutes: 45 })).toBe(45);
    expect(minutesOf({ minutes: 45 }, "song")).toBe(minutesOf({}, "song")! + 15);
  });

  it("keeps a five-minute session to a warm-up and one thing", () => {
    expect(kinds({ minutes: 5 })).toEqual(["warmup", "song"]);
    expect(kinds({ minutes: 5, hasSong: false })).toEqual(["warmup", "foundation"]);
    expect(total({ minutes: 5 })).toBe(5);
  });

  it("is humming only after a hoarse throat, and says why", () => {
    const plan = planSession({ ...base, lastThroat: "hoarse" });
    expect(plan.blocks.map((b) => b.kind)).toEqual(["warmup", "checkin"]);
    expect(plan.note).toMatch(/hoarse/);
  });
});
