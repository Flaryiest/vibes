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

  await page.getByRole("link", { name: "Back to today" }).click();
  await expect(page.getByText("1 of 5 days practiced")).toBeVisible();
});
