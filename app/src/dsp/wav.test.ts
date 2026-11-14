import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

describe("encodeWav", () => {
  const wav = new DataView(encodeWav(Float32Array.from([0, 0.5, -1, 2]), 48000));
  const text = (offset: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(offset + i)));

  it("writes a 16-bit mono PCM header", () => {
    expect(text(0)).toBe("RIFF");
    expect(text(8)).toBe("WAVE");
    expect(wav.getUint16(20, true)).toBe(1); // PCM
    expect(wav.getUint16(22, true)).toBe(1); // mono
    expect(wav.getUint32(24, true)).toBe(48000);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(wav.getUint32(40, true)).toBe(8);
    expect(wav.byteLength).toBe(44 + 8);
  });

  it("scales samples and clips out-of-range values", () => {
    expect(wav.getInt16(44, true)).toBe(0);
    expect(wav.getInt16(46, true)).toBe(16384);
    expect(wav.getInt16(48, true)).toBe(-32767);
    expect(wav.getInt16(50, true)).toBe(32767);
  });
});
