import { expect, test } from "@playwright/test";
import { PROFILE, seed } from "./seed";

const NOTES_URL = "/song-files/test-drone/notes.json";

test("a corrected note is saved into the song package and resets phrase progress", async ({ page, request }) => {
  const original = await (await request.get(NOTES_URL)).json();
  const progress = { songId: "test-drone", group: 0, step: 5, streak: 0, cleanDays: [], missed: {}, sticky: [], lastPracticed: "2026-11-13" };
  await seed(page, { profile: [PROFILE], phraseProgress: [progress] });

  try {
    await page.goto("/songs/test-drone/edit");
    await expect(page.getByText("Correct the notes.")).toBeVisible();
    // Arriving on the piano roll by keyboard selects the first note; arrow up raises it a semitone.
    await page.getByRole("application", { name: "Piano roll" }).focus();
    await page.keyboard.press("ArrowUp");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect.poll(async () => (await (await request.get(NOTES_URL)).json())[0].midi).toBe(original[0].midi + 1);

    // The automatic notes are left untouched, and the song's progress starts again.
    expect((await (await request.get("/song-files/test-drone/notes.auto.json")).json())[0].midi).toBe(original[0].midi);
    await page.goto("/songs/test-drone");
    await expect(page.getByText(/phrases: \d+ new$/)).toBeVisible();
  } finally {
    // Other tests rely on the fixture's notes.
    await request.put("/api/songs/test-drone/notes", { data: original });
  }
});
