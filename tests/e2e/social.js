// Public profiles, tappable notifications, gossip chronicle.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, checkIn, dbGet, resetDb, PORT } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const CORNER = "piazza-zenetti";
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const anna = await newUser(browser, "Anna", { dsf: 2, viewport: { width: 390, height: 844 } });
    const ben = await newUser(browser, "Ben");
    const cleo = await newUser(browser, "Cleo");
    for (const u of [anna, ben, cleo]) await onboard(u);
    await anna.page.evaluate(() => addXp(120, "test"));
    await ben.page.evaluate(() => addXp(60, "test"));
    await checkIn(anna, CORNER);
    await sleep(800);
    // ---- tappable notification: Ben arrives, Anna taps the toast ----
    // Record every toast: another message (achievement, tip) may replace the
    // arrival toast on screen before the test looks at it.
    await anna.page.evaluate(() => {
      window.__toasts = [];
      const orig = window.toast;
      window.toast = function (html, variant, onClick) { window.__toasts.push({ html: String(html), onClick }); return orig.apply(this, arguments); };
    });
    await checkIn(ben, CORNER);
    await anna.page.waitForFunction(() => window.__toasts.some((t) => /Ben/.test(t.html) && /ist am/.test(t.html)), null, { timeout: 8000 }).catch(() => {});
    const arrival = await anna.page.evaluate(() => { const t = window.__toasts.find((x) => /Ben/.test(x.html) && /ist am/.test(x.html)); return t ? { html: t.html, tappable: typeof t.onClick === "function" } : null; });
    check("friend arrival toast says where", !!arrival && /Piazza/.test(arrival.html) && arrival.tappable, arrival && arrival.html.replace(/<[^>]+>/g, ""));
    // tap it (re-show it if something else replaced it meanwhile)
    await anna.page.evaluate(() => { const t = window.__toasts.find((x) => /Ben/.test(x.html) && /ist am/.test(x.html)); if (t && !/ist am/.test(document.querySelector("#toast").textContent)) toast(t.html, "friend-alert", t.onClick); });
    await anna.page.click("#toast");
    await sleep(500);
    const detailOpen = await anna.page.evaluate(() => document.querySelector("#detail-overlay").classList.contains("open") && STATE.detailCornerId);
    check("tapping the arrival toast opens that corner", detailOpen === CORNER, String(detailOpen));
    // ---- names in the corner detail open profiles ----
    const chip = await anna.page.$(`#detail-content .people-chip[data-user-profile="${ben.uid}"]`);
    check("'gerade hier' shows Ben as a tappable chip", !!chip);
    await chip.click();
    await anna.page.waitForSelector("#user-profile-overlay", { state: "visible", timeout: 5000 });
    const top = await anna.page.textContent("#up-top");
    check("profile shows name + live corner", /Ben/.test(top) && /Gerade am/.test(top) && /Piazza Zenetti/.test(top), top.replace(/\s+/g, " ").slice(0, 160));
    check("profile shows aura and check-ins", /Aura/.test(top) && /Check-ins/.test(top));
    const favs = await anna.page.textContent("#up-bottom");
    check("favourite corners listed", /Piazza Zenetti/.test(favs));
    await anna.page.waitForTimeout(600);
    await anna.page.screenshot({ path: path.join(SHOTS, "social-profile.png") });
    // Zum Corner from the profile
    await anna.page.click("#up-top [data-up-corner]");
    await sleep(300);
    check("'Zum Corner' closes the profile and opens the corner", !(await anna.page.isVisible("#user-profile-overlay")) && await anna.page.evaluate(() => document.querySelector("#detail-overlay").classList.contains("open")));
    await anna.page.evaluate(() => closeDetail());
    // ---- friends bar + ranking entry points ----
    await anna.page.click(`#friends-list .friend-name[data-user-profile="${ben.uid}"]`);
    check("friends bar name opens profile", await anna.page.isVisible("#user-profile-overlay"));
    await anna.page.click("#up-close");
    await anna.page.evaluate(() => document.querySelector('.tab[data-view="leaderboard"]').click());
    await sleep(500);
    await anna.page.click(`#leaderboard-points [data-user-profile="${ben.uid}"]`);
    check("ranking name opens profile", await anna.page.isVisible("#user-profile-overlay"));
    await anna.page.click("#up-close");
    // own name in ranking -> own profile tab
    await anna.page.click(`#leaderboard-points [data-user-profile="${anna.uid}"]`);
    await sleep(300);
    check("own name opens own profile tab", await anna.page.evaluate(() => STATE.view === "profile") && !(await anna.page.isVisible("#user-profile-overlay")));

    // ---- deep links ----
    const actions = await anna.page.evaluate((b) => ({
      corner: typeof deepLinkAction("https://x.y/CornerGuide/?corner=piazza-zenetti"),
      profile: typeof deepLinkAction("https://x.y/CornerGuide/?profile=" + b),
      chat: typeof deepLinkAction("https://x.y/CornerGuide/?chat=" + b + "&chatName=Ben"),
      none: deepLinkAction("https://x.y/CornerGuide/")
    }), ben.uid);
    check("push links map to in-app actions", actions.corner === "function" && actions.profile === "function" && actions.chat === "function" && actions.none === null, JSON.stringify(actions));
    const link = await newUser(browser, "Linker", { query: `?profile=${ben.uid}` });
    await onboard(link);
    await link.page.waitForSelector("#user-profile-overlay", { state: "visible", timeout: 10000 }).catch(() => {});
    check("?profile=<id> link opens that profile", await link.page.isVisible("#user-profile-overlay") && /Ben/.test(await link.page.textContent("#up-top")));
    // checkin push carries the corner
    await checkIn(cleo, "harras");
    await sleep(800);
    const ev = Object.values((await dbGet("notify")) || {}).find((e) => e.type === "checkin" && /Cleo/.test(e.body));
    check("check-in push links to the corner", ev && ev.query === "?corner=harras", ev && ev.query);

    // ---- gossip round with a headline -> chronicle ----
    await anna.page.evaluate((id) => openDetail(id), CORNER);
    await anna.page.waitForSelector("[data-gossip-start]", { timeout: 10000 });
    await anna.page.click("[data-gossip-start]");
    await anna.page.waitForSelector("#gossip-overlay.open");
    await anna.page.fill("#gossip-headline", "Die Sache mit dem Hausboot");
    await anna.page.fill("#gossip-text", "Geheime Story, die nicht in der Chronik landen darf.");
    await anna.page.click("#gossip-publish");
    await anna.page.waitForFunction(() => !document.querySelector("#gossip-overlay").classList.contains("open"), null, { timeout: 15000 });
    const rounds = await dbGet(`gossipRounds/${CORNER}`);
    const roundId = Object.keys(rounds || {})[0];
    check("round carries the public headline", rounds && rounds[roundId].title === "Die Sache mit dem Hausboot");
    await ben.page.evaluate((id) => focusGossip(id), CORNER);
    await ben.page.waitForSelector('[data-gossip-rate="15"]', { timeout: 10000 });
    const headlineShown = await ben.page.textContent(".gs-story-head");
    check("listener sees the headline on the story", /Hausboot/.test(headlineShown));
    await ben.page.click('[data-gossip-rate="15"]');
    await sleep(3000);
    const annaLog = await dbGet(`gossipLog/${anna.uid}`);
    const benLog = await dbGet(`gossipLog/${ben.uid}`);
    const a = Object.values(annaLog || {})[0];
    const b = Object.values(benLog || {})[0];
    check("teller chronicle entry (final)", a && a.role === "teller" && a.open === false && a.total === 15 && a.people[ben.uid] === "Ben", JSON.stringify(a));
    check("listener chronicle entry with own points", b && b.role === "listener" && b.myPts === 15 && b.tellerName === "Anna", JSON.stringify(b));
    check("story text never stored in the chronicle", !JSON.stringify(annaLog).includes("Geheime") && !JSON.stringify(benLog).includes("Geheime"));
    const foreign = await cleo.page.evaluate(async (k) => { try { await window.FB.get(window.FB.ref(window.FB.db, "gossipLog/" + k)); return "read"; } catch (e) { return "denied"; } }, anna.uid);
    check("others cannot read my chronicle", foreign === "denied", foreign);
    await anna.page.evaluate(() => { closeDetail(); document.querySelector('.tab[data-view="profile"]').click(); });
    await sleep(800);
    const chron = await anna.page.textContent(".gossip-chronicle");
    check("profile shows the chronicle with headline, place and people", /Hausboot/.test(chron) && /Piazza Zenetti/.test(chron) && /Ben/.test(chron), chron.replace(/\s+/g, " ").slice(0, 200));
    await anna.page.evaluate(() => document.querySelector(".gossip-chronicle").scrollIntoView());
    await sleep(300);
    await anna.page.screenshot({ path: path.join(SHOTS, "social-chronicle.png") });
    // Ben looks at Anna: "1 Gossip-Runde zusammen"
    await ben.page.evaluate((k) => openUserProfile(k), anna.uid);
    await sleep(500);
    const together = await ben.page.textContent("#up-top");
    check("profile shows gossips together", /1 Gossip-Runde zusammen/.test(together), together.replace(/\s+/g, " ").slice(-120));

    const errs = [anna, ben, cleo, link].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
