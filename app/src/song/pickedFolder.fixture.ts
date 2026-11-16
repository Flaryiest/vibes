import type { PickedFile } from "./songFolder";

const NOTE = { id: 0, t: 1, d: 0.5, midi: 45, cents: 0, text: "la", word: 0, line: 0, phrase: 0, kind: "normal" };

export const FIXTURE_INSTRUMENTAL_BYTES = [1, 2, 3];
export const FIXTURE_VOCALS_BYTES = [4, 5];

type PickedSongFolderOptions = {
  /** The folder the song's folder sits in, when the whole songs folder was picked. */
  parentFolder?: string;
  title?: string;
  /** Names of files to leave out, to make an incomplete song. */
  missingFileNames?: string[];
  /** Raw text to use for a file instead of its usual contents, to make a damaged song. */
  replacedFileTexts?: Record<string, string>;
};

/**
 * What a folder picker hands over for one imported song: the files the app
 * reads, and the extra ones `songprep import` writes beside them.
 *
 * @example
 * pickedSongFolder("test-song")[0].relativePath // "test-song/manifest.json"
 */
export function pickedSongFolder(songId: string, options: PickedSongFolderOptions = {}): PickedFile[] {
  const { parentFolder, title = "Test song", missingFileNames = [], replacedFileTexts = {} } = options;
  const fileContents: Record<string, Blob> = {
    "manifest.json": new Blob([JSON.stringify({ schema: 1, id: songId, title, artist: "Fixture", durationS: 14 })]),
    "notes.json": new Blob([JSON.stringify([NOTE])]),
    "notes.auto.json": new Blob([JSON.stringify([NOTE])]),
    "lyrics.json": new Blob([JSON.stringify({ offsetS: 0, lines: [] })]),
    "beats.json": new Blob([JSON.stringify({ beats: [0, 0.5], downbeats: [0] })]),
    "f0.json": new Blob([JSON.stringify({ hopS: 0.01, hz: [110], conf: [1] })]),
    "peaks.json": new Blob([JSON.stringify([0.1])]),
    "instrumental.flac": new Blob([new Uint8Array(FIXTURE_INSTRUMENTAL_BYTES)]),
    "vocals.flac": new Blob([new Uint8Array(FIXTURE_VOCALS_BYTES)]),
  };
  for (const [fileName, text] of Object.entries(replacedFileTexts)) fileContents[fileName] = new Blob([text]);
  const songFolder = parentFolder ? `${parentFolder}/${songId}` : songId;
  return Object.entries(fileContents)
    .filter(([fileName]) => !missingFileNames.includes(fileName))
    .map(([fileName, contents]) => ({ relativePath: `${songFolder}/${fileName}`, contents }));
}
