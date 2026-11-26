// Phase 1 — slim data at startup: the app reads small copies kept by the Cloud
// Functions (pointsLite, visitStats, photoCovers …) instead of whole nodes,
// loads a corner's photos and check-ins with its detail, full pictures when
// opened; uploads keep pictures out of the photo list; presence only shows who
// was seen recently; without the copies it falls back to the full nodes, and
// the one-time backfill (admin-tools.cjs) fills them for old data.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { startServer, launch, newUser, onboard, dbGet, dbPut, dbDel, resetDb, PORT } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const REPO = path.join(__dirname, "..", "..");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(300); } return false; }

// A real JPEG as a data URL (what the app's compressor produces), via jpeg-js
// from the functions' packages.
function jpegDataUrl(w, h, shade) {
  const jpeg = require(path.join(REPO, "functions", "node_modules", "jpeg-js"));
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = (i % w) % 256; data[i * 4 + 1] = shade; data[i * 4 + 2] = Math.floor(i / w) % 256; data[i * 4 + 3] = 255; }
  return "data:image/jpeg;base64," + Buffer.from(jpeg.encode({ data, width: w, height: h }, 75).data).toString("base64");
}
function backfill() {
  return execFileSync(process.execPath, [path.join(REPO, ".github", "scripts", "admin-tools.cjs")], {
    env: { ...process.env, ACTION: "phase1-backfill", FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9000", FIREBASE_DATABASE_URL: "http://127.0.0.1:9000?ns=cornerguide-default-rtdb", NODE_PATH: path.join(REPO, "functions", "node_modules") },
    encoding: "utf8"
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(path.join(REPO, "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const ana = await newUser(browser, "Ana");
    await onboard(ana);
    await ana.page.evaluate(() => addXp(40, "test"));
    const cid = "pacelli";
    const corner = await ana.page.evaluate((id) => getAllCorners().find((c) => c.id === id) || getAllCorners()[0], cid);
    const C = corner.id;
    const now = Date.now();
    // ---------- old-format data, as it is in the live database today ----------
    const big = jpegDataUrl(800, 600, 90);
    await dbPut(`photos/${C}`, {
      p1: { src: big, author: "Ben", authorId: "benKey", time: now - 86400000, ratings: { x: 5 } },
      p2: { src: jpegDataUrl(640, 480, 200), author: "Cem", authorId: "cemKey", time: now - 3600000 }
    });
    await dbPut(`visits/${C}`, {
      v1: { user: "Ana", userId: ana.uid, time: now - 2 * 86400000 },
      v2: { user: "Ana", time: now - 40 * 86400000 },                     // very old: name only
      v3: { user: "Ben", userId: "benKey", time: now - 3600000, team: "" }
    });
    await dbPut("points/benKey", { total: 120, nickname: "Ben", history: [{ pts: 120, reason: "x", time: now - 3600000 }] });
    await dbPut("presence/benKey", { nickname: "Ben", lastSeen: now - 60000, online: true });
    await dbPut("presence/ghostKey", { nickname: "Geist", lastSeen: now - 3 * 86400000, online: false });

    // The Cloud Functions build the slim copies from these writes.
    const indexed = await waitFor(async () => {
      const cover = await dbGet(`photoCovers/${C}`);
      const stats = await dbGet(`visitStats/${C}`);
      const lite = await dbGet("pointsLite/benKey");
      return cover && cover.n === 2 && cover.thumb && stats && stats.n === 3 && lite && lite.total === 120;
    }, 30000);
    check("Cloud Functions build the slim copies (cover, counts, points)", indexed);
    const meta = (await dbGet(`photos/${C}/p1`)) || {};
    const data = (await dbGet(`photoData/${C}/p1`)) || {};
    check("inline pictures move out of the photo list (photoData + thumbnail)", !meta.src && typeof meta.thumb === "string" && meta.thumb.length < big.length / 2 && data.src === big, `thumb ${Math.round((meta.thumb || "").length / 1024)} KB of ${Math.round(big.length / 1024)} KB`);
    check("check-ins get a per-person index (by login, old ones by name)", !!(await dbGet(`visitsByUser/${ana.uid}/v1`)) && !!(await dbGet("visitsByName/Ana/v2")) && !!(await dbGet("visitsByUser/benKey/v3")));
    check("the slim points copy has no history", !("history" in ((await dbGet("pointsLite/benKey")) || { history: 1 })));

    // ---------- a fresh start (on the map) reads only the slim copies ----------
    await ana.page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await ana.page.waitForFunction(() => window.FB && window.FB.getAuthUid && window.FB.getAuthUid() && STATE.visitStats, null, { timeout: 20000 });
    await sleep(1500);
    const start = await ana.page.evaluate((c) => ({
      view: STATE.view,
      photos: Object.keys(STATE.photos || {}).length,
      visits: Object.keys(STATE.visits || {}).length,
      covers: STATE.photoCovers ? Object.keys(STATE.photoCovers).length : 0,
      count: getVisitCount(c),
      benHistory: !!(STATE.points.benKey && STATE.points.benKey.history),
      ownHistory: !!(STATE.points[currentUserKey()] && STATE.points[currentUserKey()].history),
      legacy: isLegacyPhotos() || isLegacyVisits(),
      friends: Object.keys(STATE.friends || {})
    }), C);
    check("startup on the map: no photos at all (not even covers), no check-in lists", start.view === "map" && start.photos === 0 && start.visits === 0 && start.covers === 0 && !start.legacy, JSON.stringify(start));
    check("…but the counts for ranking and karma are there", start.count === 3);
    check("others' points without history, mine in full", !start.benHistory && start.ownHistory);
    check("presence: only who was seen recently", start.friends.includes("benKey") && !start.friends.includes("ghostKey"), start.friends.join(","));
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="list"]').click());
    const coversIn = await waitFor(() => ana.page.evaluate((c) => !!(STATE.photoCovers && STATE.photoCovers[c] && STATE.photoCovers[c].thumb), C));
    check("opening the list loads the small covers", coversIn);
    await sleep(400);
    const cardImg = await ana.page.evaluate((c) => document.querySelector(`#card-${CSS.escape(c)} .card-photo img`)?.getAttribute("src") || "", C);
    check("the card shows the thumbnail", cardImg.startsWith("data:image/jpeg") && cardImg.length < 60000, `${Math.round(cardImg.length / 1024)} KB`);
    // A corner opened straight from the map (deep link, pin) gets its big picture without the covers.
    await ana.page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await ana.page.waitForFunction(() => window.FB && window.FB.getAuthUid && window.FB.getAuthUid() && STATE.visitStats, null, { timeout: 20000 });
    await ana.page.evaluate((c) => openDetail(c), C);
    const heroFromMap = await waitFor(() => ana.page.evaluate((len) => (document.querySelector("#detail-overlay .detail-hero-photo img")?.getAttribute("src") || "").length === len, big.length));
    check("a corner opened from the map shows its picture in full", heroFromMap);
    await ana.page.evaluate(() => closeDetail());

    // ---------- the detail loads that corner's photos and check-ins ----------
    await ana.page.evaluate((c) => openDetail(c), C);
    const detail = await waitFor(() => ana.page.evaluate((c) => Object.keys((STATE.photos || {})[c] || {}).length === 2 && Object.keys((STATE.visits || {})[c] || {}).length === 3, C));
    check("opening the corner loads its photos and last check-ins", detail);
    const trail = await ana.page.evaluate(() => document.querySelector("#detail-overlay .visit-trail")?.textContent || "");
    check("the visitor trail shows names and the total", /Ben/.test(trail) && /3x besucht/.test(trail), trail.replace(/\s+/g, " ").slice(0, 120));
    const galleryThumb = await ana.page.evaluate(() => document.querySelector("#detail-overlay .gallery-img")?.getAttribute("src") || "");
    check("the gallery shows thumbnails", galleryThumb.startsWith("data:image/jpeg") && galleryThumb.length < 60000);
    const hero = await waitFor(() => ana.page.evaluate((len) => (document.querySelector("#detail-overlay .detail-hero-photo img")?.getAttribute("src") || "").length > len, galleryThumb.length * 2));
    check("the big cover picture in the detail loads in full", hero);
    await ana.page.click("#detail-overlay .gallery-img");
    const full = await waitFor(() => ana.page.evaluate((len) => ($("#lightbox-img")?.getAttribute("src") || "").length > len * 2, galleryThumb.length));
    check("tapping a photo shows it in full (photoData)", full);
    await ana.page.evaluate(() => $("#lightbox")?.classList.remove("open"));

    // ---------- uploads ----------
    // Without Storage (as in the live project today): the picture goes to photoData.
    await ana.context.route("http://127.0.0.1:9199/**", (r) => r.fulfill({ status: 404, body: "no bucket" }));
    await ana.page.evaluate(([c, src]) => savePhoto(c, src, ""), [C, jpegDataUrl(800, 600, 30)]);
    const upNoStorage = await waitFor(async () => {
      const list = (await dbGet(`photos/${C}`)) || {};
      const fresh = Object.entries(list).find(([k, p]) => !["p1", "p2"].includes(k) && p.thumb);
      return fresh && !fresh[1].src && (await dbGet(`photoData/${C}/${fresh[0]}`))?.src?.length > 10000;
    });
    check("upload without Storage: picture in photoData, thumbnail in the list", upNoStorage);
    await ana.context.unroute("http://127.0.0.1:9199/**");
    // With Storage (once activated): only the URL is stored.
    await ana.page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await ana.page.waitForFunction(() => window.FB && window.FB.getAuthUid && window.FB.getAuthUid() && STATE.visitStats, null, { timeout: 20000 });
    await ana.page.evaluate(([c, src]) => savePhoto(c, src, ""), [C, jpegDataUrl(800, 600, 160)]);
    const upStorage = await waitFor(async () => Object.values((await dbGet(`photos/${C}`)) || {}).some((p) => p.storage === true && /^http/.test(p.src || "") && p.thumb));
    check("upload with Storage: just the URL (+ thumbnail)", upStorage);
    check("the cover count follows", await waitFor(async () => ((await dbGet(`photoCovers/${C}`)) || {}).n === 4));

    // ---------- my check-ins and someone else's ----------
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="profile"]').click());
    const mine = await waitFor(() => ana.page.evaluate(() => myVisitLog().length === 2));
    check("my profile map: own check-ins incl. very old ones by name", mine, String(await ana.page.evaluate(() => myVisitLog().length)));
    await ana.page.evaluate(() => openUserProfile("benKey"));
    const benLoaded = await waitFor(() => ana.page.evaluate(() => /1\s*🍻 Check-ins/.test(document.querySelector("#user-profile-overlay")?.textContent || "")));
    check("someone's profile loads their check-ins when opened", benLoaded);
    await ana.page.evaluate(() => closeUserProfile());

    // ---------- without the slim copies: the old full nodes ----------
    for (const p of ["photoCovers", "visitStats", "pointsLite"]) await dbDel(p);
    await ana.page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="list"]').click()).catch(() => {});
    await ana.page.waitForFunction(() => window.FB && window.FB.getAuthUid && window.FB.getAuthUid() && STATE.photoCovers && STATE.visitStats, null, { timeout: 20000 });
    await sleep(1500);
    const legacy = await ana.page.evaluate((c) => ({ legacy: isLegacyPhotos() && isLegacyVisits(), cover: !!coverSrcOf(c), count: getVisitCount(c), ben: (STATE.points.benKey || {}).total || 0 }), C);
    check("missing copies: falls back to the full nodes, nothing missing", legacy.legacy && legacy.cover && legacy.count === 3 && legacy.ben === 120, JSON.stringify(legacy));
    const out = backfill();
    check("the one-time backfill fills them again (counts only in the log)", /pointsLite: \d+/.test(out) && /visitStats: 1 Corners/.test(out) && !/"src"|base64/.test(out), out.split("\n").slice(0, 3).join(" | "));
    const back = await waitFor(() => ana.page.evaluate(() => !isLegacyPhotos() && !isLegacyVisits()));
    check("…and the open app switches back to the slim copies by itself", back);

    // ---------- copies refused: right after an update the app can be live
    // before the new database rules are ----------
    const rulesPath = path.join(REPO, "firebase.database.rules.json");
    const putRules = (body) => fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body });
    const oldRules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
    for (const k of ["pointsLite", "karmaLite", "visitStats", "visitsByUser", "visitsByName", "photoCovers", "photoData", "compliments"]) delete oldRules.rules[k];
    await putRules(JSON.stringify(oldRules));
    await ana.page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="list"]').click()).catch(() => {});
    await ana.page.waitForFunction(() => window.FB && window.FB.getAuthUid && window.FB.getAuthUid() && STATE.photoCovers && STATE.visitStats, null, { timeout: 20000 }).catch(() => {});
    await sleep(2000);
    const refused = await ana.page.evaluate((c) => ({ legacy: isLegacyPhotos() && isLegacyVisits(), cover: !!coverSrcOf(c), count: getVisitCount(c), ben: (STATE.points.benKey || {}).total || 0 }), C);
    check("copies refused by old rules: the app still shows everything", refused.legacy && refused.cover && refused.count === 3 && refused.ben === 120, JSON.stringify(refused));
    await putRules(fs.readFileSync(rulesPath, "utf8"));

    const errs = ana.page._logs.filter((l) => l.startsWith("[pageerror]"));
    check("no page errors", errs.length === 0, errs.join(" | ").slice(0, 400));
  } catch (err) {
    console.error("TEST CRASH", err);
    results.push({ name: "crash", ok: false });
  } finally {
    await browser.close();
    server.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
  }
})();
