import { describe, expect, it } from "vitest";
import type { NoteResult, Outcome } from "../scoring/notes";
import { advance, isCleanRep, markSticky, newProgress, stateOf, type PhraseProgress } from "./phraseLadder";

const results = (...outcomes: Outcome[]): NoteResult[] =>
  outcomes.map((outcome, id) => ({
    id,
    outcome,
    cents: outcome === "unscored" ? null : 0,
    spreadCents: outcome === "unscored" ? null : 5,
    voicedFraction: outcome === "unscored" ? 0 : 1,
  }));

const HALF = (n: number) => Array<number>(n).fill(0.5);
type Rep = { clean: boolean | null; results: NoteResult[]; today: string };
const clean = (today = "2026-11-14"): Rep => ({ clean: true, results: results("hit", "hit", "hit"), today });
const dirty = (today = "2026-11-14"): Rep => ({ clean: false, results: results("hit", "close", "hit"), today });

/** Applies repetitions in order and returns the final progress with every event raised. */
function play(start: PhraseProgress, reps: Rep[]) {
  let progress = start;
  const events: string[] = [];
  for (const rep of reps) {
    const outcome = advance(progress, rep);
    progress = outcome.progress;
    if (outcome.event) events.push(outcome.event);
  }
  return { progress, events };
}

const at = (step: PhraseProgress["step"]): PhraseProgress => ({ ...newProgress("song", 0), step, lastPracticed: "2026-11-13" });

describe("isCleanRep", () => {
  it("needs 90% of scored notes in tune", () => {
    expect(isCleanRep(results("hit", "hit", "hit"), HALF(3))).toBe(true);
    expect(isCleanRep(results("hit", "hit", "close"), HALF(3))).toBe(false);
    expect(isCleanRep(results(...Array<Outcome>(9).fill("hit"), "close"), HALF(10))).toBe(true);
  });

  it("fails on a miss on a note of 300 ms or longer, but forgives one on a shorter note", () => {
    const outcomes: Outcome[] = [...Array<Outcome>(10).fill("hit"), "miss"];
    expect(isCleanRep(results(...outcomes), [...HALF(10), 0.3])).toBe(false);
    expect(isCleanRep(results(...outcomes), [...HALF(10), 0.2])).toBe(true);
  });

  it("fails on a wrong octave", () => {
    expect(isCleanRep(results(...Array<Outcome>(10).fill("hit"), "octave"), HALF(11))).toBe(false);
  });

  it("does not count a repetition where over 40% was not heard", () => {
    expect(isCleanRep(results("hit", "unscored", "unscored"), HALF(3))).toBeNull();
    expect(isCleanRep(results("hit", "hit", "unscored"), HALF(3))).toBe(true);
    expect(isCleanRep([], [])).toBeNull();
  });
});

describe("advance", () => {
  it("moves past listening and speaking after two passes each, without scoring", () => {
    const listened = play(newProgress("song", 0), [dirty(), dirty()]);
    expect(listened.progress.step).toBe(2);
    expect(play(listened.progress, [dirty(), dirty()]).progress.step).toBe(3);
  });

  it("needs two clean repetitions in a row on the sung steps", () => {
    expect(play(at(3), [clean()]).progress.step).toBe(3);
    expect(play(at(3), [clean(), dirty(), clean()]).progress).toMatchObject({ step: 3, streak: 1 });
    expect(play(at(3), [clean(), clean()])).toMatchObject({ progress: { step: 4, streak: 0 }, events: ["stepUp"] });
  });

  it("does not count a repetition that was not heard", () => {
    const unheard = { clean: null, results: results("unscored", "unscored"), today: "2026-11-14" };
    expect(play(at(4), [clean(), unheard, clean()]).progress.step).toBe(5);
  });

  it("marks a phrase clean after three blind repetitions in a row", () => {
    const { progress, events } = play(at(7), [clean(), clean(), clean()]);
    expect(events).toEqual(["clean"]);
    expect(progress.cleanDays).toEqual(["2026-11-14"]);
    expect(stateOf(progress)).toBe("clean");
  });

  it("marks it solid only after clean passes on three different days", () => {
    const three = (day: string) => [clean(day), clean(day), clean(day)];
    const sameDay = play(at(7), [...three("2026-11-14"), ...three("2026-11-14")]);
    expect(stateOf(sameDay.progress)).toBe("clean");
    const { progress, events } = play(at(7), [...three("2026-11-14"), ...three("2026-11-15"), ...three("2026-11-16")]);
    expect(events).toEqual(["clean", "clean", "solid"]);
    expect(stateOf(progress)).toBe("solid");
  });

  it("asks for a drill on a note that is off twice running, once", () => {
    const off = { clean: false, results: results("hit", "miss", "hit"), today: "2026-11-14" };
    const first = advance(at(4), off);
    expect(first.drillNoteId).toBeNull();
    const second = advance(first.progress, off);
    expect(second.drillNoteId).toBe(1);
    expect(advance(second.progress, off).drillNoteId).toBeNull();
  });

  it("forgets a miss once the note is hit", () => {
    const off = { clean: false, results: results("hit", "close", "hit"), today: "2026-11-14" };
    const afterHit = play(at(4), [off, clean(), off]);
    expect(afterHit.progress.missed[1]).toBe(1);
  });
});

describe("state", () => {
  it("is new until first practiced, then learning", () => {
    expect(stateOf(newProgress("song", 0))).toBe("new");
    expect(stateOf(advance(newProgress("song", 0), dirty()).progress)).toBe("learning");
  });

  it("remembers sticky notes without duplicates", () => {
    const sticky = markSticky(markSticky(at(4), 2), 2);
    expect(sticky.sticky).toEqual([2]);
  });
});
