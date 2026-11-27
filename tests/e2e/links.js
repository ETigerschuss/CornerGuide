// Links go straight there: corner check-in from WhatsApp, cornerdate "bin
// dabei" with one tap — also on a new phone after "Wer bist du?". Points
// for saying yes and for showing up.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, dbPut, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZEN = { id: "piazza-zenetti", lat: 48.124563, lng: 11.555813 };
const geo = (lat, lng) => async (ctx) => { await ctx.grantPermissions(["geolocation"]); await ctx.setGeolocation({ latitude: lat, longitude: lng, accuracy: 10 }); };
const qs = (url) => url.slice(url.indexOf("?"));

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    // ---------- Ali plans a cornerdate and is at the corner ----------
    const ali = await newUser(browser, "Ali");
    await onboard(ali);
    const now = Date.now();
    const dateId = "cdTest1";
    await dbPut(`cornerDates/${dateId}`, { cornerId: ZEN.id, cornerName: "Piazza Zenetti", start: now - 5 * 60000, end: now + 2 * 3600000, byId: ali.uid, byName: "Ali", byTeam: "", createdAt: now, going: { [ali.uid]: { name: "Ali", at: now } } });
    await sleep(1500);
    const texts = await ali.page.evaluate((id) => ({ date: cornerDateWhatsAppText({ ...STATE.cornerDates[id], id }), corner: cornerWhatsAppText("piazza-zenetti") }), dateId);
    check("cornerdate WhatsApp link carries the date", new RegExp(`[?&]cd=${dateId}`).test(texts.date), texts.date);
    check("corner WhatsApp link is a 'come over' link", /[?&]come=1/.test(texts.corner), texts.corner);
    const dateLink = qs(texts.date.match(/https?:\/\/\S+/)[0]);
    const cornerLink = qs(texts.corner.match(/https?:\/\/\S+/)[0]);

    // ---------- Bea (has the app) taps the cornerdate link ----------
    const bea = await newUser(browser, "Bea");
    await onboard(bea);
    const beaAura0 = await bea.page.evaluate(() => getCurrentAura());
    await bea.page.goto(`http://127.0.0.1:${require("./lib").PORT}/index.html${dateLink}`);
    await bea.page.waitForSelector("#app-dialog", { state: "visible", timeout: 15000 }).catch(() => {});
    const dlg = { title: await bea.page.textContent("#app-dialog-title").catch(() => ""), text: await bea.page.textContent("#app-dialog-text").catch(() => ""), ok: await bea.page.textContent("#app-dialog-ok").catch(() => "") };
    check("date link opens the invitation with one 'bin dabei'", /Cornerdate/.test(dlg.title) && /Piazza Zenetti/.test(dlg.text) && /Bin dabei/.test(dlg.ok) && /\+5 Aura/.test(dlg.ok), JSON.stringify(dlg));
    await bea.page.screenshot({ path: path.join(SHOTS, "date-invite.png") });
    await bea.page.click("#app-dialog-ok");
    await sleep(1500);
    const going = await dbGet(`cornerDates/${dateId}/going`);
    const beaAura1 = await bea.page.evaluate(() => getCurrentAura());
    const beaToast = await bea.page.textContent("#toast");
    check("one tap: Bea is in, +5 Aura shown", going && going[bea.uid] && beaAura1 - beaAura0 >= 5 && /\+5 Aura/.test(beaToast), JSON.stringify({ d: beaAura1 - beaAura0, beaToast }));
    // she really comes: check in during the date
    await bea.page.evaluate(() => { _cdJoinPaid = false; manualCheckin("piazza-zenetti"); });
    await bea.page.waitForSelector("#checkin-team-overlay", { state: "visible", timeout: 4000 }).catch(() => {});
    if (await bea.page.isVisible("#checkin-team-overlay")) await bea.page.click("#cto-skip");
    await sleep(2500);
    const showed = await bea.page.evaluate(() => (rewardHistoryList(STATE.points[currentUserKey()]) || []).some((h) => /Wort gehalten/.test(h.reason)));
    check("came to the cornerdate: +10 Aura 'Wort gehalten'", showed);

    // ---------- Cem has never opened the app: link -> name -> invitation ----------
    // (Ali's link carries his invite: no code — see invites.js.)
    const cem = await newUser(browser, "Cem", { query: dateLink, dsf: 2, viewport: { width: 390, height: 844 } });
    await cem.page.waitForSelector("#claim-new-name", { state: "visible", timeout: 20000 });
    check("new phone: no code needed with Ali's link", !(await cem.page.isVisible("#access-prompt")));
    await cem.page.fill("#claim-new-name", "Cem");
    await cem.page.click("#claim-new-go");
    await cem.page.waitForSelector("#app-dialog", { state: "visible", timeout: 15000 }).catch(() => {});
    const cemTitle = await cem.page.textContent("#app-dialog-title").catch(() => "");
    check("new phone: after the name, the invitation is there", /Cornerdate/.test(cemTitle), cemTitle);
    await cem.page.click("#app-dialog-ok").catch(() => {});
    await sleep(1200);
    cem.uid = await cem.page.evaluate(() => window.FB.getAuthUid());
    check("…and one tap says yes", !!(await dbGet(`cornerDates/${dateId}/going/${cem.uid}`)));

    // ---------- Dora taps the WhatsApp corner link while standing there ----------
    const dora = await newUser(browser, "Dora", { beforeGoto: geo(ZEN.lat + 0.0003, ZEN.lng) });
    await onboard(dora);
    await dora.page.goto(`http://127.0.0.1:${require("./lib").PORT}/index.html${cornerLink}`);
    const doraIn = await dora.page.waitForFunction(() => STATE.manualCheckinId === "piazza-zenetti", null, { timeout: 15000 }).then(() => true, () => false);
    check("at the corner: the link checks you in right away", doraIn && await dora.page.isVisible(".come-bar"));
    await dora.page.waitForSelector("#checkin-team-overlay", { state: "visible", timeout: 3000 }).catch(() => {});
    if (await dora.page.isVisible("#checkin-team-overlay")) await dora.page.click("#cto-skip");

    // ---------- Emil is far away: check-in button + route + distance ----------
    const emil = await newUser(browser, "Emil", { beforeGoto: geo(48.1600, 11.6000), dsf: 2, viewport: { width: 390, height: 844 } });
    await onboard(emil);
    await emil.page.goto(`http://127.0.0.1:${require("./lib").PORT}/index.html${cornerLink}`);
    await emil.page.waitForSelector(".come-bar", { timeout: 15000 }).catch(() => {});
    await emil.page.waitForFunction(() => /Noch/.test(document.querySelector("[data-come-hint]")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
    const bar = await emil.page.evaluate(() => ({ text: document.querySelector(".come-bar")?.textContent.replace(/\s+/g, " ") || "", checked: STATE.manualCheckinId }));
    check("far away: not checked in, check-in + route + distance on top", !bar.checked && /einchecken/.test(bar.text) && /Route/.test(bar.text) && /km/.test(bar.text), bar.text.slice(0, 160));
    await emil.page.screenshot({ path: path.join(SHOTS, "come-bar.png") });
    await emil.page.click("[data-come-checkin]");
    await sleep(800);
    check("…one tap on 'Ich bin da' checks in", await emil.page.evaluate(() => STATE.manualCheckinId) === "piazza-zenetti");

    // ---------- QR sticker on a new phone: code (stickers carry no invite), then checked in after the name ----------
    const fin = await newUser(browser, "Fin", { query: `?corner=${ZEN.id}&checkin=1` });
    await fin.page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 });
    await fin.page.fill("#access-code-input", "TEST");
    await fin.page.click("#access-code-save");
    await fin.page.waitForSelector("#claim-new-name", { state: "visible", timeout: 15000 });
    await fin.page.fill("#claim-new-name", "Fin");
    await fin.page.click("#claim-new-go");
    const finIn = await fin.page.waitForFunction(() => STATE.manualCheckinId === "piazza-zenetti", null, { timeout: 10000 }).then(() => true, () => false);
    check("sticker link on a new phone: checked in after naming", finIn);

    const errs = [ali, bea, cem, dora, emil, fin].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
