import { useEffect, useRef } from "react";
import type { AudioEngine } from "../audio/engine";
import { hzToMidi, midiToName } from "../dsp/music";
import type { PitchFrame } from "../pitch/smoother";

const SECONDS = 6;
const LOW_MIDI = 33; // A1
const HIGH_MIDI = 69; // A4
/** Frames further apart than this are not joined into one line. */
const GAP_S = 0.04;

/**
 * The scrolling pitch line. Drawn from a plain array on each animation frame,
 * so the pitch stream never goes through React state.
 */
export function PitchCanvas({ engine }: { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const token = (name: string) => getComputedStyle(canvas).getPropertyValue(name).trim();
    const colors = { rule: token("--color-rule"), mist: token("--color-mist"), brass: token("--color-brass") };

    const frames: PitchFrame[] = [];
    const unsubscribe = engine.onFrame((frame) => {
      frames.push(frame);
      while (frame.t - frames[0].t > SECONDS) frames.shift();
    });

    // Match the backing store to the displayed size so lines stay sharp.
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let animation = 0;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas;
      const padding = 12 * ratio;
      const y = (midi: number) =>
        height - padding - ((midi - LOW_MIDI) / (HIGH_MIDI - LOW_MIDI)) * (height - 2 * padding);
      g.clearRect(0, 0, width, height);

      // One hairline per semitone; the octave lines (C) are stronger and labeled.
      g.lineWidth = ratio;
      g.font = `500 ${11 * ratio}px "Instrument Sans Variable", sans-serif`;
      g.textBaseline = "bottom";
      for (let midi = LOW_MIDI; midi <= HIGH_MIDI; midi++) {
        const isC = midi % 12 === 0;
        g.globalAlpha = isC ? 1 : 0.35;
        g.strokeStyle = colors.rule;
        g.beginPath();
        g.moveTo(0, Math.round(y(midi)) + 0.5);
        g.lineTo(width, Math.round(y(midi)) + 0.5);
        g.stroke();
        if (isC) {
          g.fillStyle = colors.mist;
          g.fillText(midiToName(midi), 0, y(midi) - 3 * ratio);
        }
      }
      g.globalAlpha = 1;

      // The voice.
      const now = frames.length > 0 ? frames[frames.length - 1].t : 0;
      const right = width - 10 * ratio;
      const x = (t: number) => right - ((now - t) / SECONDS) * right;
      g.strokeStyle = colors.brass;
      g.fillStyle = colors.brass;
      g.lineWidth = 2 * ratio;
      g.lineJoin = "round";
      g.lineCap = "round";
      let previous: PitchFrame | null = null;
      g.beginPath();
      for (const frame of frames) {
        if (frame.hz === null) {
          previous = null;
          continue;
        }
        const px = x(frame.t);
        const py = y(hzToMidi(frame.hz));
        if (previous && frame.t - previous.t <= GAP_S) g.lineTo(px, py);
        else g.moveTo(px, py);
        previous = frame;
      }
      g.stroke();
      const last = frames[frames.length - 1];
      if (last && last.hz !== null) {
        g.beginPath();
        g.arc(x(last.t), y(hzToMidi(last.hz)), 4 * ratio, 0, 2 * Math.PI);
        g.fill();
      }
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);

    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(animation);
    };
  }, [engine]);

  return <canvas ref={ref} role="img" aria-label="Your pitch over the last six seconds" className="block h-80 w-full" />;
}
