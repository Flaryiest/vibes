import { createContext, useContext, useState, type ReactNode } from "react";
import { AudioEngine, type EngineInfo } from "../audio/engine";

export type EngineStatus = "idle" | "starting" | "running" | "error";

type EngineState = {
  engine: AudioEngine | null;
  info: EngineInfo | null;
  status: EngineStatus;
  error: string;
  start: () => Promise<void>;
};

const EngineContext = createContext<EngineState | null>(null);

/** "?mic=fake" lets the end-to-end tests use Chrome's fake microphone. */
export const fakeMic = new URLSearchParams(location.search).get("mic") === "fake";

function explain(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it in Chrome's site settings for this page, then reload.";
  }
  return cause instanceof Error ? cause.message : String(cause);
}

/** Holds the one audio engine that every screen shares. */
export function EngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [error, setError] = useState("");

  async function start() {
    if (status === "starting" || status === "running") return;
    setStatus("starting");
    try {
      const created = new AudioEngine(fakeMic ? { micPattern: /Fake.*Input/i } : {});
      const started = await created.start();
      created.onDeviceChange(setInfo);
      setEngine(created);
      setInfo(started);
      setStatus("running");
    } catch (cause) {
      setError(explain(cause));
      setStatus("error");
    }
  }

  return <EngineContext.Provider value={{ engine, info, status, error, start }}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineState {
  const state = useContext(EngineContext);
  if (!state) throw new Error("useEngine must be used inside EngineProvider.");
  return state;
}
