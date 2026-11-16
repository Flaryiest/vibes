import { describe, expect, it } from "vitest";
import { FIXTURE_VOCALS_BYTES, pickedSongFolder } from "./pickedFolder.fixture";
import { checkPickedSong, findPickedSongFolders, readPickedSongFiles, type PickedFile } from "./songFolder";

/** The one song in a picked song folder. */
const onlySongFolder = (pickedFiles: PickedFile[]) => {
  const songFolders = findPickedSongFolders(pickedFiles);
  expect(songFolders).toHaveLength(1);
  return songFolders[0];
};

describe("findPickedSongFolders", () => {
  it("finds the one song when a song's own folder is picked", () => {
    expect(onlySongFolder(pickedSongFolder("test-song")).folderName).toBe("test-song");
  });

  it("finds every song when the whole songs folder is picked, ignoring files that belong to none", () => {
    const songsFolder = [
      ...pickedSongFolder("first-song", { parentFolder: "songs" }),
      ...pickedSongFolder("second-song", { parentFolder: "songs" }),
      { relativePath: "songs/index.json", contents: new Blob(["[]"]) },
    ];
    expect(findPickedSongFolders(songsFolder).map((songFolder) => songFolder.folderName)).toEqual(["first-song", "second-song"]);
  });

  it("refuses a folder with no imported song in it", () => {
    const musicFolder = [{ relativePath: "Music/song.m4a", contents: new Blob(["audio"]) }];
    expect(() => findPickedSongFolders(musicFolder)).toThrow(/holds no imported song/);
    expect(() => findPickedSongFolders([])).toThrow(/holds no imported song/);
  });
});

describe("checkPickedSong", () => {
  it("says which song a folder holds", async () => {
    const song = await checkPickedSong(onlySongFolder(pickedSongFolder("test-song", { title: "Test song" })));
    expect(song).toEqual({ id: "test-song", title: "Test song", artist: "Fixture", durationS: 14 });
  });

  it("names the folder and the file when a song is incomplete", async () => {
    const withoutVocals = onlySongFolder(pickedSongFolder("test-song", { missingFileNames: ["vocals.flac"] }));
    await expect(checkPickedSong(withoutVocals)).rejects.toThrow('The folder "test-song" is not a complete song: vocals.flac is missing.');
    const withoutLyrics = onlySongFolder(pickedSongFolder("test-song", { missingFileNames: ["lyrics.json"] }));
    await expect(checkPickedSong(withoutLyrics)).rejects.toThrow('The folder "test-song" is not a complete song: lyrics.json is missing.');
  });

  it("refuses a song that would not open", async () => {
    const unreadableNotes = onlySongFolder(pickedSongFolder("test-song", { replacedFileTexts: { "notes.json": "not json" } }));
    await expect(checkPickedSong(unreadableNotes)).rejects.toThrow(/"test-song" cannot be added\. .*notes\.json cannot be read/);

    const noNotes = onlySongFolder(pickedSongFolder("test-song", { replacedFileTexts: { "notes.json": "[]" } }));
    await expect(checkPickedSong(noNotes)).rejects.toThrow(/there are no notes/);

    // The id becomes part of the song's address in the app, so it has to be a plain name.
    const unusableId = onlySongFolder(pickedSongFolder("Not A Plain Name"));
    await expect(checkPickedSong(unusableId)).rejects.toThrow(/song id is not a usable name/);
  });

  it("does not read the audio", async () => {
    const pickedFiles = pickedSongFolder("test-song");
    const audioReads: string[] = [];
    for (const picked of pickedFiles) {
      if (!picked.relativePath.endsWith(".flac")) continue;
      const readAudio = picked.contents.arrayBuffer.bind(picked.contents);
      picked.contents.arrayBuffer = () => {
        audioReads.push(picked.relativePath);
        return readAudio();
      };
    }
    await checkPickedSong(onlySongFolder(pickedFiles));
    expect(audioReads).toEqual([]);
  });
});

describe("readPickedSongFiles", () => {
  it("reads the files the app uses and leaves the rest", async () => {
    const files = await readPickedSongFiles(onlySongFolder(pickedSongFolder("test-song")));
    expect(files.map((file) => file.name).sort()).toEqual([
      "beats.json",
      "f0.json",
      "instrumental.flac",
      "lyrics.json",
      "manifest.json",
      "notes.json",
      "vocals.flac",
    ]);
    const vocals = files.find((file) => file.name === "vocals.flac")!;
    expect([...new Uint8Array(vocals.bytes)]).toEqual(FIXTURE_VOCALS_BYTES);
  });
});
