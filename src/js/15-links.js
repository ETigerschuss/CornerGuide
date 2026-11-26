/* ====================== LINKS THAT GO STRAIGHT THERE ======================
   "Die Links sollen dich gleich zu den Seiten auf der App bringen (direkter
   Corner-Check-in, Cornerdate-Zusage)." A WhatsApp corner link opens the
   corner with check-in and route on top — and checks you in at once when
   you are already there. A cornerdate link opens the invitation with one
   "bin dabei" button. On a new phone or browser the link waits until you
   said who you are, then carries on by itself.                          */
function linkActionsReady() {
  return !!STATE.nickname && (!window.FB?.firebaseReady || localStorage.getItem("cg.accessGranted") === "1");
}
function runPendingLinkActions() {
  if (!linkActionsReady()) return;
  if (STATE.pendingAutoCheckinCornerId) {
    const id = STATE.pendingAutoCheckinCornerId;
    STATE.pendingAutoCheckinCornerId = null;
    if (getAllCorners().some((c) => c.id === id)) {
      if (!($("#detail-overlay")?.classList.contains("open") && STATE.detailCornerId === id)) openDetail(id);
      scheduleAutoCheckin(id);
    }
  }
  if (STATE.pendingCome) {
    const id = STATE.pendingCome;
    STATE.pendingCome = null;
    if (getAllCorners().some((c) => c.id === id)) showComeBar(id);
  }
  if (STATE.pendingDateRsvp) {
    const dateId = STATE.pendingDateRsvp;
    STATE.pendingDateRsvp = null;
    openDateInvite(dateId);
  }
}

// Where am I right now? The running GPS fix, else one quick fix (≤ 6 s).
function currentPositionOnce(maxAgeMs = 120000) {
  if (STATE.userPos && STATE.geoActive) return Promise.resolve(STATE.userPos);
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => finish(null), 6500);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
        () => finish(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: maxAgeMs }
      );
    } catch (e) { finish(null); }
  });
}

const COME_AUTO_CHECKIN_M = 150;
async function showComeBar(cornerId) {
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner) return;
  if (!($("#detail-overlay")?.classList.contains("open") && STATE.detailCornerId === cornerId)) openDetail(cornerId);
  const content = $("#detail-content");
  if (!content) return;
  content.querySelector(".come-bar")?.remove();
  const here = freshFriends().filter((f) => f.atCorner === cornerId).map((f) => f.nickname || f.name).filter(Boolean);
  const checkedIn = STATE.manualCheckinId === cornerId;
  const bar = document.createElement("div");
  bar.className = "come-bar";
  bar.innerHTML = `<div class="come-title">🍻 ${here.length ? `${T("Schon da", "Already there")}: <strong>${here.map(escapeHtml).join(", ")}</strong>` : T("Komm vorbei!", "Come over!")}</div>
    <div class="come-actions">
      <button class="action-btn primary" data-come-checkin ${checkedIn ? "disabled" : ""}>${checkedIn ? "✓ " + T("Eingecheckt", "Checked in") : "📍 " + T("Ich bin da — einchecken", "I'm here — check in")}</button>
      <a class="action-btn" data-come-route href="${escapeHtml(walkingRouteUrl(corner.lat, corner.lng))}" target="_blank" rel="noopener">🧭 ${T("Route", "Route")}</a>
    </div>
    <div class="come-hint" data-come-hint></div>`;
  content.prepend(bar);
  const btn = bar.querySelector("[data-come-checkin]");
  btn.addEventListener("click", () => {
    if (STATE.manualCheckinId !== cornerId) manualCheckin(cornerId);
    btn.disabled = true;
    btn.textContent = "✓ " + T("Eingecheckt", "Checked in");
  });
  if (checkedIn) return;
  // Already there? Then check in right away (the toast offers undo).
  const pos = await currentPositionOnce();
  const hint = bar.querySelector("[data-come-hint]");
  if (!pos || !bar.isConnected) return;
  const d = haversine(pos.lat, pos.lng, corner.lat, corner.lng);
  if (d <= COME_AUTO_CHECKIN_M && STATE.manualCheckinId !== cornerId) {
    manualCheckin(cornerId);
    btn.disabled = true;
    btn.textContent = "✓ " + T("Eingecheckt", "Checked in");
  } else if (hint) {
    hint.textContent = `📏 ${T("Noch", "Still")} ${formatDistance(d)} — ${T("etwa", "about")} ${Math.max(1, Math.round(d / 80))} ${T("Min. zu Fuß", "min walk")}`;
  }
}

// Cornerdate invitation: one tap "bin dabei". Waits briefly for the dates to load.
async function openDateInvite(dateId, attempt = 0) {
  const raw = allCornerDates()[dateId];
  if (!raw) {
    if (attempt < 20) setTimeout(() => openDateInvite(dateId, attempt + 1), 750);
    else toast(T("Dieses Cornerdate gibt es nicht mehr.", "This cornerdate no longer exists."));
    return;
  }
  const d = { ...raw, id: dateId };
  if (Number(d.end) < Date.now()) { toast(T("Dieses Cornerdate ist schon vorbei.", "This cornerdate is already over.")); return; }
  const corner = getAllCorners().find((c) => c.id === d.cornerId);
  if (corner) focusDetailSection(d.cornerId, ".cornerdate-section");
  const going = cornerDateGoing(d);
  const iGo = Object.keys(d.going || {}).some((id) => isMyKey(id));
  const mine = isMyKey(d.byId);
  const where = corner ? corner.name : (d.cornerName || "Corner");
  const text = `${formatDateRange(d.start, d.end)} ${T("am", "at")} ${where}${d.note ? ` — „${d.note}“` : ""}
${T("von", "by")} ${mine ? T("dir", "you") : (d.byName || "?")} · ${going.length} ${T("dabei", "going")}${going.length ? ": " + going.map((g) => g.name).join(", ") : ""}`;
  if (mine || iGo) {
    toast(`📅 <strong>${escapeHtml(where)}</strong>, ${escapeHtml(formatDateRange(d.start, d.end))} — ${mine ? T("dein Cornerdate", "your cornerdate") : T("du bist dabei ✓", "you're in ✓")}`);
    return;
  }
  const ok = await showDialog({
    title: `${d.secret ? "🤫" : "📅"} ${d.secret ? T("Geheimes Cornerdate", "Secret cornerdate") : T("Cornerdate", "Cornerdate")}`,
    text,
    okLabel: `✋ ${T("Bin dabei", "I'm in")} (+${d.secret ? PRIVATE_POINTS(CORNERDATE_JOIN_AURA) : CORNERDATE_JOIN_AURA} Aura)`,
    cancelLabel: T("Später", "Later")
  });
  if (ok === true) await toggleCornerDateGoing(dateId);
}

async function shareCornerLink(cornerId) {
  const corner = getAllCorners().find((item) => item.id === cornerId);
  if (!corner) return;
  const url = buildShareUrl(corner.id, STATE.nickname || "");
  const text = `Komm zum Corner: ${corner.name} 🍻`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Minga Corner Guide", text, url });
      toast("🔗 Corner-Link geteilt");
      return;
    }
    await copyText(url);
    toast("🔗 Corner-Link kopiert");
  } catch (err) {
    toast("Link konnte nicht geteilt werden.");
  }
}

async function inviteFriends() {
  if (!STATE.nickname) {
    toast("Bitte gib zuerst einen Namen ein.");
    return;
  }
  // Checked in somewhere? Then the invite leads to me ("Folge mir").
  const atCorner = !!myPresenceCorner() && !!window.FB?.firebaseReady;
  const url = atCorner ? buildJoinUrl(false) : buildShareUrl("", STATE.nickname);
  try {
    if (navigator.share) {
      await navigator.share({ title: "Minga Corner Guide", text: atCorner ? followMeText() : `${STATE.nickname} lädt dich zum Cornern ein 🍻`, url });
      toast("📨 Einladung geteilt");
      addXp(5, "Freunde eingeladen");
      unlockAchievement("recruiter", "Anwerber", "📨", 15);
      return;
    }
    await copyText(url);
    toast("📨 Einladungs-Link kopiert");
    addXp(5, "Freunde eingeladen");
    unlockAchievement("recruiter", "Anwerber", "📨", 15);
  } catch (err) {
    toast("Einladung konnte nicht geteilt werden.");
  }
}

async function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    // One worker for caching AND push (it loads firebase-messaging-sw.js).
    return await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
  } catch (err) {
    console.warn("Service worker registration failed:", err);
    return null;
  }
}

/* "Dann versuch nochmal zu deployen": the new version was online, but an
   installed app (iPhone home screen above all) is only resumed, not
   reloaded, so it kept running the old code. On coming back to the app the
   build number is compared with the server; a new one is loaded right away
   when nothing is open, otherwise a tap on the notice does it.            */
const APP_BUILD = document.querySelector('meta[name="cg-build"]')?.content || "dev";
var _appHiddenAt = 0;
var _appUpdate = { checking: false, lastCheck: 0, newBuild: "" };
function appLooksIdle() {
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return false;
  // Overlays are position:fixed (offsetParent is always null there): ask the layout.
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  return !Array.from(document.querySelectorAll(".open, [style*='display: flex'], [style*='display:flex']"))
    .some((el) => el.id !== "nickname-bar" && !el.classList.contains("toast") && shown(el));
}
async function checkForAppUpdate(force = false) {
  if (APP_BUILD === "dev" || _appUpdate.checking || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  if (!force && Date.now() - _appUpdate.lastCheck < 60000) return;
  _appUpdate.checking = true;
  _appUpdate.lastCheck = Date.now();
  try {
    const res = await fetch("./index.html?build-check=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const m = (await res.text()).match(/<meta name="cg-build" content="([^"]+)"/);
    const latest = m && m[1];
    if (!latest || latest === "dev" || latest === APP_BUILD) return;
    _appUpdate.newBuild = latest;
    // Never loop: one automatic reload per new version and session.
    let tried = "";
    try { tried = sessionStorage.getItem("cg.reloadedFor") || ""; } catch (e) { /* private mode */ }
    if (tried !== latest && appLooksIdle()) { reloadForUpdate(latest); return; }
    toast(`🔄 <strong>${T("Neue Version da", "New version available")}</strong><br><span style="font-size:11px;opacity:0.8;">${T("Tippen zum Laden", "Tap to load it")}</span>`, "", () => reloadForUpdate(latest));
  } catch (err) { /* offline: try again later */ }
  finally { _appUpdate.checking = false; }
}
function reloadForUpdate(build) {
  try { sessionStorage.setItem("cg.reloadedFor", build); sessionStorage.setItem("cg.justUpdated", "1"); } catch (e) { /* private mode */ }
  window.location.reload();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { _appHiddenAt = Date.now(); return; }
  // Back in the app after a while (or a new version is already known).
  if (_appUpdate.newBuild || Date.now() - _appHiddenAt > 60000) checkForAppUpdate(true);
});
setInterval(() => { if (!document.hidden) checkForAppUpdate(); }, 30 * 60 * 1000);
document.addEventListener("DOMContentLoaded", () => {
  let updated = false;
  try { updated = sessionStorage.getItem("cg.justUpdated") === "1"; sessionStorage.removeItem("cg.justUpdated"); } catch (e) { /* private mode */ }
  if (updated) setTimeout(() => toast(`✨ ${T("App aktualisiert", "App updated")}`), 1200);
  setTimeout(() => checkForAppUpdate(true), 8000);
});

async function enableFirebasePush() {
  if (!window.FB?.firebaseReady) {
    toast("Push nur mit Firebase verfügbar.");
    return;
  }
  if (!FCM_VAPID_PUBLIC_KEY) {
    toast("🔔 Push-Schlüssel wird noch geladen — bitte kurz warten und erneut versuchen.");
    return;
  }
  if (!window.FB?.enablePushNotifications) {
    toast("Push wird in diesem Browser nicht unterstützt.");
    return;
  }
  try {
    // The app's worker also carries the push part (firebase-messaging-sw.js).
    let fmswReg = await setupServiceWorker();
    if (!fmswReg) fmswReg = await navigator.serviceWorker.getRegistration("./");
    if (!fmswReg) {
      toast("Service Worker nicht bereit.");
      return;
    }
    const token = await window.FB.enablePushNotifications(FCM_VAPID_PUBLIC_KEY, fmswReg);
    localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
    if (window.FB?.db && window.FB?.ref && window.FB?.set && currentUserKey()) {
      await window.FB.set(window.FB.ref(window.FB.db, "pushTokens/" + currentUserKey()), {
        token,
        nickname: STATE.nickname || "Anonym",
        updatedAt: Date.now()
      });
    }
    toast("🔔 Push aktiviert");
    addXp(10, "Push aktiviert");
    unlockAchievement("always-on", "Immer erreichbar", "🔔", 15);
  } catch (err) {
    const message = err?.message || "Push konnte nicht aktiviert werden.";
    toast(`🔔 ${escapeHtml(message)}`);
  }
}

function normalizeTeamHistory(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([team, count]) => ({ team, count, changedAt: Date.now() - ((count || 0) * 1000) }));
  }
  return [];
}

function loadLocalCornerVotes() {
  try { return JSON.parse(localStorage.getItem(CORNER_VOTES_STORAGE_KEY) || "{}"); }
  catch (e) { return {}; }
}

function saveLocalCornerVotes() {
  localStorage.setItem(CORNER_VOTES_STORAGE_KEY, JSON.stringify(STATE.cornerVotes || {}));
}

function loadLocalDirectMessages() {
  try { return JSON.parse(localStorage.getItem(DIRECT_MESSAGES_STORAGE_KEY) || "[]"); }
  catch (e) { return []; }
}

function saveLocalDirectMessages() {
  localStorage.setItem(DIRECT_MESSAGES_STORAGE_KEY, JSON.stringify((STATE.directMessages || []).slice(-MAX_DIRECT_MESSAGES)));
}

function saveTeamHistoryValue() {
  localStorage.setItem(TEAM_HISTORY_KEY, JSON.stringify(STATE.teamHistory));
}

function ensureTeamHistoryEntry(teamId) {
  if (!teamId) return;
  const last = STATE.teamHistory[0];
  if (last?.team === teamId) return;
  STATE.teamHistory.unshift({ team: teamId, changedAt: Date.now() });
  STATE.teamHistory = STATE.teamHistory.slice(0, 20);
  saveTeamHistoryValue();
}
ensureTeamHistoryEntry(STATE.team);

function ensurePointIdentity(persist = true) {
  ensureRewardIdentity("aura", persist);
  ensureRewardIdentity("karma", persist);
}

function rewardStore(kind) {
  return kind === "karma" ? STATE.karmaPoints : STATE.points;
}

function saveRewardStore(kind) {
  if (kind === "karma") saveKarmaPoints();
  else savePoints();
}

function ensureRewardIdentity(kind, persist = true) {
  const store = rewardStore(kind);
  if (!store || typeof store !== "object") {
    if (kind === "karma") STATE.karmaPoints = {};
    else STATE.points = {};
  }
  const nextStore = rewardStore(kind);
  if (STATE.nickname && nextStore[STATE.nickname] && !nextStore[STATE.userId]) {
    nextStore[STATE.userId] = { ...nextStore[STATE.nickname] };
    delete nextStore[STATE.nickname];
  }
  if (!nextStore[STATE.userId]) nextStore[STATE.userId] = { total: 0, history: [] };
  nextStore[STATE.userId].nickname = STATE.nickname || nextStore[STATE.userId].nickname || "Anonym";
  if (persist) saveRewardStore(kind);
}

