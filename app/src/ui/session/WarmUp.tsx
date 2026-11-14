import { useEffect, useRef, useState } from "react";
import type { AudioEngine } from "../../audio/engine";
import { PitchCanvas } from "../PitchCanvas";
import { headlineClass } from "../lab/styles";

const BREATHS = 3;

/** Breathing first, then easy slides across the range. Nothing here is scored. */
export function WarmUp({ engine, seconds, onDone }: { engine: AudioEngine; seconds: number; onDone: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const now = (Date.now() - startedAt) / 1000;
      setElapsed(now);
      if (now >= seconds) {
        clearInterval(timer);
        done.current();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [seconds]);

  // The first quarter is breathing, at most 45 seconds of it.
  const breathingS = Math.min(45, seconds / 4);
  if (elapsed < breathingS) {
    const cycle = breathingS / BREATHS;
    const breathingIn = elapsed % cycle < cycle / 3;
    return (
      <div className="pt-12">
        <p className={`min-h-[2.5em] ${headlineClass}`}>{breathingIn ? "Breathe in" : "Hiss out slowly"}</p>
        <p className="max-w-prose text-mist">Loosen your neck and shoulders. Three slow breaths, low into the belly.</p>
      </div>
    );
  }
  return (
    <div className="pt-12">
      <p className={`min-h-[2.5em] ${headlineClass}`}>Slide from low to high and back.</p>
      <p className="max-w-prose text-mist">
        On a lip trill or a hum, as easy as a sigh. Stay inside what is comfortable. Nothing here is scored.
      </p>
      <div className="mt-8">
        <PitchCanvas engine={engine} />
      </div>
    </div>
  );
}
