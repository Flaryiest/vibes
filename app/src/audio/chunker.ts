/**
 * Collects audio blocks of any length into fixed-size chunks. Each chunk is a
 * new buffer, so the receiver may transfer it to another thread.
 */
export class Chunker {
  private buffer: Float32Array<ArrayBuffer>;
  private fill = 0;
  private frame0 = 0;
  private readonly size: number;
  private readonly emit: (chunk: Float32Array<ArrayBuffer>, frame0: number) => void;

  constructor(size: number, emit: (chunk: Float32Array<ArrayBuffer>, frame0: number) => void) {
    this.size = size;
    this.emit = emit;
    this.buffer = new Float32Array(size);
  }

  /** `blockFrame` is the audio-clock frame number of the block's first sample. */
  push(block: Float32Array, blockFrame: number): void {
    let offset = 0;
    while (offset < block.length) {
      if (this.fill === 0) this.frame0 = blockFrame + offset;
      const n = Math.min(this.size - this.fill, block.length - offset);
      this.buffer.set(block.subarray(offset, offset + n), this.fill);
      this.fill += n;
      offset += n;
      if (this.fill === this.size) {
        const full = this.buffer;
        this.buffer = new Float32Array(this.size);
        this.fill = 0;
        this.emit(full, this.frame0);
      }
    }
  }
}
