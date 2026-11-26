#!/usr/bin/env node
// Starts the Firebase emulators with the app's real rules (npm run emulators).
//
// The Firebase CLI only reads rule files inside the folder of its firebase.json,
// so the current rules from the repository root are copied here first. The
// copies are not committed (.gitignore); after changing the rules, restart this.
import { copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const file of ["firebase.database.rules.json", "storage.rules"]) {
  copyFileSync(join(here, "..", "..", file), join(here, file));
}

const cli = join(here, "node_modules", ".bin", process.platform === "win32" ? "firebase.cmd" : "firebase");
const child = spawn(cli, ["emulators:start", "--project", "cornerguide", "--only", "auth,database,storage"], {
  cwd: here,
  stdio: "inherit",
  shell: process.platform === "win32"
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
