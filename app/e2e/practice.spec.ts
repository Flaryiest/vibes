import { expect, test } from "@playwright/test";

test("a new learner is sent to find their range", async ({ page }) => {
  await page.goto("/?mic=fake");
  await expect(page.getByText("Start by finding your range.")).toBeVisible();
  await page.getByRole("link", { name: "Find my range" }).click();
  await expect(page).toHaveURL(/\/range/);
});

test("an exercise on A2 is scored as in tune when the microphone hears A2", async ({ page }) => {
  // The fake microphone plays a steady 110 Hz, which is the note asked for.
  await page.goto("/practice?mic=fake&fixed=45");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  const headline = page.getByTestId("practice-headline");
  await expect(headline).toHaveText("Listen", { timeout: 10_000 });
  await expect(headline).toHaveText("Sing", { timeout: 10_000 });
  await expect(headline).toHaveText(/Right on it\.|In tune/, { timeout: 15_000 });
  await expect(page.getByText("1 exercise, 1 right first time")).toBeVisible();
});

// The fake microphone always sings A2 (MIDI 45), so asking for other notes exercises the other verdicts.
for (const { fixed, verdict } of [
  { fixed: 57, verdict: "Right note, one octave too low." },
  { fixed: 47, verdict: "Too low by about 2 semitones." },
]) {
  test(`singing A2 when asked for MIDI ${fixed} is reported as: ${verdict}`, async ({ page }) => {
    await page.goto(`/practice?mic=fake&fixed=${fixed}`);
    await page.getByRole("button", { name: "Start audio" }).click();
    await page.getByRole("button", { name: "Start practice" }).click();
    await expect(page.getByTestId("practice-headline")).toHaveText(verdict, { timeout: 20_000 });
    await expect(page.getByText("1 exercise, 0 right first time")).toBeVisible();
  });
}

test("the range finder measures three clips and refuses a range that is too narrow", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/range?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  for (const step of ["Step 1 of 3", "Step 2 of 3", "Step 3 of 3"]) {
    await expect(page.getByText(step)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Record 6 seconds" }).click();
  }
  // A steady A2 is the speaking pitch, the lowest note and the highest note all at once.
  await expect(page.getByText(/under five semitones/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Speaking voice")).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
});
