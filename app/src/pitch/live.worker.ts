import { LiveAnalyzer, type AnalyzerConfig } from "./liveAnalyzer";

export type LiveWorkerMessage =
  | { type: "config"; config: AnalyzerConfig }
  | { type: "gate"; rmsMin: number }
  | { type: "chunk"; samples: Float32Array; frame0: number };

let analyzer: LiveAnalyzer | null = null;

self.addEventListener("message", (event: MessageEvent<LiveWorkerMessage>) => {
  const message = event.data;
  if (message.type === "config") {
    analyzer = new LiveAnalyzer(message.config);
  } else if (message.type === "gate") {
    analyzer?.setRmsMin(message.rmsMin);
  } else if (analyzer) {
    const frame = analyzer.push(message.samples, message.frame0);
    if (frame) (self as unknown as Worker).postMessage(frame);
  }
});
