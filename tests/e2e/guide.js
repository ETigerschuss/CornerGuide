// Reward guide + matrix UI check.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, resetDb } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
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
    const eva = await newUser(browser, "Eva", { dsf: 2 });
    await onboard(eva);
    const p = eva.page;
    // Matrix maths for a few sample profiles.
    const cells = await p.evaluate(() => [[0, 0], [500, 35], [500, 60], [2500, 10], [100, 450], [3000, 900]].map(([a, k]) => `${a}/${k}=${getMatrixIdentity(a, k).name}`));
    console.log(cells.join(" | "));
    check("matrix cells", cells.join("|") === "0/0=Rookie|500/35=Regular|500/60=Balanced Connector|2500/10=Aura Magnet|100/450=Karma Carrier|3000/900=Matrix Legend");
    const steps = await p.evaluate(() => matrixNextSteps(500, 35).map((s) => s.replace(/<[^>]+>/g, "")));
    check("next steps for 500/35", steps.length === 2 && steps[0].includes("15 Karma") && steps[1].includes("1565 Aura"), steps.join(" || "));

    // Give Eva some history so the grid shows a real position.
    await p.evaluate(() => { addXp(480, "Test"); addKarmaPoints(currentUserKey(), 75, "Test", STATE.nickname); });
    await p.waitForTimeout(800);
    // The one-time tip toast, then the nickname-bar entry point.
    await p.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("So sammelst du Punkte"), null, { timeout: 15000 });
    check("one-time tip toast shown after onboarding", true);
    await p.click("#nick-pts");
    await p.waitForSelector("#reward-guide-overlay.open");
    const guide = await p.textContent("#reward-guide-body");
    check("guide lists gossip karma", guide.includes("Gossip-Story erzählt") && guide.includes("+2…+20"));
    check("guide no longer promises 'Leuten direkt helfen'", !guide.includes("direkt helfen"));
    check("guide marks current cell", (await p.textContent(".mx-cell.me")).includes("Balanced Connector"));
    await p.screenshot({ path: path.join(SHOTS, "8-guide.png") });
    await p.evaluate(() => document.querySelector(".guide-card").scrollTo(0, 99999));
    await p.screenshot({ path: path.join(SHOTS, "9-guide-bottom.png") });
    await p.click("#reward-guide-close");
    check("guide closes", !(await p.isVisible("#reward-guide-overlay")));

    // Profile matrix + ranking button.
    await p.click('.tab[data-view="profile"]');
    await p.waitForSelector("#reward-matrix-section .mx-grid");
    await p.evaluate(() => document.querySelector("#reward-matrix-section").scrollIntoView());
    await p.screenshot({ path: path.join(SHOTS, "10-profile-matrix.png") });
    await p.click('.tab[data-view="leaderboard"]');
    await p.click("#points-help-btn");
    check("ranking tab opens the guide", await p.isVisible("#reward-guide-overlay.open"));
    await p.click("#reward-guide-close");

    // English.
    await p.evaluate(() => setLang("en"));
    await p.click("#points-help-btn");
    const en = await p.textContent("#reward-guide-body");
    check("guide in English", en.includes("Earning karma") && en.includes("Told a gossip story"));
    await p.click("#reward-guide-close");
    await p.evaluate(() => setLang("de"));

    const errs = p._logs.filter((l) => l.startsWith("[pageerror]"));
    check("no page errors", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
