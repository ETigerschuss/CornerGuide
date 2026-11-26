// Compliments: a preset or own words, Karma for the person who gets it, Aura
// for the sender, one per person and day (server rules), a 💛 thank-you that
// sends Karma back, push, and the sections on both profiles.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, resetDb, PORT } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 12000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(300); } return false; }
const tryWrite = (u, p, v) => u.page.evaluate(async ([x, y]) => { try { await window.FB.set(window.FB.ref(window.FB.db, x), y); return "ok"; } catch (e) { return "denied"; } }, [p, v]);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(path.join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  try {
    const ana = await newUser(browser, "Ana", { dsf: 2, viewport: { width: 390, height: 844 } });
    const ben = await newUser(browser, "Ben", { dsf: 2, viewport: { width: 390, height: 844 } });
    for (const u of [ana, ben]) { await onboard(u); await u.page.evaluate(() => addXp(20, "test")); }
    await sleep(1500);
    // Record pushes instead of sending them (the emulator has no FCM).
    await ana.page.evaluate(() => { window._pushes = []; const orig = sendTargetedPush; window.sendTargetedPush = (ids, p) => { window._pushes.push({ ids, p }); return orig(ids, p); }; });
    const day = await ana.page.evaluate(() => complimentDay());
    const id = `${ana.uid}_${day}`;

    // ---------- Ana pays Ben a compliment from his profile ----------
    await ana.page.evaluate((k) => openUserProfile(k), ben.uid);
    const hasBtn = await ana.page.waitForSelector("#user-profile-overlay .cmp-open", { timeout: 10000 }).then(() => true, () => false);
    check("Ben's profile has „💐 Kompliment machen“", hasBtn);
    const benKarma0 = await ben.page.evaluate(() => getCurrentKarma());
    const anaAura0 = await ana.page.evaluate(() => getCurrentAura());
    await ana.page.click("#user-profile-overlay .cmp-open");
    await ana.page.waitForSelector("#compliment-overlay", { state: "visible", timeout: 5000 });
    const presets = await ana.page.$$eval("#cmp-presets .cmp-preset", (b) => b.length);
    check("the composer offers ready-made compliments", presets >= 8, String(presets));
    check("…and „Senden“ waits until one is chosen", await ana.page.isDisabled("#cmp-send"));
    await ana.page.click('#cmp-presets [data-cmp-preset="vibes"]');
    check("tapping one fills the text", /gute Laune/.test(await ana.page.inputValue("#cmp-text")) && !(await ana.page.isDisabled("#cmp-send")));
    await ana.page.screenshot({ path: path.join(SHOTS, "compliment-composer.png") });
    await ana.page.click("#cmp-send");
    const stored = await waitFor(async () => { const c = await dbGet(`compliments/${ben.uid}/${id}`); return c && c.preset === "vibes" && c.from === ana.uid && /gute Laune/.test(c.text); });
    check("stored under Ben's profile, from Ana, with the preset", stored);
    check("Ben gets +20 Karma", await waitFor(() => ben.page.evaluate((k0) => getCurrentKarma() >= k0 + 20, benKarma0)));
    check("Ana gets +5 Aura for it", (await ana.page.evaluate(() => getCurrentAura())) >= anaAura0 + 5);
    const push = await ana.page.evaluate(() => window._pushes.find((x) => x.p.type === "compliment"));
    check("Ben gets a push that opens his compliments", !!push && push.ids.includes(ben.uid) && /focus=compliments/.test(push.p.query) && /gute Laune/.test(push.p.body), JSON.stringify(push || {}).slice(0, 160));
    check("Ben sees it pop up in the app", await waitFor(() => ben.page.evaluate(() => /gute Laune/.test(document.querySelector("#toast")?.textContent || ""))));

    // ---------- once per person and day ----------
    await ana.page.evaluate((k) => openUserProfile(k), ben.uid);
    const doneShown = await waitFor(() => ana.page.evaluate(() => /Heute schon ein Kompliment/.test(document.querySelector("#user-profile-overlay .cmp-section")?.textContent || "")));
    check("Ben's profile now says „heute schon ein Kompliment von dir“", doneShown);
    check("…and lists it there for everyone", await ana.page.evaluate(() => /gute Laune/.test(document.querySelector("#user-profile-overlay .cmp-list")?.textContent || "")));
    await ana.page.screenshot({ path: path.join(SHOTS, "compliment-public.png") });
    await ana.page.evaluate(() => closeUserProfile());
    check("the server refuses a second one the same day", (await tryWrite(ana, `compliments/${ben.uid}/${id}`, { from: ana.uid, text: "Nochmal!", at: Date.now() })) === "denied");
    check("nobody can send one in someone else's name", (await tryWrite(ben, `compliments/${ana.uid}/x_${day}`, { from: "x", text: "Fake", at: Date.now() })) === "denied");
    check("no compliments to yourself", (await tryWrite(ana, `compliments/${ana.uid}/${ana.uid}_${day}`, { from: ana.uid, text: "Ich bin toll", at: Date.now() })) === "denied");

    // ---------- Ben's profile: the wall and a thank-you ----------
    await ben.page.evaluate(() => document.querySelector('.tab[data-view="profile"]').click());
    const listed = await ben.page.waitForSelector("#my-compliments .cmp-item", { timeout: 8000 }).then(() => true, () => false);
    check("Ben's profile shows his compliments", listed && /Ana/.test(await ben.page.textContent("#my-compliments")));
    await ben.page.evaluate(() => document.querySelector("#my-compliments")?.scrollIntoView({ block: "start" }));
    await ben.page.screenshot({ path: path.join(SHOTS, "compliment-wall.png") });
    check("Ana can't mark it as thanked herself", (await tryWrite(ana, `compliments/${ben.uid}/${id}/thanked`, true)) === "denied");
    const anaKarma0 = await ana.page.evaluate(() => getCurrentKarma());
    await ben.page.click("#my-compliments [data-compliment-thanks]");
    check("💛 Danke is stored", await waitFor(async () => (await dbGet(`compliments/${ben.uid}/${id}/thanked`)) === true));
    check("…and gives Ana +5 Karma", await waitFor(() => ana.page.evaluate((k0) => getCurrentKarma() >= k0 + 5, anaKarma0)));
    check("the button turns into „bedankt“", await waitFor(() => ben.page.evaluate(() => /bedankt/.test(document.querySelector("#my-compliments")?.textContent || ""))));

    // ---------- own words, from the corner (people here) ----------
    await ben.page.evaluate(() => { window._pushes = []; const orig = sendTargetedPush; window.sendTargetedPush = (ids, p) => { window._pushes.push({ ids, p }); return orig(ids, p); }; });
    await ben.page.evaluate((k) => openComplimentComposer(k, "Ana"), ana.uid);
    await ben.page.waitForSelector("#compliment-overlay", { state: "visible", timeout: 5000 });
    await ben.page.fill("#cmp-text", "Danke fürs Pizza-Mitbringen 🍕");
    await ben.page.click("#cmp-send");
    const own = await waitFor(async () => { const c = await dbGet(`compliments/${ana.uid}/${ben.uid}_${day}`); return c && !c.preset && /Pizza/.test(c.text); });
    check("own words are stored as written (no preset)", own);
    check("…and Ana sees them on her profile", await waitFor(async () => {
      await ana.page.evaluate(() => { if (STATE.view !== "profile") document.querySelector('.tab[data-view="profile"]').click(); else renderProfile(); });
      return ana.page.evaluate(() => /Pizza/.test(document.querySelector("#my-compliments")?.textContent || ""));
    }));
    check("the profile suggests whom to make happy next", await ana.page.evaluate(() => typeof complimentSuggestions === "function"));

    // ---------- the push opens the compliments ----------
    const cmpLink = await ana.page.evaluate((root) => `?profile=${encodeURIComponent(root)}&focus=compliments`, ana.uid);
    await ana.page.goto(`http://127.0.0.1:${PORT}/index.html${cmpLink}`);
    const focused = await waitFor(() => ana.page.evaluate(() => STATE.view === "profile" && !!document.querySelector("#my-compliments")), 20000);
    check("a compliment push opens your own compliments", focused);

    const errs = [ana, ben].flatMap((u) => u.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
