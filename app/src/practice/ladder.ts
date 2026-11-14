import type { Level } from "./exercises";

/** Whether the learner sees their pitch while singing, only afterwards, or not at all. */
export type DisplayMode = "live" | "after" | "blind";

export const MODE_NAMES: Record<DisplayMode, string> = {
  live: "Pitch line shown while you sing",
  after: "Pitch line shown after you sing",
  blind: "No pitch line",
};

/** `recent` holds first-try results, newest last. */
export type Skill = { level: Level; mode: DisplayMode; recent: boolean[] };

const MODES: DisplayMode[] = ["live", "after", "blind"];
const WINDOW = 20;
const MIN_ATTEMPTS = 10;
const TOP = 11;

export const initialSkill = (): Skill => ({ level: 1, mode: "live", recent: [] });

/** Position on the ladder: 0 is level 1 with the line shown, 11 is level 4 with no line. */
const rung = (skill: Skill) => (skill.level - 1) * 3 + MODES.indexOf(skill.mode);

const atRung = (n: number): Skill => ({ level: (Math.floor(n / 3) + 1) as Level, mode: MODES[n % 3], recent: [] });

/**
 * Records one first-try result. Once at least ten are in, 90% success moves up
 * one rung and under 70% moves down one. Each level is practiced with the
 * pitch line shown, then shown afterwards, then hidden, before the next level.
 */
export function recordAttempt(skill: Skill, success: boolean): { skill: Skill; change: "up" | "down" | null } {
  const recent = [...skill.recent, success].slice(-WINDOW);
  if (recent.length >= MIN_ATTEMPTS) {
    const rate = recent.filter(Boolean).length / recent.length;
    const position = rung(skill);
    if (rate >= 0.9 && position < TOP) return { skill: atRung(position + 1), change: "up" };
    if (rate < 0.7 && position > 0) return { skill: atRung(position - 1), change: "down" };
  }
  return { skill: { ...skill, recent }, change: null };
}
