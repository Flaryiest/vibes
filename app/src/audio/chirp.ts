/** A short rising sweep with a smooth start and end. Its correlation peak is one sample wide. */
export function makeChirp(sampleRate: number, ms = 30, fromHz = 1500, toHz = 6000): Float32Array<ArrayBuffer> {
  const n = Math.round((sampleRate * ms) / 1000);
  const out = new Float32Array(n);
  const duration = n / sampleRate;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * (fromHz * t + ((toHz - fromHz) * t * t) / (2 * duration));
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    out[i] = Math.sin(phase) * window;
  }
  return out;
}

/**
 * Finds where `reference` best matches inside `captured`, trying start
 * positions `from` to `to` inclusive. `to` must be at most
 * `captured.length - reference.length`.
 */
export function findDelay(
  captured: Float32Array,
  reference: Float32Array,
  from: number,
  to: number,
): { index: number; score: number } {
  let referenceEnergy = 0;
  for (let j = 0; j < reference.length; j++) referenceEnergy += reference[j] * reference[j];
  let best = { index: from, score: -Infinity };
  for (let start = from; start <= to; start++) {
    let dot = 0;
    let energy = 0;
    for (let j = 0; j < reference.length; j++) {
      const sample = captured[start + j];
      dot += sample * reference[j];
      energy += sample * sample;
    }
    const score = dot / Math.sqrt(energy * referenceEnergy + 1e-12);
    if (score > best.score) best = { index: start, score };
  }
  return best;
}
