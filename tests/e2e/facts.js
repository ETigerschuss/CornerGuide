// Existing corners: checked once, shared in cornerFacts, emojis on every card,
// list filter, detail vote chips, background fill-in, rules.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, dbPut, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dLat = (m) => m / 110540;
const dLng = (m, lat) => m / (111320 * Math.cos(lat * Math.PI / 180));

// Overpass answer relative to the queried point: a toilet 90 m away and a
// playground 50 m away (so: 🚻 yes, 🌿 no).
async function mockOverpass(page) {
  page._overpass = 0;
  await page.route(/overpass/, (route) => {
    page._overpass++;
    const q = decodeURIComponent(route.request().url().split("data=")[1] || "");
    const m = q.match(/around:\d+,([0-9.]+),([0-9.]+)/);
    const lat = m ? parseFloat(m[1]) : 48.13, lng = m ? parseFloat(m[2]) : 11.55;
    const els = [
      { type: "node", id: 1, lat, lon: lng + dLng(90, lat), tags: { amenity: "toilets" } },
      { type: "node", id: 2, lat: lat + dLat(50), lon: lng, tags: { leisure: "playground" } }
    ];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elements: els }) });
  });
}
const cardText = (page, id) => page.evaluate((x) => (document.querySelector(`#card-${CSS.escape(x)} .card-amens`) || {}).textContent || "", id);
const visibleCards = (page) => page.evaluate(() => Array.from(document.querySelectorAll("#cards .card")).map((c) => c.id.replace(/^card-/, "")));

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const now = Date.now();
  await dbPut("cornerFacts", {
    "the-cage": { v: 1, at: now, weed: "ok", has: { toilette: true, sport: true }, why: ["keine Schule …"] },
    "ohm-grab": { v: 1, at: now, weed: "no", has: { wasser: true }, why: ["Spielplatz in 40 m"] },
    "schnecke": { v: 1, at: now, weed: "night", why: ["Fußgängerzone"] }
  });
  const browser = await launch();
  try {
    const a = await newUser(browser, "Ana", { dsf: 2, viewport: { width: 390, height: 844 } });
    await mockOverpass(a.page);
    await onboard(a);
    await a.page.evaluate(() => document.querySelector('.tab[data-view="list"]').click());
    await a.page.waitForFunction(() => /🌿/.test(document.querySelector("#card-the-cage .card-amens")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
    const t = {
      cage: await cardText(a.page, "the-cage"), ohm: await cardText(a.page, "ohm-grab"),
      schnecke: await cardText(a.page, "schnecke"), kapu: await cardText(a.page, "kapuzinerdreieck")
    };
    check("existing corners show their emojis on the card", /🚻/.test(t.cage) && /⚽/.test(t.cage) && /🌿/.test(t.cage) && !/🚫/.test(t.cage), JSON.stringify(t));
    check("…including 'no weed' and 'only 20–7'", /💧/.test(t.ohm) && /🚫🌿/.test(t.ohm) && /20–7/.test(t.schnecke), JSON.stringify([t.ohm, t.schnecke]));
    check("…and the curated toilet/kiosk of the original list", /🚻/.test(t.kapu) && /🏪/.test(t.kapu), t.kapu);
    await a.page.evaluate(() => document.querySelector("#card-the-cage").scrollIntoView({ block: "center" }));
    await a.page.screenshot({ path: path.join(SHOTS, "facts-cards.png") });

    // ---------- filter ----------
    await a.page.click('[data-amen-filter="toilette"]');
    await sleep(300);
    let shown = await visibleCards(a.page);
    check("filter 🚻: only corners with a toilet", shown.includes("the-cage") && shown.includes("kapuzinerdreieck") && shown.includes("bavaria-blick") && !shown.includes("ohm-grab") && !shown.includes("schnecke"), JSON.stringify(shown));
    await a.page.click('[data-amen-filter="kiffen"]');
    await sleep(300);
    shown = await visibleCards(a.page);
    check("filter 🚻 + 🌿: both must match", JSON.stringify(shown) === JSON.stringify(["the-cage"]), JSON.stringify(shown));
    await a.page.screenshot({ path: path.join(SHOTS, "facts-filter.png") });
    await a.page.click('[data-amen-filter="toilette"]');
    await sleep(300);
    shown = await visibleCards(a.page);
    check("filter 🌿 alone: allowed or allowed at night", shown.includes("the-cage") && shown.includes("schnecke") && !shown.includes("ohm-grab"), JSON.stringify(shown));
    await a.page.reload();
    await a.page.waitForFunction(() => typeof STATE !== "undefined" && document.querySelectorAll("#cards .card").length > 0, null, { timeout: 15000 });
    await a.page.evaluate(() => document.querySelector('.tab[data-view="list"]').click());
    await sleep(1500);
    const kept = await a.page.evaluate(() => ({ on: Array.from(document.querySelectorAll(".amen-chip.on")).map((b) => b.dataset.amenFilter), n: document.querySelectorAll("#cards .card").length }));
    check("the filter is remembered", JSON.stringify(kept.on) === '["kiffen"]', JSON.stringify(kept));
    await a.page.click('[data-amen-filter="kiffen"]');
    await sleep(300);

    // ---------- someone else checks a corner: my card updates in place ----------
    await a.page.evaluate(() => { document.querySelector("#card-harras").dataset.mark = "1"; });
    await dbPut("cornerFacts/harras", { v: 1, at: Date.now(), weed: "ok", has: { wasser: true } });
    const live = await a.page.waitForFunction(() => /💧/.test(document.querySelector("#card-harras .card-amens")?.textContent || ""), null, { timeout: 8000 }).then(() => true, () => false);
    check("facts from another phone appear on my card without reloading the list", live && await a.page.evaluate(() => document.querySelector("#card-harras").dataset.mark === "1"));

    // ---------- opening a corner without facts stores them for everyone ----------
    await a.page.evaluate(() => openDetail("isar-spot"));
    const stored = await (async () => { for (let i = 0; i < 30; i++) { const f = await dbGet("cornerFacts/isar-spot"); if (f) return f; await sleep(400); } return null; })();
    check("opening a corner checks it once and shares the result", stored && stored.weed === "no" && stored.has && stored.has.toilette === true && stored.v === 1, JSON.stringify(stored));
    const chips = await a.page.evaluate(() => { openDetail("the-cage"); return Array.from(document.querySelectorAll("#detail-content .emoji-vote-chip")).map((x) => x.dataset.amenity); });
    check("detail: the detected emojis can be voted on too", ["toilette", "sport", "kiffen"].every((k) => chips.includes(k)), JSON.stringify(chips));
    await a.page.evaluate(() => closeDetail());

    // ---------- the background fill-in ----------
    const before = Object.keys((await dbGet("cornerFacts")) || {}).length;
    await a.page.evaluate(() => { _factsBackfill.lastRun = 0; backfillCornerFacts(); });
    await sleep(9500);
    const after = Object.keys((await dbGet("cornerFacts")) || {}).length;
    check("unchecked corners are filled in one by one in the background", after >= before + 2, `${before} -> ${after}`);
    check("…spaced out, not all at once", await a.page.evaluate(() => _factsBackfill.running) === true || after - before <= 4, `${after - before} in ~9 s`);

    // ---------- rules ----------
    const w = await a.page.evaluate(async () => {
      const { db, ref, set } = window.FB;
      const r = {};
      r.ok = await set(ref(db, "cornerFacts/test-x"), { v: 1, at: Date.now(), weed: "ok" }).then(() => "ok", () => "denied");
      r.bad = await set(ref(db, "cornerFacts/test-y"), { v: 1, at: Date.now(), weed: "vielleicht" }).then(() => "ok", () => "denied");
      r.abroad = await set(ref(db, "cornerFacts/test-w"), { v: 1, at: Date.now(), weed: "unknown" }).then(() => "ok", () => "denied");
      return r;
    });
    check("members can store facts; nonsense values are refused", w.ok === "ok" && w.abroad === "ok" && w.bad === "denied", JSON.stringify(w));
    const stranger = await newUser(browser, "Fremd");
    await stranger.page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 });
    const sw = await stranger.page.evaluate(async () => window.FB.set(window.FB.ref(window.FB.db, "cornerFacts/test-z"), { v: 1, at: Date.now(), weed: "ok" }).then(() => "ok", () => "denied"));
    check("without the invitation code: no writing", sw === "denied", sw);

    const errs = [a, stranger].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
