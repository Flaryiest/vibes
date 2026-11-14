import { expect, test } from "@playwright/test";
import { DRONE_KEY, PROFILE, seed } from "./seed";

test("a song can be opened and given a key", async ({ page }) => {
  await seed(page, { profile: [PROFILE] });
  await page.getByRole("link", { name: "Songs" }).click();
  await page.getByRole("link", { name: /Test drone/ }).click();
  await expect(page.getByRole("heading", { name: "Test drone" })).toBeVisible();
  // The melody is A2, well inside the seeded range, so the best fit leaves it alone.
  await expect(page.getByText("At the original pitch, track unchanged").first()).toBeVisible();
  await page.getByRole("button", { name: "Use this key" }).first().click();
  await expect(page.getByRole("link", { name: "Practice this song" })).toBeVisible();
  await expect(page.getByText("4 phrases: 4 new")).toBeVisible();
});

test("a phrase is practiced and scored, and the progress is kept", async ({ page }) => {
  // Start the repeated phrase at step 5, so the first repetition is a sung, scored one.
  const progress = { songId: "test-drone", group: 0, step: 5, streak: 0, cleanDays: [], missed: {}, sticky: [], lastPracticed: "2026-11-13" };
  await seed(page, { profile: [PROFILE], songSettings: [DRONE_KEY], phraseProgress: [progress] });
  await page.goto("/songs/test-drone/practice?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const headline = page.getByTestId("practice-headline");
  await expect(headline).toHaveText("Listen", { timeout: 15_000 });
  await expect(page.getByText("Step 5 of 7: words, full speed")).toBeVisible();
  await expect(headline).toHaveText("Sing", { timeout: 15_000 });
  await expect(headline).toHaveText(/Right on it\.|In tune/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(headline).toHaveText("Done for now.");
  await page.getByRole("link", { name: "Back to the song" }).click();
  await expect(page.getByText(/4 phrases: 3 learning, 1 new/)).toBeVisible();
});
