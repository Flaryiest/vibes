import { serve } from "@hono/node-server";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4747);
const app = createApp({
  distDir: path.join(root, "app", "dist"),
  // Overridable so the tests never touch the real songs and backups.
  songsDir: process.env.SONGS_DIR ?? path.join(root, "songs"),
  dataDir: process.env.DATA_DIR ?? path.join(root, "data"),
});

// Loopback only, on both address families, so "localhost" works however the browser resolves it.
for (const hostname of ["127.0.0.1", "::1"]) {
  const server = serve({ fetch: app.fetch, port, hostname });
  server.on("error", (error) => {
    if (hostname === "::1" && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")) return;
    console.error(`Could not listen on ${hostname}:${port}: ${error.message}`);
    process.exit(1);
  });
}
console.log(`Singing trainer at http://localhost:${port}`);
