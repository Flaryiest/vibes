import type { Page } from "@playwright/test";

/** Rows to put straight into the app's database, by table name. */
export type Seed = Record<string, object[]>;

export const PROFILE = { id: "me", speakingMidi: 45, comfortLow: 40, comfortHigh: 57, measuredAt: "2026-11-14T08:00:00.000Z" };
export const DRONE_KEY = { songId: "test-drone", trackShift: 0, octaveDrop: 0, backingGain: 0.5 };

/** Opens the app once so its database exists, then writes `seed` into it. */
export async function seed(page: Page, rows: Seed): Promise<void> {
  await page.goto("/?mic=fake");
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === "singing-trainer"));
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("singing-trainer");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(Object.keys(data), "readwrite");
          for (const [table, list] of Object.entries(data)) for (const row of list) tx.objectStore(table).put(row);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    rows,
  );
}
