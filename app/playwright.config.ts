import path from "node:path";
import { defineConfig } from "@playwright/test";

const fakeMicrophone = path.resolve(import.meta.dirname, "e2e/fixtures/a2.wav");
// E2E_PORT lets several checkouts run their tests at once without sharing a port.
const port = Number(process.env.E2E_PORT ?? 4747);

export default defineConfig({
  testDir: "e2e",
  // One at a time: the tests share one port and one fake microphone, and audio timing matters.
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${port}`,
    channel: "chrome",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-audio-capture=${fakeMicrophone}`,
      ],
    },
  },
  webServer: {
    // The real local server, so tests cover songs, saved notes and backups too.
    command: "pnpm build && node ../server/index.mjs",
    env: {
      PORT: String(port),
      SONGS_DIR: path.resolve(import.meta.dirname, "e2e/fixtures/songs"),
      DATA_DIR: path.resolve(import.meta.dirname, "e2e/fixtures/data"),
    },
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
