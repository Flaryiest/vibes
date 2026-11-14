import { expect, test } from "@playwright/test";

test("the lab hears a 110 Hz tone as A2", async ({ page }) => {
  await page.goto("/lab?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(page.getByTestId("engine-status")).toHaveAttribute("data-state", "running", { timeout: 15_000 });
  await expect(page.getByTestId("pitch-name")).toHaveText("A2", { timeout: 15_000 });
});

test("changing key and tempo keeps the two tracks in sync and on time", async ({ page }) => {
  await page.goto("/lab?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.getByRole("button", { name: "Test key and tempo change" }).click();
  const rows = page.getByTestId("stretch-results").locator("tbody tr");
  await expect(rows).toHaveCount(5, { timeout: 60_000 });
  for (const row of await rows.all()) {
    await expect(row.locator("td").nth(3)).toHaveText("Yes");
    const timing = parseFloat(await row.locator("td").nth(2).innerText());
    expect(timing).toBeLessThan(30);
  }
});
