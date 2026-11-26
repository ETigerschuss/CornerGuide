// Regression checks: 24h cleanup, push deep link, QR check-in link, supply karma.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, checkIn, dbGet, dbPut, resetDb, PORT } = require("./lib");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", {
    method: "PUT", headers: { Authorization: "Bearer owner" },
    body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8")
  });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const anna = await newUser(browser, "Anna");
    const ben = await newUser(browser, "Ben");
    await onboard(anna); await onboard(ben);

    // --- 24h cleanup: an expired round with audio uploaded by Anna, removed by Ben's client.
    const old = Date.now() - 25 * 3600 * 1000;
    const audioPath = "gossipAudio/harras/oldround";
    await anna.page.evaluate(async (p) => {
      const blob = new Blob([new Uint8Array(4000)], { type: "audio/webm" });
      await window.FB.uploadBlob(p, blob, "audio/webm");
    }, audioPath);
    await dbPut("gossipRounds/harras/oldround", { tellerId: anna.uid, tellerName: "Anna", createdAt: old, windowMs: 600000, hasAudio: true, audience: { [ben.uid]: "Ben" } });
    await dbPut("gossipContent/harras/oldround", { by: anna.uid, createdAt: old, text: "alt", audioUrl: "https://example.invalid/x" });
    await dbPut(`gossipVotes/harras/oldround/${ben.uid}`, { pts: 10, at: old });
    await ben.page.evaluate(() => { _gossip.lastCleanup = 0; cleanupExpiredGossip(); });
    await ben.page.waitForTimeout(2500);
    check("expired round deleted", (await dbGet("gossipRounds/harras/oldround")) === null);
    check("expired story deleted", (await dbGet("gossipContent/harras/oldround")) === null);
    check("expired votes deleted", (await dbGet("gossipVotes/harras/oldround")) === null);
    const audioGone = await ben.page.evaluate(async (p) => {
      try { await window.FB.deleteFile(p); return "still there"; } catch (e) { return e.code || e.message; }
    }, audioPath);
    check("expired recording deleted from storage", /object-not-found/.test(audioGone), audioGone);
    // A fresh round must NOT be deletable by others.
    await checkIn(anna, "harras"); await checkIn(ben, "harras");
    await dbPut("gossipRounds/harras/fresh", { tellerId: anna.uid, tellerName: "Anna", createdAt: Date.now(), windowMs: 600000, audience: { [ben.uid]: "Ben" } });
    const delFresh = await ben.page.evaluate(async () => { try { await window.FB.remove(window.FB.ref(window.FB.db, "gossipRounds/harras/fresh")); return "deleted"; } catch (e) { return "denied"; } });
    check("others cannot delete a fresh round", delFresh === "denied");

    // --- Supply run: Ben confirms Anna's run -> +40 karma via transaction, name kept.
    await anna.page.evaluate(() => announceSupplyRun("harras"));
    await anna.page.waitForTimeout(1200);
    const runs = await dbGet("supplyRuns/harras");
    const [runId, run] = Object.entries(runs || {})[0] || [];
    await ben.page.evaluate(({ runId, run }) => confirmSupplyRun("harras", runId, run), { runId, run });
    await anna.page.waitForSelector("#celebration.show", { timeout: 8000 });
    const cel = await anna.page.textContent("#celebration");
    check("supply celebration unchanged", cel.includes("+40 Karma") && cel.includes("Nachschub"), cel.replace(/\s+/g, " ").slice(0, 80));
    const annaKarma = await dbGet(`karmaPoints/${anna.uid}`);
    check("supply karma credited (+40) with nickname", annaKarma && annaKarma.total === 40 && annaKarma.nickname === "Anna", JSON.stringify({ t: annaKarma && annaKarma.total, n: annaKarma && annaKarma.nickname }));

    // --- Push deep link opens the corner at its gossip section.
    const cleo = await newUser(browser, "Cleo");
    await onboard(cleo);
    await cleo.page.goto(`http://127.0.0.1:${PORT}/index.html?corner=harras&gossip=1`);
    await cleo.page.waitForSelector("#detail-overlay.open", { timeout: 10000 });
    await cleo.page.waitForSelector(".gossip-section", { timeout: 5000 });
    check("gossip deep link opens the corner", (await cleo.page.textContent("#detail-title")).includes("Harras"));
    check("deep-link params cleaned from URL", !cleo.page.url().includes("gossip=1") && !cleo.page.url().includes("corner="), cleo.page.url());

    // --- QR sticker link (?corner=…&checkin=1) checks you in again.
    await cleo.page.goto(`http://127.0.0.1:${PORT}/index.html?corner=piazza-zenetti&checkin=1`);
    await cleo.page.waitForFunction(() => STATE.manualCheckinId === "piazza-zenetti", null, { timeout: 10000 }).catch(() => {});
    check("QR check-in link works again", (await cleo.page.evaluate(() => STATE.manualCheckinId)) === "piazza-zenetti");

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
