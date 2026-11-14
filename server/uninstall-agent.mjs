// Stops the trainer's server from starting at login.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { plistPath } from "./install-agent.mjs";

try {
  execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plistPath], { stdio: "ignore" });
} catch {
  // Was not loaded.
}
rmSync(plistPath, { force: true });
console.log("Removed. The trainer no longer starts at login.");
