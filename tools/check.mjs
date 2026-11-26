#!/usr/bin/env node
// Quick checks without dependencies (run locally and in CI):
//  1. index.html is exactly what src/ builds
//  2. the app code and the Firebase module have no syntax errors
//  3. the database rules are valid JSON
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
const step = (name, fn) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (err) { failed = true; console.error(`✗ ${name}\n${String(err.stdout || "")}${String(err.stderr || err.message || err)}`); }
};

step("index.html matches src/", () => execFileSync(process.execPath, [join(root, "tools", "build.mjs"), "--check"], { stdio: "pipe" }));

const dir = mkdtempSync(join(tmpdir(), "cg-check-"));
step("app code has no syntax errors", () => {
  const js = readdirSync(join(root, "src", "js")).filter((f) => f.endsWith(".js")).sort()
    .map((f) => readFileSync(join(root, "src", "js", f), "utf8")).join("");
  const file = join(dir, "app.js");
  writeFileSync(file, js);
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
});
step("Firebase module has no syntax errors", () => {
  const file = join(dir, "firebase.mjs");
  writeFileSync(file, readFileSync(join(root, "src", "firebase.js"), "utf8"));
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
});
step("database rules are valid JSON", () => JSON.parse(readFileSync(join(root, "firebase.database.rules.json"), "utf8")));

process.exit(failed ? 1 : 0);
