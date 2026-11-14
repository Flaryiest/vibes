import type { ReactNode } from "react";
import type { AudioEngine, EngineInfo } from "../audio/engine";
import { useEngine } from "./engine";
import { buttonClass, headlineClass } from "./lab/styles";

/** Asks for the microphone once, then shows its children. The browser only starts audio from a click. */
export function AudioGate({
  prompt,
  requireBuiltIn = true,
  children,
}: {
  prompt: string;
  /** When true, nothing is shown unless the live microphone is the MacBook's own. */
  requireBuiltIn?: boolean;
  children: (engine: AudioEngine, info: EngineInfo) => ReactNode;
}) {
  const { engine, info, status, error, start } = useEngine();
  if (engine && info) {
    if (requireBuiltIn && !info.micIsBuiltIn) {
      return (
        <p className="max-w-lg pt-[18vh] text-signal">
          The microphone in use is not the MacBook's own, so scores would be unreliable. Close System Settings › Sound
          and any call apps, then reload this page.
        </p>
      );
    }
    return <>{children(engine, info)}</>;
  }
  return (
    <div className="pt-[18vh]">
      <p className={headlineClass}>{prompt}</p>
      <button onClick={() => void start()} disabled={status === "starting"} className={`mt-8 ${buttonClass}`}>
        Start audio
      </button>
      {status === "error" && <p className="mt-6 max-w-lg text-signal">{error}</p>}
    </div>
  );
}
