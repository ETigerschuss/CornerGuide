// Languages: Deutsch, English, Español. The Corner logo on the title page
// opens your own profile; the 🏳️‍🌈 flag opens the language menu below it
// (the same choice as in the profile settings). A switch reloads the app in
// the new language — static page texts, texts the app writes, dates — and
// keeps the view you were on. The main screens have no text left without a
// Spanish translation.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, resetDb, PORT } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 12000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(250); } return false; }
const tabs = (u) => u.page.evaluate(() => [...document.querySelectorAll(".tab[data-view]")].map((t) => t.textContent.trim()));
const activeView = (u) => u.page.evaluate(() => document.querySelector(".tab.active")?.dataset.view);
// Every T() text without Spanish lands in window._i18nMiss (see T in 02-state-language.js).
const trackMissing = (ctx) => ctx.addInitScript(() => { window._i18nMiss = new Set(); });

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(path.join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  const users = [];
  try {
    const ana = await newUser(browser, "Ana", { dsf: 2, viewport: { width: 390, height: 844 }, beforeGoto: trackMissing });
    users.push(ana);
    await onboard(ana);
    await ana.page.evaluate(() => addXp(20, "test"));
    await sleep(800);

    // ---------- German by default; logo → own profile ----------
    check("German by default: tabs, flag says DE", (await tabs(ana)).join("|") === "Karte|Liste|🏆 Ranking|👤 Profil" && /DE/.test(await ana.page.textContent("#hero-lang-code")));
    check("the logo and the flag are buttons", await ana.page.evaluate(() => document.querySelector("#hero-logo-btn")?.getAttribute("aria-label") === "Dein Profil" && document.querySelector("#hero-flag-btn")?.getAttribute("aria-label") === "Sprache wählen"));
    await ana.page.click("#hero-logo-btn");
    check("tapping the Corner logo opens your own profile", await waitFor(async () => (await activeView(ana)) === "profile"
      && await ana.page.evaluate(() => /Ana/.test(document.querySelector("#profile-content .profile-name")?.textContent || ""))));
    check("…with name, level and stats in view", await waitFor(() => ana.page.evaluate(() => {
      const r = document.querySelector("#profile-content .profile-header")?.getBoundingClientRect();
      return !!r && r.top >= 0 && r.top < window.innerHeight * 0.6;
    })));
    await ana.page.screenshot({ path: path.join(SHOTS, "lang-logo-profile.png") });

    // ---------- flag → language menu ----------
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="map"]').click());
    await sleep(400);
    await ana.page.click("#hero-flag-btn");
    const menu = await ana.page.waitForSelector("#hero-lang-menu", { state: "visible", timeout: 5000 }).then(() => true, () => false);
    const options = await ana.page.$$eval("#hero-lang-menu [data-set-lang]", (b) => b.map((x) => x.textContent.trim()));
    check("the 🏳️‍🌈 flag opens the language menu right below it", menu && await ana.page.evaluate(() => {
      const f = document.querySelector("#hero-flag-btn").getBoundingClientRect();
      const m = document.querySelector("#hero-lang-menu").getBoundingClientRect();
      return m.top >= f.bottom && m.top - f.bottom < 30 && Math.abs(m.right - f.right) < 30;
    }));
    check("…with Deutsch (✓), English and Español", options.length === 3 && /Deutsch.*✓/.test(options[0]) && /English/.test(options[1]) && /Español/.test(options[2]), options.join(" | "));
    await ana.page.screenshot({ path: path.join(SHOTS, "lang-menu.png") });
    await ana.page.keyboard.press("Escape");
    check("Escape closes it", await ana.page.isHidden("#hero-lang-menu"));
    await ana.page.click("#hero-flag-btn");
    await ana.page.click(".title-block");
    check("…so does a tap elsewhere", await waitFor(() => ana.page.isHidden("#hero-lang-menu")));

    // ---------- Español ----------
    await ana.page.click("#hero-flag-btn");
    await Promise.all([ana.page.waitForNavigation({ timeout: 20000 }), ana.page.click('#hero-lang-menu [data-set-lang="es"]')]);
    await ana.page.waitForFunction(() => typeof STATE !== "undefined" && STATE.lang === "es", null, { timeout: 15000 });
    await sleep(1500);
    check("Español: the app reloads in Spanish", (await tabs(ana)).join("|") === "Mapa|Lista|🏆 Ranking|👤 Perfil" && await ana.page.evaluate(() => document.documentElement.lang === "es"), (await tabs(ana)).join("|"));
    check("…the flag says ES, the page's own texts too", /ES/.test(await ana.page.textContent("#hero-lang-code"))
      && /Cambiar/.test(await ana.page.textContent("#nick-change-btn")) && /Amigos por ahí/.test(await ana.page.textContent("#friends-bar-title")));
    check("…and you stay on the view you were on (map)", (await activeView(ana)) === "map");
    await ana.page.screenshot({ path: path.join(SHOTS, "lang-es-map.png") });
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="list"]').click());
    await sleep(800);
    await ana.page.evaluate(() => openDetail("piazza-zenetti"));
    check("the corner detail is in Spanish", await waitFor(() => ana.page.evaluate(() => /Ruta/.test(document.querySelector("#detail-overlay")?.textContent || "") && /Visitas/i.test(document.querySelector("#detail-overlay")?.textContent || ""))));
    await ana.page.screenshot({ path: path.join(SHOTS, "lang-es-detail.png") });
    await ana.page.evaluate(() => closeDetail());
    await ana.page.click("#hero-logo-btn");
    check("the profile too — sections, buttons, teams", await waitFor(() => ana.page.evaluate(() => {
      const t = document.querySelector("#profile-content")?.textContent || "";
      return /Compartir y amigos cercanos/.test(t) && /Ranking de equipos/i.test(t) && /Lobo/.test(t) && /Idioma/.test(t);
    })));
    check("dates use the Spanish format", await ana.page.evaluate(() => appLocale() === "es-ES" && clockOf(Date.UTC(2026, 10, 28, 17, 5)) === new Date(Date.UTC(2026, 10, 28, 17, 5)).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })));
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="leaderboard"]').click());
    await sleep(800);
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="profile"]').click());
    await sleep(800);
    const missing = await ana.page.evaluate(() => [...(window._i18nMiss || [])]);
    check("map, list, corner, profile and ranking: no text without Spanish", missing.length === 0, JSON.stringify(missing).slice(0, 400));

    // ---------- the profile settings offer the same three ----------
    const langBtns = await ana.page.$$eval("#profile-content [data-set-lang]", (b) => b.map((x) => `${x.dataset.setLang}:${x.classList.contains("active")}`));
    check("profile settings: Deutsch, English, Español — Español active", langBtns.join(",") === "de:false,en:false,es:true", langBtns.join(","));
    await ana.page.evaluate(() => document.querySelector('#profile-content [data-set-lang="en"]')?.scrollIntoView({ block: "center" }));
    await Promise.all([ana.page.waitForNavigation({ timeout: 20000 }), ana.page.click('#profile-content [data-set-lang="en"]')]);
    await ana.page.waitForFunction(() => typeof STATE !== "undefined" && STATE.lang === "en", null, { timeout: 15000 });
    await sleep(1200);
    check("English from the profile: reloads in English, back on the profile", (await tabs(ana)).join("|") === "Map|List|🏆 Ranking|👤 Profile" && (await activeView(ana)) === "profile" && /EN/.test(await ana.page.textContent("#hero-lang-code")));
    await Promise.all([ana.page.waitForNavigation({ timeout: 20000 }), ana.page.evaluate(() => setLang("de"))]);
    await ana.page.waitForFunction(() => typeof STATE !== "undefined" && STATE.lang === "de", null, { timeout: 15000 });
    check("…and back to Deutsch", await waitFor(async () => (await tabs(ana)).join("|") === "Karte|Liste|🏆 Ranking|👤 Profil"));

    // ---------- a newcomer whose phone is set to Spanish ----------
    const lu = await newUser(browser, "Lucía", { dsf: 2, viewport: { width: 390, height: 844 }, beforeGoto: (ctx) => ctx.addInitScript(() => {
      if (!sessionStorage.getItem("seeded")) { localStorage.setItem("cg.lang", "es"); sessionStorage.setItem("seeded", "1"); }
    }) });
    users.push(lu);
    await lu.page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 });
    check("a newcomer in Spanish: the access screen is Spanish", /introduce el código de invitación/.test(await lu.page.textContent("#access-text")) && /Confirmar/.test(await lu.page.textContent("#access-code-save")));
    await lu.page.screenshot({ path: path.join(SHOTS, "lang-es-access.png") });
    await lu.page.fill("#access-code-input", "TEST");
    await lu.page.click("#access-code-save");
    check("…and so is “¿Quién eres?”", await waitFor(() => lu.page.evaluate(() => /Quién eres/.test(document.querySelector("#claim-title")?.textContent || "") && /Nuevo aquí/.test(document.querySelector("#claim-new")?.textContent || ""))));
    await lu.page.screenshot({ path: path.join(SHOTS, "lang-es-claim.png") });

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
