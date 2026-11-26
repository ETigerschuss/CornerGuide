// One profile, several logins: pick once (one tap), nobody gets thrown out,
// the same level everywhere, and the app opens straight in next time.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, checkIn, dbGet, dbPut, dbDel, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function enterCode(user) {
  const { page } = user;
  await page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 });
  await page.fill("#access-code-input", "TEST");
  await page.click("#access-code-save");
  await page.waitForSelector("#claim-overlay", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("#claim-list .claim-row").length > 0 || /Keine|Noch keine/.test(document.querySelector("#claim-list").textContent), null, { timeout: 15000 });
  user.uid = await page.evaluate(() => window.FB.getAuthUid());
}
async function tapName(user, name) {
  await user.page.evaluate((n) => { const row = Array.from(document.querySelectorAll("#claim-list .claim-row")).find((r) => r.querySelector(".claim-row-name").textContent.trim() === n); row.click(); }, name);
}
async function levels(page) {
  return page.evaluate(() => {
    const me = getRewardLeaders("aura", 100).find((x) => x.user === currentUserKey());
    return { profile: getLevel(getCurrentAura()).level, ranking: me ? getLevel(me.total).level : 0, aura: getCurrentAura(), rankAura: me ? me.total : 0, karma: getCurrentKarma(), nick: STATE.nickname };
  });
}
async function blocking(page) {
  return page.evaluate(() => ["#access-prompt", "#claim-overlay", "#nickname-prompt", "#app-dialog"].filter((sel) => {
    const el = document.querySelector(sel);
    return el && getComputedStyle(el).display !== "none";
  }));
}
async function newLoginSameDevice(browser, user) {
  const ls = await user.page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  await user.context.close();
  const next = await newUser(browser, user.name, {
    beforeGoto: (ctx) => ctx.addInitScript((data) => {
      if (sessionStorage.getItem("__seeded")) return;
      sessionStorage.setItem("__seeded", "1");
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
    }, ls)
  });
  await next.page.waitForFunction(() => window.FB && window.FB.getAuthUid && window.FB.getAuthUid(), null, { timeout: 15000 });
  next.uid = await next.page.evaluate(() => window.FB.getAuthUid());
  return next;
}
async function waitFor(fn, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return true; await sleep(300); }
  return false;
}

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    // ---------- ÉT: installed app keeps running, a WhatsApp link opens Safari ----------
    const et = await newUser(browser, "ÉT");
    await onboard(et);
    await et.page.evaluate(() => { addXp(300, "test"); addKarmaPoints(currentUserKey(), 40, "test"); });
    await checkIn(et, "piazza-zenetti");
    await sleep(1200);
    const et2 = await newUser(browser, "ÉT-safari", { dsf: 2, viewport: { width: 390, height: 844 } });
    await enterCode(et2);
    const welcome = await et2.page.evaluate(() => ({
      title: document.querySelector("#claim-title").textContent,
      newVisible: !document.querySelector("#claim-new").hidden && getComputedStyle(document.querySelector("#claim-new-name")).display !== "none",
      names: Array.from(document.querySelectorAll("#claim-list .claim-row-name")).map((x) => x.textContent.trim()),
      close: !document.querySelector("#claim-close").hidden
    }));
    check("welcome: 'Wer bist du?' with both — new name and existing names", /Wer bist du/.test(welcome.title) && welcome.newVisible && welcome.names.includes("ÉT") && !welcome.close, JSON.stringify(welcome));
    await et2.page.screenshot({ path: path.join(SHOTS, "welcome.png") });
    await tapName(et2, "ÉT");
    await et2.page.waitForFunction(() => STATE.nickname === "ÉT", null, { timeout: 15000 }).catch(() => {});
    check("one tap, no extra question", !(await et2.page.isVisible("#app-dialog")) && await et2.page.evaluate(() => STATE.nickname) === "ÉT");
    await sleep(1500);
    const link = await dbGet(`points/${et2.uid}`);
    const orig = await dbGet(`points/${et.uid}`);
    check("the new login joins the profile (nothing moved)", link && link.aliasOf === et.uid && orig && orig.total >= 300, JSON.stringify({ aliasOf: link && link.aliasOf, orig: orig && orig.total }));
    const l2 = await levels(et2.page);
    check("new device: profile = ranking, all points and karma there", l2.profile === l2.ranking && l2.aura >= 300 && l2.karma >= 40, JSON.stringify(l2));
    await sleep(1000);
    const etState = await et.page.evaluate(() => ({ nick: STATE.nickname, overlay: getComputedStyle(document.querySelector("#claim-overlay")).display }));
    check("installed app is NOT thrown out", etState.nick === "ÉT" && etState.overlay === "none", JSON.stringify(etState));
    await et2.page.evaluate(() => addXp(50, "Safari check-in"));
    const synced = await waitFor(async () => (await et.page.evaluate(() => getCurrentAura())) === (await et2.page.evaluate(() => getCurrentAura())));
    const auraEt = await et.page.evaluate(() => getCurrentAura());
    check("points from the browser show in the app too (same total)", synced && auraEt >= 350, `app=${auraEt}`);
    await et.page.evaluate(() => broadcastPresence());
    await et2.page.evaluate(() => broadcastPresence());

    // a friend sees ÉT once — in the ranking and in the friends bar
    const mia = await newUser(browser, "Mia");
    await onboard(mia);
    await mia.page.evaluate(() => addXp(20, "test"));
    await sleep(1500);
    const miaView = await mia.page.evaluate(() => ({
      rows: getRewardLeaders("aura", 50).filter((x) => x.nickname === "ÉT").map((x) => x.total),
      friends: freshFriends().filter((f) => (f.nickname || "") === "ÉT").length
    }));
    check("friends see ÉT once in the ranking, with the sum", miaView.rows.length === 1 && miaView.rows[0] >= 350, JSON.stringify(miaView.rows));
    check("…and once in the friends bar", miaView.friends === 1, String(miaView.friends));

    // reopening goes straight in
    await et2.page.reload();
    await et2.page.waitForFunction(() => window.FB && window.FB.getAuthUid && window.FB.getAuthUid(), null, { timeout: 15000 });
    await sleep(4000);
    const blockedReopen = await blocking(et2.page);
    const l2b = await levels(et2.page);
    check("reopening: no question, straight in", blockedReopen.length === 0 && l2b.nick === "ÉT" && l2b.profile === l2b.ranking && l2b.aura >= 350, JSON.stringify({ blockedReopen, l2b }));
    await et2.page.screenshot({ path: path.join(SHOTS, "reopen.png") });

    // ---------- wrong name tapped: undo from the toast ----------
    const tom = await newUser(browser, "Tom-neu");
    await enterCode(tom);
    await tapName(tom, "Mia");
    await tom.page.waitForFunction(() => STATE.nickname === "Mia", null, { timeout: 15000 }).catch(() => {});
    await tom.page.click("#toast");
    await tom.page.waitForSelector("#claim-overlay", { state: "visible", timeout: 8000 }).catch(() => {});
    await sleep(800);
    const undone = await dbGet(`points/${tom.uid}/aliasOf`);
    check("'Nicht du?' undoes a wrong tap", (await tom.page.isVisible("#claim-overlay")) && !undone && await tom.page.evaluate(() => !STATE.nickname), String(undone));
    await tom.page.fill("#claim-new-name", "Tom");
    await tom.page.click("#claim-new-go");
    await sleep(600);
    check("…then starting new is just as easy", await tom.page.evaluate(() => STATE.nickname) === "Tom" && !(await tom.page.isVisible("#claim-overlay")));

    // ---------- typing an existing name offers it ----------
    const hana = await newUser(browser, "Hana");
    await onboard(hana);
    await hana.page.evaluate(() => addXp(50, "test"));
    await sleep(1000);
    const hana2 = await newUser(browser, "hana2");
    await enterCode(hana2);
    await hana2.page.fill("#claim-new-name", "hána");
    await hana2.page.click("#claim-new-go");
    await hana2.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 }).catch(() => {});
    check("existing name: 'Bist du das?'", /gibt es schon/.test(await hana2.page.textContent("#app-dialog-title").catch(() => "")));
    await hana2.page.click("#app-dialog-ok");
    await hana2.page.waitForFunction(() => STATE.nickname === "Hana", null, { timeout: 15000 }).catch(() => {});
    await sleep(800);
    check("…'Ja' joins that profile", await hana2.page.evaluate(() => STATE.nickname) === "Hana" && ((await dbGet(`points/${hana2.uid}`)) || {}).aliasOf === hana.uid);

    // ---------- an earlier login of the same phone (login lost) ----------
    const ali = await newUser(browser, "Ali");
    const a1 = await onboard(ali);
    await ali.page.evaluate(() => addXp(900, "test"));
    await sleep(1200);
    const ali2 = await newLoginSameDevice(browser, ali);      // code still stored: silent repair
    const aliLinked = await waitFor(async () => ((await dbGet(`points/${ali2.uid}`)) || {}).aliasOf === a1, 20000);
    await sleep(800);
    const la = await levels(ali2.page);
    check("earlier login of this phone: linked by itself, profile = ranking", aliLinked && la.profile === la.ranking && la.aura >= 900, JSON.stringify(la));
    check("…without any question", (await blocking(ali2.page)).length === 0, JSON.stringify(await blocking(ali2.page)));

    // ---------- an older app version still moves profiles: no 'Wer bist du?' if it's me ----------
    const gil = await newUser(browser, "Gilo");
    await onboard(gil);
    await gil.page.evaluate(() => addXp(80, "test"));
    await sleep(800);
    const fakeOther = "legacyLogin_" + Date.now();
    await dbPut(`points/${fakeOther}`, { total: 80, nickname: "Gilo", history: [{ pts: 80, reason: "moved", time: Date.now() }] });
    await dbPut(`profileLocks/${gil.uid}`, { by: fakeOther, at: Date.now() });
    const gilLinked = await waitFor(async () => ((await dbGet(`points/${gil.uid}`)) || {}).aliasOf === fakeOther, 10000);
    check("old-style takeover of my profile by 'me': joined silently", gilLinked && await gil.page.evaluate(() => STATE.nickname) === "Gilo" && !(await gil.page.isVisible("#claim-overlay")));

    // ---------- recovery code joins the live profile ----------
    const cleo = await newUser(browser, "Cleo");
    await onboard(cleo);
    const code = await cleo.page.evaluate(async () => { addXp(120, "test"); return await createRecoveryCode(); });
    await cleo.page.evaluate(() => addXp(30, "after"));
    await sleep(1200);
    const cleo2 = await newUser(browser, "Cleo2");
    await cleo2.page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 });
    await cleo2.page.click("#access-recover-code");
    await cleo2.page.waitForSelector("#app-dialog", { state: "visible" });
    await cleo2.page.fill("#app-dialog-input", code);
    await cleo2.page.click("#app-dialog-ok");
    await cleo2.page.waitForFunction(() => STATE.nickname === "Cleo", null, { timeout: 15000 }).catch(() => {});
    await sleep(1500);
    const lc = await levels(cleo2.page);
    check("recovery code: live points there, old device stays", lc.aura >= 150 && await cleo.page.evaluate(() => STATE.nickname) === "Cleo", JSON.stringify(lc));

    // ---------- access grant missing for this login: asked once, then saving works ----------
    const mo = await newUser(browser, "Mo", { dsf: 2, viewport: { width: 390, height: 844 } });
    await onboard(mo);
    await dbDel(`accessGranted/${mo.uid}`);
    await mo.page.evaluate(() => localStorage.removeItem("cg.accessCode"));   // like an older app version
    await mo.page.reload();
    await mo.page.waitForSelector("#access-prompt", { state: "visible", timeout: 15000 }).catch(() => {});
    const why = await mo.page.textContent("#access-text").catch(() => "");
    check("missing grant: access prompt explains it", await mo.page.isVisible("#access-prompt") && /nicht mehr hinterlegt/.test(why), why);
    await mo.page.fill("#access-code-input", "TEST");
    await mo.page.click("#access-code-save");
    await sleep(800);
    check("re-entering the code keeps the profile (no 'Wer bist du?')", !(await mo.page.isVisible("#claim-overlay")) && await mo.page.evaluate(() => STATE.nickname) === "Mo");
    await dbDel(`accessGranted/${mo.uid}`);
    await mo.page.reload();
    await sleep(4000);
    check("with a known code the grant is repaired silently", (await blocking(mo.page)).length === 0 && !!(await dbGet(`accessGranted/${mo.uid}`)));

    const errs = [et, et2, mia, tom, hana2, ali2, gil, cleo2, mo].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
