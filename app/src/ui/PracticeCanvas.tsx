import { useEffect, useRef } from "react";
import type { AudioEngine } from "../audio/engine";
import { hzToMidi } from "../dsp/music";
import type { PitchFrame } from "../pitch/smoother";
import type { RepView } from "../practice/repView";
import type { NoteResult } from "../scoring/notes";

type View = { view: RepView | null; showTrace: boolean; results: NoteResult[] | null };

/**
 * One repetition, left to right: outlined notes to listen to, then filled notes
 * to sing, with a playhead moving across. The learner's pitch is drawn in brass
 * when `showTrace` is set, and a note that was hit turns brass.
 */
export function PracticeCanvas({ engine, view, showTrace, results }: View & { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef<View>({ view, showTrace, results });

  useEffect(() => {
    latest.current = { view, showTrace, results };
  }, [view, showTrace, results]);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const token = (name: string) => getComputedStyle(canvas).getPropertyValue(name).trim();
    const colors = {
      rule: token("--color-rule"),
      chalk: token("--color-chalk"),
      mist: token("--color-mist"),
      brass: token("--color-brass"),
    };

    const frames: PitchFrame[] = [];
    const unsubscribe = engine.onFrame((frame) => {
      frames.push(frame);
      while (frame.t - frames[0].t > 30) frames.shift();
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
      const current = latest.current;
      const rep = current.view;
      if (rep && rep.notes.length > 0) {
        const midis = rep.notes.map((note) => note.midi);
        const low = Math.min(...midis) - 5;
        const high = Math.max(...midis) + 5;
        const textRoom = 18 * ratio;
        const x = (t: number) => ((t - rep.startAt) / (rep.endAt - rep.startAt)) * width;
        const y = (midi: number) => height - textRoom - ((midi - low) / (high - low)) * (height - textRoom);

        // One hairline per semitone.
        g.lineWidth = ratio;
        g.strokeStyle = colors.rule;
        g.globalAlpha = 0.35;
        for (let midi = Math.ceil(low); midi <= high; midi++) {
          const py = Math.round(y(midi)) + 0.5;
          g.beginPath();
          g.moveTo(0, py);
          g.lineTo(width, py);
          g.stroke();
        }
        g.globalAlpha = 1;

        // The line between listening and singing.
        if (rep.listenAt !== null && rep.singAt !== null) {
          const divide = Math.round(x(rep.singAt - 0.15)) + 0.5;
          g.beginPath();
          g.moveTo(divide, 0);
          g.lineTo(divide, height);
          g.stroke();
        }

        // Each note is one semitone tall: singing inside the bar is in tune.
        const bar = (start: number, note: { t: number; d: number; midi: number }) => {
          const left = x(start + note.t);
          const top = y(note.midi + 0.5);
          g.beginPath();
          g.roundRect(left, top, Math.max(2, x(start + note.t + note.d) - left - ratio), y(note.midi - 0.5) - top, 4 * ratio);
        };
        g.font = `${12 * ratio}px "Instrument Sans Variable", sans-serif`;
        g.textBaseline = "top";
        for (const note of rep.notes) {
          if (rep.listenAt !== null) {
            bar(rep.listenAt, note);
            g.globalAlpha = 0.5;
            g.strokeStyle = colors.chalk;
            g.stroke();
          }
          if (rep.singAt !== null) {
            const hit = current.results?.find((r) => r.id === note.id)?.outcome === "hit";
            bar(rep.singAt, note);
            g.globalAlpha = hit ? 0.45 : 0.14;
            g.fillStyle = hit ? colors.brass : colors.chalk;
            g.fill();
          }
          if (note.text) {
            g.globalAlpha = 1;
            g.fillStyle = colors.mist;
            g.fillText(note.text, x((rep.singAt ?? rep.listenAt ?? rep.startAt) + note.t), y(note.midi - 0.5) + 4 * ratio);
          }
        }
        g.globalAlpha = 1;

        // The original singer's line, while listening.
        if (rep.curve && rep.listenAt !== null) {
          g.strokeStyle = colors.mist;
          g.lineWidth = 1.5 * ratio;
          g.lineJoin = "round";
          let previousT = -Infinity;
          g.beginPath();
          for (const point of rep.curve) {
            const px = x(rep.listenAt + point.t);
            const py = y(point.midi);
            if (point.t - previousT <= 0.05) g.lineTo(px, py);
            else g.moveTo(px, py);
            previousT = point.t;
          }
          g.stroke();
        }

        // The learner's voice, only during the response.
        if (current.showTrace && rep.singAt !== null) {
          g.strokeStyle = colors.brass;
          g.lineWidth = 2 * ratio;
          g.lineJoin = "round";
          g.lineCap = "round";
          let previous: PitchFrame | null = null;
          g.beginPath();
          for (const frame of frames) {
            if (frame.hz === null || frame.t < rep.singAt - 0.3 || frame.t > rep.endAt) {
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
        if (now >= rep.startAt && now <= rep.endAt) {
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
