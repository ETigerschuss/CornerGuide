// Invite links: every member's shared links carry a personal invite; whoever
// opens one is in with one tap (no code), picks a name, and the inviter gets
// Karma (Cloud Function, 3× a day). Replaced/blocked links stop letting new
// people in, the group code keeps working, stickers carry no invite, and the
// rules keep anyone from forging invites, counts or joins.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, dbPut, resetDb, PORT } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(300); } return false; }
const tryWrite = (u, p, v) => u.page.evaluate(async ([x, y]) => { try { await window.FB.set(window.FB.ref(window.FB.db, x), y); return "ok"; } catch (e) { return "denied"; } }, [p, v]);
const tryRead = (u, p) => u.page.evaluate(async (x) => { try { await window.FB.get(window.FB.ref(window.FB.db, x)); return "ok"; } catch (e) { return "denied"; } }, p);
// Notes whether the code prompt ever showed up (the point: it must not).
const watchAccessPrompt = (context) => context.addInitScript(() => {
  window._accessShown = false;
  document.addEventListener("DOMContentLoaded", () => {
    const el = document.querySelector("#access-prompt");
    if (el) new MutationObserver(() => { if (el.style.display === "flex") window._accessShown = true; }).observe(el, { attributes: true, attributeFilter: ["style"] });
  });
});
const CORNER = "piazza-zenetti";

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(path.join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  const users = [];
  try {
    // ---------- Ana is in with the group code and gets her personal invite ----------
    const ana = await newUser(browser, "Ana", { dsf: 2, viewport: { width: 390, height: 844 } });
    users.push(ana);
    await onboard(ana);
    await ana.page.evaluate(() => addXp(20, "test"));
    const made = await waitFor(async () => !!(await dbGet(`inviteOf/${ana.uid}`)));
    const token = made ? await dbGet(`inviteOf/${ana.uid}`) : "";
    const inv = token ? await dbGet(`invites/${token}`) : null;
    check("the group code still works, and Ana gets her own invite link", made && /^[A-Za-z0-9_-]{16,40}$/.test(token) && inv && inv.by === ana.uid && inv.byName === "Ana", token);
    check("…remembered on the device", (await ana.page.evaluate(() => myInviteToken())) === token);
    const links = await ana.page.evaluate((c) => ({
      corner: buildShareUrl(c, STATE.nickname), whatsapp: buildShareUrl(c, STATE.nickname, false, { [COME_PARAM]: "1" }),
      join: buildJoinUrl(true), sticker: buildStickerUrl(c)
    }), CORNER);
    const param = (u) => new URL(u).searchParams.get("i");
    check("corner and WhatsApp links carry her invite", param(links.corner) === token && param(links.whatsapp) === token, links.corner);
    check("„Folge mir“ links too", param(links.join) === token);
    check("neutral stickers for public places carry none", param(links.sticker) === null, links.sticker);

    await ana.page.evaluate(() => document.querySelector('.tab[data-view="profile"]').click());
    const section = await waitFor(() => ana.page.evaluate(() => /Dein Einladungslink/.test(document.querySelector("#share-section")?.textContent || "")));
    check("her profile shows „📨 Dein Einladungslink“ with Teilen and Neuer Link", section && await ana.page.evaluate(() => !!document.querySelector("#share-invite-link") && !!document.querySelector("#replace-invite-link")));
    await ana.page.evaluate(() => document.querySelector("#share-section")?.scrollIntoView({ block: "start" }));
    await ana.page.screenshot({ path: path.join(SHOTS, "invite-profile.png") });
    await ana.page.evaluate(() => { window._sharedText = ""; navigator.share = undefined; window.copyText = async (t) => { window._sharedText = t; return true; }; });
    await ana.page.click("#share-invite-link");
    check("„Teilen“ hands out the link with her invite", await waitFor(() => ana.page.evaluate((t) => new URL(window._sharedText || "http://x/").searchParams.get("i") === t, token)));

    // ---------- Cleo opens Ana's corner link: in with one tap ----------
    const anaKarma0 = await ana.page.evaluate(() => getCurrentKarma());
    const cleoLink = new URL(links.corner);
    const cleo = await newUser(browser, "Cleo", { dsf: 2, viewport: { width: 390, height: 844 }, query: cleoLink.search, beforeGoto: watchAccessPrompt });
    users.push(cleo);
    const welcomed = await cleo.page.waitForSelector("#claim-new-name", { state: "visible", timeout: 20000 }).then(() => true, () => false);
    check("Cleo lands straight on „Wer bist du?“", welcomed);
    check("…without ever seeing the code prompt", !(await cleo.page.evaluate(() => window._accessShown)));
    await cleo.page.screenshot({ path: path.join(SHOTS, "invite-welcome.png") });
    cleo.uid = await cleo.page.evaluate(() => window.FB.getAuthUid());
    check("her access is the invite", (await dbGet(`accessGranted/${cleo.uid}`)) === token);
    check("the invite is gone from the address", !(await cleo.page.evaluate(() => new URLSearchParams(location.search).has("i"))));
    await cleo.page.fill("#claim-new-name", "Cleo");
    await cleo.page.click("#claim-new-go");
    const joined = await waitFor(async () => { const j = await dbGet(`inviteJoins/${token}/${cleo.uid}`); return j && j.name === "Cleo"; });
    check("with her name her app notes the join", joined);
    check("the server counts it (uses = 1)", await waitFor(async () => (await dbGet(`invites/${token}/uses`)) === 1));
    check("Ana gets +30 Karma for it", await waitFor(() => ana.page.evaluate((k0) => getCurrentKarma() >= k0 + 30, anaKarma0)));
    const hist = Object.values(((await dbGet(`karmaPoints/${ana.uid}`)) || {}).history || {});
    check("…with „🍻 Cleo ist über deinen Link dabei“", hist.some((h) => h && h.pts === 30 && /Cleo ist über deinen Link dabei/.test(h.reason)));
    check("Cleo's link then opens the corner it was for", await waitFor(() => cleo.page.evaluate((c) => STATE.detailCornerId === c && document.querySelector("#detail-overlay")?.classList.contains("open"), CORNER)));
    const cleoToken = await waitFor(() => cleo.page.evaluate(() => !!myInviteToken())) ? await cleo.page.evaluate(() => myInviteToken()) : "";
    const cleoShare = await cleo.page.evaluate((c) => buildShareUrl(c, STATE.nickname), CORNER);
    check("Cleo's own links carry her own invite, not Ana's", cleoToken && cleoToken !== token && new URL(cleoShare).searchParams.get("i") === cleoToken);

    // ---------- the rules ----------
    check("nobody can make an invite in someone else's name", (await tryWrite(cleo, "invites/FakeFakeFakeFake1234", { by: ana.uid, at: Date.now() })) === "denied");
    check("…or point someone else's link elsewhere", (await tryWrite(cleo, `inviteOf/${ana.uid}`, cleoToken)) === "denied");
    check("…or block someone else's link", (await tryWrite(cleo, `invites/${token}/revoked`, true)) === "denied");
    check("…or bump a count", (await tryWrite(ana, `invites/${token}/uses`, 99)) === "denied");
    check("a join only for the invite you came with", (await tryWrite(cleo, `inviteJoins/${cleoToken}/${cleo.uid}`, { name: "Cleo", at: Date.now() })) === "denied");
    check("…and only once", (await tryWrite(cleo, `inviteJoins/${token}/${cleo.uid}`, { name: "Cleo2", at: Date.now() })) === "denied");
    check("who joined through whom is admin-only", (await tryRead(cleo, `inviteJoins/${token}`)) === "denied" && (await tryRead(cleo, "invites")) === "denied");

    // ---------- 3 thank-yous a day, then it only counts ----------
    const day = await ana.page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, ""));
    const k1 = await ana.page.evaluate(() => getCurrentKarma());
    for (const n of [1, 2, 3]) await dbPut(`inviteJoins/${token}/fakeLogin${n}`, { name: `Gast${n}`, at: Date.now() });
    check("the server counts every join", await waitFor(async () => (await dbGet(`invites/${token}/uses`)) === 4));
    check("…but thanks Ana only 3× a day", await waitFor(async () => (await dbGet(`inviteRewards/${ana.uid}/${day}`)) === 3)
      && await waitFor(() => ana.page.evaluate((k) => getCurrentKarma() === k + 60, k1)), String(await ana.page.evaluate(() => getCurrentKarma()) - k1));

    // ---------- the push opens the newcomer, with a compliment ready ----------
    await ana.page.goto(`http://127.0.0.1:${PORT}/index.html?profile=${encodeURIComponent(cleo.uid)}&focus=compliment`);
    const composer = await waitFor(() => ana.page.evaluate(() => document.querySelector("#compliment-overlay")?.style.display === "flex" && /Cleo/.test(document.querySelector("#compliment-overlay")?.textContent || "")), 25000);
    check("„Neu dabei“ push opens Cleo's profile with the compliment ready", composer);
    await ana.page.screenshot({ path: path.join(SHOTS, "invite-welcome-compliment.png") });
    await ana.page.click("#cmp-close");
    await ana.page.evaluate(() => closeUserProfile());

    // ---------- someone already in keeps their access ----------
    const ben = await newUser(browser, "Ben");
    users.push(ben);
    await onboard(ben);
    await ben.page.goto(`http://127.0.0.1:${PORT}/index.html${cleoLink.search}`);
    await sleep(3500);
    check("a member opening the link keeps their own access", (await dbGet(`accessGranted/${ben.uid}`)) === "TEST" && !(await ben.page.isVisible("#access-prompt")));
    check("…and never passes Ana's invite on", await ben.page.evaluate((t) => { const u = new URL(buildShareUrl("harras", STATE.nickname)); return u.searchParams.get("i") !== t && !new URLSearchParams(location.search).has("i"); }, token));

    // ---------- picking an existing profile is no new member ----------
    const fay = await newUser(browser, "Fay", { query: cleoLink.search });
    users.push(fay);
    await fay.page.waitForSelector("#claim-new-name", { state: "visible", timeout: 20000 });
    fay.uid = await fay.page.evaluate(() => window.FB.getAuthUid());
    const usesBefore = await dbGet(`invites/${token}/uses`);
    await fay.page.evaluate((k) => linkToProfile(k, { welcome: true }), ben.uid);
    await sleep(2500);
    check("Ben on a new phone through the link: no join, no Karma", !(await dbGet(`inviteJoins/${token}/${fay.uid}`)) && (await dbGet(`invites/${token}/uses`)) === usesBefore);

    // ---------- Ana replaces her link ----------
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="profile"]').click());
    await ana.page.waitForSelector("#replace-invite-link", { timeout: 10000 });
    await ana.page.click("#replace-invite-link");
    await ana.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    await ana.page.click("#app-dialog-ok");
    const replaced = await waitFor(async () => { const t = await dbGet(`inviteOf/${ana.uid}`); return t && t !== token; });
    const token2 = await dbGet(`inviteOf/${ana.uid}`);
    check("„Neuer Link“ blocks the old one and makes a new one", replaced && (await dbGet(`invites/${token}/revoked`)) === true && (await ana.page.evaluate(() => myInviteToken())) === token2);
    const dan = await newUser(browser, "Dan", { query: `?i=${token}` });
    users.push(dan);
    const told = await dan.page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 }).then(() => true, () => false);
    check("the old link lets nobody new in — and says so", told && /gilt nicht mehr/.test(await dan.page.textContent("#access-text")));
    dan.uid = await dan.page.evaluate(() => window.FB.getAuthUid());
    check("…and the server refuses it too", (await tryWrite(dan, `accessGranted/${dan.uid}`, token)) === "denied" && (await tryWrite(dan, `accessGranted/${dan.uid}`, "NoSuchInviteToken1234")) === "denied");
    await dan.page.goto(`http://127.0.0.1:${PORT}/index.html?i=${token2}`);
    check("the new link works", await dan.page.waitForSelector("#claim-new-name", { state: "visible", timeout: 20000 }).then(() => true, () => false) && (await dbGet(`accessGranted/${dan.uid}`)) === token2);

    // ---------- admin: who brought whom, and a block ----------
    await dbPut(`config/admins/${ana.uid}`, true);
    await ana.page.reload();
    await ana.page.waitForFunction(() => STATE.isAdmin === true, null, { timeout: 15000 });
    await ana.page.evaluate(() => renderAdminPanel());
    const listed = await waitFor(() => ana.page.evaluate(() => /Cleo/.test(document.querySelector("#admin-invites")?.textContent || "") && /4 dabei/.test(document.querySelector("#admin-invites")?.textContent || "")));
    check("the admin panel lists the links, with who came in", listed, await ana.page.evaluate(() => (document.querySelector("#admin-invites")?.textContent || "").replace(/\s+/g, " ").slice(0, 200)));
    await ana.page.evaluate(() => document.querySelector("#admin-invites")?.scrollIntoView({ block: "start" }));
    await ana.page.screenshot({ path: path.join(SHOTS, "invite-admin.png") });
    await ana.page.click(`[data-admin-revoke-invite="${cleoToken}"]`);
    await ana.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    await ana.page.click("#app-dialog-ok");
    check("…and can block one", await waitFor(async () => (await dbGet(`invites/${cleoToken}/revoked`)) === true));

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
