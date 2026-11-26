// Test harness for CornerGuide: serves the repo locally, swaps blocked CDNs for
// npm copies and points the Firebase SDK at the local emulators.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const REPO = path.resolve(__dirname, "..", "..");
const NM = path.join(__dirname, "node_modules");
const PORT = 8085;
const NS = "cornerguide-default-rtdb";
const DB = `http://127.0.0.1:9000`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".css": "text/css" };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      let p = decodeURIComponent(url.pathname);
      if (p === "/" || p === "") p = "/index.html";
      const file = path.join(REPO, p);
      if (!file.startsWith(REPO) || !fs.existsSync(file)) { res.writeHead(404); res.end("nf"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      if (file.endsWith("index.html")) res.end(patchIndex(fs.readFileSync(file, "utf8")));
      else res.end(fs.readFileSync(file));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function patchIndex(html) {
  let out = html;
  const rep = (a, b) => { if (!out.includes(a)) throw new Error("patch anchor missing: " + a); out = out.replace(a, b); };
  rep('import { getDatabase, ref,', 'import { connectDatabaseEmulator, getDatabase, ref,');
  rep('import { getAuth, signInAnonymously,', 'import { connectAuthEmulator, getAuth, signInAnonymously,');
  rep('import { getStorage, ref as storageRef,', 'import { connectStorageEmulator, getStorage, ref as storageRef,');
  rep('db = getDatabase(app);', 'db = getDatabase(app); connectDatabaseEmulator(db, "127.0.0.1", 9000);');
  rep('storage = getStorage(app);', 'storage = getStorage(app); connectStorageEmulator(storage, "127.0.0.1", 9199);');
  rep('auth = getAuth(app);', 'auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });');
  return out;
}

async function routeContext(context) {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("https://www.gstatic.com/firebasejs/10.12.2/")) {
      const f = path.join(NM, "firebase", url.split("/").pop().split("?")[0]);
      if (fs.existsSync(f)) return route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: "" });
    }
    if (url.startsWith("https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/")) {
      const rel = url.split("/dist/")[1].split("?")[0];
      const f = path.join(NM, "leaflet", "dist", rel);
      if (fs.existsSync(f)) return route.fulfill({ status: 200, contentType: rel.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: "" });
    }
    if (url.startsWith("https://fonts.googleapis.com") || url.startsWith("https://fonts.gstatic.com")) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    if (url.includes("tile.openstreetmap.org") || url.includes("api.qrserver.com") || url.includes("google-analytics") || url.includes("googletagmanager")) return route.fulfill({ status: 204, body: "" });
    if (url.startsWith("http://127.0.0.1") || url.startsWith("ws://127.0.0.1") || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    // Everything else (e.g. firebaseinstallations, fcm) is offline in tests.
    return route.fulfill({ status: 503, body: "" });
  });
}

async function dbReq(method, p, body) {
  const res = await fetch(`${DB}/${p}.json?ns=${NS}`, {
    method,
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (e) { return txt; }
}
const dbGet = (p) => dbReq("GET", p);
const dbPut = (p, v) => dbReq("PUT", p, v);
const dbDel = (p) => dbReq("DELETE", p);

async function resetDb() {
  await dbPut("", { accessCodes: { TEST: true }, config: { admins: {} } });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/cornerguide/accounts`, { method: "DELETE" }).catch(() => {});
}

async function launch() {
  return chromium.launch({
    args: ["--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
  });
}

async function newUser(browser, name, opts = {}) {
  const context = await browser.newContext({
    serviceWorkers: opts.sw ? "allow" : "block",
    viewport: opts.viewport || { width: 412, height: 860 },
    deviceScaleFactor: opts.dsf || 1,
    permissions: ["microphone", "notifications"],
    locale: "de-DE",
    timezoneId: "Europe/Berlin"
  });
  await routeContext(context);
  if (opts.beforeGoto) await opts.beforeGoto(context);
  const page = await context.newPage();
  page._logs = [];
  page.on("console", (m) => { const t = m.text(); page._logs.push(`[${m.type()}] ${t}`); if (opts.echo && m.type() !== "debug") console.log(`  {${name}} ${m.type()}: ${t}`); });
  page.on("pageerror", (e) => { page._logs.push(`[pageerror] ${e.message}`); console.log(`  {${name}} PAGEERROR: ${e.message}`); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html${opts.query || ""}`);
  return { name, context, page };
}

async function onboard(user) {
  const { page, name } = user;
  await page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 });
  await page.fill("#access-code-input", "TEST");
  await page.click("#access-code-save");
  await page.waitForSelector("#claim-overlay", { state: "visible", timeout: 15000 });
  // One welcome screen: "✨ Neu hier?" (type a name) or tap an existing one.
  await page.waitForSelector("#claim-new-name", { state: "visible", timeout: 10000 });
  await page.fill("#claim-new-name", name);
  await page.click("#claim-new-go");
  await page.waitForFunction(() => window.FB && window.FB.getAuthUid && window.FB.getAuthUid() && typeof STATE !== "undefined" && STATE.userId === window.FB.getAuthUid(), null, { timeout: 15000 });
  user.uid = await page.evaluate(() => window.FB.getAuthUid());
  await page.waitForTimeout(500);
  return user.uid;
}

async function checkIn(user, cornerId) {
  const { page } = user;
  await page.evaluate((id) => manualCheckin(id), cornerId);
  await page.waitForSelector("#checkin-team-overlay", { state: "visible", timeout: 5000 }).catch(() => {});
  if (await page.isVisible("#checkin-team-overlay")) await page.click("#cto-skip");
  await page.waitForTimeout(300);
}

module.exports = { startServer, launch, newUser, onboard, checkIn, dbGet, dbPut, dbDel, resetDb, PORT };
