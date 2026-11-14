import type { EngineInfo } from "../../audio/engine";
import { Panel } from "./Panel";

const onOff = (value: unknown) => (value === false ? "off" : value === true ? "on" : "not reported");

export function StatusPanel({ info }: { info: EngineInfo }) {
  const rows: [string, string][] = [
    ["Microphone", info.micLabel],
    ["Built-in microphone in use", info.micIsBuiltIn ? "Yes" : "No"],
    ["Output", info.outputLabel || "Not reported"],
    ["Route guess", info.outputKind],
    ["Sample rate", `${info.sampleRate} Hz`],
    ["Echo cancellation", onOff(info.applied.echoCancellation)],
    ["Noise suppression", onOff(info.applied.noiseSuppression)],
    ["Automatic gain control", onOff(info.applied.autoGainControl)],
    ["Channels", String(info.applied.channelCount ?? "not reported")],
    ["Browser base latency", `${info.baseLatencyMs.toFixed(1)} ms`],
    ["Reported output latency", `${info.outputLatencyMs.toFixed(1)} ms`],
  ];
  return (
    <Panel title="Status">
      <dl className="grid grid-cols-[minmax(0,14rem)_1fr] gap-x-6 gap-y-1.5 text-sm tabular-nums">
        {rows.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-mist">{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {info.warnings.map((warning) => (
        <p key={warning} className="text-sm text-signal">
          {warning}
        </p>
      ))}
    </Panel>
  );
}
