/**
 * The files of a song package that the app reads. `songprep import` writes
 * others beside them (the automatic notes, waveform peaks, pre-rendered keys);
 * the app does not use those.
 */
export const PACKAGE_JSON_FILE_NAMES = ["manifest.json", "notes.json", "lyrics.json", "beats.json", "f0.json"] as const;

/** The two audio tracks of a package: `instrumental.flac` and `vocals.flac`. */
export const STEM_NAMES = ["instrumental", "vocals"] as const;

export const NOTES_FILE_NAME = "notes.json";

/** A song id is its folder name and part of its address in the app, e.g. "gigi-perez-sailor-song". */
export const SONG_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
