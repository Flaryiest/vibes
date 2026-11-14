/**
 * The song package: what `songprep import` writes to `songs/<id>/` and the app
 * reads. See section 4.3 of the spec. All times are seconds in the original
 * recording; all pitches are as sung in the original, before any key change.
 */

export type Manifest = {
  schema: 1;
  /** Folder name, e.g. "gigi-perez-sailor-song". */
  id: string;
  title: string;
  artist: string;
  durationS: number;
  sampleRate: number;
  sourceHash: string;
  /** Tool and model versions used for the import. */
  tools: Record<string, string>;
  lyricsSource: "file" | "lrclib" | "transcribed";
  lyricsNeedReview: boolean;
  bpm: number;
  /** Lowest and highest notes of 150 ms or longer. */
  range: { lowMidi: number; highMidi: number };
  /** Where most of the melody sits: the duration-weighted 10th to 90th percentile. */
  typicalRange: { lowMidi: number; highMidi: number };
  /** Semitone shifts for which a pre-rendered instrumental exists. */
  bakedKeys: number[];
};

/** `rap` notes are scored for timing only; `free` notes are not scored. */
export type NoteKind = "normal" | "rap" | "free";

export type Note = {
  id: number;
  /** Start, seconds. */
  t: number;
  /** Duration, seconds. */
  d: number;
  /** Whole MIDI pitch as sung in the original. */
  midi: number;
  /** The original singer's offset from that pitch. */
  cents: number;
  /** Syllable or word; "~" continues the previous syllable on a new pitch. */
  text: string;
  word: number;
  line: number;
  /** Notes sharing a phrase number are sung on one breath. */
  phrase: number;
  kind: NoteKind;
};

export type Lyrics = {
  /** Correction between the lyric source's timing and this audio. */
  offsetS: number;
  lines: { t0: number; t1: number; text: string; words: { t0: number; t1: number; text: string }[] }[];
};

export type Beats = { beats: number[]; downbeats: number[] };

/** The original singer's pitch curve, for display. `hz` is 0 where unvoiced. */
export type F0 = { hopS: number; hz: number[]; conf: number[] };

/** One entry of `songs/index.json`. */
export type SongIndexEntry = { id: string; title: string; artist: string; durationS: number };

/** Everything the app loads for one song, apart from the audio. */
export type SongPackage = { manifest: Manifest; notes: Note[]; lyrics: Lyrics; beats: Beats; f0: F0 };
