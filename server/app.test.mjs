import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, test } from "node:test";
import { createApp } from "./app.mjs";

let dirs;
let app;

beforeEach(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "trainer-"));
  dirs = { distDir: path.join(root, "dist"), songsDir: path.join(root, "songs"), dataDir: path.join(root, "data") };
  await mkdir(path.join(dirs.distDir, "assets"), { recursive: true });
  await mkdir(path.join(dirs.songsDir, "test-song"), { recursive: true });
  await writeFile(path.join(dirs.distDir, "index.html"), "<!doctype html><title>app</title>");
  await writeFile(path.join(dirs.distDir, "assets", "main.js"), "console.log(1)");
  await writeFile(path.join(dirs.songsDir, "index.json"), '[{"id":"test-song"}]');
  await writeFile(path.join(dirs.songsDir, "test-song", "notes.auto.json"), "[]");
  app = createApp(dirs);
});

const json = (body) => ({ method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

test("serves the app and its assets", async () => {
  assert.match(await (await app.request("/")).text(), /<title>app/);
  assert.equal(await (await app.request("/assets/main.js")).text(), "console.log(1)");
});

test("serves the app for client-side routes", async () => {
  const response = await app.request("/practice");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>app/);
});

test("serves song packages", async () => {
  const response = await app.request("/songs/index.json");
  assert.deepEqual(await response.json(), [{ id: "test-song" }]);
});

test("answers 404 for a missing song file instead of the app page", async () => {
  assert.equal((await app.request("/songs/nope/notes.json")).status, 404);
});

test("writes corrected notes into the package and leaves the automatic ones alone", async () => {
  const notes = [{ id: 0, t: 1, d: 0.5, midi: 57 }];
  const response = await app.request("/api/songs/test-song/notes", json(notes));
  assert.equal(response.status, 200);
  const dir = path.join(dirs.songsDir, "test-song");
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, "notes.json"), "utf8")), notes);
  assert.equal(await readFile(path.join(dir, "notes.auto.json"), "utf8"), "[]");
  assert.deepEqual((await readdir(dir)).sort(), ["notes.auto.json", "notes.json"]);
});

test("refuses notes for an unknown song, a bad id or a body that is not a list", async () => {
  assert.equal((await app.request("/api/songs/unknown/notes", json([]))).status, 404);
  assert.equal((await app.request("/api/songs/..%2Fdata/notes", json([]))).status, 400);
  assert.equal((await app.request("/api/songs/test-song/notes", json({ a: 1 }))).status, 400);
});

test("stores one backup per day and lists them newest first", async () => {
  const post = (body) => app.request("/api/backup", { ...json(body), method: "POST" });
  assert.equal((await post({ version: 1, attempts: [] })).status, 200);
  assert.equal((await post({ version: 1, attempts: [1] })).status, 200);
  const names = await (await app.request("/api/backups")).json();
  assert.equal(names.length, 1);
  assert.match(names[0], /^\d{4}-\d{2}-\d{2}\.json$/);
  assert.deepEqual(await (await app.request(`/api/backups/${names[0]}`)).json(), { version: 1, attempts: [1] });
});

test("keeps only the newest thirty backups", async () => {
  await mkdir(path.join(dirs.dataDir, "backups"), { recursive: true });
  for (let day = 1; day <= 31; day++) {
    const name = `2026-01-${String(day).padStart(2, "0")}.json`;
    await writeFile(path.join(dirs.dataDir, "backups", name), "{}");
  }
  await app.request("/api/backup", { ...json({ version: 1 }), method: "POST" });
  const names = await (await app.request("/api/backups")).json();
  assert.equal(names.length, 30);
  assert.ok(!names.includes("2026-01-01.json"));
});

test("refuses a backup name that is not a dated file", async () => {
  assert.equal((await app.request("/api/backups/..%2F..%2Fsecret")).status, 400);
});
