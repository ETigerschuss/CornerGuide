// The app notices a new deploy and loads it: right away when nothing is open,
// otherwise via a tappable notice — and never in a loop. Plus the one service
// worker (cache + push) registers and controls the page.
const fs = require("fs");
const { startServer, launch, newUser, onboard, resetDb } = require("./lib");
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await fetch("http://127.0.0.1:9000/.settings/rules.json?ns=cornerguide-default-rtdb", { method: "PUT", headers: { Authorization: "Bearer owner" }, body: fs.readFileSync(require("path").join(__dirname, "..", "..", "firebase.database.rules.json"), "utf8") });
  const server = await startServer();
  await resetDb();
  const browser = await launch();
  let serverBuild = "old1";
  try {
    const u = await newUser(browser, "Upd", {
      beforeGoto: (ctx) => ctx.route(/\/index\.html/, async (route) => {
        const resp = await route.fetch();
        let body = await resp.text();
        const build = route.request().url().includes("build-check") ? serverBuild : "old1";
        body = body.replace('<meta name="cg-build" content="dev" />', `<meta name="cg-build" content="${build}" />`);
        await route.fulfill({ response: resp, body });
      })
    });
    await onboard(u);
    await sleep(9000);   // the start-up check (same build) must not reload
    let loads = 0;
    u.page.on("load", () => loads++);
    check("same build: no reload", loads === 0 && await u.page.evaluate(() => APP_BUILD) === "old1");
    check("map with nothing open counts as idle", await u.page.evaluate(() => appLooksIdle()));

    serverBuild = "new2";
    await u.page.evaluate(() => checkForAppUpdate(true)).catch(() => {});
    await u.page.waitForLoadState("load");
    await sleep(2500);
    const after = await u.page.evaluate(() => ({ tried: sessionStorage.getItem("cg.reloadedFor"), toast: document.querySelector("#toast").textContent }));
    check("new build + idle: reloads by itself, says so", loads === 1 && after.tried === "new2" && /App aktualisiert/.test(after.toast), JSON.stringify({ loads, ...after }));
    await sleep(9000);   // the reloaded page still says old1 (stale CDN): must not loop
    const toast2 = await u.page.textContent("#toast");
    check("no reload loop when the server copy lags", loads === 1 && /Neue Version da/.test(toast2), JSON.stringify({ loads, toast2 }));

    // something open: ask instead of reloading
    serverBuild = "new3";
    await u.page.evaluate(() => { _appUpdate.lastCheck = 0; });
    await u.page.click("#fab");
    await sleep(300);
    check("dialog open counts as busy", !(await u.page.evaluate(() => appLooksIdle())));
    await u.page.evaluate(() => checkForAppUpdate(true));
    await sleep(800);
    const busy = { loads, toast: await u.page.textContent("#toast") };
    check("busy: no reload, a tappable notice instead", busy.loads === 1 && /Neue Version da/.test(busy.toast), JSON.stringify(busy));
    await u.page.click("#toast");
    await u.page.waitForLoadState("load");
    await sleep(1500);
    check("…tapping it loads the new version", loads === 2);

    // ---------- service worker: one worker for cache + push ----------
    const s = await newUser(browser, "SW", { sw: true });
    const reg = await s.page.evaluate(async () => {
      const r = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 15000))]);
      return r ? { scope: r.scope, script: (r.active && r.active.scriptURL) || "" } : null;
    });
    check("service worker registers and activates", !!reg && /service-worker\.js$/.test(reg.script), JSON.stringify(reg));
    await s.page.reload();
    await sleep(1500);
    const ctl = await s.page.evaluate(() => ({ controlled: !!navigator.serviceWorker.controller, app: typeof STATE !== "undefined" }));
    check("after reload the page runs under the worker", ctl.controlled && ctl.app, JSON.stringify(ctl));

    const errs = [u, s].flatMap((x) => x.page._logs.filter((l) => l.startsWith("[pageerror]")));
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
