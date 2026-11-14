import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { harmonicTone } from "../src/dsp/synth";
import { encodeWav } from "../src/dsp/wav";

/** Writes the WAV file that Chrome plays as its fake microphone: five seconds of A2 (110 Hz). */
export default function globalSetup(): void {
  const directory = path.resolve(import.meta.dirname, "fixtures");
  mkdirSync(directory, { recursive: true });
  const tone = harmonicTone({ hz: 110, seconds: 5, sampleRate: 48000 });
  writeFileSync(path.join(directory, "a2.wav"), new Uint8Array(encodeWav(tone, 48000)));
}
