// Corner-info map: kiosks, toilets, water, shelters, bins, benches.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const CORNER = "piazza-zenetti";   // 48.124563, 11.555813
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERPASS = { version: 0.6, elements: [
  { type: "node", id: 1, lat: 48.1250, lon: 11.5562, tags: { shop: "kiosk", name: "Kiosk Zenetti", opening_hours: "24/7" } },
  { type: "node", id: 2, lat: 48.1236, lon: 11.5545, tags: { shop: "convenience", name: "Späti 24", opening_hours: "24/7" } },
  { type: "node", id: 3, lat: 48.1243, lon: 11.5562, tags: { amenity: "shelter", shelter_type: "public_transport", name: "Zenettiplatz" } },
  { type: "node", id: 10, lat: 48.1252, lon: 11.5571, tags: { amenity: "toilets", name: "Öffentliches WC Schlachthof", fee: "no", wheelchair: "yes", opening_hours: "24/7" } },
  { type: "node", id: 11, lat: 48.1262, lon: 11.5531, tags: { amenity: "toilets", fee: "yes" } },
  { type: "node", id: 12, lat: 48.1240, lon: 11.5552, tags: { amenity: "drinking_water", name: "Trinkbrunnen" } },
  { type: "node", id: 13, lat: 48.1246, lon: 11.5560, tags: { amenity: "waste_basket" } },
  { type: "node", id: 14, lat: 48.1245, lon: 11.5557, tags: { amenity: "bench" } },
  { type: "node", id: 15, lat: 48.1247, lon: 11.5559, tags: { amenity: "bench" } },
  { type: "node", id: 16, lat: 48.1249, lon: 11.5548, tags: { amenity: "recycling", "recycling:glass_bottles": "yes" } }
] };
let overpassCalls = 0;
async function mockApis(context) {
  await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ utc_offset_seconds: 3600, hourly: { time: [] } }) }));
  await context.route("https://overpass-api.de/**", (route) => { overpassCalls++; return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(OVERPASS) }); });
}

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const u = await newUser(browser, "Mia", { dsf: 2, viewport: { width: 390, height: 844 }, beforeGoto: mockApis });
    await onboard(u);
    await u.page.evaluate((id) => openDetail(id), CORNER);
    await u.page.waitForSelector(".ci-amen .ci-place", { timeout: 15000 });
    const amen = await u.page.textContent(".ci-amen");
    check("nearest toilet listed with 'kostenlos' and ♿", /WC Schlachthof/.test(amen) && /kostenlos/.test(amen) && /♿/.test(amen), amen.replace(/\s+/g, " ").slice(0, 160));
    check("drinking water listed", /Trinkbrunnen|Trinkwasser/.test(amen));
    check("quick action jumps to the map", await u.page.isVisible('[data-scroll-target=".ci-mapblock"]'));
    await u.page.click('[data-scroll-target=".ci-mapblock"]');
    await u.page.waitForFunction(() => document.querySelectorAll(".ci-map .ci-map-pin").length > 0, null, { timeout: 10000 }).catch(() => {});
    const pins = await u.page.evaluate(() => Array.from(document.querySelectorAll(".ci-map .ci-map-pin")).map((e) => e.textContent));
    check("map shows kiosk, toilet, water and shelter pins", ["🏪", "🚻", "🚰", "🚏"].every((e) => pins.includes(e)), pins.join(" "));
    check("bins and benches hidden by default", !pins.includes("🪑") && !pins.includes("🗑️"));
    check("the corner itself is marked", await u.page.isVisible(".ci-map .ci-map-corner"));
    const chips = await u.page.evaluate(() => Array.from(document.querySelectorAll(".ci-chip")).map((c) => c.textContent.replace(/\s+/g, " ").trim()));
    check("legend chips show counts", chips.some((c) => /Toiletten 2/.test(c)) && chips.some((c) => /Bänke 2/.test(c)), chips.join(" | "));
    await u.page.click('[data-ci-group="bench"]');
    await sleep(300);
    const pins2 = await u.page.evaluate(() => Array.from(document.querySelectorAll(".ci-map .ci-map-pin")).map((e) => e.textContent));
    check("tapping 'Bänke' shows the benches", pins2.filter((p) => p === "🪑").length === 2, pins2.join(" "));
    check("layer choice is remembered", await u.page.evaluate(() => JSON.parse(localStorage.getItem("cg.ciLayers")).bench === true));
    // popup with route
    await u.page.evaluate(() => { const pin = Array.from(document.querySelectorAll(".ci-map .ci-map-pin")).find((e) => e.textContent === "🚻"); pin.parentElement.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await sleep(400);
    const popup = await u.page.textContent(".leaflet-popup-content").catch(() => "");
    check("pin popup with name, distance and route", /WC|Toilette/.test(popup) && /Route/.test(popup), popup);
    await u.page.evaluate(() => document.querySelector(".ci-mapblock").scrollIntoView({ block: "center" }));
    await sleep(400);
    await u.page.screenshot({ path: path.join(SHOTS, "cimap.png") });
    // reopening uses the cache (places + rules: one request each, then none)
    await sleep(1500);   // the rules query runs after the places query
    const firstOpen = overpassCalls;
    await u.page.evaluate((id) => { closeDetail(); openDetail(id); }, CORNER);
    await sleep(800);
    check("places and rules are cached (no new request on reopening)", firstOpen <= 2 && overpassCalls === firstOpen, `first=${firstOpen} now=${overpassCalls}`);
    const errs = u.page._logs.filter((l) => l.startsWith("[pageerror]"));
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
