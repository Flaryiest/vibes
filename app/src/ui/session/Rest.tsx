import { useEffect, useRef, useState } from "react";
import { headlineClass, quietButtonClass } from "../lab/styles";

/** A short silent break. The voice recovers quickly when it gets one. */
export function Rest({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(Math.ceil(seconds));
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const remaining = seconds - (Date.now() - startedAt) / 1000;
      setLeft(Math.max(0, Math.ceil(remaining)));
      if (remaining <= 0) {
        clearInterval(timer);
        done.current();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [seconds]);

  return (
    <div className="pt-12">
      <p className={headlineClass}>Rest. Drink some water.</p>
      <p className="mt-3 tabular-nums text-mist">{left} seconds</p>
      <button onClick={() => done.current()} className={`mt-8 ${quietButtonClass}`}>
        Continue now
      </button>
    </div>
  );
}
