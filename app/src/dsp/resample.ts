/**
 * Mono samples in [-1, 1] at `fromRate`, as 16-bit samples at `toRate`. Louder
 * samples are clipped.
 *
 * When `fromRate` is a whole multiple of `toRate` (48 kHz to 16 kHz), each
 * group of samples is averaged into one, which also removes most of what the
 * lower rate cannot carry. Otherwise the new samples are read off straight
 * lines between the old ones.
 */
export function toPcm16(samples: Float32Array, fromRate: number, toRate: number): Int16Array<ArrayBuffer> {
  const ratio = fromRate / toRate;
  const out = new Int16Array(Math.floor(samples.length / ratio));
  const store = (i: number, value: number) => {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
  };
  if (Number.isInteger(ratio)) {
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      for (let j = 0; j < ratio; j++) sum += samples[i * ratio + j];
      store(i, sum / ratio);
    }
  } else {
    for (let i = 0; i < out.length; i++) {
      const position = i * ratio;
      const before = Math.floor(position);
      const after = Math.min(before + 1, samples.length - 1);
      store(i, samples[before] + (samples[after] - samples[before]) * (position - before));
    }
  }
  return out;
}
