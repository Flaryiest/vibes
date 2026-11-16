import { expect, test } from "@playwright/test";
import { DRONE_KEY, PROFILE, seed } from "./seed";

test("a whole session runs through its parts and is saved with a backup", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, { profile: [PROFILE], songSettings: [DRONE_KEY] });
  await page.reload();
  await expect(page.getByText("Today's session is ready.")).toBeVisible();

  // Sixty times faster: a thirty-minute plan in about half a minute.
  await page.goto("/session?mic=fake&speed=60");
  await page.getByRole("button", { name: "Start audio" }).click();
  const part = page.getByTestId("session-part");
  await expect(part).toHaveText("Part 1 of 5: warm-up");
  await expect(part).toHaveText("Part 2 of 5: pitch matching", { timeout: 15_000 });
  await expect(part).toHaveText("Part 4 of 5: song work", { timeout: 40_000 });
  await expect(part).toHaveText("Part 5 of 5: check-in", { timeout: 60_000 });

  await page.getByRole("button", { name: "Fine" }).click();
  await page.getByRole("button", { name: "Effort 2" }).click();
  await page.getByRole("button", { name: "Save and finish" }).click();
  await expect(page.getByText("Session saved.")).toBeVisible();
  await expect(page.getByText("A backup was written to disk.")).toBeVisible();
  // The disk backup is the backup here; downloading one is for the copy without a local server.
  await expect(page.getByRole("button", { name: "Download a backup" })).toHaveCount(0);

  await page.getByRole("link", { name: "Back to today" }).click();
  await expect(page.getByText("1 of 5 days practiced")).toBeVisible();
});

test("once the whole song is at full speed and headphones are in use, the session adds a run-through", async ({ page }) => {
  test.setTimeout(120_000);
  const at = (group: number) => ({ songId: "test-drone", group, step: 5, streak: 0, cleanDays: [], missed: {}, sticky: [], lastPracticed: "2026-11-13" });
  await seed(page, {
    profile: [PROFILE],
    songSettings: [DRONE_KEY],
    phraseProgress: [at(0), at(2)],
    settings: [{ key: "route", value: "headphones" }],
  });
  await page.goto("/session?mic=fake&speed=60");
  await page.getByRole("button", { name: "Start audio" }).click();
  const part = page.getByTestId("session-part");
  await expect(part).toHaveText("Part 1 of 6: warm-up");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Skip this part" }).click();
  await expect(part).toHaveText("Part 5 of 6: run-through");
  await expect(page.getByRole("button", { name: "Record a run-through" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Next part" }).click();
  await expect(part).toHaveText("Part 6 of 6: check-in");
});
