import { useRef, useState } from "react";
import { AudioEngine, type EngineInfo } from "../audio/engine";
import { describePitch } from "../dsp/music";
import { PitchCanvas } from "./PitchCanvas";
import { CalibrationPanel } from "./lab/CalibrationPanel";
import { ChecksPanel } from "./lab/ChecksPanel";
import { ClipPanel } from "./lab/ClipPanel";
import { LeakagePanel } from "./lab/LeakagePanel";
import { StatusPanel } from "./lab/StatusPanel";
import { buttonClass } from "./lab/styles";

// "?mic=fake" lets the end-to-end test use Chrome's fake microphone.
const fakeMic = new URLSearchParams(location.search).get("mic") === "fake";

type Status = "idle" | "starting" | "running" | "error";
const STATUS_TEXT: Record<Status, string> = { idle: "", starting: "Starting", running: "Listening", error: "Stopped" };

function explain(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it in Chrome's site settings for this page, then reload.";
  }
  return cause instanceof Error ? cause.message : String(cause);
}

export function Lab() {
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const readoutRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLSpanElement>(null);
  const octaveRef = useRef<HTMLSpanElement>(null);
  const hzRef = useRef<HTMLSpanElement>(null);
  const centsRef = useRef<HTMLSpanElement>(null);
  const clarityRef = useRef<HTMLSpanElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);

  async function start() {
    setStatus("starting");
    try {
      const created = new AudioEngine(fakeMic ? { micPattern: /Fake.*Input/i } : {});
      const started = await created.start();
      // Written straight to the DOM so the pitch stream never enters React state.
      created.onFrame((frame) => {
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
      });
      created.onDeviceChange(setInfo);
      setEngine(created);
      setInfo(started);
      setStatus("running");
    } catch (cause) {
      setError(explain(cause));
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 pb-24 pt-8 sm:px-10">
      <header className="flex items-baseline justify-between text-sm">
        <h1 className="font-medium">Audio lab</h1>
        <span data-testid="engine-status" data-state={status} className="text-mist">
          {STATUS_TEXT[status]}
        </span>
      </header>

      {!engine && (
        <div className="pt-[22vh]">
          <p className="max-w-lg text-3xl leading-tight [font-stretch:87%]">
            Check that the microphone hears you and the pitch line follows your voice.
          </p>
          <button onClick={start} disabled={status === "starting"} className={`mt-8 ${buttonClass}`}>
            Start audio
          </button>
          {status === "error" && <p className="mt-6 max-w-lg text-signal">{error}</p>}
        </div>
      )}

      {engine && info && (
        <div data-panels>
          <section aria-label="Live pitch" className="pb-12 pt-12">
            <div
              ref={readoutRef}
              data-voiced="false"
              className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pb-6 transition-colors data-[voiced=false]:text-mist/50"
            >
              <p
                data-testid="pitch-name"
                className="text-[9rem] font-medium leading-[0.85] tracking-tight [font-stretch:75%]"
              >
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
          <StatusPanel info={info} />
          <CalibrationPanel engine={engine} info={info} />
          <ClipPanel engine={engine} />
          <LeakagePanel engine={engine} />
          <ChecksPanel />
        </div>
      )}
    </main>
  );
}
