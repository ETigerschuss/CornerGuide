// New corner by tapping only: GPS pin, district, name idea, emoji toggles
// pre-filled from OpenStreetMap, cannabis/park/city rules — plus the same
// "Regeln & Ausstattung" for every corner in the detail.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// metres -> degrees around Munich
const dLat = (m) => m / 110540;
const dLng = (m, lat) => m / (111320 * Math.cos(lat * Math.PI / 180));
const P = { lat: 48.1310, lng: 11.5760 };            // a spot near Gärtnerplatz (test data)
function square(lat, lng, half) {                      // closed way around a centre
  const a = dLat(half), b = dLng(half, lat);
  return [{ lat: lat - a, lon: lng - b }, { lat: lat - a, lon: lng + b }, { lat: lat + a, lon: lng + b }, { lat: lat + a, lon: lng - b }, { lat: lat - a, lon: lng - b }];
}
function line(lat, lng, offsetN, lenE) {               // east-west street offsetN metres north
  const y = lat + dLat(offsetN);
  return [{ lat: y, lon: lng - dLng(lenE, lat) }, { lat: y, lon: lng + dLng(lenE, lat) }];
}
const SCENE_P = { elements: [
  { type: "way", id: 1, tags: { amenity: "school", name: "Testschule" }, geometry: square(P.lat + dLat(75), P.lng, 15) },   // edge ~60 m away
  { type: "node", id: 2, lat: P.lat, lon: P.lng + dLng(120, P.lat), tags: { amenity: "toilets", fee: "no" } },
  { type: "node", id: 3, lat: P.lat + dLat(80), lon: P.lng + dLng(10, P.lat), tags: { amenity: "drinking_water" } },
  { type: "node", id: 4, lat: P.lat - dLat(150), lon: P.lng, tags: { shop: "kiosk", name: "Späti Eck" } },
  { type: "way", id: 5, tags: { highway: "residential", name: "Gärtnerplatz" }, geometry: line(P.lat, P.lng, 10, 80) },
  { type: "way", id: 6, tags: { highway: "tertiary", name: "Reichenbachstraße" }, geometry: line(P.lat, P.lng, -25, 80) },
  { type: "way", id: 7, tags: { highway: "footway" }, geometry: line(P.lat, P.lng, 3, 30) },
  { type: "node", id: 8, lat: P.lat + dLat(5), lon: P.lng, tags: { place: "square", name: "Gärtnerplatz" } }
] };
const SCENE_EMPTY = { elements: [{ type: "way", id: 20, tags: { highway: "residential", name: "Ruhige Straße" }, geometry: line(48.1700, 11.6200, 8, 60) }] };

async function mockOverpass(page, opts = {}) {
  page._overpassCalls = 0;
  await page.route(/overpass/, (route) => {
    page._overpassCalls++;
    if (opts.down) return route.fulfill({ status: 503, body: "" });
    const q = decodeURIComponent(route.request().url().split("data=")[1] || "");
    const m = q.match(/around:\d+,([0-9.]+),([0-9.]+)/);
    const lat = m ? parseFloat(m[1]) : 0;
    const body = Math.abs(lat - P.lat) < 0.002 ? SCENE_P : SCENE_EMPTY;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    // ---------- Lena stands at the spot and adds it with taps only ----------
    const lena = await newUser(browser, "Lena", { dsf: 2, viewport: { width: 390, height: 844 }, beforeGoto: async (ctx) => { await ctx.grantPermissions(["geolocation"]); await ctx.setGeolocation({ latitude: P.lat, longitude: P.lng, accuracy: 10 }); } });
    await mockOverpass(lena.page);
    await onboard(lena);
    await lena.page.click("#fab");
    await lena.page.waitForFunction(() => !!_pinMarker, null, { timeout: 10000 }).catch(() => {});
    await lena.page.waitForFunction(() => !!SPOT_DRAFT.check, null, { timeout: 10000 }).catch(() => {});
    await sleep(300);
    const d = await lena.page.evaluate(() => ({
      pin: _pinMarker ? [_pinMarker.getLatLng().lat.toFixed(4), _pinMarker.getLatLng().lng.toFixed(4)] : null,
      info: document.querySelector("#spot-pin-info").textContent,
      name: document.querySelector("#f-name").value,
      chips: Array.from(document.querySelectorAll("#spot-name-chips .spot-chip")).map((x) => x.textContent),
      on: Array.from(document.querySelectorAll(".spot-amen.on")).map((x) => x.dataset.amen),
      weedLabel: document.querySelector('.spot-amen[data-amen="kiffen"]').textContent.replace(/\s+/g, " ").trim(),
      rules: document.querySelector("#spot-rules").textContent.replace(/\s+/g, " ")
    }));
    check("opening the dialog puts the pin where you stand", d.pin && d.pin[0] === "48.1310" && d.pin[1] === "11.5760", JSON.stringify(d.pin));
    check("district shown automatically", /02 Ludwigsvorstadt-Isarvorstadt/.test(d.info), d.info);
    check("name is filled in from the map (corner of the two streets)", /^Ecke Gärtnerplatz\/Reichenbachstr\.$/.test(d.name) && d.chips.includes("Gärtnerplatz"), JSON.stringify({ name: d.name, chips: d.chips }));
    check("toilet, water, kiosk switched on automatically; no roof/sport", ["toilette", "wasser", "kiosk"].every((k) => d.on.includes(k)) && !d.on.includes("dach") && !d.on.includes("sport"), JSON.stringify(d.on));
    check("school 60 m away: 🟢 off, with the reason (code word)", !d.on.includes("kiffen") && /hier nicht/.test(d.weedLabel) && /Kein grünes Licht/.test(d.rules) && !/Kiffen|Cannabis|🌿/.test(d.rules) && /Testschule/.test(d.rules) && /60 m/.test(d.rules), d.rules.slice(0, 200));
    check("source and 'ohne Gewähr' are shown", /Quelle/.test(d.rules) && /ohne Gewähr/.test(d.rules));
    await lena.page.screenshot({ path: path.join(SHOTS, "spot-tap.png") });
    // a tap flips an emoji (e.g. there IS a roof: the bridge)
    await lena.page.click('.spot-amen[data-amen="dach"]');
    check("one tap toggles an emoji", await lena.page.evaluate(() => SPOT_DRAFT.amen.dach === true));
    // save without typing anything
    await lena.page.click("#modal-save");
    await sleep(1500);
    const spots = Object.values((await dbGet("corners")) || {});
    const sp = spots.find((c) => c.name === "Ecke Gärtnerplatz/Reichenbachstr.");
    check("saved with taps only (no description needed)", !!sp && sp.area === "Ludwigsvorstadt-Isarvorstadt", JSON.stringify(sp && { area: sp.area, desc: sp.description }));
    check("emojis and rules stored with the spot", sp && ["toilette", "wasser", "kiosk", "dach"].every((k) => (sp.amenities || []).includes(k)) && sp.check && sp.check.weed === "no", JSON.stringify(sp && { a: sp.amenities, c: sp.check }));

    // ---------- the detail of any corner shows rules & amenities ----------
    await lena.page.evaluate((id) => openDetail(id), sp.id);
    await lena.page.waitForFunction(() => !/Prüfe/.test(document.querySelector(".ci-spotcheck")?.textContent || "Prüfe"), null, { timeout: 10000 }).catch(() => {});
    const det = await lena.page.evaluate(() => document.querySelector(".ci-spotcheck")?.textContent.replace(/\s+/g, " ") || "");
    check("corner detail: 'Regeln & Ausstattung' with pills and reasons", /Toilette/.test(det) && /Kein grünes Licht/.test(det) && !/Kiffen|Cannabis/.test(det) && /Testschule/.test(det), det.slice(0, 200));
    const chipsDetail = await lena.page.evaluate(() => Array.from(document.querySelectorAll("#detail-content .emoji-vote-chip")).map((x) => x.dataset.amenity));
    check("…and the emojis as vote chips", ["toilette", "wasser", "kiosk", "dach"].every((k) => chipsDetail.includes(k)), JSON.stringify(chipsDetail));
    await lena.page.screenshot({ path: path.join(SHOTS, "spot-detail.png"), fullPage: false });

    // ---------- rule logic (pure) ----------
    const logic = await lena.page.evaluate(() => {
      const geom = (lat, lng) => [{ lat: lat - 0.0003, lon: lng }, { lat: lat + 0.0003, lon: lng }];
      const mk = (els) => ({ elements: els });
      const at = { lat: 48.1380, lng: 11.5720 };
      const fz = analyzeSpot(mk([{ type: "way", id: 1, tags: { highway: "pedestrian", name: "Kaufingerstraße" }, geometry: geom(at.lat, at.lng) }]), at.lat, at.lng);
      const abg = analyzeSpot(mk([{ type: "area", id: 3600001, tags: { leisure: "park", name: "Alter Botanischer Garten" } }]), 48.1425, 11.5667);
      const hbf = analyzeSpot(mk([{ type: "way", id: 2, tags: { highway: "primary", name: "Bayerstraße" }, geometry: [{ lat: 48.1398, lon: 11.5570 }, { lat: 48.1398, lon: 11.5620 }] }]), 48.1399, 11.5590);
      const hbfFar = analyzeSpot(mk([{ type: "way", id: 2, tags: { highway: "primary", name: "Bayerstraße" }, geometry: [{ lat: 48.1370, lon: 11.5300 }, { lat: 48.1370, lon: 11.5360 }] }]), 48.1371, 11.5330);
      const park = analyzeSpot(mk([{ type: "area", id: 3600002, tags: { leisure: "park", name: "Testpark", opening_hours: "Mo-Su 06:00-22:00" } }]), 48.15, 11.55);
      const free = analyzeSpot(mk([]), 48.17, 11.62);
      const priv = analyzeSpot(mk([{ type: "way", id: 9, tags: { leisure: "pitch", access: "private" }, geometry: geom(48.17, 11.62) }]), 48.17, 11.62);
      const italy = analyzeSpot(mk([{ type: "area", id: 3600003, tags: { "ISO3166-1": "IT", admin_level: "2", name: "Italia" } }]), 45.9225, 10.8832);
      const germany = analyzeSpot(mk([{ type: "area", id: 3600004, tags: { "ISO3166-1": "DE", admin_level: "2", name: "Deutschland" } }]), 48.17, 11.62);
      const austria = analyzeSpot(mk([{ type: "area", id: 3600005, tags: { "ISO3166-1": "AT", admin_level: "2", name: "Österreich" } }]), 47.80, 13.04);
      const swiss = analyzeSpot(mk([{ type: "area", id: 3600006, tags: { "ISO3166-1": "CH", admin_level: "2", name: "Schweiz" } }]), 47.37, 8.54);
      const txt = (r) => spotRuleLines(r).map((l) => l.text).join(" | ");
      return {
        fz: [weedVerdict(fz).v, txt(fz)], abg: [weedVerdict(abg).v, txt(abg)], hbf: [hbf.hbf, txt(hbf)], hbfFar: hbfFar.hbf,
        park: txt(park), free: [weedVerdict(free).v, txt(free)], priv: weedVerdict(priv).v,
        italy: [weedVerdict(italy).v, txt(italy), italy.parks.length, amenityFromCheck("kiffen", italy)], germany: [weedVerdict(germany).v, germany.parks.length],
        austria: [weedVerdict(austria).v, txt(austria), spotRuleLines(austria)[0].src], swiss: [weedVerdict(swiss).v, txt(swiss)],
        night: [weedAllowedNow({ v: "night" }, new Date(2026, 10, 24, 21, 0)), weedAllowedNow({ v: "night" }, new Date(2026, 10, 24, 15, 0))]
      };
    });
    check("pedestrian zone: green light only from 20 h", logic.fz[0] === "night" && /ab 20 Uhr/.test(logic.fz[1]) && /7–20 Uhr/.test(logic.fz[1]) && logic.night[0] === true && logic.night[1] === false, JSON.stringify(logic.fz));
    check("Alter Botanischer Garten: city ban on weed AND alcohol", logic.abg[0] === "no" && /Alkohol ganztägig verboten/.test(logic.abg[1]), logic.abg[1].slice(0, 160));
    check("Hauptbahnhof area: alcohol ban hint (not far away on the same street)", logic.hbf[0] === true && /Hauptbahnhof/.test(logic.hbf[1]) && logic.hbfFar === false, JSON.stringify([logic.hbf[0], logic.hbfFar]));
    check("park opening hours shown", /Testpark: geöffnet Mo-Su 06:00-22:00/.test(logic.park), logic.park);
    check("nothing nearby: weed ok", logic.free[0] === "ok" && /keine Schule/.test(logic.free[1]));
    check("a private sports ground does not count", logic.priv === "ok");
    check("Lake Garda: no green light in Italy, not doubled", logic.italy[0] === "no" && /^Kein grünes Licht — in Italien/.test(logic.italy[1]) && (logic.italy[1].match(/grünes Licht/g) || []).length === 1 && logic.italy[2] === 0 && logic.italy[3] === false, JSON.stringify(logic.italy));
    check("Austria: no green light, no German source link", logic.austria[0] === "no" && /^Kein grünes Licht — in Österreich/.test(logic.austria[1]) && !logic.austria[2], JSON.stringify(logic.austria));
    check("other countries: the app doesn't guess", logic.swiss[0] === "?" && /andere Regeln/.test(logic.swiss[1]), JSON.stringify(logic.swiss));
    check("in Germany: unchanged, and the country is never taken for a park", logic.germany[0] === "ok" && logic.germany[1] === 0, JSON.stringify(logic.germany));

    // ---------- OpenStreetMap down: still works by tapping ----------
    const max = await newUser(browser, "Max", { beforeGoto: async (ctx) => { await ctx.grantPermissions(["geolocation"]); await ctx.setGeolocation({ latitude: 48.1700, longitude: 11.6200, accuracy: 10 }); } });
    await mockOverpass(max.page, { down: true });
    await onboard(max);
    await max.page.click("#fab");
    await max.page.waitForFunction(() => SPOT_DRAFT.failed === true, null, { timeout: 15000 }).catch(() => {});
    const downTxt = await max.page.textContent("#spot-rules");
    check("OSM down: says so, emojis can be tapped by hand", /nicht erreichbar/.test(downTxt), downTxt);
    await max.page.click('.spot-amen[data-amen="kiosk"]');
    await max.page.fill("#f-name", "Max-Eck");
    await max.page.click("#modal-save");
    await sleep(1200);
    const ms = Object.values((await dbGet("corners")) || {}).find((c) => c.name === "Max-Eck");
    check("…and saving still works", ms && (ms.amenities || []).includes("kiosk"), JSON.stringify(ms && ms.amenities));

    const errs = [lena, max].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
