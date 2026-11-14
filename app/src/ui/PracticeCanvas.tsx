import { useEffect, useRef } from "react";
import type { AudioEngine } from "../audio/engine";
import { hzToMidi } from "../dsp/music";
import type { PitchFrame } from "../pitch/smoother";
import type { Repetition } from "../practice/repetition";
import type { NoteResult } from "../scoring/notes";

type View = { repetition: Repetition | null; showTrace: boolean; results: NoteResult[] | null };

/**
 * One repetition, left to right: outlined notes to listen to, then filled notes
 * to sing, with a playhead moving across. The learner's pitch is drawn in brass
 * when `showTrace` is set, and a note that was hit turns brass.
 */
export function PracticeCanvas({ engine, repetition, showTrace, results }: View & { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ repetition, showTrace, results });

  useEffect(() => {
    view.current = { repetition, showTrace, results };
  }, [repetition, showTrace, results]);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const token = (name: string) => getComputedStyle(canvas).getPropertyValue(name).trim();
    const colors = { rule: token("--color-rule"), chalk: token("--color-chalk"), brass: token("--color-brass") };

    const frames: PitchFrame[] = [];
    const unsubscribe = engine.onFrame((frame) => {
      frames.push(frame);
      while (frame.t - frames[0].t > 15) frames.shift();
    });

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
      g.clearRect(0, 0, width, height);
      const current = view.current;
      if (current.repetition) {
        const { exercise, listenAt, singAt, endAt } = current.repetition;
        const midis = exercise.notes.map((note) => note.midi);
        const low = Math.min(...midis) - 5;
        const high = Math.max(...midis) + 5;
        const x = (t: number) => ((t - listenAt) / (endAt - listenAt)) * width;
        const y = (midi: number) => height - ((midi - low) / (high - low)) * height;

        // One hairline per semitone.
        g.lineWidth = ratio;
        g.strokeStyle = colors.rule;
        g.globalAlpha = 0.35;
        for (let midi = low; midi <= high; midi++) {
          const py = Math.round(y(midi)) + 0.5;
          g.beginPath();
          g.moveTo(0, py);
          g.lineTo(width, py);
          g.stroke();
        }

        // The line between listening and singing.
        g.globalAlpha = 1;
        const divide = Math.round(x(singAt - 0.25)) + 0.5;
        g.beginPath();
        g.moveTo(divide, 0);
        g.lineTo(divide, height);
        g.stroke();

        // Each note is one semitone tall: singing inside the bar is in tune.
        const bar = (start: number, note: { t: number; d: number; midi: number }) => {
          const left = x(start + note.t);
          const top = y(note.midi + 0.5);
          g.beginPath();
          g.roundRect(left, top, x(start + note.t + note.d) - left, y(note.midi - 0.5) - top, 4 * ratio);
        };
        for (const note of exercise.notes) {
          bar(listenAt, note);
          g.globalAlpha = 0.5;
          g.strokeStyle = colors.chalk;
          g.stroke();

          const hit = current.results?.find((r) => r.id === note.id)?.outcome === "hit";
          bar(singAt, note);
          g.globalAlpha = hit ? 0.45 : 0.14;
          g.fillStyle = hit ? colors.brass : colors.chalk;
          g.fill();
        }
        g.globalAlpha = 1;

        // The learner's voice, only during the response.
        if (current.showTrace) {
          g.strokeStyle = colors.brass;
          g.lineWidth = 2 * ratio;
          g.lineJoin = "round";
          g.lineCap = "round";
          let previous: PitchFrame | null = null;
          g.beginPath();
          for (const frame of frames) {
            if (frame.hz === null || frame.t < singAt - 0.3 || frame.t > endAt) {
              previous = null;
              continue;
            }
            const px = x(frame.t);
            const py = y(hzToMidi(frame.hz));
            if (previous && frame.t - previous.t <= 0.04) g.lineTo(px, py);
            else g.moveTo(px, py);
            previous = frame;
          }
          g.stroke();
        }

        // The playhead.
        const now = engine.ctx.currentTime;
        if (now >= listenAt && now <= endAt) {
          const px = Math.round(x(now)) + 0.5;
          g.strokeStyle = colors.chalk;
          g.globalAlpha = 0.6;
          g.lineWidth = ratio;
          g.beginPath();
          g.moveTo(px, 0);
          g.lineTo(px, height);
          g.stroke();
          g.globalAlpha = 1;
        }
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

  return <canvas ref={ref} role="img" aria-label="The notes to sing, and your pitch" className="block h-64 w-full" />;
}
