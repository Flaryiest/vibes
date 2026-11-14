import { expect, test } from "@playwright/test";

test("the lab hears a 110 Hz tone as A2", async ({ page }) => {
  await page.goto("/lab?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(page.getByTestId("engine-status")).toHaveAttribute("data-state", "running", { timeout: 15_000 });
  await expect(page.getByTestId("pitch-name")).toHaveText("A2", { timeout: 15_000 });
});
