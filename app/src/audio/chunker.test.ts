import { describe, expect, it } from "vitest";
import { Chunker } from "./chunker";

/** A block whose sample values are their own frame numbers. */
function ramp(start: number, length: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => start + i);
}

describe("Chunker", () => {
  it("groups 128-frame blocks into 512-frame chunks", () => {
    const chunks: { first: number; last: number; frame0: number }[] = [];
    const chunker = new Chunker(512, (c, frame0) => chunks.push({ first: c[0], last: c[511], frame0 }));
    for (let frame = 0; frame < 1280; frame += 128) chunker.push(ramp(frame, 128), frame);
    expect(chunks).toEqual([
      { first: 0, last: 511, frame0: 0 },
      { first: 512, last: 1023, frame0: 512 },
    ]);
  });

  it("handles blocks that straddle a chunk boundary", () => {
    const chunks: { first: number; last: number; frame0: number }[] = [];
    const chunker = new Chunker(512, (c, frame0) => chunks.push({ first: c[0], last: c[511], frame0 }));
    for (let frame = 1000; frame < 2500; frame += 300) chunker.push(ramp(frame, 300), frame);
    expect(chunks).toEqual([
      { first: 1000, last: 1511, frame0: 1000 },
      { first: 1512, last: 2023, frame0: 1512 },
    ]);
  });

  it("hands over a new buffer for every chunk", () => {
    const buffers: ArrayBuffer[] = [];
    const chunker = new Chunker(4, (c) => buffers.push(c.buffer));
    chunker.push(ramp(0, 8), 0);
    expect(buffers.length).toBe(2);
    expect(buffers[0]).not.toBe(buffers[1]);
  });
});
