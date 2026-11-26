// History playback with zoom, team colours, one visit per day, undo.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, checkIn, dbGet, dbPut, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  await dbPut("corners/custom-tegernsee-1", { id: "custom-tegernsee-1", name: "Seeufer Tegernsee", area: "Tegernsee", lat: 47.7116, lng: 11.7577, description: "Ausflug", tags: [], amenities: [], isCustom: true, createdBy: "Test", createdById: "x", createdAt: Date.now() });
  const browser = await launch();
  try {
    const anna = await newUser(browser, "Anna", { dsf: 2, viewport: { width: 390, height: 844 } });
    await onboard(anna);
    const corners = await anna.page.evaluate(() => getAllCorners().filter((c) => !c.isCustom).slice(0, 5).map((c) => c.id));
    const uid = anna.uid;
    const day = 86400000;
    const t0 = Date.now() - 30 * day;
    const plan = [
      [corners[0], 0, "wolf"], [corners[0], 0.05, "wolf"],   // same corner, same day -> counts once
      [corners[1], 1, "wolf"], [corners[2], 2, "bird"], [corners[1], 3, "bird"],
      ["custom-tegernsee-1", 5, "bird"],                     // trip out of town
      [corners[3], 7, ""], [corners[4], 8, "wolf"]           // back home; one without team
    ];
    for (let i = 0; i < plan.length; i++) {
      const [cid, d, team] = plan[i];
      await dbPut(`visits/${cid}/v${i}`, { user: "Anna", userId: uid, team, time: t0 + d * day + 3600000 * 18 });
    }
    await anna.page.evaluate(() => { STATE.teamHistory = [{ team: "wolf", changedAt: Date.now() - 60 * 86400000 }]; });
    await sleep(1200);
    const logLen = await anna.page.evaluate(() => myVisitLog().length);
    check("same corner on the same day counts once", logLen === plan.length - 1, `log=${logLen}`);
    const inferred = await anna.page.evaluate(() => myVisitLog().find((v) => v.time && v.team === "wolf" && v.cornerId) && myVisitLog()[5].team);
    check("check-in without team gets the team I had then", inferred === "wolf", String(inferred));
    await anna.page.evaluate(() => document.querySelector('.tab[data-view="profile"]').click());
    await anna.page.waitForSelector("#pmap-play", { timeout: 8000 });
    await anna.page.evaluate(() => document.querySelector("#profile-map").scrollIntoView({ block: "center" }));
    await sleep(500);
    const pieBg = await anna.page.evaluate(() => Array.from(document.querySelectorAll("#profile-map .cg-pie")).map((e) => e.style.background).join(" | "));
    const wolfColor = await anna.page.evaluate(() => TEAMS.wolf.color);
    const toRgb = (hex) => { const h = hex.replace("#", ""); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`; };
    check("circles are painted in team colours", pieBg.includes(toRgb(wolfColor)) || pieBg.toLowerCase().includes(wolfColor.toLowerCase()), pieBg.slice(0, 160));
    // ---- play: sample zoom + caption while it runs ----
    await anna.page.click("#pmap-speed");   // 2x
    await anna.page.click("#pmap-speed");   // 4x
    check("speed button cycles", (await anna.page.textContent("#pmap-speed")).includes("4x"));
    await anna.page.click("#pmap-play");
    const samples = [];
    let shot = false;
    for (let i = 0; i < 160; i++) {
      const s = await anna.page.evaluate(() => ({ z: STATE.profileMap.getZoom(), cap: document.getElementById("pmap-caption").textContent, playing: !!_pmapTour, c: STATE.profileMap.getCenter() }));
      samples.push(s);
      if (!shot && /Seeufer/.test(s.cap)) { await anna.page.screenshot({ path: path.join(SHOTS, "pmap-trip.png") }); shot = true; }
      if (i > 5 && !s.playing) break;
      await sleep(150);
    }
    const caps = samples.map((s) => s.cap);
    const maxZoom = Math.max(...samples.map((s) => s.z));
    const tripIdx = caps.findIndex((c) => /Ausflug/.test(c));
    const homeIdx = caps.findIndex((c) => /Zurück nach München/.test(c));
    const minZoomTrip = Math.min(...samples.slice(Math.max(0, tripIdx), tripIdx + 12).map((s) => s.z));
    check("zooms in close on Munich corners", maxZoom >= 15, `max zoom ${maxZoom}`);
    check("trip out of town zooms out", tripIdx >= 0 && minZoomTrip <= 11, `trip at ${tripIdx}, min zoom ${minZoomTrip}`);
    check("…and back to Munich", homeIdx > tripIdx, `home at ${homeIdx}`);
    check("caption shows corner, date and team", caps.some((c) => /Wolf|Vogel|Bird/i.test(c) && /\d{2}\.\d{2}\.\d{4}/.test(c)), caps.find((c) => /\d{4}/.test(c)));
    check("finale shows the totals", caps.some((c) => /Check-ins · \d+ Corners/.test(c)), caps.slice(-3).join(" / "));
    check("playback ends by itself", !samples[samples.length - 1].playing);
    const endPies = await anna.page.evaluate(() => document.querySelectorAll("#profile-map .cg-pie").length);
    check("all visited corners drawn at the end", endPies === 6, `pies=${endPies}`);
    // stop in the middle
    await anna.page.click("#pmap-play");
    await sleep(700);
    await anna.page.click("#pmap-play");
    await sleep(300);
    check("second tap stops the playback", !(await anna.page.evaluate(() => !!_pmapTour)) && /abspielen/.test(await anna.page.textContent("#pmap-play")));

    // ---- team chosen right after the check-in colours that check-in ----
    await anna.page.evaluate(() => manualCheckin("harras"));
    await anna.page.waitForSelector("#checkin-team-overlay", { state: "visible", timeout: 5000 });
    await anna.page.click('#cto-teams [data-team="octopus"]');
    await anna.page.click("#cto-done");
    await sleep(1000);
    const hv = Object.values((await dbGet("visits/harras")) || {}).find((v) => v.userId === uid);
    check("team picked after check-in is stored on the visit", hv && hv.team === "octopus", JSON.stringify(hv));
    // second check-in at the same corner today is not stored again
    await anna.page.evaluate(() => { manualCheckin("harras"); });   // check out
    await anna.page.evaluate(() => { manualCheckin("harras"); });   // check in again
    await sleep(800);
    const hcount = Object.values((await dbGet("visits/harras")) || {}).filter((v) => v.userId === uid).length;
    check("second check-in today is not counted again", hcount === 1, `visits=${hcount}`);
    await anna.page.evaluate(() => { if (document.querySelector("#checkin-team-overlay").style.display === "flex") document.querySelector("#cto-skip").click(); manualCheckin("harras"); });
    await sleep(400);

    // ---- undo a wrong check-in ----
    const target = corners[2];
    const auraBefore = await anna.page.evaluate(() => getCurrentAura());
    await anna.page.evaluate(() => { STATE.lastCheckinCorner = null; STATE.lastCheckinTime = 0; });
    await anna.page.evaluate((id) => manualCheckin(id), "schnecke");
    await sleep(300);
    await anna.page.evaluate(() => { if (document.querySelector("#checkin-team-overlay").style.display === "flex") document.querySelector("#cto-skip").click(); });
    // the toast now shows the Aura message; the undo lives in the first toast's handler — call it the way the toast does
    await sleep(800);
    const mid = await anna.page.evaluate(() => getCurrentAura());
    const sv0 = Object.values((await dbGet("visits/schnecke")) || {}).filter((v) => v.userId === uid).length;
    check("wrong check-in was recorded first", sv0 === 1 && mid > auraBefore, `visits=${sv0}, aura ${auraBefore} -> ${mid}`);
    const undone = await anna.page.evaluate(() => { manualCheckin("schnecke"); undoCheckin("schnecke"); return { here: STATE.manualCheckinId, cooldown: STATE.lastCheckinCorner }; });
    await sleep(1000);
    const auraAfter = await anna.page.evaluate(() => getCurrentAura());
    const sv = Object.values((await dbGet("visits/schnecke")) || {}).filter((v) => v.userId === uid).length;
    check("undo removes the visit", sv === 0, `visits=${sv}`);
    check("undo takes the Aura back", auraAfter <= auraBefore + 1, `${auraBefore} -> ${auraAfter}`);
    await anna.page.evaluate((id) => manualCheckin(id), target);
    await sleep(300);
    check("after undo you can check in elsewhere right away (no cooldown)", await anna.page.evaluate(() => STATE.manualCheckinId) === target);

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
