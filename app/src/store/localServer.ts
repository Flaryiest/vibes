const LOCAL_SERVER_HEALTH_ROUTE = "/api/health";

/** What came back when the app asked whether the trainer's own server is behind this page. */
export enum LocalServerProbeOutcome {
  /** The trainer's server on the learner's Mac replied. */
  LOCAL_SERVER_REPLIED = "local-server-replied",
  /** Something replied, but not that server: a static host's missing-page error, or the app's own page. */
  ANOTHER_HOST_REPLIED = "another-host-replied",
  /** Nothing replied at all: the network is down, or the server is stopped or restarting. */
  NOTHING_REPLIED = "nothing-replied",
}

export async function probeLocalServer(): Promise<LocalServerProbeOutcome> {
  let response: Response;
  try {
    response = await fetch(LOCAL_SERVER_HEALTH_ROUTE);
  } catch {
    return LocalServerProbeOutcome.NOTHING_REPLIED;
  }
  if (!response.ok) return LocalServerProbeOutcome.ANOTHER_HOST_REPLIED;

  let reply: unknown;
  try {
    reply = await response.json();
  } catch {
    // A web page rather than the server's reply.
    return LocalServerProbeOutcome.ANOTHER_HOST_REPLIED;
  }
  const isLocalServerReply = typeof reply === "object" && reply !== null && (reply as { ok?: unknown }).ok === true;
  return isLocalServerReply ? LocalServerProbeOutcome.LOCAL_SERVER_REPLIED : LocalServerProbeOutcome.ANOTHER_HOST_REPLIED;
}

let rememberedAnswer: boolean | null = null;
let probeInFlight: Promise<LocalServerProbeOutcome> | null = null;

/** One probe at a time, shared by everything that asks while it is under way. */
function probeOnce(): Promise<LocalServerProbeOutcome> {
  probeInFlight ??= probeLocalServer().finally(() => {
    probeInFlight = null;
  });
  return probeInFlight;
}

/**
 * Whether this copy of the app is served by the server on the learner's Mac,
 * which reads the songs folder and writes backups to disk. Without it (the
 * copy on the web) songs and backups stay in the browser.
 *
 * A reply settles it for as long as the page is open, since a page cannot
 * move from one host to another. Silence is treated as "no" for now but not
 * remembered, so a server that was only restarting is found again next time.
 */
export async function hasLocalServer(): Promise<boolean> {
  if (rememberedAnswer !== null) return rememberedAnswer;
  const outcome = await probeOnce();
  if (outcome === LocalServerProbeOutcome.NOTHING_REPLIED) return false;
  rememberedAnswer = outcome === LocalServerProbeOutcome.LOCAL_SERVER_REPLIED;
  return rememberedAnswer;
}
