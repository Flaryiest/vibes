import { describe, expect, it } from "vitest";
import { pickLatency, type CalibrationRun } from "./latency";

const run = (at: string, output: string, roundTripMs: number | null, accepted = true): CalibrationRun => ({
  at,
  route: `${output} | MacBook Pro Microphone (Built-in)`,
  roundTripMs,
  accepted,
});

describe("pickLatency", () => {
  const runs = [
    run("2026-11-14T10:00:00Z", "AirPods Pro", 180),
    run("2026-11-14T11:00:00Z", "AirPods Pro", 172),
    run("2026-11-14T12:00:00Z", "AirPods Pro", 400, false),
    run("2026-11-14T09:00:00Z", "MacBook Pro Speakers (Built-in)", 31),
  ];

  it("uses the latest accepted run for the route", () => {
    expect(pickLatency(runs, "headphones")).toBeCloseTo(0.172, 9);
    expect(pickLatency(runs, "speakers")).toBeCloseTo(0.031, 9);
  });

  it("is null without an accepted run", () => {
    expect(pickLatency([run("2026-11-14T12:00:00Z", "AirPods Pro", null, false)], "headphones")).toBeNull();
    expect(pickLatency([], "speakers")).toBeNull();
  });
});
