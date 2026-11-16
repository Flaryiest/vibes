import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backupToDisk } from "./db";
import { hasLocalServer } from "./localServer";

vi.mock("./localServer", () => ({ hasLocalServer: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backupToDisk", () => {
  it("sends the backup to the local server when it is there", async () => {
    vi.mocked(hasLocalServer).mockResolvedValue(true);
    const fetchStub = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchStub);

    expect(await backupToDisk()).toBe(true);
    expect(fetchStub).toHaveBeenCalledWith("/api/backup", expect.objectContaining({ method: "POST" }));
  });

  it("writes nothing and asks nothing of the host when there is no local server", async () => {
    vi.mocked(hasLocalServer).mockResolvedValue(false);
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);

    expect(await backupToDisk()).toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("reports no backup when the local server fails to take it", async () => {
    vi.mocked(hasLocalServer).mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    expect(await backupToDisk()).toBe(false);
  });
});
