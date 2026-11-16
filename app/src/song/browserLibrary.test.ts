import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newProgress } from "../practice/phraseLadder";
import {
  db,
  exportAll,
  libraryFile,
  libraryKeepsSong,
  librarySongs,
  loadPhraseProgress,
  loadSongSettings,
  removeLibrarySong,
  replaceLibraryFile,
  savePhraseProgress,
  saveSongSettings,
} from "../store/db";
import { addPickedSongsToBrowser } from "./browserLibrary";
import { readPackage, saveNotes } from "./package";
import { FIXTURE_INSTRUMENTAL_BYTES, pickedSongFolder } from "./pickedFolder.fixture";
import type { PickedFile } from "./songFolder";
import { browserSongStore } from "./songStore";
import type { Note } from "./types";

const readNotes = async (songId: string): Promise<Note[]> => (await readPackage(browserSongStore.readFile, songId)).notes;

const textBytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

/** Records which of these picked files have their contents read from now on. */
function watchReads(pickedFiles: PickedFile[]): string[] {
  const readPaths: string[] = [];
  for (const picked of pickedFiles) {
    const read = picked.contents.arrayBuffer.bind(picked.contents);
    picked.contents.arrayBuffer = () => {
      readPaths.push(picked.relativePath);
      return read();
    };
  }
  return readPaths;
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the songs kept in the browser", () => {
  it("keeps an added song whole: listed, readable as a package, with its audio", async () => {
    const outcome = await addPickedSongsToBrowser(pickedSongFolder("test-song", { title: "Test song" }));
    expect(outcome.added.map((song) => song.id)).toEqual(["test-song"]);
    expect(outcome.alreadyKept).toEqual([]);

    expect(await browserSongStore.listSongs()).toEqual([
      { id: "test-song", title: "Test song", artist: "Fixture", durationS: 14 },
    ]);
    const songPackage = await readPackage(browserSongStore.readFile, "test-song");
    expect(songPackage.manifest.title).toBe("Test song");
    const instrumental = await browserSongStore.readFile("test-song", "instrumental.flac");
    expect([...new Uint8Array(instrumental!)]).toEqual(FIXTURE_INSTRUMENTAL_BYTES);
  });

  it("lists songs in the order they were added", async () => {
    await addPickedSongsToBrowser(pickedSongFolder("zebra-song"));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await addPickedSongsToBrowser(pickedSongFolder("apple-song"));
    expect((await librarySongs()).map((song) => song.id)).toEqual(["zebra-song", "apple-song"]);
  });

  it("saves corrected notes into the kept song", async () => {
    await addPickedSongsToBrowser(pickedSongFolder("test-song"));
    const [firstNote] = await readNotes("test-song");
    await browserSongStore.saveNotes("test-song", [{ ...firstNote, midi: firstNote.midi + 1 }]);
    expect((await readNotes("test-song"))[0].midi).toBe(firstNote.midi + 1);
  });

  it("refuses to save notes for a song it does not keep", async () => {
    await expect(browserSongStore.saveNotes("absent-song", [])).rejects.toThrow(/not kept in this browser/);
    expect(await libraryFile("absent-song", "notes.json")).toBeNull();
  });

  it("leaves a kept song as it is when the same song is added again, without reading its audio", async () => {
    await addPickedSongsToBrowser(pickedSongFolder("test-song"));
    const [firstNote] = await readNotes("test-song");
    await browserSongStore.saveNotes("test-song", [{ ...firstNote, midi: 60 }]);

    const keptSongAgain = pickedSongFolder("test-song", { parentFolder: "songs" });
    const readPaths = watchReads(keptSongAgain);
    const songsFolder = [...keptSongAgain, ...pickedSongFolder("new-song", { parentFolder: "songs" })];
    const outcome = await addPickedSongsToBrowser(songsFolder);

    expect(outcome.added.map((song) => song.id)).toEqual(["new-song"]);
    expect(outcome.alreadyKept.map((song) => song.id)).toEqual(["test-song"]);
    // The correction made in the browser survives.
    expect((await readNotes("test-song"))[0].midi).toBe(60);
    expect(readPaths.filter((path) => path.endsWith(".flac"))).toEqual([]);
  });

  it("adds nothing when any song in the folder is incomplete", async () => {
    const songsFolder = [
      ...pickedSongFolder("whole-song", { parentFolder: "songs" }),
      ...pickedSongFolder("broken-song", { parentFolder: "songs", missingFileNames: ["vocals.flac"] }),
    ];
    await expect(addPickedSongsToBrowser(songsFolder)).rejects.toThrow(/broken-song/);
    expect(await librarySongs()).toEqual([]);
  });

  it("removes a song with its files and phrase progress, keeping its key", async () => {
    await addPickedSongsToBrowser(pickedSongFolder("test-song"));
    await savePhraseProgress(newProgress("test-song", 0));
    await saveSongSettings({ songId: "test-song", trackShift: 2, octaveDrop: 1, backingGain: 0.5 });

    await removeLibrarySong("test-song");

    expect(await librarySongs()).toEqual([]);
    expect(await libraryKeepsSong("test-song")).toBe(false);
    expect(await libraryFile("test-song", "vocals.flac")).toBeNull();
    await expect(readPackage(browserSongStore.readFile, "test-song")).rejects.toThrow(/is missing/);
    expect(await loadPhraseProgress("test-song")).toEqual([]);
    expect((await loadSongSettings("test-song"))?.trackShift).toBe(2);
  });

  it("lets a kept song that no longer opens be removed and added afresh", async () => {
    await addPickedSongsToBrowser(pickedSongFolder("test-song"));
    await replaceLibraryFile("test-song", { name: "notes.json", bytes: textBytes("[]") });
    await expect(readPackage(browserSongStore.readFile, "test-song")).rejects.toThrow(/there are no notes/);
    // Still known as kept, which is what lets the song's screen offer to remove it.
    expect(await libraryKeepsSong("test-song")).toBe(true);

    await removeLibrarySong("test-song");
    const outcome = await addPickedSongsToBrowser(pickedSongFolder("test-song"));
    expect(outcome.added.map((song) => song.id)).toEqual(["test-song"]);
    expect(await readNotes("test-song")).toHaveLength(1);
  });

  it("is left out of the backup, which holds what the learner did rather than the songs", async () => {
    await addPickedSongsToBrowser(pickedSongFolder("test-song"));
    const backup = await exportAll();
    expect(Object.keys(backup)).not.toContain("librarySongs");
    expect(Object.keys(backup)).not.toContain("libraryFiles");
    expect(JSON.stringify(backup)).not.toContain("test-song");
  });
});

describe("saving notes where there is no local server", () => {
  beforeEach(() => {
    // A static host: it answers, but not as the local server would.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));
  });

  it("saves into the song kept in the browser", async () => {
    await addPickedSongsToBrowser(pickedSongFolder("test-song"));
    const [firstNote] = await readNotes("test-song");
    await saveNotes("test-song", [{ ...firstNote, midi: 50 }]);
    expect((await readNotes("test-song"))[0].midi).toBe(50);
  });

  it("refuses notes the song could not be opened with, and keeps the notes it had", async () => {
    await addPickedSongsToBrowser(pickedSongFolder("test-song"));
    const notesBefore = await readNotes("test-song");

    await expect(saveNotes("test-song", [])).rejects.toThrow("The song would not open again with these notes: there are no notes.");
    const outOfOrder = [{ ...notesBefore[0], t: 5 }, { ...notesBefore[0], t: 1 }];
    await expect(saveNotes("test-song", outOfOrder)).rejects.toThrow(/the notes are out of order/);

    expect(await readNotes("test-song")).toEqual(notesBefore);
  });
});
