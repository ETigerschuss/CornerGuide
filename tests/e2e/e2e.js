// End-to-end gossip round with three users + security-rule checks.
// Run via: firebase emulators:exec --only auth,database,storage "node e2e.js"
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, checkIn, dbGet, resetDb } = require("./lib");

const CORNER = "piazza-zenetti";
const SHOTS = path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }

async function tryWrite(user, p, value) {
  return user.page.evaluate(async ({ p, value }) => {
    try { await window.FB.set(window.FB.ref(window.FB.db, p), value); return "ok"; }
    catch (e) { return "denied: " + (e.code || e.message); }
  }, { p, value });
}
async function tryRead(user, p) {
  return user.page.evaluate(async (p) => {
    try { const s = await window.FB.get(window.FB.ref(window.FB.db, p)); return s.exists() ? "ok" : "empty"; }
    catch (e) { return "denied"; }
  }, p);
}

(async () => {
  // Rules may have changed on disk: load the current file into the emulator.
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", {
    method: "PUT", headers: { Authorization: "Bearer owner" },
    body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8")
  });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const anna = await newUser(browser, "Anna", { dsf: 2 });
    const ben = await newUser(browser, "Ben", { dsf: 2 });
    const cleo = await newUser(browser, "Cleo");
    const dora = await newUser(browser, "Dora");
    for (const u of [anna, ben, cleo, dora]) await onboard(u);
    console.log("uids:", anna.uid, ben.uid, cleo.uid, dora.uid);

    // Anna alone at the corner: no round possible yet.
    await checkIn(anna, CORNER);
    await anna.page.evaluate((id) => openDetail(id), CORNER);
    await anna.page.waitForTimeout(800);
    const aloneText = await anna.page.textContent(".gossip-section");
    check("alone: start button hidden, hint shown", (await anna.page.$$("[data-gossip-start]")).length === 0 && aloneText.includes("allein"), aloneText.slice(0, 80));

    await checkIn(ben, CORNER);
    await checkIn(cleo, CORNER);
    await checkIn(dora, "harras");      // Dora is elsewhere
    await anna.page.waitForSelector("[data-gossip-start]", { timeout: 10000 });
    check("2+ people: start button appears", true);
    await anna.page.screenshot({ path: path.join(SHOTS, "1-anna-start.png") });

    // Compose: text + 3 s fake-mic recording.
    await anna.page.click("[data-gossip-start]");
    await anna.page.waitForSelector("#gossip-overlay.open");
    await anna.page.fill("#gossip-text", "Ratet mal, wer gestern am Harras den Kiosk-Typen nach seiner Nummer gefragt hat … 👀");
    await anna.page.click("#gossip-rec-btn");
    await anna.page.waitForTimeout(3200);
    await anna.page.screenshot({ path: path.join(SHOTS, "2-anna-recording.png") });
    await anna.page.click("#gossip-rec-btn");
    await anna.page.waitForSelector("#gossip-rec-preview:not([hidden])", { timeout: 5000 });
    const recInfo = await anna.page.evaluate(() => ({ size: GOSSIP_REC.blob && GOSSIP_REC.blob.size, type: GOSSIP_REC.blob && GOSSIP_REC.blob.type, dur: GOSSIP_REC.duration }));
    check("recording produced audio", recInfo.size > 1000, JSON.stringify(recInfo));
    await anna.page.screenshot({ path: path.join(SHOTS, "3-anna-composer.png") });
    await anna.page.click("#gossip-publish");
    try {
      await anna.page.waitForFunction(() => !document.querySelector("#gossip-overlay").classList.contains("open"), null, { timeout: 15000 });
    } catch (e) {
      console.log("composer still open, hint:", await anna.page.textContent("#gossip-hint"));
      console.log(anna.page._logs.filter((l) => /warn|error/.test(l)).slice(-8).join(" || "));
      throw e;
    }

    const rounds = await dbGet(`gossipRounds/${CORNER}`);
    const roundId = Object.keys(rounds || {})[0];
    const round = rounds && rounds[roundId];
    check("round written", !!round && round.tellerId === anna.uid, JSON.stringify(round && { ...round, audience: Object.keys(round.audience || {}) }));
    check("audience = Ben + Cleo (not Dora)", round && round.audience && round.audience[ben.uid] && round.audience[cleo.uid] && !round.audience[dora.uid]);
    const content = await dbGet(`gossipContent/${CORNER}/${roundId}`);
    check("content has text + uploaded audio", !!(content && content.text && content.audioUrl), content && (content.audioUrl || "").slice(0, 60));
    const pushEvents = await dbGet("notifyTargeted");
    const ev = pushEvents && Object.values(pushEvents)[0];
    check("targeted push queued for Ben + Cleo", !!ev && ev.toIds[ben.uid] && ev.toIds[cleo.uid] && !ev.toIds[anna.uid] && ev.query.includes("gossip=1"), ev && ev.body);
    await anna.page.waitForTimeout(600);
    await anna.page.screenshot({ path: path.join(SHOTS, "4-anna-waiting.png") });

    // Privacy & rule checks.
    check("Dora (elsewhere) cannot read the story", (await tryRead(dora, `gossipContent/${CORNER}/${roundId}`)) === "denied");
    check("Ben (at corner) can read the story", (await tryRead(ben, `gossipContent/${CORNER}/${roundId}`)) === "ok");
    check("Anna cannot rate her own story", (await tryWrite(anna, `gossipVotes/${CORNER}/${roundId}/${anna.uid}`, { pts: 20, at: Date.now() })).startsWith("denied"));
    check("Dora cannot rate from elsewhere", (await tryWrite(dora, `gossipVotes/${CORNER}/${roundId}/${dora.uid}`, { pts: 20, at: Date.now() })).startsWith("denied"));
    check("Ben cannot vote in Cleo's name", (await tryWrite(ben, `gossipVotes/${CORNER}/${roundId}/${cleo.uid}`, { pts: 2, at: Date.now() })).startsWith("denied"));
    check("invalid point value rejected", (await tryWrite(ben, `gossipVotes/${CORNER}/${roundId}/${ben.uid}`, { pts: 99, at: Date.now() })).startsWith("denied"));

    // Ben gets the in-app announcement and rates via the UI.
    const benToast = await ben.page.textContent("#toast");
    check("Ben got the in-app announcement", /Gossip/.test(benToast || ""), benToast);
    await ben.page.evaluate((id) => focusGossip(id), CORNER);
    await ben.page.waitForSelector(".gs-story-text", { timeout: 10000 });
    await ben.page.waitForSelector(".gs-story audio", { timeout: 5000 });
    const benStory = await ben.page.textContent(".gs-story-text");
    check("Ben sees the story text", benStory.includes("Kiosk-Typen"));
    const scoresHidden = !(await ben.page.isVisible(".gs-result"));
    check("scores hidden while round is open", scoresHidden);
    await ben.page.waitForTimeout(400);
    await ben.page.screenshot({ path: path.join(SHOTS, "5-ben-rate.png") });
    await ben.page.click('[data-gossip-rate="20"]');
    await ben.page.waitForTimeout(1200);
    check("Ben's double vote rejected", (await tryWrite(ben, `gossipVotes/${CORNER}/${roundId}/${ben.uid}`, { pts: 2, at: Date.now() })).startsWith("denied"));
    const annaKarmaMid = (await dbGet(`karmaPoints/${anna.uid}`)) || {};
    check("Anna has +20 karma after Ben", annaKarmaMid.total === 20, JSON.stringify({ total: annaKarmaMid.total, nickname: annaKarmaMid.nickname }));

    // Cleo locks her phone in the middle of the round …
    await cleo.context.setOffline(true);
    await cleo.page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await anna.page.waitForTimeout(4000);
    const cleoPresence = await dbGet(`presence/${cleo.uid}`);
    check("Cleo (screen locked) stays checked in, marked offline", cleoPresence && cleoPresence.atCorner === CORNER && cleoPresence.online === false);
    const annaWho = await anna.page.textContent(".gs-who");
    check("round still waits for Cleo", (await anna.page.textContent(".gs-controls")).includes("1/2"), annaWho);
    // … and comes back to rate.
    await cleo.context.setOffline(false);
    await cleo.page.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await cleo.page.waitForTimeout(2500);
    await cleo.page.evaluate((id) => focusGossip(id), CORNER);
    await cleo.page.waitForSelector('[data-gossip-rate="15"]', { timeout: 10000 });
    await cleo.page.click('[data-gossip-rate="15"]');

    // Reveal on all phones.
    await anna.page.waitForSelector("#celebration.show", { timeout: 10000 });
    const cel = await anna.page.textContent("#celebration");
    check("Anna's celebration shows +35 Karma", /\+35\s*Karma/.test(cel), cel.replace(/\s+/g, " ").slice(0, 120));
    await anna.page.screenshot({ path: path.join(SHOTS, "6-anna-celebration.png") });
    await ben.page.waitForSelector(".gs-result", { timeout: 10000 });
    const benResult = await ben.page.textContent(".gs-result");
    check("Ben sees the revealed result (35 points)", benResult.includes("35"), benResult.replace(/\s+/g, " ").slice(0, 120));
    await ben.page.waitForTimeout(500);
    await ben.page.screenshot({ path: path.join(SHOTS, "7-ben-result.png") });
    const annaKarma = (await dbGet(`karmaPoints/${anna.uid}`)) || {};
    check("Anna's karma total = 35 (no lost update)", annaKarma.total === 35, JSON.stringify({ total: annaKarma.total, history: (annaKarma.history || []).map((h) => h.reason) }));
    const benAura = (await dbGet(`points/${ben.uid}`)) || {};
    check("Ben got rating aura", (benAura.history || []).some((h) => h.reason === "Gossip bewertet"));
    const resultPush = Object.values((await dbGet("notifyTargeted")) || {}).find((e) => e.type === "gossip-result");
    check("result push queued for Anna", !!resultPush && resultPush.toIds[anna.uid], resultPush && resultPush.body);
    check("card shows no live badge after reveal", !(await ben.page.isVisible(`[data-gossip-card="${CORNER}"]`)));
    check("Anna unlocked 'Klatschbase'", (await anna.page.evaluate(() => STATE.achievements)).includes("first-gossip"));

    // Dora arrives after the reveal: she sees story + result, but can't rate.
    check("Dora (not here yet) sees no story text", (await dora.page.evaluate((id) => { openDetail(id); return !!document.querySelector(".gs-story-text"); }, CORNER)) === false);
    await dora.page.evaluate(() => { STATE.lastCheckinTime = 0; });   // skip the 15-min corner-hopping cooldown
    await checkIn(dora, CORNER);
    await dora.page.evaluate((id) => openDetail(id), CORNER);
    await dora.page.waitForSelector(".gs-result", { timeout: 10000 });
    await dora.page.waitForSelector(".gs-story-text", { timeout: 10000 });
    check("late arrival: no rating buttons after reveal", (await dora.page.$$("[data-gossip-rate]")).length === 0);
    // Teller ends a round early -> the server refuses later ratings.
    await anna.page.evaluate((id) => focusGossip(id), CORNER);
    await anna.page.waitForSelector("[data-gossip-start]", { timeout: 10000 });
    await anna.page.evaluate(async (cornerId) => {
      const { db, ref, push, set, serverTimestamp } = window.FB;
      const r = push(ref(db, "gossipRounds/" + cornerId));
      await set(ref(db, `gossipContent/${cornerId}/${r.key}`), { by: STATE.userId, createdAt: serverTimestamp(), text: "Kurz & knapp" });
      await set(r, { tellerId: STATE.userId, tellerName: "Anna", createdAt: serverTimestamp(), windowMs: 600000, audience: {}, karma: true });
      await revealGossipNow(cornerId, r.key);
      window.__r2 = r.key;
    }, CORNER);
    const r2 = await anna.page.evaluate(() => window.__r2);
    check("rating after 'Jetzt auflösen' rejected", (await tryWrite(ben, `gossipVotes/${CORNER}/${r2}/${ben.uid}`, { pts: 20, at: Date.now() })).startsWith("denied"));

    const errs = [anna, ben, cleo, dora].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")).map((l) => `${u.name}: ${l}`));
    check("no uncaught page errors", errs.length === 0, errs.slice(0, 5).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
