// Starts the trainer's server at login and keeps it running. Undo with `pnpm run uninstall-agent`.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LABEL = "dev.vibes.singing-trainer";
export const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.resolve(serverDir, "..", "data", "logs");

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${path.join(serverDir, "index.mjs")}</string>
  </array>
  <key>WorkingDirectory</key><string>${serverDir}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(logDir, "server.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, "server.log")}</string>
</dict>
</plist>
`;

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(logDir, { recursive: true });
  mkdirSync(path.dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, plist);
  const domain = `gui/${process.getuid()}`;
  try {
    execFileSync("launchctl", ["bootout", domain, plistPath], { stdio: "ignore" });
  } catch {
    // Not loaded yet.
  }
  execFileSync("launchctl", ["bootstrap", domain, plistPath], { stdio: "inherit" });
  console.log(`Installed. The trainer now runs at http://localhost:4747 whenever you are logged in.`);
  console.log(`Logs: ${path.join(logDir, "server.log")}`);
}
