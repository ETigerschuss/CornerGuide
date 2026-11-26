// Close friends, private corners (friends / only me), secret cornerdates —
// enforced by the server, with half the points, and a sharing overview.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 12000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(300); } return false; }
const readAs = (u, p) => u.page.evaluate((x) => window.FB.get(window.FB.ref(window.FB.db, x)).then((s) => s.exists() ? "ok" : "empty", () => "denied"), p);
const seesCorner = (u, name) => u.page.evaluate((n) => getAllCorners().some((c) => c.name === n), name);

async function addSpot(u, name, lat, lng, vis) {
  await u.page.click("#fab");
  await u.page.waitForFunction(() => !!_pinMap, null, { timeout: 8000 });
  await u.page.evaluate(([a, b]) => _pinMap.fire("click", { latlng: L.latLng(a, b) }), [lat, lng]);
  await u.page.fill("#f-name", name);
  if (vis) await u.page.click(`#spot-visibility [data-vis="${vis}"]`);
  await u.page.click("#modal-save");
  await sleep(1500);
}

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const ana = await newUser(browser, "Ana", { dsf: 2, viewport: { width: 390, height: 844 } });
    const ben = await newUser(browser, "Ben");
    const cem = await newUser(browser, "Cem");
    for (const u of [ana, ben, cem]) { await onboard(u); await u.page.evaluate(() => addXp(30, "test")); }
    await sleep(1500);

    // ---------- Ana marks Ben as a close friend (from his profile) ----------
    await ana.page.evaluate((k) => openUserProfile(k), ben.uid);
    await ana.page.waitForSelector("#up-cf", { timeout: 8000 });
    await ana.page.click("#up-cf");
    const cfOk = await waitFor(async () => (await dbGet(`closeFriends/${ana.uid}/${ben.uid}`)) === true && (await dbGet(`closeFriendOf/${ben.uid}/${ana.uid}`)) === true);
    check("close friend added from the profile (list + reverse index)", cfOk && /Enge Freunde/.test(await ana.page.textContent("#up-cf")));
    await ana.page.evaluate(() => closeUserProfile());
    check("nobody else can read Ana's list", (await readAs(cem, `closeFriends/${ana.uid}`)) === "denied" && (await readAs(ben, `closeFriends/${ana.uid}`)) === "denied");

    // ---------- a corner only for close friends ----------
    const aura0 = await ana.page.evaluate(() => getCurrentAura());
    await addSpot(ana, "Anas Geheimecke", 48.1600, 11.5900, "friends");
    const pc = Object.entries((await dbGet(`privateCorners/${ana.uid}/friends`)) || {});
    const pid = pc.length ? pc[0][0] : "";
    const aura1 = await ana.page.evaluate(() => getCurrentAura());
    check("saved in the private place, not in the public list", !!pid && !(await dbGet(`corners/${pid}`)), pid);
    check("…for half the points (+10 instead of +50)", aura1 - aura0 >= 10 && aura1 - aura0 < 50, `${aura1 - aura0}`);
    check("Ben (close friend) sees it", await waitFor(() => seesCorner(ben, "Anas Geheimecke")));
    check("Cem does not — and the server refuses him", !(await seesCorner(cem, "Anas Geheimecke")) && (await readAs(cem, `privateCorners/${ana.uid}/friends`)) === "denied");
    await ben.page.evaluate(() => document.querySelector('.tab[data-view="list"]').click());
    await sleep(500);
    const badge = await ben.page.evaluate((id) => document.querySelector(`#card-${CSS.escape(id)} .vis-badge`)?.textContent || "", pid);
    check("Ben's card says whose and for whom", /Enge Freunde/.test(badge) && /Ana/.test(badge), badge);
    await ben.page.evaluate((id) => document.querySelector(`#card-${CSS.escape(id)}`)?.scrollIntoView({ block: "center" }), pid);
    await ben.page.screenshot({ path: path.join(SHOTS, "private-card.png") });
    check("no public facts are stored for a private corner", !(await dbGet(`cornerFacts/${pid}`)));

    // ---------- only me ----------
    await addSpot(ana, "Nur-Ana-Platz", 48.1660, 11.5960, "me");
    const me = Object.keys((await dbGet(`privateCorners/${ana.uid}/me`)) || {});
    check("'only me' corner saved", me.length === 1);
    await sleep(1500);
    check("…Ben doesn't see it either (server refuses)", !(await seesCorner(ben, "Nur-Ana-Platz")) && (await readAs(ben, `privateCorners/${ana.uid}/me`)) === "denied");

    // ---------- check-in at the private corner ----------
    await ana.page.evaluate((id) => manualCheckin(id), pid);
    await ana.page.waitForSelector("#checkin-team-overlay", { state: "visible", timeout: 4000 }).catch(() => {});
    if (await ana.page.isVisible("#checkin-team-overlay")) await ana.page.click("#cto-skip");
    await sleep(1800);
    const pushes = Object.values((await dbGet("notifyTargeted")) || {}).filter((e) => e.type === "checkin");
    const broadcast = Object.values((await dbGet("notify")) || {}).filter((e) => e.type === "checkin" && /Geheimecke/.test(e.body));
    check("check-in push only to close friends", pushes.length === 1 && pushes[0].toIds && pushes[0].toIds[ben.uid] && !pushes[0].toIds[cem.uid] && broadcast.length === 0, JSON.stringify(pushes.map((p) => Object.keys(p.toIds || {}))));
    const hist = await ana.page.evaluate(() => rewardHistoryList(STATE.points[currentUserKey()]).filter((h) => /Check-in: Anas Geheimecke/.test(h.reason)).map((h) => h.pts));
    check("check-in at a private corner: half the aura", hist.length === 1 && hist[0] <= 3, JSON.stringify(hist));
    await ana.page.evaluate(() => broadcastPresence());
    await sleep(1500);
    const cemSees = await cem.page.evaluate(() => { renderFriendsBar(); return document.querySelector("#friends-list")?.textContent || ""; });
    const benSees = await ben.page.evaluate(() => { renderFriendsBar(); return document.querySelector("#friends-list")?.textContent || ""; });
    check("others see Ana 'private', Ben sees which corner", /privat/.test(cemSees) && !/Geheimecke/.test(cemSees) && /Geheimecke/.test(benSees), JSON.stringify([cemSees.slice(0, 80), benSees.slice(0, 80)]));

    // ---------- secret cornerdate ----------
    await ana.page.evaluate(() => openCornerDatePlanner("piazza-zenetti"));
    await ana.page.waitForSelector("#cornerdate-overlay.open", { timeout: 5000 });
    await ana.page.check("#cd-secret");
    const notifyLabel = await ana.page.textContent("#cd-notify-label");
    const auraB0 = await ana.page.evaluate(() => getCurrentAura());
    await ana.page.click("#cd-save");
    await sleep(1500);
    const sd = Object.entries((await dbGet(`secretDates/${ana.uid}`)) || {});
    const sid = sd.length ? sd[0][0] : "";
    const planPts = await ana.page.evaluate(() => rewardHistoryList(STATE.points[currentUserKey()]).filter((h) => h.reason === "Cornerdate geplant").map((h) => h.pts));
    await ana.page.evaluate(() => closeCornerDatePlanner());   // "Geplant!" stays open until "Fertig"
    check("secret date stored privately, nothing public", !!sid && !(await dbGet("cornerDates")) && /engen Freunde/.test(notifyLabel), notifyLabel);
    check("…planning it gives fewer points (3 instead of 5)", JSON.stringify(planPts) === "[3]", JSON.stringify(planPts));
    const invited = Object.values((await dbGet("notifyTargeted")) || {}).filter((e) => e.type === "cornerdate");
    check("…only close friends are notified", invited.length === 1 && invited[0].toIds[ben.uid] && !invited[0].toIds[cem.uid]);
    check("Ben sees the secret date, Cem doesn't (server refuses)", await waitFor(() => ben.page.evaluate((id) => !!allCornerDates()[id], sid)) && !(await cem.page.evaluate((id) => !!allCornerDates()[id], sid)) && (await readAs(cem, `secretDates/${ana.uid}`)) === "denied");
    const benAura0 = await ben.page.evaluate(() => getCurrentAura());
    await ben.page.evaluate((id) => toggleCornerDateGoing(id), sid);
    await sleep(1200);
    const benAura1 = await ben.page.evaluate(() => getCurrentAura());
    check("Ben says yes: stored, half the points", !!(await dbGet(`secretDates/${ana.uid}/${sid}/going/${ben.uid}`)) && benAura1 - benAura0 === 3, `${benAura1 - benAura0}`);
    const cemTry = await cem.page.evaluate(async ([o, id, uid]) => window.FB.set(window.FB.ref(window.FB.db, `secretDates/${o}/${id}/going/${uid}`), { name: "Cem", at: Date.now() }).then(() => "ok", () => "denied"), [ana.uid, sid, cem.uid]);
    check("Cem cannot slip in", cemTry === "denied", cemTry);
    await ben.page.evaluate(() => openDetail("piazza-zenetti"));
    await sleep(600);
    const section = await ben.page.evaluate(() => document.querySelector(".cornerdate-section")?.textContent || "");
    check("the corner shows it as secret for Ben", /geheim/.test(section), section.slice(0, 120));
    await ben.page.evaluate(() => closeDetail());
    // Cem has no close friends: a secret date is not possible
    await cem.page.evaluate(() => openCornerDatePlanner("piazza-zenetti"));
    await cem.page.waitForSelector("#cornerdate-overlay.open", { timeout: 5000 });
    await cem.page.check("#cd-secret");
    await cem.page.click("#cd-save");
    await sleep(500);
    const cemHint = await cem.page.textContent("#cd-hint");
    check("without close friends: a clear hint instead", /enge Freunde/.test(cemHint), JSON.stringify({ cemHint, secret: await cem.page.isChecked("#cd-secret"), keys: await cem.page.evaluate(() => closeFriendKeys()) }));
    await cem.page.evaluate(() => closeCornerDatePlanner());

    // ---------- the sharing overview ----------
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="profile"]').click());
    await ana.page.waitForSelector("#share-section", { timeout: 5000 });
    const share = await ana.page.textContent("#share-section");
    check("profile shows close friends and what is shared", /Ben/.test(share) && /👯 1/.test(share) && /🔒 1/.test(share) && /alle in der App/.test(share), share.replace(/\s+/g, " ").slice(0, 200));
    await ana.page.evaluate(() => document.querySelector("#share-section").scrollIntoView({ block: "start" }));
    await ana.page.screenshot({ path: path.join(SHOTS, "sharing.png") });

    // ---------- make it public again ----------
    await ana.page.evaluate((id) => openCornerEditor(id), pid);
    await ana.page.click('#ce-visibility [data-vis="all"]');
    await ana.page.click("#ce-save");
    const moved = await waitFor(async () => !!(await dbGet(`corners/${pid}`)) && !(await dbGet(`privateCorners/${ana.uid}/friends/${pid}`)));
    check("switching to 'everyone' moves it to the public list", moved && await waitFor(() => seesCorner(cem, "Anas Geheimecke")));

    // ---------- Ben gets a second login (browser): Ana's app adds it ----------
    const ben2 = await newUser(browser, "Ben-Safari");
    await ben2.page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 });
    await ben2.page.fill("#access-code-input", "TEST");
    await ben2.page.click("#access-code-save");
    await ben2.page.waitForSelector("#claim-list .claim-row", { timeout: 15000 });
    await ben2.page.evaluate(() => Array.from(document.querySelectorAll("#claim-list .claim-row")).find((r) => /^Ben$/.test(r.querySelector(".claim-row-name").textContent.trim())).click());
    ben2.uid = await ben2.page.evaluate(() => window.FB.getAuthUid());
    const synced = await waitFor(async () => (await dbGet(`closeFriends/${ana.uid}/${ben2.uid}`)) === true, 20000);
    check("Ben's new login is added by Ana's app (no re-adding needed)", synced);
    check("…and sees Ana's secret date there too", await waitFor(() => ben2.page.evaluate((id) => !!allCornerDates()[id], sid), 15000));

    // ---------- removing a close friend ----------
    await ana.page.evaluate(() => { closeDetail(); document.querySelector('.tab[data-view="profile"]').click(); });
    await ana.page.waitForSelector("#share-section [data-cf-remove]", { timeout: 5000 });
    await ana.page.click("#share-section [data-cf-remove]");
    const gone = await waitFor(async () => !(await dbGet(`closeFriends/${ana.uid}/${ben.uid}`)) && !(await dbGet(`closeFriendOf/${ben.uid}/${ana.uid}`)));
    check("removing Ben takes away his access", gone && (await readAs(ben, `secretDates/${ana.uid}`)) === "denied");

    const errs = [ana, ben, cem, ben2].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
