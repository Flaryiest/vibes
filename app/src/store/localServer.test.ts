import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalServerProbeOutcome, probeLocalServer } from "./localServer";

const replyWith = (reply: Response | Error) => {
  const fetchStub = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
};

const localServerReply = () => Response.json({ ok: true });
const missingPage = () => new Response("Not found", { status: 404 });
const nothing = () => new TypeError("Failed to fetch");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeLocalServer", () => {
  it("recognizes the local server's own reply", async () => {
    replyWith(localServerReply());
    expect(await probeLocalServer()).toBe(LocalServerProbeOutcome.LOCAL_SERVER_REPLIED);
  });

  it("tells a static host apart, whether it reports a missing page or serves the app's page for every address", async () => {
    replyWith(missingPage());
    expect(await probeLocalServer()).toBe(LocalServerProbeOutcome.ANOTHER_HOST_REPLIED);
    replyWith(new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect(await probeLocalServer()).toBe(LocalServerProbeOutcome.ANOTHER_HOST_REPLIED);
    replyWith(Response.json({ status: "fine" }));
    expect(await probeLocalServer()).toBe(LocalServerProbeOutcome.ANOTHER_HOST_REPLIED);
  });

  it("reports silence as its own outcome", async () => {
    replyWith(nothing());
    expect(await probeLocalServer()).toBe(LocalServerProbeOutcome.NOTHING_REPLIED);
  });
});

describe("hasLocalServer", () => {
  // Each test needs the module's remembered answer to start empty.
  let hasLocalServer: () => Promise<boolean>;
  beforeEach(async () => {
    vi.resetModules();
    ({ hasLocalServer } = await import("./localServer"));
  });

  it("asks once and keeps a reply for the rest of the page's life", async () => {
    const fetchStub = replyWith(localServerReply());
    expect(await hasLocalServer()).toBe(true);
    replyWith(missingPage());
    expect(await hasLocalServer()).toBe(true);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("keeps a static host's reply too, so the web copy asks only once", async () => {
    const fetchStub = replyWith(missingPage());
    expect(await hasLocalServer()).toBe(false);
    expect(await hasLocalServer()).toBe(false);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("does not remember silence, so a restarting server is found on the next ask", async () => {
    replyWith(nothing());
    expect(await hasLocalServer()).toBe(false);
    replyWith(localServerReply());
    expect(await hasLocalServer()).toBe(true);
  });

  it("shares one probe between callers that ask at the same moment", async () => {
    const fetchStub = replyWith(localServerReply());
    expect(await Promise.all([hasLocalServer(), hasLocalServer(), hasLocalServer()])).toEqual([true, true, true]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
