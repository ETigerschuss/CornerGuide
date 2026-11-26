#!/usr/bin/env node
// Runs every test suite one after another (they share the emulators and reset
// the database each time) and prints a summary. Start the emulators first:
//   npm run emulators
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const suites = readdirSync(here)
  .filter((f) => f.endsWith(".js") && f !== "lib.js")
  .map((f) => f.replace(/\.js$/, ""))
  .filter((s) => !only.length || only.includes(s))
  .sort();

let failed = 0;
const rows = [];
for (const s of suites) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [join(here, s + ".js")], { encoding: "utf8", timeout: 10 * 60 * 1000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const summary = (out.match(/\d+\/\d+ (checks )?passed/g) || []).pop() || "no summary";
  const ok = r.status === 0;
  if (!ok) failed++;
  rows.push(`${ok ? "✓" : "✗"} ${s.padEnd(10)} ${summary}  (${Math.round((Date.now() - t) / 1000)} s)`);
  console.log(rows[rows.length - 1]);
  if (!ok) out.split("\n").filter((l) => /^FAIL|TEST CRASH|PAGEERROR/.test(l)).slice(0, 8).forEach((l) => console.log("    " + l.slice(0, 300)));
}
console.log(`\n${suites.length - failed}/${suites.length} suites green`);
process.exit(failed ? 1 : 0);
