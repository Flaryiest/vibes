import { describe, expect, it } from "vitest";
import type { SongIndexEntry } from "../song/types";
import { describeAddedSongs } from "./addSongText";

const song = (title: string): SongIndexEntry => ({ id: title.toLowerCase(), title, artist: "Fixture", durationS: 14 });

describe("describeAddedSongs", () => {
  it("names a single added song and counts several", () => {
    expect(describeAddedSongs({ added: [song("Swansong")], alreadyKept: [] })).toBe('Added "Swansong".');
    expect(describeAddedSongs({ added: [song("One"), song("Two")], alreadyKept: [] })).toBe("Added 2 songs.");
  });

  it("says how to replace a song that was already here", () => {
    expect(describeAddedSongs({ added: [], alreadyKept: [song("Swansong")] })).toBe(
      '"Swansong" is already here. To replace a song, open it and remove it first.',
    );
    expect(describeAddedSongs({ added: [song("New")], alreadyKept: [song("One"), song("Two")] })).toBe(
      'Added "New". 2 songs are already here. To replace a song, open it and remove it first.',
    );
  });
});
