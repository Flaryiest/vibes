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
