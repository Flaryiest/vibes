import { expect, test } from "@playwright/test";
import { DRONE_KEY, PROFILE, seed } from "./seed";

const HEADPHONES = { key: "route", value: "headphones" };

test("a run-through is recorded with the pitch hidden, scored, and kept with its audio", async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, { profile: [PROFILE], songSettings: [DRONE_KEY], settings: [HEADPHONES] });
  await page.goto("/songs/test-drone/take?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(page.getByRole("button", { name: "Headphones" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Record a run-through" }).click();

  // The words come up line by line while the song plays.
  const headline = page.getByTestId("take-headline");
  await expect(headline).toHaveText("la la la la", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(headline).toHaveText("oh oh oh", { timeout: 15_000 });

  // The song is fourteen seconds of A2, and the fake microphone holds an A2 throughout.
  await expect(page.getByText("100%", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(headline).toHaveText("This take meets every target that could be measured.");
  await expect(page.getByRole("row", { name: /Notes heard/ })).toContainText("15 of 15");

  const takes = page.getByRole("list", { name: "Takes" }).getByRole("listitem");
  await expect(takes).toHaveCount(1);
  await expect(takes.first()).toContainText("100% in tune");
  await takes.first().getByRole("button", { name: /^Play/ }).click();
  await expect(takes.first().getByRole("button", { name: /^Stop/ })).toBeVisible();

  // The take is still there when the screen is opened again.
  await page.reload();
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(page.getByRole("list", { name: "Takes" }).getByRole("listitem")).toHaveCount(1);
});

test("a run-through that is stopped is not kept", async ({ page }) => {
  await seed(page, { profile: [PROFILE], songSettings: [DRONE_KEY], settings: [HEADPHONES] });
  await page.goto("/songs/test-drone/take?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.getByRole("button", { name: "Record a run-through" }).click();
  await expect(page.getByTestId("take-headline")).toHaveText("la la la la", { timeout: 15_000 });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Stopped. That take was not kept.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record a run-through" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Takes" })).toHaveCount(0);
});

test("a song with no key chosen is sent back to be set up", async ({ page }) => {
  await seed(page, { profile: [PROFILE] });
  await page.goto("/songs/test-drone/take?mic=fake");
  await expect(page.getByText("Choose a key for this song first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up the song" })).toHaveAttribute("href", "/songs/test-drone");
});
