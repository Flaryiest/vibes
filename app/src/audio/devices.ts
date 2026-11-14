export type DeviceInfo = { kind: string; label: string; deviceId: string };

export const BUILT_IN_MIC = /MacBook.*Microphone/i;

const isDefaultEntry = (d: DeviceInfo): boolean => d.deviceId === "default" || /^Default\b/i.test(d.label);

/**
 * Chooses the microphone by label. Chrome adds a "Default - ..." entry that
 * follows the system default, which becomes the AirPods when they connect, so
 * that entry is never used.
 */
export function pickMic(devices: DeviceInfo[], pattern: RegExp = BUILT_IN_MIC): DeviceInfo | null {
  return devices.find((d) => d.kind === "audioinput" && !isDefaultEntry(d) && pattern.test(d.label)) ?? null;
}

export function micConstraints(deviceId: string): MediaStreamConstraints {
  return {
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  };
}

export function processingWarnings(settings: {
  echoCancellation?: boolean | string;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}): string[] {
  const warnings: string[] = [];
  if (settings.echoCancellation !== undefined && settings.echoCancellation !== false) {
    warnings.push("Echo cancellation is still on.");
  }
  if (settings.noiseSuppression === true) warnings.push("Noise suppression is still on.");
  if (settings.autoGainControl === true) warnings.push("Automatic gain control is still on.");
  return warnings;
}

/** The label of the system default output, or "" when the browser does not report one. */
export function defaultOutputLabel(devices: DeviceInfo[]): string {
  const entry = devices.find((d) => d.kind === "audiooutput" && d.deviceId === "default");
  return entry ? entry.label.replace(/^Default\s*-\s*/i, "") : "";
}

export type OutputKind = "headphones" | "speakers" | "unknown";

export function classifyOutput(label: string): OutputKind {
  if (/AirPods|Beats|Headphones|Buds|Bose|Sony/i.test(label)) return "headphones";
  if (/Speakers/i.test(label)) return "speakers";
  return "unknown";
}

export const routeKey = (outputLabel: string, inputLabel: string): string => `${outputLabel} | ${inputLabel}`;
