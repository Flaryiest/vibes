import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DRONE_KEY, PROFILE, seed } from "./seed";

// These run where there is no local server: songs are added from a folder and kept in the browser.
const SONG_FOLDER = path.resolve(import.meta.dirname, "fixtures/songs/test-drone");

async function addTestSong(page: Page): Promise<void> {
  await page.goto("/songs");
  await expect(page.getByText("No songs yet.")).toBeVisible();
  await page.getByTestId("song-folder").setInputFiles(SONG_FOLDER);
  await expect(page.getByRole("status")).toHaveText('Added "Test drone".');
}

/** The first note of the song as this browser now keeps it. */
async function keptFirstNoteMidi(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("singing-trainer");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const read = open.result.transaction("libraryFiles").objectStore("libraryFiles").get(["test-drone", "notes.json"]);
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            open.result.close();
            resolve(JSON.parse(new TextDecoder().decode(read.result.bytes))[0].midi);
          };
        };
      }),
  );
}

test("a song added from its folder is kept in the browser, then practiced and scored", async ({ page }) => {
  // Start the repeated phrase at step 5, so the first repetition is a sung, scored one.
  const progress = { songId: "test-drone", group: 0, step: 5, streak: 0, cleanDays: [], missed: {}, sticky: [], lastPracticed: "2026-11-13" };
  await seed(page, { profile: [PROFILE], songSettings: [DRONE_KEY], phraseProgress: [progress] });
  await addTestSong(page);

  // Still there after a reload, with nothing but the browser to serve it.
  await page.reload();
  await page.getByRole("link", { name: /Test drone/ }).click();
  await expect(page.getByRole("heading", { name: "Test drone" })).toBeVisible();

  await page.goto("/songs/test-drone/practice?mic=fake");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const headline = page.getByTestId("practice-headline");
  await expect(headline).toHaveText("Listen", { timeout: 15_000 });
  await expect(headline).toHaveText("Sing", { timeout: 15_000 });
  await expect(headline).toHaveText(/Right on it\.|In tune/, { timeout: 15_000 });
});

test("adding the same song again leaves the kept one alone", async ({ page }) => {
  await seed(page, { profile: [PROFILE] });
  await addTestSong(page);
  await page.getByTestId("song-folder").setInputFiles(SONG_FOLDER);
  await expect(page.getByRole("status")).toHaveText(/"Test drone" is already here\./);
  await expect(page.getByRole("link", { name: /Test drone/ })).toHaveCount(1);
});

test("a corrected note is saved in the browser, and removing the song clears it out", async ({ page }) => {
  const progress = { songId: "test-drone", group: 0, step: 5, streak: 0, cleanDays: [], missed: {}, sticky: [], lastPracticed: "2026-11-13" };
  await seed(page, { profile: [PROFILE], songSettings: [DRONE_KEY], phraseProgress: [progress] });
  await addTestSong(page);
  const originalMidi = await keptFirstNoteMidi(page);

  await page.goto("/songs/test-drone/edit");
  await expect(page.getByText("Correct the notes.")).toBeVisible();
  // Arriving on the piano roll by keyboard selects the first note; arrow up raises it a semitone.
  await page.getByRole("application", { name: "Piano roll" }).focus();
  await page.keyboard.press("ArrowUp");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await keptFirstNoteMidi(page)).toBe(originalMidi + 1);

  await page.goto("/songs/test-drone");
  await page.getByRole("button", { name: "Remove this song" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(page.getByText("No songs yet.")).toBeVisible();
  // Nothing of it is left to open, or to remove.
  await page.goto("/songs/test-drone");
  await expect(page.getByText(/This song package is damaged: .* is missing\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove this song" })).toHaveCount(0);
});

test("a kept song that will not open can still be removed", async ({ page }) => {
  await seed(page, { profile: [PROFILE], songSettings: [DRONE_KEY] });
  await addTestSong(page);
  // Damage the kept song the way a bad save once could: no notes left.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("singing-trainer");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("libraryFiles", "readwrite");
          tx.objectStore("libraryFiles").put({ songId: "test-drone", name: "notes.json", bytes: new TextEncoder().encode("[]").buffer });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  await page.goto("/songs/test-drone");
  await expect(page.getByText("This song package is damaged: there are no notes.")).toBeVisible();
  await page.getByRole("button", { name: "Remove this song" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(page.getByText("No songs yet.")).toBeVisible();

  // With it gone, a good copy can be added again.
  await page.getByTestId("song-folder").setInputFiles(SONG_FOLDER);
  await expect(page.getByRole("status")).toHaveText('Added "Test drone".');
});

test("a finished session is stored in the browser and offers a backup to download", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, { profile: [PROFILE] });

  // Sixty times faster: a thirty-minute plan in about half a minute.
  await page.goto("/session?mic=fake&speed=60");
  await page.getByRole("button", { name: "Start audio" }).click();
  const part = page.getByTestId("session-part");
  await expect(part).toHaveText(/Part 1 of \d: warm-up/);
  await expect(part).toHaveText(/: check-in$/, { timeout: 90_000 });

  await page.getByRole("button", { name: "Fine" }).click();
  await page.getByRole("button", { name: "Effort 2" }).click();
  await page.getByRole("button", { name: "Save and finish" }).click();
  await expect(page.getByText("Session saved.")).toBeVisible();
  await expect(page.getByText("It is stored in this browser.", { exact: true })).toBeVisible();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a backup" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^singing-trainer-backup-\d{4}-\d{2}-\d{2}\.json$/);
  // The file holds the session just finished.
  const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(backup.sessions).toHaveLength(1);
  expect(backup.sessions[0].throat).toBe("fine");
});
