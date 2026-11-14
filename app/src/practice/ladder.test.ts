import { describe, expect, it } from "vitest";
import { initialSkill, recordAttempt, type Skill } from "./ladder";

/** Applies a run of attempts and returns the final skill and every change along the way. */
function play(start: Skill, attempts: boolean[]) {
  let skill = start;
  const changes: ("up" | "down")[] = [];
  for (const success of attempts) {
    const outcome = recordAttempt(skill, success);
    skill = outcome.skill;
    if (outcome.change) changes.push(outcome.change);
  }
  return { skill, changes };
}

const hits = (n: number) => Array<boolean>(n).fill(true);
const misses = (n: number) => Array<boolean>(n).fill(false);

describe("recordAttempt", () => {
  it("starts on level 1 with the pitch line shown", () => {
    expect(initialSkill()).toEqual({ level: 1, mode: "live", recent: [] });
  });

  it("does not judge before ten attempts", () => {
    const { skill, changes } = play(initialSkill(), hits(9));
    expect(changes).toEqual([]);
    expect(skill.recent.length).toBe(9);
  });

  it("steps through the display modes, then to the next level", () => {
    const first = play(initialSkill(), hits(10));
    expect(first.skill).toEqual({ level: 1, mode: "after", recent: [] });
    expect(first.changes).toEqual(["up"]);
    expect(play(first.skill, hits(10)).skill).toMatchObject({ level: 1, mode: "blind" });
    expect(play(initialSkill(), hits(30)).skill).toMatchObject({ level: 2, mode: "live" });
  });

  it("steps down below 70 percent", () => {
    const start: Skill = { level: 2, mode: "live", recent: [] };
    const { skill, changes } = play(start, [...hits(6), ...misses(4)]);
    expect(changes).toEqual(["down"]);
    expect(skill).toEqual({ level: 1, mode: "blind", recent: [] });
  });

  it("holds between 70 and 90 percent", () => {
    const { skill, changes } = play(initialSkill(), [...hits(8), ...misses(2)]);
    expect(changes).toEqual([]);
    expect(skill.level).toBe(1);
  });

  it("stays at the bottom and at the top", () => {
    expect(play(initialSkill(), misses(15)).skill).toMatchObject({ level: 1, mode: "live" });
    const top: Skill = { level: 4, mode: "blind", recent: [] };
    expect(play(top, hits(15)).skill).toMatchObject({ level: 4, mode: "blind" });
  });

  it("looks at the last twenty attempts only", () => {
    const { skill } = play(initialSkill(), [...misses(2), ...hits(7), ...misses(1), ...hits(15)]);
    expect(skill.recent.length).toBeLessThanOrEqual(20);
  });
});
