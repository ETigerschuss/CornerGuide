/* ====================== FEATURE OVERRIDES ====================== */
const TEAM_ORDER = ["plant", "insect", "alien", "wolf", "bird", "octopus"];
// User-created teams are merged into TEAMS at runtime from the customTeams node.
let CUSTOM_TEAM_KEYS = [];
function allTeamKeys() { return [...TEAM_ORDER, ...CUSTOM_TEAM_KEYS]; }
const CUSTOM_TEAM_COLORS = ["#e8a93e", "#ff2e6c", "#b8ff3a", "#6cb6ff", "#ff8c42", "#c77dff", "#4ecdc4", "#f9c74f"];
let _teamCreateColor = CUSTOM_TEAM_COLORS[0];
let _teamCreateReturnCorner = null;
const TEAM_STORAGE_KEY = "cg.team";
const TEAM_HISTORY_KEY = "cg.teamHistory";
const NOTIF_STORAGE_KEY = "cg.notifications";
const USER_ID_STORAGE_KEY = "cg.userId";
const CORNER_VOTES_STORAGE_KEY = "cg.cornerVotes";
const DIRECT_MESSAGES_STORAGE_KEY = "cg.directMessages";
const FCM_TOKEN_STORAGE_KEY = "cg.fcmToken";
const NOTIF_SETTINGS_KEY = "cg.notifSettings";

function loadNotifSettings() {
  try { return JSON.parse(localStorage.getItem(NOTIF_SETTINGS_KEY) || "{}"); }
  catch (e) { return {}; }
}
function saveNotifSettings() {
  localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(STATE.notifSettings || {}));
  syncNotifSettingsToFirebase();
}
function syncNotifSettingsToFirebase() {
  if (!window.FB?.firebaseReady || !currentUserKey()) return;
  try {
    const { db, ref, set } = window.FB;
    set(ref(db, "userPrefs/" + currentUserKey() + "/notifSettings"), {
      mode: STATE.notifPref || "all",
      blockedTeams: STATE.notifSettings?.blockedTeams || [],
      blockedUsers: STATE.notifSettings?.blockedUsers || []
    });
  } catch (e) { console.warn("Failed to sync notif settings:", e); }
}
const MAX_DIRECT_MESSAGES = 120;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 20000;
// Presence entries older than this are treated as offline and hidden.
const PRESENCE_FRESH_MS = 45 * 60 * 1000;
// A checked-in person whose phone is locked (no heartbeat, connection gone)
// stays at their corner this long after their last sign of life — shown as 💤.
const CHECKIN_STICKY_MS = 3 * 60 * 60 * 1000;
// No heartbeat for this long = app in the background / screen off.
const PRESENCE_ASLEEP_MS = 90 * 1000;
// Only fire a "friend arrived at corner" alarm if the check-in happened within
// this window. Prevents stale DB entries from triggering notifications every
// time the app loads or reconnects.
const CHECKIN_ALARM_WINDOW_MS = 2 * 60 * 1000;
// Stay this long within PROXIMITY_M of a corner -> automatic check-in.
const AUTO_CHECKIN_DWELL_MS = 5 * 60 * 1000;

// Nobody stays at a corner overnight: drop a check-in once the calendar day
// rolls over, or after a hard 10h cap for very late sessions.
const CHECKIN_MAX_AGE_MS = 10 * 60 * 60 * 1000;
function autoCheckoutIfStale() {
  if (!STATE.manualCheckinId) return;
  const since = parseInt(localStorage.getItem("cg.checkedInAt") || "0") || STATE.lastCheckinTime || 0;
  if (!since) return;
  const then = new Date(since), now = new Date();
  const newDay = then.toDateString() !== now.toDateString();
  const tooOld = Date.now() - since > CHECKIN_MAX_AGE_MS;
  if (!newDay && !tooOld) return;
  const corner = getAllCorners().find((c) => c.id === STATE.manualCheckinId);
  const prev = STATE.manualCheckinId;
  STATE.manualCheckinId = null;
  STATE._autoCheckedCorner = null;
  localStorage.removeItem("cg.checkedInAt");
  localStorage.removeItem("cg.manualCheckinId");
  document.getElementById("card-" + prev)?.classList.remove("at-here");
  refreshMainMarker(prev);
  updateCheckinButtons();
  broadcastPresence();
  toast(`🌅 ${T("Automatisch ausgecheckt", "Auto checked out")}${corner ? ` ${T("am", "at")} ${escapeHtml(corner.name)}` : ""}`);
}

// Auto check-in after dwelling >= 5 min near the same corner (geo must be on).
function checkDwellAutoCheckin() {
  if (!STATE.geoActive || !STATE.userPos || !STATE.nickname) return;
  let nearest = null, nDist = Infinity;
  getAllCorners().forEach((c) => {
    const d = haversine(STATE.userPos.lat, STATE.userPos.lng, c.lat, c.lng);
    if (d < nDist) { nDist = d; nearest = c; }
  });
  const nearId = nDist <= STATE.PROXIMITY_M ? nearest.id : null;
  if (!nearId) {
    STATE._dwellCornerId = null;
    STATE._dwellSince = 0;
    STATE._autoCheckedCorner = null;
    return;
  }
  if (STATE._dwellCornerId !== nearId) {
    STATE._dwellCornerId = nearId;
    STATE._dwellSince = Date.now();
    return;
  }
  const dwelled = Date.now() - (STATE._dwellSince || Date.now());
  // _autoCheckedCorner stops a re-check-in loop if the user manually checks out
  // while still standing at the same corner.
  if (dwelled >= AUTO_CHECKIN_DWELL_MS && STATE.manualCheckinId !== nearId && STATE._autoCheckedCorner !== nearId) {
    STATE._autoCheckedCorner = nearId;
    manualCheckin(nearId);
    toast(`🤖 ${T("5 Minuten am", "5 minutes at")} <strong>${escapeHtml(nearest.name)}</strong> — ${T("automatisch eingecheckt!", "auto checked in!")}`, null, () => openDetail(nearest.id));
  }
}

/* ---- Availability: user-picked status everyone can see ---- */
const AVAILABILITY = {
  available: { color: "#b8ff3a", emoji: "🟢", label: "Verfügbar" },
  keen:      { color: "#ff8c42", emoji: "🟠", label: "Bock auf Cornern" },
  otw:       { color: "#6cb6ff", emoji: "🔵", label: "Unterwegs" },
  later:     { color: "#f9c74f", emoji: "🟡", label: "Vielleicht später" },
  busy:      { color: "#ff4d4d", emoji: "🔴", label: "Keine Zeit" }
};
STATE.availability = localStorage.getItem("cg.availability") || "available";

function setAvailability(key) {
  if (!AVAILABILITY[key]) return;
  STATE.availability = key;
  localStorage.setItem("cg.availability", key);
  broadcastPresence();
  updateAvailabilityButton();
  toast(`${AVAILABILITY[key].emoji} Status: <strong>${AVAILABILITY[key].label}</strong>`);
}

function updateAvailabilityButton() {
  const btn = $("#availability-btn");
  if (!btn) return;
  const a = AVAILABILITY[STATE.availability] || AVAILABILITY.available;
  btn.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${a.color};margin-right:5px;vertical-align:middle;"></span>${a.label}`;
}

function openAvailabilityPicker() {
  const overlay = $("#availability-overlay");
  if (!overlay) return;
  const wrap = $("#availability-options");
  wrap.innerHTML = Object.entries(AVAILABILITY).map(([key, a]) => `
    <button class="notif-opt${STATE.availability === key ? " active" : ""}" data-avail="${key}" style="display:flex;align-items:center;gap:10px;width:100%;margin-bottom:8px;text-align:left;">
      <span style="width:14px;height:14px;border-radius:50%;background:${a.color};flex:0 0 auto;"></span>
      <span>${a.emoji} ${a.label}</span>
    </button>`).join("");
  wrap.querySelectorAll("[data-avail]").forEach((b) => b.addEventListener("click", () => {
    setAvailability(b.dataset.avail);
    overlay.style.display = "none";
    renderFriendsBar();
  }));
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
  overlay.style.display = "flex";
}
const MIN_CORNER_DISTANCE_METERS = 50;
const STATUS_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_INVITE_NAME_LENGTH = 40;
const SHARE_CORNER_PARAM = "corner";
const INVITE_PARAM = "invite";
const CHECKIN_PARAM = "checkin";
const COME_PARAM = "come";   // WhatsApp "kommt vorbei": check-in + route on top
const DATE_PARAM = "cd";     // a cornerdate invitation: one tap "bin dabei"
const AUTO_CHECKIN_DELAY_MS = 400; // Allow the detail overlay animation to settle before triggering check-in
let FCM_VAPID_PUBLIC_KEY = ""; // Loaded at runtime from Firebase /config/vapidKey
let detailXpCornerId = null;

STATE.userId = getOrCreateUserId();
STATE.notifPref = localStorage.getItem(NOTIF_STORAGE_KEY) || STATE.notifPref || "all";
STATE.team = localStorage.getItem(TEAM_STORAGE_KEY) || STATE.team || "";
STATE.teamHistory = normalizeTeamHistory(STATE.teamHistory);
STATE.cornerStatuses = STATE.cornerStatuses || {};
STATE.captured = STATE.captured || {};
STATE.captureHistory = STATE.captureHistory || {};
STATE.encounters = STATE.encounters || {};
STATE.liveLocations = STATE.liveLocations || {};
STATE.liveMarkers = STATE.liveMarkers || {};
STATE.cornerVotes = STATE.cornerVotes || loadLocalCornerVotes();
STATE.directMessages = STATE.directMessages || loadLocalDirectMessages();
STATE.presenceHeartbeat = null;
STATE.presenceVisibilityHookBound = !!STATE.presenceVisibilityHookBound;
STATE.lastDirectMessageAt = parseInt(localStorage.getItem("cg.lastDirectMessageAt") || "0");
STATE.pendingShareCornerId = null;
STATE.pendingInviteName = "";
STATE.pendingAutoCheckinCornerId = null;
STATE.pendingCome = null;
STATE.pendingDateRsvp = null;
const _savedNotifSettings = loadNotifSettings();
STATE.notifSettings = {
  blockedTeams: Array.isArray(_savedNotifSettings.blockedTeams) ? _savedNotifSettings.blockedTeams : [],
  blockedUsers: Array.isArray(_savedNotifSettings.blockedUsers) ? _savedNotifSettings.blockedUsers : []
};
ensurePointIdentity();

function getOrCreateUserId() {
  let id = localStorage.getItem(USER_ID_STORAGE_KEY);
  if (!id) {
    id = "user-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(USER_ID_STORAGE_KEY, id);
  }
  return id;
}

/* Identity history.
   STATE.userId starts as a local "user-xxxx" id and is later replaced by the
   Firebase auth uid (and again when an old profile is claimed). Anything other
   people addressed to an EARLIER key — direct messages above all — became
   invisible after the flip ("die Nachrichten sind auf einmal weg"). We keep
   every key this person has used so reads can cover all of them.            */
function myKeys() {
  let keys = [];
  try { keys = JSON.parse(localStorage.getItem("cg.myKeys") || "[]"); } catch (e) { keys = []; }
  const cur = currentUserKey();
  if (cur && !keys.includes(cur)) keys.unshift(cur);
  return keys.filter(Boolean);
}
function rememberMyKey(key) {
  if (!key) return;
  let keys = [];
  try { keys = JSON.parse(localStorage.getItem("cg.myKeys") || "[]"); } catch (e) { keys = []; }
  if (keys.includes(key)) return;
  keys.push(key);
  localStorage.setItem("cg.myKeys", JSON.stringify(keys.slice(-6)));
}
function isMyKey(key) {
  if (!key) return false;
  if (myKeys().includes(key)) return true;
  // Another login of my profile (installed app, browser, other phone).
  return profileRoot(key) === myRootKey();
}
function forgetMyKey(key) {
  if (!key) return;
  let keys = [];
  try { keys = JSON.parse(localStorage.getItem("cg.myKeys") || "[]"); } catch (e) { keys = []; }
  localStorage.setItem("cg.myKeys", JSON.stringify(keys.filter((k) => k !== key)));
}

// Move anything still addressed to an old key over to the current one.
async function migrateInboxFromLegacyKeys() {
  if (!window.FB?.firebaseReady) return;
  const cur = currentUserKey();
  const legacy = myKeys().filter((k) => k !== cur);
  if (!cur || !legacy.length) return;
  const { db, ref, get, set, remove } = window.FB;
  for (const old of legacy) {
    try {
      const snap = await get(ref(db, "messages/" + old));
      const data = snap.val();
      if (!data) continue;
      for (const [id, msg] of Object.entries(data)) {
        await set(ref(db, "messages/" + cur + "/" + id), msg).catch(() => {});
      }
      await remove(ref(db, "messages/" + old)).catch(() => {});
      console.log(`Inbox von ${old} nach ${cur} übernommen (${Object.keys(data).length} Nachrichten).`);
    } catch (err) { console.warn("inbox migration failed for", old, err); }
  }
}

/* Merge one identity key into another in the DATABASE (aura, karma, achievements,
   team). Without this the XP of the same person ends up split across the local
   id and the auth uid — which is exactly what happened to six accounts. */
function mergeRewardEntry(currentEntry, incomingEntry, fallbackNickname = "") {
  const current = currentEntry || {};
  const incoming = incomingEntry || {};
  return {
    total: Number(current.total || 0) + Number(incoming.total || 0),
    history: [...(Array.isArray(current.history) ? current.history : []), ...(Array.isArray(incoming.history) ? incoming.history : [])].slice(-200),
    nickname: current.nickname || incoming.nickname || fallbackNickname || ""
  };
}

function pickClaimRewardEntry(currentEntry, incomingEntry, fallbackNickname = "") {
  const current = currentEntry || null;
  const incoming = incomingEntry || null;
  if (!current && !incoming) return null;
  if (!current) return { ...incoming, nickname: incoming.nickname || fallbackNickname || "" };
  if (!incoming) return { ...current, nickname: current.nickname || fallbackNickname || "" };
  const currentTotal = Number(current.total || 0);
  const incomingTotal = Number(incoming.total || 0);
  if (incomingTotal > currentTotal) return { ...incoming, nickname: incoming.nickname || current.nickname || fallbackNickname || "" };
  if (currentTotal > incomingTotal) return { ...current, nickname: current.nickname || incoming.nickname || fallbackNickname || "" };
  const currentHistory = Array.isArray(current.history) ? current.history.length : 0;
  const incomingHistory = Array.isArray(incoming.history) ? incoming.history.length : 0;
  const preferred = incomingHistory > currentHistory ? incoming : current;
  return { ...preferred, nickname: preferred.nickname || fallbackNickname || "" };
}

async function mergeProfileKeys(oldKey, newKey) {
  if (!oldKey || !newKey || oldKey === newKey || !window.FB?.firebaseReady) return false;
  const { db, ref, get, set, remove } = window.FB;
  try {
    const [oldP, newP, oldK, newK, oldA, oldT] = await Promise.all([
      get(ref(db, "points/" + oldKey)),
      get(ref(db, "points/" + newKey)),
      get(ref(db, "karmaPoints/" + oldKey)),
      get(ref(db, "karmaPoints/" + newKey)),
      get(ref(db, "achievements/" + oldKey)),
      get(ref(db, "teams/" + oldKey))
    ]);
    const o = oldP.val();
    const ok = oldK.val();
    if (!o && !ok) return false;
    const n = newP.val() || { total: 0, history: [] };
    const nk = newK.val() || { total: 0, history: [] };
    const mergedAura = mergeRewardEntry(n, o);
    const mergedKarma = mergeRewardEntry(nk, ok, mergedAura.nickname || "");
    await Promise.all([
      set(ref(db, "points/" + newKey), mergedAura),
      set(ref(db, "karmaPoints/" + newKey), mergedKarma)
    ]);
    const ach = oldA.val();
    if (ach) {
      const cur = (await get(ref(db, "achievements/" + newKey))).val() || {};
      await set(ref(db, "achievements/" + newKey), { ...ach, ...cur });
    }
    const team = oldT.val();
    if (team && team.team) {
      const curTeam = (await get(ref(db, "teams/" + newKey))).val();
      if (!curTeam) await set(ref(db, "teams/" + newKey), team);
    }
    await Promise.all([
      remove(ref(db, "points/" + oldKey)).catch(() => {}),
      remove(ref(db, "karmaPoints/" + oldKey)).catch(() => {}),
      remove(ref(db, "achievements/" + oldKey)).catch(() => {}),
      remove(ref(db, "teams/" + oldKey)).catch(() => {})
    ]);
    STATE.points[newKey] = mergedAura;
    STATE.karmaPoints[newKey] = mergedKarma;
    delete STATE.points[oldKey];
    delete STATE.karmaPoints[oldKey];
    savePoints();
    saveKarmaPoints();
    return mergedAura;
  } catch (err) {
    console.warn("mergeProfileKeys failed:", err);
    return false;
  }
}

function migrateUserIdentity(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  rememberMyKey(oldId);
  rememberMyKey(newId);
  if (STATE.points?.[oldId] && !STATE.points?.[newId]) {
    STATE.points[newId] = { ...STATE.points[oldId] };
    delete STATE.points[oldId];
    savePoints();
  }
  if (STATE.karmaPoints?.[oldId] && !STATE.karmaPoints?.[newId]) {
    STATE.karmaPoints[newId] = { ...STATE.karmaPoints[oldId] };
    delete STATE.karmaPoints[oldId];
    saveKarmaPoints();
  }
  // Consolidate in the database too, so XP is never split across both keys.
  mergeProfileKeys(oldId, newId);
}

function sanitizeInviteName(value) {
  return String(value || "")
    .replace(/[<>"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildShareUrl(cornerId, inviteName, autoCheckin = false, extra = {}) {
  const url = new URL(window.location.href);
  // Never pass on what this page was opened with.
  [COME_PARAM, DATE_PARAM, "date", "gossip", "join", "here", "n", "profile", "chat", "chatName", "feedback"].forEach((k) => url.searchParams.delete(k));
  url.hash = "";
  Object.entries(extra || {}).forEach(([k, v]) => { if (v) url.searchParams.set(k, String(v)); });
  if (cornerId) url.searchParams.set(SHARE_CORNER_PARAM, cornerId);
  else url.searchParams.delete(SHARE_CORNER_PARAM);
  if (inviteName) url.searchParams.set(INVITE_PARAM, inviteName);
  else url.searchParams.delete(INVITE_PARAM);
  if (autoCheckin) url.searchParams.set(CHECKIN_PARAM, "1");
  else url.searchParams.delete(CHECKIN_PARAM);
  // Referral: whoever generated this QR/link gets rewarded when it is used.
  if (autoCheckin && currentUserKey()) url.searchParams.set("ref", currentUserKey());
  else url.searchParams.delete("ref");
  // Carry my team so a scanned personal code checks the other person into the
  // same team (that is the point of sharing a corner with your crew).
  if (autoCheckin && STATE.team) url.searchParams.set("team", STATE.team);
  else url.searchParams.delete("team");
  // My personal invite: whoever opens it is in without a code (37-invites.js).
  return withMyInvite(url).toString();
}

// A neutral code for printing/stickers: no person, no team — just the corner.
function buildStickerUrl(cornerId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(SHARE_CORNER_PARAM, cornerId);
  url.searchParams.set(CHECKIN_PARAM, "1");
  return url.toString();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "absolute";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const success = document.execCommand("copy");
  document.body.removeChild(area);
  return success;
}

function scheduleAutoCheckin(cornerId) {
  setTimeout(() => manualCheckin(cornerId), AUTO_CHECKIN_DELAY_MS);
}

function applyIncomingLinks() {
  const params = new URLSearchParams(window.location.search);
  const cornerId = (params.get(SHARE_CORNER_PARAM) || "").trim();
  const inviteName = sanitizeInviteName((params.get(INVITE_PARAM) || "").trim());
  const autoCheckin = params.get(CHECKIN_PARAM) === "1";
  if (cornerId) STATE.pendingShareCornerId = cornerId;
  // Push deep links: ?corner=…&gossip=1 opens the gossip round, &date=1 the cornerdates.
  if (cornerId && params.get("gossip") === "1") STATE.pendingGossipFocus = cornerId;
  if (cornerId && params.get("date") === "1") STATE.pendingDateFocus = cornerId;
  if (inviteName) STATE.pendingInviteName = inviteName.slice(0, MAX_INVITE_NAME_LENGTH);
  // When autoCheckin=true, store the target corner for later (resolved after nickname is confirmed)
  if (autoCheckin && cornerId) STATE.pendingAutoCheckinCornerId = cornerId;
  if (cornerId && params.get(COME_PARAM) === "1") STATE.pendingCome = cornerId;
  const dateId = (params.get(DATE_PARAM) || "").trim();
  if (dateId && /^[A-Za-z0-9_-]{1,64}$/.test(dateId)) STATE.pendingDateRsvp = dateId;
  // QR referral: remember who generated the scanned code (rewarded on check-in).
  const refId = (params.get("ref") || "").trim();
  if (refId && autoCheckin) STATE.pendingReferrerId = refId;
  // A personal QR carries the sharer's team so the crew ends up together.
  const sharedTeam = (params.get("team") || "").trim();
  if (sharedTeam && autoCheckin) STATE.pendingSharedTeam = sharedTeam;
  // Push about a profile request (admins / the profile's current device).
  if (params.get("feedback") === "1") STATE.pendingFeedbackFocus = true;
  const joinId = (params.get("join") || "").trim();
  if (joinId && /^[A-Za-z0-9_-]{1,128}$/.test(joinId)) STATE.pendingJoin = { id: joinId, here: params.get("here") === "1", name: sanitizeInviteName(params.get("n") || "").slice(0, 30) };
  const profileKey = (params.get("profile") || "").trim();
  if (profileKey && /^[A-Za-z0-9_-]{1,128}$/.test(profileKey)) STATE.pendingProfileKey = profileKey;
  // Push about a compliment (own list) / about a newcomer (their profile + 💐).
  if (profileKey && ["compliments", "compliment"].includes(params.get("focus"))) STATE.pendingProfileFocus = params.get("focus");
}

function clearHandledQueryParam(name) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState({}, "", url.toString());
}

function openPendingSharedCorner() {
  if (!STATE.pendingShareCornerId) return false;
  const corner = getAllCorners().find((item) => item.id === STATE.pendingShareCornerId);
  if (!corner) return false;
  openDetail(corner.id);
  const cornerId = STATE.pendingShareCornerId;
  STATE.pendingShareCornerId = null;
  clearHandledQueryParam(SHARE_CORNER_PARAM);
  if (STATE.pendingGossipFocus === cornerId) {
    STATE.pendingGossipFocus = null;
    clearHandledQueryParam("gossip");
    focusGossip(cornerId);
  }
  if (STATE.pendingDateFocus === cornerId) {
    STATE.pendingDateFocus = null;
    clearHandledQueryParam("date");
    focusDetailSection(cornerId, ".cornerdate-section");
  }
  if (STATE.pendingAutoCheckinCornerId === cornerId) {
    clearHandledQueryParam(CHECKIN_PARAM);
    if (linkActionsReady()) {
      STATE.pendingAutoCheckinCornerId = null;
      scheduleAutoCheckin(cornerId);
    }
    // else: stays pending until you said who you are (runPendingLinkActions)
  }
  if (STATE.pendingCome === cornerId) clearHandledQueryParam(COME_PARAM);
  if (STATE.pendingDateRsvp) clearHandledQueryParam(DATE_PARAM);
  runPendingLinkActions();
  return true;
}

