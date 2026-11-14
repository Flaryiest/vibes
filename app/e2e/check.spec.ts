import { expect, test, type Page } from "@playwright/test";
import { PROFILE, seed } from "./seed";

/** Midday, local time, `daysAgo` days back: safely inside that calendar day. */
function midday(daysAgo: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

/** Gives a seeded take a recording: a second and a half of a quiet tone, as 16-bit samples. */
async function seedTakeAudio(page: Page, takeId: number): Promise<void> {
  await page.evaluate(
    (id) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("singing-trainer");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const sampleRate = 16000;
          const pcm = Int16Array.from({ length: 1.5 * sampleRate }, (_, i) =>
            Math.round(3000 * Math.sin((2 * Math.PI * 220 * i) / sampleRate)),
          );
          const tx = open.result.transaction("takeAudio", "readwrite");
          tx.objectStore("takeAudio").put({ takeId: id, sampleRate, pcm: pcm.buffer });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    takeId,
  );
}

test("the pitch check runs to the end and finds a steady A2 fully in tune", async ({ page }) => {
  // Sixteen exercises, each heard once and sung once: just under two minutes.
  test.setTimeout(180_000);
  // The fake microphone plays a steady 110 Hz, and every exercise is pinned to that note.
  await page.goto("/check?mic=fake&fixed=45");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.getByRole("button", { name: "Start the pitch check" }).click();
  const headline = page.getByTestId("check-headline");
  await expect(headline).toHaveText("Listen", { timeout: 10_000 });
  await expect(page.getByText("Exercise 1 of 16")).toBeVisible();
  await expect(headline).toHaveText("Sing", { timeout: 10_000 });
  await expect(page.getByText("Exercise 2 of 16")).toBeVisible({ timeout: 15_000 });

  await expect(headline).toHaveText("100% in tune.", { timeout: 150_000 });
  await expect(page.getByText("34 of 34 notes heard")).toBeVisible();
  await expect(page.getByText("Calibration run 1 of 2")).toBeVisible();
  await expect(page.getByText(/adults without lessons averaged 68%.*approximate/)).toBeVisible();

  // The result was saved, so the progress screen has it.
  await page.getByRole("link", { name: "See your progress" }).click();
  await expect(page.getByText("100% of notes in tune")).toBeVisible();
});

test("the progress screen shows practice days, pitch checks, takes and the range", async ({ page }) => {
  const check = (id: number, day: string, pctInTune: number) => ({
    id,
    at: `${day}T12:00:00.000Z`,
    pctInTune,
    meanAbsCents: 110 - pctInTune,
    notes: 34,
  });
  const take = (id: number, day: string, kind: "run" | "capsule", pctInTune: number) => ({
    id,
    songId: "test-drone",
    at: `${day}T12:00:00.000Z`,
    kind,
    pctInTune,
    meanAbsCents: 110 - pctInTune,
    scoredNotes: 15,
    totalNotes: 15,
    key: { trackShift: 0, octaveDrop: 0 },
  });
  const range = { speakingMidi: 45, comfortLow: 40, comfortHigh: 57 };
  await seed(page, {
    profile: [PROFILE],
    attempts: [
      { id: 1, at: midday(0), level: 1, mode: "live", targets: [45], results: [], firstTry: true, success: true },
      { id: 2, at: midday(0), level: 1, mode: "live", targets: [45], results: [], firstTry: true, success: true },
    ],
    sessions: [{ id: 1, at: midday(3), minutes: 30, effort: 3, throat: "fine" }],
    pitchChecks: [check(1, "2026-10-03", 52), check(2, "2026-10-17", 58), check(3, "2026-10-31", 66), check(4, "2026-11-14", 71)],
    // The repeated phrase has been sung clean on one day; the other phrase is untouched.
    phraseProgress: [
      { songId: "test-drone", group: 0, step: 7, streak: 0, cleanDays: ["2026-11-10"], missed: {}, sticky: [], lastPracticed: "2026-11-10" },
    ],
    takes: [take(1, "2026-11-01", "capsule", 41), take(2, "2026-11-12", "run", 63)],
    rangeChecks: [
      { id: 1, at: "2026-10-03T12:00:00.000Z", ...range, comfortLow: 41, comfortHigh: 55 },
      { id: 2, at: "2026-11-14T12:00:00.000Z", ...range },
    ],
  });
  await seedTakeAudio(page, 1);
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Your progress" })).toBeVisible();

  // Two attempts today and a session three days ago are two days of practice.
  const week = page.getByRole("list", { name: "Practice on each of the last seven days" });
  await expect(week.getByRole("listitem")).toHaveCount(7);
  await expect(week.getByText(/: practiced$/)).toHaveCount(2);
  await expect(page.getByText("2 days practiced. The goal is 5.")).toBeVisible();

  // The latest check, against the one four weeks before it.
  await expect(page.getByText("71% of notes in tune")).toBeVisible();
  await expect(page.getByText(/Up 13 points since .*17/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Pitch check results.*4 checks/ })).toBeVisible();
  await expect(page.getByText(/Last check .*14.*average error 39 cents/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Run a pitch check" })).toHaveAttribute("href", "/check");

  // The song, its phrases, and its takes oldest first.
  await expect(page.getByRole("link", { name: "Test drone" })).toBeVisible();
  await expect(page.getByText("4 phrases: 3 clean, 1 new")).toBeVisible();
  const takes = page.getByRole("row").filter({ hasText: "%" });
  await expect(takes).toHaveCount(2);
  await expect(takes.nth(0)).toContainText("41%");
  await expect(takes.nth(0)).toContainText("Time capsule");
  await expect(takes.nth(1)).toContainText("63%");
  await expect(takes.nth(1)).not.toContainText("Time capsule");

  // Only the take with a recording can be played, and the button comes back when it ends.
  await expect(page.getByRole("button", { name: /^Play the take/ })).toHaveCount(1);
  await takes.nth(0).getByRole("button", { name: /^Play the take/ }).click();
  await expect(takes.nth(0).getByRole("button", { name: /^Stop the take/ })).toBeVisible();
  await expect(takes.nth(0).getByRole("button", { name: /^Play the take/ })).toBeVisible({ timeout: 10_000 });

  // The range, newest first.
  await expect(page.getByRole("cell", { name: / to / })).toHaveText(["E2 to A3", "F2 to G3"]);
});

test("the progress screen says so when nothing has been recorded yet", async ({ page }) => {
  await page.goto("/progress");
  await expect(page.getByText("0 days practiced. The goal is 5.")).toBeVisible();
  await expect(page.getByText(/No pitch checks yet\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Run the first pitch check" })).toHaveAttribute("href", "/check");
  await expect(page.getByText("No recorded takes yet.")).toBeVisible();
  await expect(page.getByText("No range measured yet.")).toBeVisible();
});
