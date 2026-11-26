// Corner-Info (weather/sun, kiosks, rain), Cornerdate (calendar) and WhatsApp.
// Open-Meteo and Overpass are mocked with responses in their real formats.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, checkIn, dbGet, resetDb, PORT } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const CORNER = "piazza-zenetti";   // 48.124563, 11.555813
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }

// ---- Open-Meteo fixture: sunny now (3 h), rain from +3 h, Europe/Berlin (UTC+1 in November)
function weatherFixture() {
  const off = 3600000;
  const now = Date.now();
  const midnight = Math.floor((now + off) / 86400000) * 86400000 - off;
  const curIdx = Math.floor((now - midnight) / 3600000);
  const time = [], temp = [], pop = [], mm = [], code = [], sun = [], isDay = [];
  for (let i = 0; i < 48; i++) {
    const t = midnight + i * 3600000;
    time.push(new Date(t + off).toISOString().slice(0, 16));
    const sunny = i >= curIdx - 1 && i <= curIdx + 1;
    const rain = i >= curIdx + 3 && i <= curIdx + 5;
    temp.push(9 + (i % 5));
    pop.push(rain ? 70 : 10);
    mm.push(rain ? 1.2 : 0);
    code.push(sunny ? 0 : rain ? 61 : 3);
    sun.push(sunny ? 3600 : 0);
    isDay.push(i % 24 >= 7 && i % 24 <= 16 ? 1 : 0);
  }
  return { latitude: 48.12, longitude: 11.56, timezone: "Europe/Berlin", utc_offset_seconds: 3600,
    hourly: { time, temperature_2m: temp, precipitation_probability: pop, precipitation: mm, weather_code: code, sunshine_duration: sun, is_day: isDay } };
}
// ---- Overpass fixture around Piazza Zenetti
const OVERPASS = { version: 0.6, elements: [
  { type: "node", id: 1, lat: 48.1250, lon: 11.5562, tags: { shop: "kiosk", name: "Kiosk Zenetti", opening_hours: "Mo-Su 00:00-24:00" } },
  { type: "node", id: 2, lat: 48.1236, lon: 11.5545, tags: { shop: "convenience", name: "Späti 24", opening_hours: "24/7" } },
  { type: "node", id: 3, lat: 48.1272, lon: 11.5528, tags: { amenity: "fuel", brand: "Aral", opening_hours: "Mo-Fr 06:00-22:00; Sa,Su 08:00-20:00" } },
  { type: "node", id: 4, lat: 48.1247, lon: 11.5560, tags: { shop: "kiosk", name: "Nachtkiosk", opening_hours: "Mo-Su 03:00-03:30" } },
  { type: "node", id: 5, lat: 48.1243, lon: 11.5562, tags: { amenity: "shelter", shelter_type: "public_transport", name: "Zenettiplatz" } },
  { type: "way", id: 6, center: { lat: 48.1249, lon: 11.5551 }, tags: { highway: "footway", covered: "yes" } },
  { type: "node", id: 7, lat: 48.1300, lon: 11.5600, tags: { shop: "bakery", name: "ignored" } }
] };

let overpassCalls = 0;
async function mockApis(context) {
  await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(weatherFixture()) }));
  await context.route("https://overpass-api.de/**", (route) => { overpassCalls++; return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(OVERPASS) }); });
  await context.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return {}; }; });
}

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const anna = await newUser(browser, "Anna", { dsf: 2, viewport: { width: 390, height: 844 }, beforeGoto: mockApis });
    const ben = await newUser(browser, "Ben", { dsf: 2, viewport: { width: 390, height: 844 }, beforeGoto: mockApis });
    const cleo = await newUser(browser, "Cleo", { beforeGoto: mockApis });
    for (const u of [anna, ben, cleo]) await onboard(u);

    // ---------- pure logic ----------
    const oh = await anna.page.evaluate(() => {
      const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi);   // 2026-11-16 is a Monday
      return {
        a: osmOpenNow("24/7", at(2026, 11, 15, 3, 0)),
        b: osmOpenNow("Mo-Sa 07:00-22:00; Su off", at(2026, 11, 15, 12, 0)),
        c: osmOpenNow("Mo-Sa 07:00-22:00; Su off", at(2026, 11, 16, 8, 0)),
        d: osmOpenNow("Mo-Sa 07:00-22:00; Su off", at(2026, 11, 16, 23, 0)),
        e: osmOpenNow("Fr-Sa 18:00-02:00", at(2026, 11, 14, 1, 0)),
        f: osmOpenNow("Fr-Sa 18:00-02:00", at(2026, 11, 15, 1, 0)),
        g: osmOpenNow("Fr-Sa 18:00-02:00", at(2026, 11, 15, 3, 0)),
        h: osmOpenNow("Mo-Fr 08:00-12:00,14:00-18:00", at(2026, 11, 18, 13, 0)),
        i: osmOpenNow("Mo-Fr 08:00-12:00,14:00-18:00", at(2026, 11, 18, 15, 0)),
        j: osmOpenNow("sunrise-sunset", at(2026, 11, 18, 15, 0)),
        k: osmOpenNow("Mo-Fr 08:00-18:00; PH off", at(2026, 11, 16, 10, 0)),
        l: osmOpenNow("Sa,Su 08:00-20:00", at(2026, 11, 16, 10, 0))
      };
    });
    const ohOk = oh.a === true && oh.b === false && oh.c === true && oh.d === false && oh.e === true && oh.f === true && oh.g === false && oh.h === false && oh.i === true && oh.j === null && oh.k === true && oh.l === false;
    check("opening-hours parser", ohOk, JSON.stringify(oh));
    const sun = await anna.page.evaluate(() => {
      const s = sunDay(new Date(2026, 10, 13, 12, 0).getTime(), 48.1245, 11.5558);
      const hm = (t) => t && `${new Date(t).getHours()}:${String(new Date(t).getMinutes()).padStart(2, "0")}`;
      return { rise: hm(s.rise), set: hm(s.set), golden: hm(s.golden), highFrom: hm(s.highFrom), highTo: hm(s.highTo), maxEl: Math.round(s.maxEl) };
    });
    // Reference for Munich, 13 Nov 2026: sunrise ≈ 07:23, sunset ≈ 16:40, max elevation ≈ 24°
    const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
    check("sun times for Munich are plausible", Math.abs(toMin(sun.rise) - 443) <= 10 && Math.abs(toMin(sun.set) - 1000) <= 10 && sun.maxEl >= 22 && sun.maxEl <= 26 && !!sun.highFrom, JSON.stringify(sun));

    // ---------- Corner-Info ----------
    await checkIn(anna, CORNER); await checkIn(ben, CORNER);
    await anna.page.evaluate((id) => openDetail(id), CORNER);
    await anna.page.waitForSelector(".ci-hours .ci-hour", { timeout: 10000 });
    await anna.page.waitForSelector(".ci-supply .ci-place", { timeout: 10000 });
    const ci = await anna.page.textContent(".corner-info-section");
    check("weather: sunny now + rain later", ci.includes("Gerade Sonne") && ci.includes("Regen ab ca."), ci.replace(/\s+/g, " ").slice(0, 160));
    check("sunset + golden hour shown", ci.includes("Sonnenuntergang") && ci.includes("Golden Hour"));
    const supplyRows = await anna.page.$$eval(".ci-supply .ci-place", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
    // Time-independent: every open place comes before every closed one (the
    // Aral station in the fixture closes at night), the night kiosk is closed.
    const firstClosed = supplyRows.findIndex((r) => r.includes("● zu"));
    const lastOpen = supplyRows.map((r) => r.includes("● offen")).lastIndexOf(true);
    check("nearest supplies listed, open ones first", supplyRows.length === 4 && /Kiosk Zenetti|Späti 24/.test(supplyRows[0]) && supplyRows[0].includes("offen") && (firstClosed === -1 || lastOpen < firstClosed) && supplyRows.some((r) => r.includes("Nachtkiosk") && r.includes("● zu")), supplyRows.join(" | "));
    const routeHref = await anna.page.getAttribute(".ci-supply .ci-place a", "href");
    check("walking route link", /google\.com\/maps\/dir\/\?api=1&destination=48\.\d+,11\.\d+&travelmode=walking/.test(routeHref), routeHref);
    const shelter = await anna.page.textContent(".ci-shelter");
    check("covered spots nearby listed", shelter.includes("Zenettiplatz") && shelter.includes("Arkade"), shelter.replace(/\s+/g, " ").slice(0, 120));
    await anna.page.evaluate(() => document.querySelector(".corner-info-section").scrollIntoView());
    await anna.page.screenshot({ path: path.join(SHOTS, "12-corner-info.png") });

    // Rain vote → regenfest + alternative for another corner.
    await anna.page.click('[data-rain-vote="ueberdacht"]');
    await anna.page.waitForTimeout(1200);
    check("rain vote stored", (await dbGet(`emojiVotes/${CORNER}/ueberdacht/${anna.uid}`)) === true);
    check("verdict: regenfest", (await anna.page.textContent(".ci-rain-vote")).includes("Regenfest"));
    await ben.page.evaluate(() => openDetail("harras"));
    await ben.page.waitForSelector(".ci-alt", { timeout: 5000 });
    await ben.page.waitForTimeout(800);
    check("rain alternative suggested elsewhere", (await ben.page.textContent(".ci-alt")).includes("Piazza Zenetti"));
    const callsBefore = overpassCalls;
    await anna.page.evaluate((id) => { closeDetail(); openDetail(id); }, CORNER);
    await anna.page.waitForSelector(".ci-supply .ci-place", { timeout: 5000 });
    check("places are cached (no second Overpass call)", overpassCalls === callsBefore, `calls=${overpassCalls}`);

    // ---------- Cornerdate ----------
    await anna.page.evaluate((id) => openCornerDatePlanner(id), CORNER);
    const tomorrow = await anna.page.evaluate(() => { const d = new Date(Date.now() + 86400000); return toDateInputValue(d); });
    await anna.page.fill("#cd-date", tomorrow);
    await anna.page.fill("#cd-time", "19:00");
    await anna.page.fill("#cd-note", "Bring 'ne Decke mit");
    await anna.page.click("#cd-save");
    await anna.page.waitForSelector("#cd-done:not([hidden])", { timeout: 10000 });
    await anna.page.screenshot({ path: path.join(SHOTS, "13-cornerdate-done.png") });
    const dates = await dbGet("cornerDates");
    const [dateId, date] = Object.entries(dates || {})[0] || [];
    const startLocal = date && await anna.page.evaluate((s) => { const d = new Date(s); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; }, date.start);
    check("cornerdate stored (19:00, 2 h, creator going)", !!date && startLocal === "19:00" && date.end - date.start === 7200000 && !!date.going[anna.uid] && date.note === "Bring 'ne Decke mit", JSON.stringify({ startLocal, note: date && date.note }));
    const ev = Object.values((await dbGet("notify")) || {}).find((e) => e.type === "cornerdate");
    check("push to everyone queued with deep link (straight to the invitation)", !!ev && ev.query === `?corner=${CORNER}&date=1&cd=${dateId}` && ev.body.includes("Cornerdate"), ev && ev.query);
    const [download] = await Promise.all([anna.page.waitForEvent("download"), anna.page.click("#cd-done [data-cd-ics]")]);
    const ics = fs.readFileSync(await download.path(), "utf8");
    const icsLines = ics.split("\r\n");
    const longest = Math.max(...icsLines.map((l) => Buffer.byteLength(l, "utf8")));
    check("ics: valid calendar with place, pin and reminder", ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("SUMMARY:🍻 Cornerdate: Piazza Zenetti") && ics.includes("LOCATION:Piazza Zenetti\\, Isarvorstadt\\, München") && ics.includes("GEO:48.124563;11.555813") && ics.includes("TRIGGER:-PT30M") && ics.includes(`DTSTART:${new Date(date.start).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`) && longest <= 75, `${download.suggestedFilename()} longest=${longest}`);
    fs.writeFileSync(path.join(SHOTS, "cornerdate.ics"), ics);
    const gcal = await anna.page.getAttribute("#cd-done a[href*='calendar.google.com']", "href");
    check("google calendar link", /action=TEMPLATE/.test(gcal) && /dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/.test(gcal), gcal.slice(0, 120));
    await anna.page.click("#cd-done [data-cd-wa]");
    const waDate = await anna.page.evaluate(() => decodeURIComponent((window.__opened.pop() || "").replace("https://wa.me/?text=", "")));
    check("whatsapp share for the date", waDate.startsWith("📅 Cornerdate: Morgen, 19:00–21:00 am Piazza Zenetti!"), waDate.slice(0, 120));
    await anna.page.click("#cd-done [data-cd-close]");

    // Ben: toast + list strip + RSVP
    const benToast = await ben.page.textContent("#toast");
    check("Ben notified in-app", benToast.includes("plant ein Cornerdate"), benToast.replace(/\s+/g, " "));
    await ben.page.evaluate(() => { closeDetail(); document.querySelector('.tab[data-view="list"]').click(); });
    await ben.page.waitForSelector("#cornerdates-strip .cd-strip-item", { timeout: 5000 });
    check("list shows upcoming cornerdate", (await ben.page.textContent("#cornerdates-strip")).includes("Piazza Zenetti"));
    await ben.page.click("#cornerdates-strip .cd-strip-item");
    await ben.page.waitForSelector(".cornerdate-section [data-cd-going]", { timeout: 5000 });
    await ben.page.click(".cornerdate-section [data-cd-going]");
    await ben.page.waitForTimeout(1000);
    check("Ben's RSVP stored", !!(await dbGet(`cornerDates/${dateId}/going/${ben.uid}`)));
    const tryWrite = (u, p, v) => u.page.evaluate(async ({ p, v }) => { try { await window.FB.set(window.FB.ref(window.FB.db, p), v); return "ok"; } catch (e) { return "denied"; } }, { p, v });
    check("Ben cannot change Anna's date", (await tryWrite(ben, `cornerDates/${dateId}/start`, date.start + 3600000)) === "denied");
    check("Ben cannot RSVP for Cleo", (await tryWrite(ben, `cornerDates/${dateId}/going/${cleo.uid}`, { name: "Cleo", at: Date.now() })) === "denied");
    await ben.page.evaluate(() => document.querySelector(".cornerdate-section").scrollIntoView());
    await ben.page.screenshot({ path: path.join(SHOTS, "14-cornerdate-section.png") });

    // Deep link from the push.
    await cleo.page.goto(`http://127.0.0.1:${PORT}/index.html?corner=${CORNER}&date=1`);
    await cleo.page.waitForSelector("#detail-overlay.open .cornerdate-section .cd-item", { timeout: 10000 });
    check("push deep link opens the cornerdate", (await cleo.page.textContent(".cornerdate-section")).includes("2 dabei"));

    // ---------- WhatsApp ----------
    await cleo.page.evaluate(() => { closeDetail(); localStorage.setItem("cg.autoWhatsApp", "1"); document.querySelector('.tab[data-view="list"]').click(); });
    await cleo.page.click(`#card-${CORNER} .checkin-btn`);   // a real tap → may open WhatsApp
    await cleo.page.waitForTimeout(600);
    const auto = await cleo.page.evaluate(() => decodeURIComponent((window.__opened[window.__opened.length - 1] || "").replace("https://wa.me/?text=", "")));
    check("auto-WhatsApp after a tapped check-in", auto.startsWith("🍻 Bin gerade am Piazza Zenetti (Isarvorstadt)!") && auto.includes("Schon da:") && auto.includes("Anna") && /[?&]corner=piazza-zenetti/.test(auto) && /[?&]come=1/.test(auto), auto.slice(0, 160));
    if (await cleo.page.isVisible("#checkin-team-overlay")) {
      await cleo.page.click("#cto-whatsapp");
      const fromOverlay = await cleo.page.evaluate(() => window.__opened.length);
      check("WhatsApp button in the check-in dialog", fromOverlay >= 2);
      await cleo.page.click("#cto-skip");
    } else check("WhatsApp button in the check-in dialog", false, "overlay not shown");
    const autoGps = await cleo.page.evaluate(() => { const n = window.__opened.length; STATE.lastCheckinTime = 0; manualCheckin("harras"); return window.__opened.length - n; });
    check("no WhatsApp on a check-in without a tap", autoGps === 0);

    // ---------- list banner ----------
    await ben.page.evaluate(() => { closeDetail(); document.querySelector('.tab[data-view="list"]').click(); renderWeatherBanner(); });
    await ben.page.waitForFunction(() => document.querySelector("#weather-banner")?.textContent.includes("Regen"), null, { timeout: 5000 });
    const banner = await ben.page.textContent("#weather-banner");
    check("list weather banner with rain-proof tip", banner.includes("Gerade Sonne") && banner.includes("Regen ab ca.") && banner.includes("Piazza Zenetti"), banner.replace(/\s+/g, " "));
    await ben.page.evaluate(() => window.scrollTo(0, document.querySelector("#weather-banner").offsetTop - 120));
    await ben.page.screenshot({ path: path.join(SHOTS, "15-list-banner.png") });

    // Anna cancels her date.
    await anna.page.evaluate((id) => openDetail(id), CORNER);
    await anna.page.click(".cornerdate-section [data-cd-cancel]");
    await anna.page.click("#app-dialog-ok");
    await anna.page.waitForTimeout(1000);
    check("creator can cancel", (await dbGet(`cornerDates/${dateId}`)) === null);

    const errs = [anna, ben, cleo].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")).map((l) => `${u.name}: ${l}`));
    check("no page errors", errs.length === 0, errs.slice(0, 4).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
