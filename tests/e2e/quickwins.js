// Improvements from the in-app comments.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, checkIn, dbGet, dbPut, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const CORNER = "piazza-zenetti";
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mockApis(context) {
  await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ utc_offset_seconds: 3600, hourly: { time: [] } }) }));
  await context.route("https://overpass-api.de/**", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ elements: [] }) }));
}

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const anna = await newUser(browser, "Anna", { dsf: 2, viewport: { width: 390, height: 844 }, beforeGoto: mockApis });
    const ben = await newUser(browser, "Ben", { beforeGoto: mockApis });
    for (const u of [anna, ben]) await onboard(u);
    // ---- the map is the landing page ----
    const start = await anna.page.evaluate(() => ({ view: STATE.view, active: document.querySelector(".tab.active").dataset.view, mapVisible: document.querySelector("#view-map").classList.contains("active"), map: !!STATE.mainMap }));
    check("app starts on the map", start.view === "map" && start.active === "map" && start.mapVisible && start.map, JSON.stringify(start));
    await anna.page.screenshot({ path: path.join(SHOTS, "qw-landing.png") });
    // tap a corner marker -> detail
    await anna.page.waitForSelector(`.corner-marker[data-id="${CORNER}"]`, { timeout: 8000 });
    await anna.page.evaluate((id) => STATE.mainMarkers[id].fire("click"), CORNER);
    await sleep(400);
    check("tapping a map marker opens the corner", await anna.page.evaluate(() => document.querySelector("#detail-overlay").classList.contains("open") && STATE.detailCornerId) === CORNER);
    const origin = await anna.page.textContent(".detail-origin");
    check("built-in corner says where it comes from", /Original-Liste/.test(origin), origin);
    await anna.page.evaluate(() => closeDetail());
    // tap a card body in the list -> detail
    await anna.page.click('.tab[data-view="list"]');
    await sleep(300);
    await anna.page.click(`#card-${CORNER} .card-name`);
    await sleep(300);
    check("tapping a card opens the corner", await anna.page.evaluate(() => document.querySelector("#detail-overlay").classList.contains("open")));
    await anna.page.evaluate(() => closeDetail());
    // custom corner: creator + date
    await dbPut("corners/custom-1780170078902-ab123", { id: "custom-1780170078902-ab123", name: "Testspot", area: "Westend", lat: 48.135, lng: 11.54, description: "x", tags: [], amenities: [], isCustom: true, createdBy: "Ben", createdById: ben.uid, createdAt: Date.UTC(2026, 4, 30, 12) });
    await sleep(800);
    await anna.page.evaluate(() => openDetail("custom-1780170078902-ab123"));
    await sleep(300);
    const o2 = await anna.page.textContent(".detail-origin");
    check("custom corner shows creator and date", /Eingetragen von/.test(o2) && /Ben/.test(o2) && /30\.05\.2026/.test(o2), o2);
    check("creator name opens the profile", !!(await anna.page.$(`.detail-origin [data-user-profile="${ben.uid}"]`)));
    await anna.page.evaluate(() => closeDetail());

    // ---- sun on open places ----
    await anna.page.evaluate((id) => openDetail(id), "harras");
    await anna.page.waitForSelector(".ci-place-vote", { timeout: 8000 });
    const sunBefore = await anna.page.textContent(".ci-sun");
    await anna.page.click('[data-place-vote="offen"]');
    await sleep(600);
    const sunAfter = await anna.page.textContent(".ci-sun");
    check("voting 'Offener Platz' switches to the open-place sun window", /Offener Platz/.test(sunAfter) && (/Häusern/.test(sunBefore) || /Offener Platz/.test(sunBefore)), `${sunBefore.slice(0, 60)} → ${sunAfter.slice(0, 80)}`);
    await anna.page.evaluate(() => closeDetail());

    // ---- cornerdate rewards ----
    const annaKarma0 = ((await dbGet(`karmaPoints/${anna.uid}`)) || {}).total || 0;
    await anna.page.evaluate((id) => openCornerDatePlanner(id), CORNER);
    const { today, hhmm } = await anna.page.evaluate(() => {
      const d = new Date(Date.now() + 5 * 60000);
      return { today: toDateInputValue(d), hhmm: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
    });
    await anna.page.fill("#cd-date", today);
    await anna.page.fill("#cd-time", hhmm);
    await anna.page.click("#cd-save");
    await anna.page.waitForSelector("#cd-done:not([hidden])", { timeout: 10000 }).catch(async () => {
      console.log("CD HINT:", await anna.page.textContent("#cd-hint"), "| date", await anna.page.inputValue("#cd-date"), "| time", await anna.page.inputValue("#cd-time"));
      console.log(anna.page._logs.filter((l) => /warn|error/i.test(l)).slice(-6).join("\n"));
    });
    const doneText = await anna.page.textContent("#cd-done");
    check("planning shows the Aura it earns", /\+5 Aura/.test(doneText) && /Karma pro Zusage/.test(doneText), doneText.replace(/\s+/g, " ").slice(0, 160));
    await anna.page.click("#cd-done [data-cd-close]");
    await sleep(800);
    await ben.page.evaluate((id) => openDetail(id), CORNER);
    await ben.page.waitForSelector(".cornerdate-section [data-cd-going]", { timeout: 8000 });
    await ben.page.click(".cornerdate-section [data-cd-going]");
    await sleep(1500);
    const annaKarma1 = ((await dbGet(`karmaPoints/${anna.uid}`)) || {}).total || 0;
    check("planner gets karma when someone says yes", annaKarma1 === annaKarma0 + 3, `${annaKarma0} -> ${annaKarma1}`);
    await ben.page.evaluate(() => closeDetail());
    await checkIn(ben, CORNER);
    await sleep(1500);
    const annaKarma2 = ((await dbGet(`karmaPoints/${anna.uid}`)) || {}).total || 0;
    check("planner gets karma when the guest really shows up", annaKarma2 === annaKarma1 + 5, `${annaKarma1} -> ${annaKarma2}`);
    const pushYes = Object.values((await dbGet("notifyTargeted")) || {}).filter((e) => /cornerdate/.test(e.type));
    check("planner is told (push events)", pushYes.length >= 1, pushYes.map((e) => e.type).join(","));

    // ---- feedback channel ----
    await ben.page.evaluate(() => document.querySelector('.tab[data-view="profile"]').click());
    await ben.page.waitForSelector("#feedback-btn", { timeout: 5000 });
    await ben.page.click("#feedback-btn");
    await ben.page.waitForSelector("#app-dialog", { state: "visible" });
    await ben.page.fill("#app-dialog-input", "Bitte dunkleren Modus für die Karte");
    await ben.page.click("#app-dialog-ok");
    await sleep(1000);
    const fb = Object.values((await dbGet("feedback")) || {});
    check("feedback stored for the admins", fb.length === 1 && fb[0].by === ben.uid && /dunkleren/.test(fb[0].text), JSON.stringify(fb[0] || {}).slice(0, 120));
    const fbRead = await anna.page.evaluate(async () => { try { await window.FB.get(window.FB.ref(window.FB.db, "feedback")); return "read"; } catch (e) { return "denied"; } });
    check("only admins can read feedback", fbRead === "denied", fbRead);
    await dbPut(`config/admins/${anna.uid}`, true);
    await anna.page.reload();
    await anna.page.waitForFunction(() => typeof STATE !== "undefined" && STATE.isAdmin === true, null, { timeout: 15000 });
    await anna.page.evaluate(() => renderAdminPanel());
    await anna.page.waitForSelector("#admin-feedback .admin-fb", { timeout: 8000 });
    check("admin panel lists the feedback", /dunkleren/.test(await anna.page.textContent("#admin-feedback")));

    // ---- duplicate check-ins cleanup ----
    const t = Date.now() - 3 * 86400000;
    await dbPut("visits/harras/d1", { user: "Ben", userId: ben.uid, team: "", time: t });
    await dbPut("visits/harras/d2", { user: "Ben", userId: ben.uid, team: "", time: t + 60000 });
    await dbPut("visits/harras/d3", { user: "Ben", userId: ben.uid, team: "", time: t + 120000 });
    await sleep(600);
    await anna.page.click("#admin-dedupe-visits");
    await anna.page.waitForSelector("#app-dialog", { state: "visible" });
    const q = await anna.page.textContent("#app-dialog-title");
    await anna.page.click("#app-dialog-ok");
    await sleep(1000);
    const left = Object.keys((await dbGet("visits/harras")) || {}).filter((k) => /^d/.test(k));
    check("duplicate check-ins removed (first one kept)", left.length === 1 && left[0] === "d1", `${q} → ${left.join(",")}`);
    await anna.page.click("#admin-close");

    // ---- photo comments ----
    await dbPut(`photos/${CORNER}/p1`, { src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", author: "Ben", authorId: ben.uid, time: Date.now() - 3600000, caption: "Sonnenuntergang", ratings: {} });
    await sleep(600);
    await anna.page.evaluate((id) => openDetail(id), CORNER);
    await anna.page.waitForSelector(".photo-comment-btn", { timeout: 8000 });
    await anna.page.click(".photo-comment-btn");
    await anna.page.waitForSelector("#photo-comments-overlay", { state: "visible" });
    await anna.page.fill("#pc-input", "Mega Licht! 😍");
    await anna.page.click("#pc-send");
    await sleep(1000);
    const comments = (await dbGet(`photos/${CORNER}/p1/comments`)) || {};
    const c1 = Object.values(comments)[0];
    check("photo comment stored", c1 && c1.text === "Mega Licht! 😍" && c1.by === anna.uid, JSON.stringify(c1));
    check("comment shows in the dialog", /Mega Licht/.test(await anna.page.textContent("#pc-body")));
    const ev = Object.values((await dbGet("notifyTargeted")) || {}).find((e) => e.type === "photo-comment");
    check("photo author gets notified", ev && ev.toIds[ben.uid], ev && ev.body);
    await anna.page.screenshot({ path: path.join(SHOTS, "qw-photocomments.png") });
    await anna.page.click("#pc-close");
    const btnText = await anna.page.textContent(".photo-comment-btn");
    check("gallery shows the comment count", /1/.test(btnText), btnText);

    const errs = [anna, ben].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
