#!/usr/bin/env node
// Builds index.html from src/. No dependencies — just Node.
//
// The app is still delivered as ONE file: GitHub Pages serves it as is, it
// loads in one request and works offline. The source is split by feature in
// src/ so it stays readable:
//   src/head.html        <head> up to the libraries
//   src/firebase.js      the Firebase module (window.FB)
//   src/css/NN-*.css     styles, in order
//   src/body.html        </head>, <body> and all markup
//   src/js/NN-*.js       app code, in order (one shared script scope, as before)
//
//   node tools/build.mjs          write index.html
//   node tools/build.mjs --check  fail if index.html is not what src/ builds
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "src", p), "utf8");
const parts = (dir) => readdirSync(join(root, "src", dir))
  .filter((f) => /^\d{2}-[a-z0-9-]+\.(css|js)$/.test(f))
  .sort()
  .map((f) => read(join(dir, f)));

const html = [
  read("head.html"),
  '<script type="module">\n', read("firebase.js"), "</script>\n",
  "<style>\n", ...parts("css"), "</style>\n",
  read("body.html"),
  "<script>\n", ...parts("js"), "</script>\n",
  "</body>\n</html>\n"
].join("");

const target = join(root, "index.html");
if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(target, "utf8"); } catch (e) { /* missing */ }
  if (current !== html) {
    console.error("index.html is not built from src/ — edit the files in src/, then run: node tools/build.mjs");
    process.exit(1);
  }
  console.log("index.html matches src/");
} else {
  writeFileSync(target, html);
  console.log(`index.html written (${html.length} characters)`);
}
