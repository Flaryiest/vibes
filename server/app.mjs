import { Hono } from "hono";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
};

const SONG_ID = /^[a-z0-9][a-z0-9-]*$/;
const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}\.json$/;
const BACKUPS_KEPT = 30;

/** Resolves `relative` inside `root`, or returns null if it would escape it. */
function inside(root, relative) {
  const full = path.resolve(root, relative);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

async function sendFile(c, file) {
  try {
    const data = await readFile(file);
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    return c.body(data, 200, { "content-type": type, "cache-control": "no-cache" });
  } catch {
    return null;
  }
}

/** Writes via a temporary file and a rename, so a reader never sees half a file. */
async function writeAtomic(file, text) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, text);
  await rename(temp, file);
}

/**
 * The local server: the built app, the song packages, and the two things the
 * browser cannot do itself — saving corrected notes into a package and keeping
 * backups on disk.
 */
export function createApp({ distDir, songsDir, dataDir }) {
  const app = new Hono();
  const backupsDir = path.join(dataDir, "backups");

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.put("/api/songs/:id/notes", async (c) => {
    const id = c.req.param("id");
    if (!SONG_ID.test(id)) return c.json({ error: "Bad song id." }, 400);
    const dir = path.join(songsDir, id);
    const isDir = await stat(dir).then((s) => s.isDirectory(), () => false);
    if (!isDir) return c.json({ error: "No such song." }, 404);
    const notes = await c.req.json().catch(() => null);
    if (!Array.isArray(notes)) return c.json({ error: "Notes must be a list." }, 400);
    await writeAtomic(path.join(dir, "notes.json"), JSON.stringify(notes, null, 1));
    return c.json({ ok: true });
  });

  app.post("/api/backup", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object") return c.json({ error: "Body must be JSON." }, 400);
    await mkdir(backupsDir, { recursive: true });
    const name = `${new Date().toISOString().slice(0, 10)}.json`;
    await writeAtomic(path.join(backupsDir, name), JSON.stringify(body));
    const names = (await readdir(backupsDir)).filter((n) => BACKUP_NAME.test(n)).sort();
    for (const old of names.slice(0, Math.max(0, names.length - BACKUPS_KEPT))) {
      await unlink(path.join(backupsDir, old));
    }
    return c.json({ ok: true, name });
  });

  app.get("/api/backups", async (c) => {
    const names = await readdir(backupsDir).catch(() => []);
    return c.json(names.filter((n) => BACKUP_NAME.test(n)).sort().reverse());
  });

  app.get("/api/backups/:name", async (c) => {
    const name = c.req.param("name");
    if (!BACKUP_NAME.test(name)) return c.json({ error: "Bad backup name." }, 400);
    return (await sendFile(c, path.join(backupsDir, name))) ?? c.json({ error: "No such backup." }, 404);
  });

  app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

  // Song packages. Not under /songs, which is one of the app's own screens.
  app.get("/song-files/*", async (c) => {
    const file = inside(songsDir, decodeURIComponent(c.req.path.slice("/song-files/".length)));
    if (!file) return c.json({ error: "Bad path." }, 400);
    return (await sendFile(c, file)) ?? c.json({ error: "Not found." }, 404);
  });

  // The app itself. Paths without a file extension are screens, which the app routes in the browser.
  app.get("*", async (c) => {
    const pathname = decodeURIComponent(c.req.path);
    if (path.extname(pathname)) {
      const file = inside(distDir, `.${pathname}`);
      return (file && (await sendFile(c, file))) ?? c.text("Not found.", 404);
    }
    return (await sendFile(c, path.join(distDir, "index.html"))) ?? c.text("The app has not been built. Run pnpm build.", 500);
  });

  return app;
}
