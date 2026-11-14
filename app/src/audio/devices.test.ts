import { describe, expect, it } from "vitest";
import {
  classifyOutput,
  defaultOutputLabel,
  micConstraints,
  pickMic,
  processingWarnings,
  routeKey,
  type DeviceInfo,
} from "./devices";

// What Chrome lists on a MacBook Pro once AirPods have connected and macOS has made them the default.
const WITH_AIRPODS: DeviceInfo[] = [
  { kind: "audioinput", deviceId: "default", label: "Default - AirPods Pro" },
  { kind: "audioinput", deviceId: "a1", label: "AirPods Pro" },
  { kind: "audioinput", deviceId: "b2", label: "MacBook Pro Microphone (Built-in)" },
  { kind: "audiooutput", deviceId: "default", label: "Default - AirPods Pro" },
  { kind: "audiooutput", deviceId: "c3", label: "MacBook Pro Speakers (Built-in)" },
];

const WITHOUT_AIRPODS: DeviceInfo[] = [
  { kind: "audioinput", deviceId: "default", label: "Default - MacBook Pro Microphone (Built-in)" },
  { kind: "audioinput", deviceId: "b2", label: "MacBook Pro Microphone (Built-in)" },
  { kind: "audiooutput", deviceId: "default", label: "Default - MacBook Pro Speakers (Built-in)" },
  { kind: "audiooutput", deviceId: "c3", label: "MacBook Pro Speakers (Built-in)" },
];

describe("pickMic", () => {
  it("picks the built-in microphone even when AirPods are the default input", () => {
    expect(pickMic(WITH_AIRPODS)?.deviceId).toBe("b2");
  });

  it("never picks the Default entry, even when it is the built-in microphone", () => {
    expect(pickMic(WITHOUT_AIRPODS)?.deviceId).toBe("b2");
  });

  it("returns null when no built-in microphone is listed", () => {
    expect(pickMic(WITH_AIRPODS.filter((d) => d.deviceId !== "b2"))).toBeNull();
  });

  it("accepts another pattern for tests", () => {
    const fake: DeviceInfo[] = [
      { kind: "audioinput", deviceId: "default", label: "Fake Default Audio Input" },
      { kind: "audioinput", deviceId: "f1", label: "Fake Audio Input 1" },
    ];
    expect(pickMic(fake, /Fake.*Input/i)?.deviceId).toBe("f1");
  });
});

describe("micConstraints", () => {
  it("pins the device and turns all processing off", () => {
    expect(micConstraints("b2")).toEqual({
      audio: {
        deviceId: { exact: "b2" },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  });
});

describe("processingWarnings", () => {
  it("is empty when everything is off or unreported", () => {
    expect(processingWarnings({ echoCancellation: false, noiseSuppression: false, autoGainControl: false })).toEqual([]);
    expect(processingWarnings({})).toEqual([]);
  });

  it("names each flag that is still on", () => {
    const warnings = processingWarnings({ echoCancellation: true, noiseSuppression: false, autoGainControl: true });
    expect(warnings).toEqual(["Echo cancellation is still on.", "Automatic gain control is still on."]);
  });
});

describe("output", () => {
  it("reads the default output label without Chrome's prefix", () => {
    expect(defaultOutputLabel(WITH_AIRPODS)).toBe("AirPods Pro");
    expect(defaultOutputLabel(WITHOUT_AIRPODS)).toBe("MacBook Pro Speakers (Built-in)");
    expect(defaultOutputLabel([])).toBe("");
  });

  it("classifies outputs by label", () => {
    expect(classifyOutput("AirPods Pro")).toBe("headphones");
    expect(classifyOutput("MacBook Pro Speakers (Built-in)")).toBe("speakers");
    expect(classifyOutput("")).toBe("unknown");
  });

  it("builds a route key from both labels", () => {
    expect(routeKey("AirPods Pro", "MacBook Pro Microphone (Built-in)")).toBe(
      "AirPods Pro | MacBook Pro Microphone (Built-in)",
    );
  });
});
