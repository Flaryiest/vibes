import { readPackage, stemFileName } from "./package";
import { PACKAGE_JSON_FILE_NAMES, SONG_ID_PATTERN, STEM_NAMES } from "./package.constants";
import type { PackageFile, ReadPackageFile } from "./songStore.types";
import type { SongIndexEntry, SongPackage } from "./types";

/**
 * One file from a folder the learner picked. `relativePath` starts at the
 * picked folder's own name: "sailor-song/notes.json" when a song's folder was
 * picked, "songs/sailor-song/notes.json" when the whole songs folder was.
 */
export type PickedFile = { relativePath: string; contents: Blob };

/** One imported song among the picked files: its folder's name, and the files directly inside it by name. */
export type PickedSongFolder = { folderName: string; filesByName: Map<string, Blob> };

const MANIFEST_FILE_NAME = "manifest.json";
const STEM_FILE_NAMES: string[] = STEM_NAMES.map(stemFileName);
const REQUIRED_FILE_NAMES: string[] = [...PACKAGE_JSON_FILE_NAMES, ...STEM_FILE_NAMES];

function splitPath(relativePath: string): { folderPath: string; fileName: string } {
  const lastSlash = relativePath.lastIndexOf("/");
  if (lastSlash < 0) return { folderPath: "", fileName: relativePath };
  return { folderPath: relativePath.slice(0, lastSlash), fileName: relativePath.slice(lastSlash + 1) };
}

/**
 * Finds the imported songs among the picked files: every folder that directly
 * holds a manifest. A song's own folder gives one; the songs folder gives each
 * song in it. Nothing is read yet. Throws when there is no song at all.
 */
export function findPickedSongFolders(pickedFiles: PickedFile[]): PickedSongFolder[] {
  const filesByFolderPath = new Map<string, Map<string, Blob>>();
  for (const picked of pickedFiles) {
    const { folderPath, fileName } = splitPath(picked.relativePath);
    const filesByName = filesByFolderPath.get(folderPath) ?? new Map<string, Blob>();
    filesByName.set(fileName, picked.contents);
    filesByFolderPath.set(folderPath, filesByName);
  }

  const songFolders: PickedSongFolder[] = [];
  for (const [folderPath, filesByName] of filesByFolderPath) {
    if (!filesByName.has(MANIFEST_FILE_NAME)) continue;
    songFolders.push({ folderName: folderPath.slice(folderPath.lastIndexOf("/") + 1), filesByName });
  }
  if (songFolders.length === 0) {
    throw new Error("That folder holds no imported song. Pick a song's folder inside songs, or the songs folder itself.");
  }
  return songFolders;
}

async function readPickedFiles(songFolder: PickedSongFolder, fileNames: readonly string[]): Promise<PackageFile[]> {
  const files: PackageFile[] = [];
  for (const name of fileNames) {
    const contents = songFolder.filesByName.get(name);
    if (!contents) {
      throw new Error(`The folder "${songFolder.folderName}" is not a complete song: ${name} is missing.`);
    }
    files.push({ name, bytes: await contents.arrayBuffer() });
  }
  return files;
}

/**
 * Checks one picked song without reading its audio, and says which song it is.
 * The small files go through the same reader that later opens the song, so a
 * song that passes will open. The two audio files are only checked to be
 * there: whether they play is found out when the song is first played.
 */
export async function checkPickedSong(songFolder: PickedSongFolder): Promise<SongIndexEntry> {
  const { folderName, filesByName } = songFolder;
  for (const name of STEM_FILE_NAMES) {
    if (!filesByName.has(name)) {
      throw new Error(`The folder "${folderName}" is not a complete song: ${name} is missing.`);
    }
  }
  const jsonFiles = await readPickedFiles(songFolder, PACKAGE_JSON_FILE_NAMES);
  const readPickedJsonFile: ReadPackageFile = async (_songId, fileName) =>
    jsonFiles.find((file) => file.name === fileName)?.bytes ?? null;

  let songPackage: SongPackage;
  try {
    songPackage = await readPackage(readPickedJsonFile, folderName);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`The folder "${folderName}" cannot be added. ${reason}`);
  }

  const { manifest } = songPackage;
  if (!SONG_ID_PATTERN.test(manifest.id)) {
    throw new Error(`The folder "${folderName}" cannot be added. Its song id is not a usable name.`);
  }
  const artist = typeof manifest.artist === "string" ? manifest.artist : "";
  return { id: manifest.id, title: manifest.title, artist, durationS: manifest.durationS };
}

/**
 * Reads everything of one picked song that the app keeps, audio included.
 * A song runs to tens of megabytes, so callers read one song at a time.
 */
export function readPickedSongFiles(songFolder: PickedSongFolder): Promise<PackageFile[]> {
  return readPickedFiles(songFolder, REQUIRED_FILE_NAMES);
}
