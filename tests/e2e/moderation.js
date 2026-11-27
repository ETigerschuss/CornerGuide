// Melden & Blockieren: blocking hides someone's comments, photos, chats and
// compliments (the server refuses their compliments), reports reach only the
// admins, and the admin panel can delete content, remove a person (no way
// back in with the code or a link) and let them back in.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, dbPut, resetDb, PORT } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 12000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(300); } return false; }
const tryWrite = (u, p, v) => u.page.evaluate(async ([x, y]) => { try { await window.FB.set(window.FB.ref(window.FB.db, x), y); return "ok"; } catch (e) { return "denied"; } }, [p, v]);
const tryRead = (u, p) => u.page.evaluate(async (x) => { try { await window.FB.get(window.FB.ref(window.FB.db, x)); return "ok"; } catch (e) { return "denied"; } }, p);
const CORNER = "piazza-zenetti";
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const openDetailOf = (u) => u.page.evaluate((c) => openDetail(c), CORNER);
const commentTexts = (u) => u.page.evaluate(() => [...document.querySelectorAll("#detail-content .comment-item .comment-text")].map((e) => e.textContent));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(path.join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  const users = [];
  try {
    const ana = await newUser(browser, "Ana", { dsf: 2, viewport: { width: 390, height: 844 } });
    const ben = await newUser(browser, "Ben", { dsf: 2, viewport: { width: 390, height: 844 } });
    const cleo = await newUser(browser, "Cleo");
    users.push(ana, ben, cleo);
    for (const u of [ana, ben, cleo]) { await onboard(u); await u.page.evaluate(() => addXp(20, "test")); }
    await sleep(1500);
    const day = await ana.page.evaluate(() => complimentDay());

    // Cleo writes a comment (now with her login) and has a photo at the corner.
    await cleo.page.evaluate((c) => addComment(c, "Cleo", "Kauft alle bei mir ein, billig!!!"), CORNER);
    await dbPut(`photos/${CORNER}/p1`, { author: "Cleo", authorId: cleo.uid, time: Date.now(), thumb: PIXEL });
    const commentKey = await waitFor(async () => Object.keys((await dbGet(`comments/${CORNER}`)) || {}).length === 1)
      ? Object.keys(await dbGet(`comments/${CORNER}`))[0] : "";
    check("new comments carry who wrote them", (await dbGet(`comments/${CORNER}/${commentKey}/authorId`)) === cleo.uid);
    await openDetailOf(ben);
    check("Ben sees Cleo's comment with a 🚩", await waitFor(async () => (await commentTexts(ben)).some((t) => /billig/.test(t)))
      && await ben.page.evaluate(() => !!document.querySelector("#detail-content [data-report-comment]")));
    check("…and her photo with a 🚩", await waitFor(() => ben.page.evaluate(() => !!document.querySelector('#detail-content [data-report-photo$="/p1"]'))));
    check("his own comments have no 🚩", await ben.page.evaluate(async (c) => { addComment(c, "Ben", "Schön hier"); await new Promise((r) => setTimeout(r, 1200)); const mine = [...document.querySelectorAll("#detail-content .comment-item")].find((li) => /Schön hier/.test(li.textContent)); return !!mine && !mine.querySelector("[data-report-comment]"); }, CORNER));

    // ---------- Ben reports the comment ----------
    await ben.page.click("#detail-content [data-report-comment]");
    await ben.page.waitForSelector("#report-overlay", { state: "visible", timeout: 5000 });
    check("the report dialog shows the comment and asks why", /billig/.test(await ben.page.textContent("#report-sub")) && await ben.page.isDisabled("#report-send"));
    await ben.page.click('#report-reasons [data-report-reason="spam"]');
    await ben.page.fill("#report-text", "Werbung im Corner-Chat");
    await ben.page.screenshot({ path: path.join(SHOTS, "report-dialog.png") });
    await ben.page.click("#report-send");
    const rep1 = await waitFor(async () => Object.values((await dbGet("reports")) || {}).some((r) => r.kind === "comment"));
    const reports1 = Object.entries((await dbGet("reports")) || {});
    const commentReport = reports1.find(([, r]) => r.kind === "comment");
    check("the report is stored: who, whom, what, why", rep1 && commentReport && commentReport[1].by === ben.uid && commentReport[1].target === cleo.uid && commentReport[1].reason === "spam"
      && commentReport[1].ref === `comments/${CORNER}/${commentKey}` && /billig/.test(commentReport[1].excerpt) && /Werbung/.test(commentReport[1].text), JSON.stringify(commentReport && commentReport[1]).slice(0, 200));
    check("reports are for admins only", (await tryRead(ben, "reports")) === "denied");
    check("…nobody can report in someone else's name", (await tryWrite(ben, "reports/fake1", { by: ana.uid, kind: "profile", reason: "spam", at: Date.now() })) === "denied");
    check("…and only known kinds", (await tryWrite(ben, "reports/fake2", { by: ben.uid, kind: "anything", reason: "spam", at: Date.now() })) === "denied");

    // ---------- Ben blocks Cleo from her profile ----------
    check("before: Cleo may send Ana a compliment", (await tryWrite(cleo, `compliments/${ana.uid}/${cleo.uid}_${day}`, { from: cleo.uid, text: "Hi Ana", at: Date.now() })) === "ok");
    await ben.page.evaluate((k) => openUserProfile(k), cleo.uid);
    await ben.page.waitForSelector("#up-block", { timeout: 10000 });
    check("a profile offers 🚩 Melden and 🚫 Blockieren", await ben.page.isVisible("#up-report") && /Blockieren/.test(await ben.page.textContent("#up-block")));
    await ben.page.evaluate(() => document.querySelector("#up-block")?.scrollIntoView({ block: "center" }));
    await ben.page.screenshot({ path: path.join(SHOTS, "profile-block.png") });
    await ben.page.click("#up-block");
    await ben.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    await ben.page.click("#app-dialog-ok");
    check("blocked: stored for Ben", await waitFor(async () => !!(await dbGet(`blocks/${ben.uid}/${cleo.uid}`))));
    check("…the profile says so and offers to undo", await waitFor(() => ben.page.evaluate(() => /aufheben/.test(document.querySelector("#up-block")?.textContent || "") && !!document.querySelector(".up-blocked"))));
    check("…no pushes from her (server list)", await waitFor(async () => ((await dbGet(`userPrefs/${ben.uid}/notifSettings/blockedUsers`)) || []).includes(cleo.uid)));
    check("…the server refuses her compliments to Ben", (await tryWrite(cleo, `compliments/${ben.uid}/${cleo.uid}_${day}`, { from: cleo.uid, text: "Hallo Ben", at: Date.now() })) === "denied");
    check("…only Ben can see or change his list", (await tryRead(cleo, `blocks/${ben.uid}`)) === "denied" && (await tryWrite(cleo, `blocks/${ben.uid}/${cleo.uid}`, null)) === "denied");
    await ben.page.evaluate(() => closeUserProfile());
    await openDetailOf(ben);
    check("Ben no longer sees her comment — just a note", await waitFor(async () => !(await commentTexts(ben)).some((t) => /billig/.test(t))
      && await ben.page.evaluate(() => /ausgeblendet/.test(document.querySelector("#detail-content .comment-hidden")?.textContent || ""))));
    check("…nor her photo", await waitFor(() => ben.page.evaluate(() => !document.querySelector('#detail-content [data-report-photo$="/p1"]') && !document.querySelector('#detail-content .gallery-img[data-photo="p1"]'))));
    await openDetailOf(ana);
    check("Ana still sees both", await waitFor(async () => (await commentTexts(ana)).some((t) => /billig/.test(t))) && await waitFor(() => ana.page.evaluate(() => !!document.querySelector('#detail-content .gallery-img[data-photo="p1"]'))));
    await cleo.page.evaluate((k) => sendMessage(k, "Ben", "Hey Ben, willst du was kaufen?", { toastMsg: false }), ben.uid);
    await sleep(2000);
    check("her messages: no toast, not in his chat list", await ben.page.evaluate(() => !/willst du was kaufen/.test(document.querySelector("#toast")?.textContent || "")
      && (renderChatList(), ![...document.querySelectorAll("#chat-list [data-peer-name]")].some((e) => e.dataset.peerName === "Cleo"))));
    await ben.page.evaluate(() => { closeDetail?.(); document.querySelector('.tab[data-view="profile"]').click(); });
    check("Ben's profile lists whom he blocked", await waitFor(() => ben.page.evaluate(() => /Blockiert \(1\)/.test(document.querySelector("#share-section")?.textContent || "") && /Cleo/.test(document.querySelector("#share-section")?.textContent || ""))));

    // ---------- Ana reports Cleo's profile ----------
    await ana.page.evaluate((k) => openUserProfile(k), cleo.uid);
    await ana.page.waitForSelector("#up-report", { timeout: 10000 });
    await ana.page.click("#up-report");
    await ana.page.waitForSelector("#report-overlay", { state: "visible", timeout: 5000 });
    check("profile report: „Auch blockieren“ is offered", await ana.page.isVisible("#report-block-row"));
    await ana.page.click('#report-reasons [data-report-reason="harass"]');
    await ana.page.click("#report-send");
    check("…stored as a profile report", await waitFor(async () => Object.values((await dbGet("reports")) || {}).some((r) => r.kind === "profile" && r.target === cleo.uid && r.by === ana.uid && r.reason === "harass")));
    await ana.page.evaluate(() => closeUserProfile());

    // ---------- the admin panel ----------
    await dbPut(`config/admins/${ana.uid}`, true);
    await ana.page.goto(`http://127.0.0.1:${PORT}/index.html?reports=1`);
    const opened = await waitFor(() => ana.page.evaluate(() => STATE.isAdmin === true && document.querySelector("#admin-overlay")?.style.display === "flex"
      && (document.querySelectorAll("#admin-reports .admin-report").length === 2)), 20000);
    check("a report push opens the admin panel at the reports", opened, await ana.page.evaluate(() => (document.querySelector("#admin-reports")?.textContent || "").replace(/\s+/g, " ").slice(0, 200)));
    await ana.page.evaluate(() => document.querySelector("#admin-reports")?.scrollIntoView({ block: "start" }));
    await ana.page.screenshot({ path: path.join(SHOTS, "admin-reports.png") });
    await ana.page.click(`[data-rep-delete="${commentReport[0]}"]`);
    await ana.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    await ana.page.click("#app-dialog-ok");
    check("„Inhalt löschen“ removes the comment and closes the report", await waitFor(async () => !(await dbGet(`comments/${CORNER}/${commentKey}`)) && (await dbGet(`reports/${commentReport[0]}/done`)) === true));
    check("…one report left open", await waitFor(() => ana.page.evaluate(() => document.querySelectorAll("#admin-reports .admin-report").length === 1)));
    const cleoToken = await waitFor(async () => !!(await dbGet(`inviteOf/${cleo.uid}`))) ? await dbGet(`inviteOf/${cleo.uid}`) : "";
    await ana.page.click("#admin-reports [data-rep-ban]");
    await ana.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    await ana.page.click("#app-dialog-ok");
    check("⛔ Rauswerfen: banned, access gone, her invite link blocked", await waitFor(async () => !!(await dbGet(`banned/${cleo.uid}`)) && !(await dbGet(`accessGranted/${cleo.uid}`))
      && (!cleoToken || (await dbGet(`invites/${cleoToken}/revoked`)) === true)), cleoToken);
    check("…she can't write anymore", (await tryWrite(cleo, `comments/${CORNER}/x1`, { author: "Cleo", text: "Hallo?", time: Date.now() })) === "denied");
    check("…nor come back with the code", (await tryWrite(cleo, `accessGranted/${cleo.uid}`, "TEST")) === "denied");
    const anaToken = await dbGet(`inviteOf/${ana.uid}`);
    check("…or with someone's link", !anaToken || (await tryWrite(cleo, `accessGranted/${cleo.uid}`, anaToken)) === "denied");
    await cleo.page.reload();
    const told = await cleo.page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 }).then(() => true, () => false);
    check("…and her app tells her instead of asking for a code", told && /gesperrt/.test(await cleo.page.textContent("#access-text")));
    check("the admin sees her under „Rausgeworfen“", await waitFor(() => ana.page.evaluate(() => /Cleo/.test(document.querySelector("#admin-reports .admin-banned")?.textContent || ""))));
    await ana.page.click("#admin-reports [data-unban]");
    await ana.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    await ana.page.click("#app-dialog-ok");
    check("„Wieder reinlassen“ lifts it — the code works again", await waitFor(async () => !(await dbGet(`banned/${cleo.uid}`))) && (await tryWrite(cleo, `accessGranted/${cleo.uid}`, "TEST")) === "ok");
    check("non-admins can't read the list or ban anyone", (await tryRead(ben, "banned")) === "denied" && (await tryWrite(ben, `banned/${ana.uid}`, { at: Date.now() })) === "denied");

    // ---------- Ben unblocks Cleo ----------
    await ben.page.click('#share-section [data-unblock]');
    check("unblock from the profile list", await waitFor(async () => !(await dbGet(`blocks/${ben.uid}/${cleo.uid}`))));
    check("…her compliments are welcome again", (await tryWrite(cleo, `compliments/${ben.uid}/${cleo.uid}_${day}`, { from: cleo.uid, text: "Sorry Ben", at: Date.now() })) === "ok");

    const errs = users.flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
