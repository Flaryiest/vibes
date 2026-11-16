import path from "node:path";
import { defineConfig } from "@playwright/test";

const fakeMicrophone = path.resolve(import.meta.dirname, "e2e/fixtures/a2.wav");
// E2E_PORT lets several checkouts run their tests at once without sharing a port.
const port = Number(process.env.E2E_PORT ?? 4747);

// The copy on the web has no local server. Its tests run against a plain static host standing in for it,
// or against a real deployment when HOSTED_URL names one.
const HOSTED_TESTS = /hosted\.spec\.ts/;
const hostedPort = Number(process.env.E2E_HOSTED_PORT ?? 4749);
const deployedUrl = process.env.HOSTED_URL;

const localServer = {
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
};

// Started after the local server, whose command builds the app this one serves.
const staticHost = {
  command: `pnpm exec vite preview --port ${hostedPort} --strictPort`,
  url: `http://localhost:${hostedPort}`,
  reuseExistingServer: true,
  timeout: 30_000,
};

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
  projects: [
    // Against a real deployment only the hosted tests apply.
    ...(deployedUrl ? [] : [{ name: "local", testIgnore: HOSTED_TESTS }]),
    { name: "hosted", testMatch: HOSTED_TESTS, use: { baseURL: deployedUrl ?? `http://localhost:${hostedPort}` } },
  ],
  webServer: deployedUrl ? [] : [localServer, staticHost],
});
