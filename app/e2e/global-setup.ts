import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { harmonicTone } from "../src/dsp/synth";
import { encodeWav } from "../src/dsp/wav";

const SAMPLE_RATE = 48000;
const fixtures = path.resolve(import.meta.dirname, "fixtures");

function writeFlac(dir: string, name: string, samples: Float32Array): void {
  const wav = path.join(dir, `${name}.wav`);
  writeFileSync(wav, new Uint8Array(encodeWav(samples, SAMPLE_RATE)));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, path.join(dir, `${name}.flac`)]);
  rmSync(wav);
}

/**
 * A fourteen-second song whose whole melody is the note A2, so the fake
 * microphone (a steady A2) "sings" every phrase correctly. Four phrases; the
 * first, second and fourth share words, so they form one group.
 */
function makeFixtureSong(songsDir: string): void {
  const dir = path.join(songsDir, "test-drone");
  mkdirSync(dir, { recursive: true });
  const durationS = 14;
  const phrases = [
    { start: 2, words: ["la", "la", "la", "la"] },
    { start: 5, words: ["la", "la", "la", "la"] },
    { start: 8, words: ["oh", "oh", "oh"] },
    { start: 11, words: ["la", "la", "la", "la"] },
  ];
  const notes = phrases.flatMap((phrase, p) =>
    phrase.words.map((text, i) => ({ t: phrase.start + i * 0.5, d: 0.5, midi: 45, cents: 0, text, word: i, line: p, phrase: p, kind: "normal" })),
  );
  const numbered = notes.map((note, id) => ({ id, ...note }));
  const lyrics = {
    offsetS: 0,
    lines: phrases.map((phrase) => ({
      t0: phrase.start,
      t1: phrase.start + phrase.words.length * 0.5,
      text: phrase.words.join(" "),
      words: phrase.words.map((text, i) => ({ t0: phrase.start + i * 0.5, t1: phrase.start + (i + 1) * 0.5, text })),
    })),
  };
  const beats = Array.from({ length: durationS * 2 }, (_, i) => i * 0.5);
  const sung = (t: number) => numbered.some((note) => t >= note.t && t < note.t + note.d);
  const frames = Array.from({ length: durationS * 100 }, (_, i) => sung(i * 0.01));

  const total = durationS * SAMPLE_RATE;
  const tone = harmonicTone({ hz: 110, seconds: durationS, sampleRate: SAMPLE_RATE, level: 0.3 });
  const vocals = new Float32Array(total);
  const instrumental = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    if (sung(t)) vocals[i] = tone[i];
    instrumental[i] = 0.05 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 330 * t));
  }
  writeFlac(dir, "vocals", vocals);
  writeFlac(dir, "instrumental", instrumental);

  const manifest = {
    schema: 1,
    id: "test-drone",
    title: "Test drone",
    artist: "Fixture",
    durationS,
    sampleRate: SAMPLE_RATE,
    sourceHash: "fixture",
    tools: {},
    lyricsSource: "file",
    lyricsNeedReview: false,
    bpm: 120,
    range: { lowMidi: 45, highMidi: 45 },
    typicalRange: { lowMidi: 45, highMidi: 45 },
    bakedKeys: [],
  };
  const write = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value));
  write("manifest.json", manifest);
  write("notes.auto.json", numbered);
  write("notes.json", numbered);
  write("lyrics.json", lyrics);
  write("beats.json", { beats, downbeats: beats.filter((_, i) => i % 4 === 0) });
  write("f0.json", { hopS: 0.01, hz: frames.map((on) => (on ? 110 : 0)), conf: frames.map((on) => (on ? 1 : 0)) });
  writeFileSync(
    path.join(songsDir, "index.json"),
    JSON.stringify([{ id: "test-drone", title: "Test drone", artist: "Fixture", durationS }]),
  );
}

/** Writes what the tests need: the fake microphone's WAV (five seconds of A2) and a small song package. */
export default function globalSetup(): void {
  rmSync(path.join(fixtures, "songs"), { recursive: true, force: true });
  rmSync(path.join(fixtures, "data"), { recursive: true, force: true });
  mkdirSync(fixtures, { recursive: true });
  const tone = harmonicTone({ hz: 110, seconds: 5, sampleRate: SAMPLE_RATE });
  writeFileSync(path.join(fixtures, "a2.wav"), new Uint8Array(encodeWav(tone, SAMPLE_RATE)));
  makeFixtureSong(path.join(fixtures, "songs"));
}
