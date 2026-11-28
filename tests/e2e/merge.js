// Gleicher Name, mehrere Profile: the admin panel lists same-name PROFILES —
// not the logins of one profile, which all carry its name — and merges one
// into the bigger one by linking it: profile and ranking add the points up,
// nothing is moved or deleted, every device stays signed in. A tap on the
// toast or "Trennen" splits them again, and different people with the same
// name can be marked as such.
const fs = require("fs");
const path = require("path");
const { startServer, launch, newUser, onboard, dbGet, dbPut, resetDb, PORT } = require("./lib");
const SHOTS = path.join(__dirname, "shots");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(300); } return false; }

async function enterCode(user) {
  const { page } = user;
  await page.waitForSelector("#access-prompt", { state: "visible", timeout: 20000 });
  await page.fill("#access-code-input", "TEST");
  await page.click("#access-code-save");
  await page.waitForSelector("#claim-overlay", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("#claim-list .claim-row").length > 0, null, { timeout: 15000 });
  user.uid = await page.evaluate(() => window.FB.getAuthUid());
}
const blocking = (u) => u.page.evaluate(() => ["#access-prompt", "#claim-overlay", "#nickname-prompt", "#app-dialog"].filter((sel) => {
  const el = document.querySelector(sel);
  return el && getComputedStyle(el).display !== "none";
}));
// Totals of everyone called Max in this user's ranking.
const maxRows = (u) => u.page.evaluate(() => getRewardLeaders("aura", 100).filter((x) => normalizeName(x.nickname) === "max").map((x) => x.total).sort((a, b) => b - a));
const myAura = (u) => u.page.evaluate(() => getCurrentAura());
async function reloadApp(u) {
  await u.page.reload();
  await u.page.waitForFunction(() => typeof STATE !== "undefined" && window.FB?.getAuthUid?.() && STATE.userId === window.FB.getAuthUid(), null, { timeout: 20000 });
  await sleep(1500);
}
async function openAdmin(u) {
  await u.page.evaluate(() => renderAdminPanel());
  return waitFor(() => u.page.evaluate(() => document.querySelectorAll("#admin-profiles .admin-profile-row").length > 0 && !!document.querySelector("#admin-dupes")?.textContent.trim()));
}
const dupeGroups = (u) => u.page.evaluate(() => [...document.querySelectorAll("#admin-dupes .dupe-group")].map((g) => ({
  head: g.querySelector(".dupe-head").textContent.trim(),
  rows: [...g.querySelectorAll(".dupe-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim())
})));
const profileRows = (u) => u.page.evaluate(() => [...document.querySelectorAll("#admin-profiles .admin-profile-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()));
const clickInGroup = (u, name, sel) => u.page.evaluate(([n, s]) => {
  const g = [...document.querySelectorAll("#admin-dupes .dupe-group")].find((x) => x.querySelector(".dupe-head").textContent.trim().startsWith(n));
  const b = g && g.querySelector(s);
  if (b) b.click();
  return !!b;
}, [name, sel]);
const total = async (key) => Number((await dbGet(`points/${key}/total`)) || 0);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(path.join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  const users = [];
  try {
    // ---------- Max: installed app + the browser of the same phone (one profile, 2 logins) ----------
    const max1 = await newUser(browser, "Max");
    users.push(max1);
    await onboard(max1);
    await max1.page.evaluate(() => addXp(100, "test"));
    await sleep(1200);
    const max1b = await newUser(browser, "Max-browser");
    users.push(max1b);
    await enterCode(max1b);
    await max1b.page.evaluate(() => [...document.querySelectorAll("#claim-list .claim-row")].find((r) => r.querySelector(".claim-row-name").textContent.trim() === "Max")?.click());
    check("setup: Max's second login joins his profile", await waitFor(async () => (await dbGet(`points/${max1b.uid}/aliasOf`)) === max1.uid));
    await max1b.page.evaluate(() => addXp(15, "test"));

    // ---------- …and Max on a new phone, who typed his name again ----------
    const max2 = await newUser(browser, "Max", { dsf: 2, viewport: { width: 390, height: 844 } });
    users.push(max2);
    await onboard(max2);
    const twinOffered = await max2.page.waitForSelector("#app-dialog", { state: "visible", timeout: 6000 }).then(() => true, () => false);
    if (twinOffered) await max2.page.click("#app-dialog-cancel");   // "Nein, ich bin neu"
    await max2.page.evaluate(() => addXp(40, "test"));

    // ---------- two different people called Lena ----------
    const now = Date.now();
    await dbPut("points/lenaA", { total: 60, nickname: "Lena", history: [{ pts: 60, reason: "test", time: now - 3 * 86400000 }] });
    await dbPut("points/lenaB", { total: 25, nickname: "lena ", history: [{ pts: 25, reason: "test", time: now - 3600000 }] });

    // ---------- Ana is the admin ----------
    const ana = await newUser(browser, "Ana", { dsf: 2, viewport: { width: 390, height: 844 } });
    users.push(ana);
    await onboard(ana);
    await dbPut(`config/admins/${ana.uid}`, true);
    await sleep(1500);
    await reloadApp(ana);
    await waitFor(() => ana.page.evaluate(() => STATE.isAdmin === true));
    const [t1, t1b, t2] = [await total(max1.uid), await total(max1b.uid), await total(max2.uid)];
    const big = t1 + t1b, sum = t1 + t1b + t2;
    check("setup: two separate Max profiles (3 logins)", twinOffered && t1 > 100 && t1b >= 15 && t2 >= 40 && !(await dbGet(`points/${max2.uid}/aliasOf`)), `${t1}+${t1b} / ${t2}`);
    check("before: the ranking shows Max twice", await waitFor(async () => JSON.stringify(await maxRows(ana)) === JSON.stringify([big, t2])), JSON.stringify(await maxRows(ana)));

    // ---------- the admin panel ----------
    check("the admin panel opens", await openAdmin(ana));
    const groups = await dupeGroups(ana);
    check("„Doppelte Profile“ lists profiles, not logins: Lena — 2, Max — 2", groups.map((g) => `${g.head}:${g.rows.length}`).join("|") === "Lena — 2 Profile:2|Max — 2 Profile:2", JSON.stringify(groups));
    const maxGroup = groups.find((g) => g.head.startsWith("Max")) || { rows: [] };
    check("…the bigger one is the main profile, each with level, aura, logins, last activity",
      /Hauptprofil/.test(maxGroup.rows[0] || "") && new RegExp(`${big} Aura.*2 Logins.*heute aktiv`).test(maxGroup.rows[0] || "")
      && /Zusammenführen/.test(maxGroup.rows[1] || "") && new RegExp(`${t2} Aura.*1 Login`).test(maxGroup.rows[1] || ""), JSON.stringify(maxGroup.rows));
    const rows1 = await profileRows(ana);
    check("„👥 Profile“: one row per person — Max with his 2 logins", rows1.length === 5 && rows1.some((r) => new RegExp(`^Max · 2 Logins ${big} Aura`).test(r)), JSON.stringify(rows1));
    await ana.page.evaluate(() => document.querySelector("#admin-dupes")?.scrollIntoView({ block: "start" }));
    await ana.page.screenshot({ path: path.join(SHOTS, "merge-admin-dupes.png") });

    // ---------- merge: a tap on the toast undoes it ----------
    await clickInGroup(ana, "Max", "[data-dupe-merge]");
    await ana.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    const dlg = await ana.page.textContent("#app-dialog-text");
    check("the confirm says what happens: together Lv. + summed aura, devices stay signed in", new RegExp(`${sum} Aura`).test(dlg) && /angemeldet/.test(dlg) && /Trennen/.test(dlg), dlg);
    await ana.page.screenshot({ path: path.join(SHOTS, "merge-confirm.png") });
    await ana.page.click("#app-dialog-ok");
    check("merged by linking: Max's new phone becomes part of his profile", await waitFor(async () => (await dbGet(`points/${max2.uid}/aliasOf`)) === max1.uid && Number(await dbGet(`points/${max2.uid}/mergedAt`)) > 0));
    check("…the toast shows the merged level and aura", await waitFor(() => ana.page.evaluate((s) => new RegExp(`Zusammengeführt.*${s} Aura`).test(document.querySelector("#toast")?.textContent || ""), sum), 3000));
    await ana.page.click("#toast");
    check("…and a tap on it splits them again", await waitFor(async () => !(await dbGet(`points/${max2.uid}/aliasOf`)) && !(await dbGet(`points/${max2.uid}/mergedAt`))));
    check("…the panel shows both again", await waitFor(async () => (await dupeGroups(ana)).some((g) => g.head === "Max — 2 Profile")));

    // ---------- merge for real ----------
    await clickInGroup(ana, "Max", "[data-dupe-merge]");
    await ana.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    await ana.page.click("#app-dialog-ok");
    check("merged again", await waitFor(async () => (await dbGet(`points/${max2.uid}/aliasOf`)) === max1.uid));
    check("nothing moved, nothing deleted: every login keeps its own points", (await total(max1.uid)) === t1 && (await total(max1b.uid)) === t1b && (await total(max2.uid)) === t2
      && (await dbGet(`points/${max1b.uid}/aliasOf`)) === max1.uid);
    check("…the server copy carries the link too", await waitFor(async () => (await dbGet(`pointsLite/${max2.uid}/aliasOf`)) === max1.uid));
    await waitFor(async () => !(await dupeGroups(ana)).some((g) => g.head.startsWith("Max")));
    const after = await ana.page.evaluate(() => ({
      groups: [...document.querySelectorAll("#admin-dupes .dupe-group .dupe-head")].map((h) => h.textContent.trim()),
      merged: [...document.querySelectorAll("#admin-dupes .dupe-merged")].map((r) => r.textContent.replace(/\s+/g, " ").trim())
    }));
    check("panel: Max is no duplicate any more, he is listed under „Zusammengeführt“ with „Trennen“",
      after.groups.join("|") === "Lena — 2 Profile" && after.merged.length === 1 && new RegExp(`^Max → Max ${t2} Aura · 1 Login .*Trennen$`).test(after.merged[0]), JSON.stringify(after));
    const rows2 = await profileRows(ana);
    check("„👥 Profile“: one Max with 3 logins and all his aura", rows2.length === 4 && rows2.some((r) => new RegExp(`^Max · 3 Logins ${sum} Aura`).test(r)), JSON.stringify(rows2));
    check("ranking: one Max with the summed aura", await waitFor(async () => JSON.stringify(await maxRows(ana)) === JSON.stringify([sum])), JSON.stringify(await maxRows(ana)));
    await ana.page.evaluate(() => document.querySelector("#admin-dupes")?.scrollIntoView({ block: "start" }));
    await ana.page.screenshot({ path: path.join(SHOTS, "merge-admin-merged.png") });

    // ---------- the devices: still signed in, one level everywhere ----------
    await reloadApp(max2);
    check("Max's new phone: opens straight in, no „Wer bist du?“", (await blocking(max2)).length === 0, JSON.stringify(await blocking(max2)));
    check("…shows the merged aura and level", await waitFor(async () => (await myAura(max2)) === sum), String(await myAura(max2)));
    check("…and a single Max in its ranking", await waitFor(async () => JSON.stringify(await maxRows(max2)) === JSON.stringify([sum])), JSON.stringify(await maxRows(max2)));
    await max2.page.evaluate(() => document.querySelector('.tab[data-view="leaderboard"]').click());
    await sleep(800);
    await max2.page.screenshot({ path: path.join(SHOTS, "merge-ranking.png") });
    await reloadApp(max1);
    check("Max's first phone: the same aura", (await blocking(max1)).length === 0 && await waitFor(async () => (await myAura(max1)) === sum), String(await myAura(max1)));
    await max2.page.evaluate(() => addXp(7, "test"));
    check("new points on the merged phone keep the link and add up", await waitFor(async () => (await total(max2.uid)) === t2 + 7 && (await dbGet(`points/${max2.uid}/aliasOf`)) === max1.uid)
      && await waitFor(async () => (await myAura(max2)) === sum + 7));

    // ---------- „Trennen“ (later: the admin opens the panel again) ----------
    await openAdmin(ana);
    await waitFor(() => ana.page.evaluate((a) => new RegExp(`${a} Aura`).test(document.querySelector("#admin-dupes .dupe-merged")?.textContent || ""), t2 + 7));
    await ana.page.evaluate(() => document.querySelector("#admin-dupes [data-dupe-split]")?.click());
    await ana.page.waitForSelector("#app-dialog", { state: "visible", timeout: 5000 });
    check("„Trennen“ asks first and says where the aura goes", new RegExp(`${t2 + 7} Aura`).test(await ana.page.textContent("#app-dialog-text")), await ana.page.textContent("#app-dialog-text"));
    await ana.page.click("#app-dialog-ok");
    check("split: two profiles again, the points stay where they are", await waitFor(async () => !(await dbGet(`points/${max2.uid}/aliasOf`)) && !(await dbGet(`points/${max2.uid}/mergedAt`)))
      && (await total(max2.uid)) === t2 + 7 && (await total(max1.uid)) === t1);
    check("…the panel lists the Max profiles as duplicates again", await waitFor(async () => (await dupeGroups(ana)).some((g) => g.head === "Max — 2 Profile")));
    await reloadApp(max2);
    check("…the phone keeps working with its own aura", (await blocking(max2)).length === 0 && await waitFor(async () => (await myAura(max2)) === t2 + 7), String(await myAura(max2)));

    // ---------- different people with the same name ----------
    await openAdmin(ana);
    check("Lena and „lena “ count as the same name", (await dupeGroups(ana)).some((g) => g.head === "Lena — 2 Profile"));
    await clickInGroup(ana, "Lena", "[data-dupe-distinct]");
    check("„Verschiedene Personen“ hides the group", await waitFor(async () => !(await dupeGroups(ana)).some((g) => g.head.startsWith("Lena"))
      && /1 als verschiedene Personen ausgeblendet/.test(await ana.page.textContent("#admin-dupes"))));
    await openAdmin(ana);
    check("…and remembers it", !(await dupeGroups(ana)).some((g) => g.head.startsWith("Lena")));
    await ana.page.evaluate(() => document.querySelector("#admin-dupes [data-dupe-unhide]")?.click());
    check("„wieder zeigen“ brings it back", await waitFor(async () => (await dupeGroups(ana)).some((g) => g.head === "Lena — 2 Profile")));
    check("Lena's profiles were never touched", !(await dbGet("points/lenaA/aliasOf")) && !(await dbGet("points/lenaB/aliasOf")));

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
