// Munich districts (numbers + outlines) and the pin picker for new spots.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One well-known place per district (plus one outside Munich).
const PLACES = [
  ["01", "Marienplatz", 48.1374, 11.5755], ["02", "Theresienwiese", 48.1316, 11.5494], ["03", "Pinakotheken", 48.1488, 11.5700],
  ["04", "Elisabethplatz", 48.1588, 11.5726], ["05", "Ostbahnhof", 48.1270, 11.6046], ["06", "Margaretenplatz", 48.1194, 11.5438],
  ["07", "Westpark", 48.1225, 11.5195], ["08", "Gollierplatz", 48.1355, 11.5333], ["09", "Rotkreuzplatz", 48.1530, 11.5340],
  ["10", "Bahnhof Moosach", 48.1797, 11.5106], ["11", "Olympiapark", 48.1755, 11.5518], ["12", "Allianz Arena", 48.2188, 11.6247],
  ["13", "Arabellapark", 48.1527, 11.6158], ["14", "Bahnhof Berg am Laim", 48.1236, 11.6339], ["15", "Messestadt Riem", 48.1340, 11.6900],
  ["16", "Neuperlach Zentrum", 48.1009, 11.6458], ["17", "Bahnhof Giesing", 48.1118, 11.5961], ["18", "Candidplatz", 48.1105, 11.5745],
  ["19", "Solln", 48.0790, 11.5250], ["20", "Hadern", 48.1173, 11.4789], ["21", "Bahnhof Pasing", 48.1497, 11.4612],
  ["22", "Aubing", 48.1560, 11.4110], ["23", "Allach", 48.1950, 11.4650], ["24", "Hasenbergl", 48.2150, 11.5550],
  ["25", "Laim Mitte", 48.1380, 11.5000], [null, "Tegernsee", 47.7116, 11.7577]
];

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const anna = await newUser(browser, "Anna", { dsf: 2, viewport: { width: 390, height: 844 } });
    await onboard(anna);
    await anna.page.waitForFunction(() => Array.isArray(_districts) && _districts.length === 25, null, { timeout: 15000 });
    check("25 Stadtbezirke loaded", true);
    const wrong = await anna.page.evaluate((places) => places.map(([nr, name, lat, lng]) => {
      const d = districtAt(lat, lng);
      return { nr, name, got: d ? d.nr : null };
    }).filter((x) => x.got !== x.nr), PLACES);
    check("known places land in the right district (25 + outside)", wrong.length === 0, JSON.stringify(wrong));
    const names = await anna.page.evaluate(() => _districts.map((d) => `${d.nr} ${d.name}`));
    console.log("CORNERS:", JSON.stringify(await anna.page.evaluate(() => getAllCorners().map((c) => `${c.name} → ${cornerDistrict(c) ? cornerDistrict(c).nr + " " + cornerDistrict(c).name : "außerhalb"}`))));
    check("numbered like the city (01 Altstadt-Lehel … 25 Laim)", names[0] === "01 Altstadt-Lehel" && names[1] === "02 Ludwigsvorstadt-Isarvorstadt" && names[24] === "25 Laim", names.slice(0, 3).join(" | "));

    // ---- main map ----
    await anna.page.waitForFunction(() => document.querySelectorAll("#main-map .district-label").length === 25, null, { timeout: 10000 }).catch(() => {});
    const layer = await anna.page.evaluate(() => ({ labels: document.querySelectorAll("#main-map .district-label").length, paths: document.querySelectorAll("#main-map path.leaflet-interactive").length }));
    check("map shows 25 outlines with numbers", layer.labels === 25 && layer.paths >= 25, JSON.stringify(layer));
    await anna.page.evaluate(() => STATE.mainMap.setView([48.137, 11.575], 12, { animate: false }));
    await sleep(200);
    const namesAt12 = await anna.page.evaluate(() => getComputedStyle(document.querySelector("#main-map .district-label span")).display);
    await anna.page.evaluate(() => STATE.mainMap.setView([48.137, 11.575], 13, { animate: false }));
    await sleep(200);
    const namesAt13 = await anna.page.evaluate(() => getComputedStyle(document.querySelector("#main-map .district-label span")).display);
    check("names appear from zoom 13 (numbers always)", namesAt12 === "none" && namesAt13 !== "none", `${namesAt12} / ${namesAt13}`);
    await anna.page.evaluate(() => STATE.mainMap.setView([48.1316, 11.5494], 14, { animate: false }));
    await sleep(300);
    await anna.page.screenshot({ path: path.join(SHOTS, "districts-map.png") });
    // popup on a district
    await anna.page.evaluate(() => {
      _districtLayer.eachLayer((l) => { if (l.getLayers && l.getLayers()[0]?.feature?.properties?.nr === "02") l.fire("click", { latlng: L.latLng(48.1316, 11.5494) }); });
    });
    await sleep(300);
    const popup = await anna.page.textContent("#main-map .leaflet-popup-content").catch(() => "");
    check("tapping a district shows number, name and corner count", /02 · Ludwigsvorstadt-Isarvorstadt/.test(popup) && /Corner/.test(popup), popup);
    // toggle
    await anna.page.click("#district-toggle");
    await sleep(200);
    const off = await anna.page.evaluate(() => document.querySelectorAll("#main-map .district-label").length);
    await anna.page.click("#district-toggle");
    await sleep(200);
    const on = await anna.page.evaluate(() => document.querySelectorAll("#main-map .district-label").length);
    check("districts can be switched off and on", off === 0 && on === 25, `${off} → ${on}`);

    // ---- list: badges + filter ----
    await anna.page.click('.tab[data-view="list"]');
    await sleep(300);
    const badge = await anna.page.textContent("#card-piazza-zenetti .district-badge").catch(() => "");
    check("cards carry the district number", badge === "02", badge);
    const opts = await anna.page.evaluate(() => Array.from(document.querySelectorAll("#district-filter option")).map((o) => o.textContent));
    check("filter lists districts with corner counts", opts[0].includes("Alle") && opts.some((o) => /^02 Ludwigsvorstadt-Isarvorstadt \(\d+\)$/.test(o)), opts.join(" | "));
    await anna.page.selectOption("#district-filter", "02");
    await sleep(200);
    const shown = await anna.page.evaluate(() => Array.from(document.querySelectorAll("#cards .card")).map((c) => c.querySelector(".district-badge")?.textContent));
    check("filter shows only that district", shown.length > 0 && shown.every((b) => b === "02"), JSON.stringify(shown));
    await anna.page.selectOption("#district-filter", "");

    // ---- detail ----
    await anna.page.evaluate(() => openDetail("piazza-zenetti"));
    await sleep(200);
    const det = await anna.page.textContent(".detail-district");
    check("detail names the district", /Stadtbezirk 02 · Ludwigsvorstadt-Isarvorstadt/.test(det.replace(/\s+/g, " ")), det);
    await anna.page.click(".detail-district [data-district-map]");
    await sleep(900);
    const view = await anna.page.evaluate(() => ({ tab: STATE.view, z: STATE.mainMap.getZoom(), detail: document.querySelector("#detail-overlay").classList.contains("open") }));
    check("'Grenzen zeigen' jumps to the district on the map", view.tab === "map" && !view.detail && view.z >= 12, JSON.stringify(view));

    // ---- pin picker ----
    await anna.page.click("#fab");
    await anna.page.waitForFunction(() => !!_pinMap && document.querySelector("#spot-pin-map .leaflet-tile-pane") !== null, null, { timeout: 5000 });
    // It first looks for the location; without GPS permission it falls back to the hint.
    await anna.page.waitForFunction(() => /Tipp auf die Karte/.test(document.querySelector("#spot-pin-info").textContent), null, { timeout: 9000 }).catch(() => {});
    const hint = await anna.page.textContent("#spot-pin-info");
    await anna.page.evaluate(() => { document.querySelector(".spot-more").open = true; });   // description, district, coordinates
    check("without GPS: hint to tap the map", /Tipp auf die Karte/.test(hint), hint);
    await anna.page.evaluate(() => _pinMap.fire("click", { latlng: L.latLng(48.15881, 11.57258) }));
    await sleep(200);
    const afterTap = await anna.page.evaluate(() => ({ lat: document.querySelector("#f-lat").value, lng: document.querySelector("#f-lng").value, info: document.querySelector("#spot-pin-info").textContent, area: document.querySelector("#f-area").value, pin: !!_pinMarker }));
    check("tap sets pin + coordinates", afterTap.pin && afterTap.lat === "48.158810" && afterTap.lng === "11.572580", JSON.stringify(afterTap));
    check("pin shows the district and fills 'Stadtteil'", /04 Schwabing-West/.test(afterTap.info) && afterTap.area === "Schwabing-West", JSON.stringify(afterTap));
    // drag the pin
    await anna.page.evaluate(() => { _pinMarker.setLatLng([48.1374, 11.5755]); _pinMarker.fire("dragend"); });
    await sleep(200);
    const afterDrag = await anna.page.evaluate(() => ({ lat: document.querySelector("#f-lat").value, info: document.querySelector("#spot-pin-info").textContent, area: document.querySelector("#f-area").value }));
    check("dragging the pin updates everything", afterDrag.lat === "48.137400" && /01 Altstadt-Lehel/.test(afterDrag.info) && afterDrag.area === "Altstadt-Lehel", JSON.stringify(afterDrag));
    // a typed Stadtteil is kept
    await anna.page.fill("#f-area", "Glockenbachviertel");
    await anna.page.evaluate(() => { _pinMarker.setLatLng([48.1300, 11.5700]); _pinMarker.fire("dragend"); });
    check("a typed 'Stadtteil' is not overwritten", await anna.page.inputValue("#f-area") === "Glockenbachviertel");
    // typed coordinates move the pin
    await anna.page.fill("#f-lat", "48.1530");
    await anna.page.fill("#f-lng", "11.5340");
    await anna.page.dispatchEvent("#f-lng", "change");
    await sleep(200);
    const moved = await anna.page.evaluate(() => { const p = _pinMarker.getLatLng(); return [p.lat.toFixed(4), p.lng.toFixed(4), document.querySelector("#spot-pin-info").textContent]; });
    check("typed coordinates move the pin", moved[0] === "48.1530" && moved[1] === "11.5340" && /09 Neuhausen/.test(moved[2]), JSON.stringify(moved));
    // too close to an existing corner
    const pz = await anna.page.evaluate(() => { const c = getAllCorners().find((x) => x.id === "piazza-zenetti"); _pinMap.fire("click", { latlng: L.latLng(c.lat + 0.0001, c.lng) }); return document.querySelector("#spot-pin-info").textContent; });
    check("warns when the pin is right next to an existing corner", /Piazza Zenetti/.test(pz) && /Abstand/.test(pz), pz);
    await anna.page.screenshot({ path: path.join(SHOTS, "pin-picker.png") });
    // save a spot via the picker
    await anna.page.evaluate(() => _pinMap.fire("click", { latlng: L.latLng(48.1601, 11.5740) }));
    await anna.page.fill("#f-name", "Elisabethmarkt-Eck");
    await anna.page.fill("#f-desc", "Bänke, Sonne bis spät");
    await anna.page.click("#modal-save");
    await sleep(1200);
    const spots = Object.values((await dbGet("corners")) || {});
    const sp = spots.find((c) => c.name === "Elisabethmarkt-Eck");
    check("spot saved at the pin", sp && Math.abs(sp.lat - 48.1601) < 1e-5 && Math.abs(sp.lng - 11.5740) < 1e-5, JSON.stringify(sp && { lat: sp.lat, lng: sp.lng, area: sp.area }));
    await anna.page.click('.tab[data-view="list"]');
    await sleep(400);
    const newBadge = await anna.page.evaluate((id) => document.querySelector(`#card-${id} .district-badge`)?.textContent, sp && sp.id);
    check("new spot shows its district number", newBadge === "04", newBadge);

    const errs = anna.page._logs.filter((l) => l.startsWith("[pageerror]"));
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
