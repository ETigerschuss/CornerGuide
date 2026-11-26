// Follow-me links/QR: lead to wherever the inviter is checked in right now.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, checkIn, dbGet, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
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
    await onboard(anna);
    await anna.page.evaluate(() => selectTeam("wolf"));
    await checkIn(anna, "piazza-zenetti");
    await sleep(800);
    // ---- the dialog ----
    await anna.page.evaluate(() => openFollowMeDialog());
    await anna.page.waitForSelector("#qr-overlay", { state: "visible" });
    const img = await anna.page.getAttribute("#qr-body img", "src");
    const decoded = decodeURIComponent(img);
    check("follow-me QR encodes my id + on-site flag", decoded.includes(`join=${anna.uid}`) && decoded.includes("here=1"), decoded.slice(-120));
    const title = await anna.page.textContent("#qr-title");
    check("dialog says where I am", /Piazza Zenetti/.test(title), title);
    await anna.page.screenshot({ path: path.join(SHOTS, "join-dialog.png") });
    await anna.page.click("#qr-close");
    const pointsBefore = (await dbGet(`points/${anna.uid}`)).total;

    // ---- QR scanned next to Anna: checked in right there, same team ----
    const ben = await newUser(browser, "Ben", { query: `?join=${anna.uid}&here=1&n=Anna` });
    await onboard(ben);
    await ben.page.waitForFunction(() => STATE.manualCheckinId === "piazza-zenetti", null, { timeout: 15000 }).catch(() => {});
    check("on-site scan checks in at the inviter's corner", await ben.page.evaluate(() => STATE.manualCheckinId) === "piazza-zenetti");
    await ben.page.waitForFunction(() => STATE.team === "wolf", null, { timeout: 8000 }).catch(() => {});
    check("…in the inviter's team", await ben.page.evaluate(() => STATE.team) === "wolf");
    await sleep(1500);
    const pointsAfter = (await dbGet(`points/${anna.uid}`)).total;
    check("inviter gets the QR bonus", pointsAfter >= pointsBefore + 15, `${pointsBefore} -> ${pointsAfter}`);
    check("join params removed from the address bar", !(await ben.page.evaluate(() => location.search)).includes("join"));

    // ---- link from afar: opens the corner, no automatic check-in ----
    const cleo = await newUser(browser, "Cleo", { query: `?join=${anna.uid}` });
    await onboard(cleo);
    await cleo.page.waitForFunction(() => document.querySelector("#detail-overlay").classList.contains("open"), null, { timeout: 15000 }).catch(() => {});
    check("link opens the inviter's current corner", await cleo.page.evaluate(() => STATE.detailCornerId) === "piazza-zenetti");
    await sleep(1200);
    check("link does not check in from afar", await cleo.page.evaluate(() => STATE.manualCheckinId) !== "piazza-zenetti");
    const follow = await cleo.page.textContent(".detail-follow").catch(() => "");
    check("detail shows whom you follow", /Anna/.test(follow), follow);
    check("check-in button sits at the top of the detail", await cleo.page.evaluate(() => {
      const first = document.querySelector("#detail-content .detail-topbar .checkin-btn");
      const photo = document.querySelector("#detail-content .detail-hero-photo");
      return !!first && !!photo && (first.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }));
    await cleo.page.screenshot({ path: path.join(SHOTS, "join-detail.png") });
    // tapping the top check-in works
    await cleo.page.click("#detail-content .detail-topbar .checkin-btn");
    await cleo.page.waitForSelector("#checkin-team-overlay", { state: "visible", timeout: 5000 }).catch(() => {});
    if (await cleo.page.isVisible("#checkin-team-overlay")) await cleo.page.click("#cto-skip");
    check("top check-in button checks in", await cleo.page.evaluate(() => STATE.manualCheckinId) === "piazza-zenetti");

    // ---- inviter not checked in anywhere: profile instead ----
    await anna.page.evaluate(() => manualCheckin("piazza-zenetti"));   // check out
    await sleep(1200);
    const dora = await newUser(browser, "Dora", { query: `?join=${anna.uid}` });
    await onboard(dora);
    await dora.page.waitForSelector("#user-profile-overlay", { state: "visible", timeout: 12000 }).catch(() => {});
    const toastText = await dora.page.textContent("#toast");
    check("not checked in: says so and shows the profile", /nirgends eingecheckt/.test(toastText) && await dora.page.isVisible("#user-profile-overlay"), toastText);

    // ---- own code ----
    const own = await anna.page.evaluate(async () => { STATE.pendingJoin = { id: currentUserKey(), here: false, name: "" }; await handlePendingJoin(); return document.querySelector("#toast").textContent; });
    check("own follow-me code is recognised", /eigener/.test(own), own);

    const errs = [anna, ben, cleo, dora].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
