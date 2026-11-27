#!/usr/bin/env node
// Starts the Firebase emulators with the app's real rules and Cloud Functions
// (npm run emulators).
//
// The Firebase CLI only reads files inside the folder of its firebase.json,
// so the current rules and functions from the repository root are copied here
// first (not committed, see .gitignore); after changing them, restart this.
// The functions keep the slim copies the app reads at startup (pointsLite,
// visitStats, photoCovers …), so they have to run for the tests.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
for (const file of ["firebase.database.rules.json", "storage.rules"]) {
  copyFileSync(join(root, file), join(here, file));
}

const fnSrc = join(root, "functions");
const fnDst = join(here, ".functions");
if (!existsSync(join(fnSrc, "node_modules", "firebase-functions"))) {
  console.error("The Cloud Functions need their packages first:  npm ci --prefix ../../functions");
  process.exit(1);
}
mkdirSync(fnDst, { recursive: true });
for (const f of readdirSync(fnSrc)) {
  if (!(f.endsWith(".js") || f === "package.json")) continue;
  let text = readFileSync(join(fnSrc, f), "utf8");
  if (f === "index.js") {
    // The emulator only fires database triggers in us-central1 (the real
    // database and functions are in europe-west1).
    // Without a login it also can't look the project up, so the Admin SDK
    // would use another database namespace than the app — name it.
    const local = text
      .replace('const REGION = "europe-west1";', 'const REGION = "us-central1";')
      .replace("admin.initializeApp();", 'admin.initializeApp({ databaseURL: "https://cornerguide-default-rtdb.europe-west1.firebasedatabase.app" });')
      // The push functions delete each queued event once handled — warm, in a
      // few milliseconds, before a test can look at what the app queued.
      // There is no FCM here anyway: keep the events.
      .replaceAll("await event.data.ref.remove();", "/* e2e: event kept for the tests */");
    if (!local.includes('"us-central1"') || !local.includes("cornerguide-default-rtdb")) console.warn("emulators.mjs: could not adapt functions/index.js for the emulator — triggers may not work");
    text = local;
  }
  writeFileSync(join(fnDst, f), text);
}
if (!existsSync(join(fnDst, "node_modules"))) symlinkSync(join(fnSrc, "node_modules"), join(fnDst, "node_modules"), "junction");

const cli = join(here, "node_modules", ".bin", process.platform === "win32" ? "firebase.cmd" : "firebase");
const child = spawn(cli, ["emulators:start", "--project", "cornerguide", "--only", "auth,database,storage,functions"], {
  cwd: here,
  stdio: "inherit",
  shell: process.platform === "win32"
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
