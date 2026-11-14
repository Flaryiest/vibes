import { useEffect, useRef } from "react";
import type { AudioEngine } from "../audio/engine";
import { describePitch } from "../dsp/music";
import { AudioGate } from "./AudioGate";
import { PitchCanvas } from "./PitchCanvas";
import { CalibrationPanel } from "./lab/CalibrationPanel";
import { ChecksPanel } from "./lab/ChecksPanel";
import { ClipPanel } from "./lab/ClipPanel";
import { LeakagePanel } from "./lab/LeakagePanel";
import { StatusPanel } from "./lab/StatusPanel";
import { StretchPanel } from "./lab/StretchPanel";

/** The current note, large, with the raw numbers beside it and the pitch line beneath. */
function LiveReadout({ engine }: { engine: AudioEngine }) {
  const readoutRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLSpanElement>(null);
  const octaveRef = useRef<HTMLSpanElement>(null);
  const hzRef = useRef<HTMLSpanElement>(null);
  const centsRef = useRef<HTMLSpanElement>(null);
  const clarityRef = useRef<HTMLSpanElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      // Written straight to the DOM so the pitch stream never enters React state.
      engine.onFrame((frame) => {
        const readout = readoutRef.current;
        if (!readout) return;
        const pitch = frame.hz === null ? null : describePitch(frame.hz);
        readout.dataset.voiced = String(pitch !== null);
        // Between notes the last note stays on screen, dimmed, so the display does not jump.
        if (pitch) {
          letterRef.current!.textContent = pitch.name.slice(0, -1);
          octaveRef.current!.textContent = pitch.name.slice(-1);
        }
        hzRef.current!.textContent = pitch ? `${frame.hz!.toFixed(1)} Hz` : "";
        centsRef.current!.textContent = pitch ? `${pitch.cents < 0 ? "−" : "+"}${Math.abs(pitch.cents)} cents` : "";
        clarityRef.current!.textContent = `clarity ${frame.clarity.toFixed(2)}`;
        levelRef.current!.textContent =
          frame.rms > 0 ? `−${Math.abs(Math.round(20 * Math.log10(frame.rms)))} dB` : "silent";
      }),
    [engine],
  );

  return (
    <section aria-label="Live pitch" className="pb-12 pt-12">
      <div
        ref={readoutRef}
        data-voiced="false"
        className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pb-6 transition-colors data-[voiced=false]:text-mist/50"
      >
        <p data-testid="pitch-name" className="text-[9rem] font-medium leading-[0.85] tracking-tight [font-stretch:75%]">
          <span ref={letterRef}>&nbsp;</span>
          <span ref={octaveRef} className="relative top-[0.1em] ml-1 text-[0.36em] tracking-normal text-mist" />
        </p>
        <p className="grid grid-cols-[5.5rem_5.5rem_6.5rem_4.5rem] pb-2 text-right text-sm tabular-nums text-mist">
          <span ref={hzRef} />
          <span ref={centsRef} />
          <span ref={clarityRef} />
          <span ref={levelRef} />
        </p>
      </div>
      <PitchCanvas engine={engine} />
    </section>
  );
}

export function Lab() {
  return (
    <AudioGate
      prompt="Check that the microphone hears you and the pitch line follows your voice."
      requireBuiltIn={false}
    >
      {(engine, info) => (
        <div data-panels>
          <LiveReadout engine={engine} />
          <StatusPanel info={info} />
          <CalibrationPanel engine={engine} info={info} />
          <ClipPanel engine={engine} />
          <LeakagePanel engine={engine} />
          <StretchPanel />
          <ChecksPanel />
        </div>
      )}
    </AudioGate>
  );
}
