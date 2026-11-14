import path from "node:path";
import { defineConfig } from "@playwright/test";

const fakeMicrophone = path.resolve(import.meta.dirname, "e2e/fixtures/a2.wav");

export default defineConfig({
  testDir: "e2e",
  // One at a time: the tests share one port and one fake microphone, and audio timing matters.
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:4747",
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
    url: "http://localhost:4747",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
