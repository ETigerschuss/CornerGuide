/* ====================== STATE ====================== */
const STATE = {
  view: "map",
  customSpots: loadCustomSpots(),
  mainMap: null,
  mainMarkers: {},
  miniMaps: {},
  userMainMarker: null,
  geoWatch: null,
  geoActive: false,
  hasCenteredOnUser: false,
  userPos: null,
  atCornerId: null,
  // Restored after a restart: iOS often kills a PWA while the screen is locked,
  // which used to silently check people out. autoCheckoutIfStale() still drops
  // it once the day rolls over or it is older than CHECKIN_MAX_AGE_MS.
  manualCheckinId: localStorage.getItem("cg.checkedInAt") ? (localStorage.getItem("cg.manualCheckinId") || null) : null,
  PROXIMITY_M: 75,
  nickname: localStorage.getItem("cg.nickname") || "",
  friends: {},
  comments: {},
  barometer: {},
  visits: {},
  emojiVotes: {},
  photos: {},
  achievements: loadAchievements(),
  points: loadPoints(),
  karmaPoints: loadKarmaPoints(),
  visitedCorners: loadVisitedCorners(),
  checkinFeedback: loadCheckinFeedback(),
  // New feature state
  team: localStorage.getItem("cg.team") || "",
  teamHistory: loadTeamHistory(),
  teams: {},
  cornerStatuses: {},
  captured: {},
  captureHistory: {},
  encounters: {},
  liveLocations: {},
  liveMarkers: {},
  lastCheckinTime: parseInt(localStorage.getItem("cg.lastCheckinTime") || "0"),
  lastCheckinCorner: localStorage.getItem("cg.lastCheckinCorner") || "",
  notifPref: loadNotifPref(),
  cooldownInterval: null,
  lang: localStorage.getItem("cg.lang") || "de"
};

/* ====================== LANGUAGE ====================== */
/**
 * T(de, en) — returns the German or English string depending on STATE.lang.
 * Use for every user-visible string that should be translatable.
 */
function T(de, en) { return STATE.lang === "en" ? en : de; }

function setLang(lang) {
  STATE.lang = lang;
  localStorage.setItem("cg.lang", lang);
  // Re-render everything that uses T()
  document.querySelectorAll(".tab[data-view]").forEach((t) => {
    const labels = { list: T("Liste", "List"), map: T("Karte", "Map"), leaderboard: "🏆 " + T("Ranking", "Ranking"), profile: "👤 " + T("Profil", "Profile") };
    if (labels[t.dataset.view]) t.textContent = labels[t.dataset.view];
  });
  const bar = document.getElementById("friends-bar-title");
  if (bar) bar.textContent = T("🍻 Freunde unterwegs", "🍻 Friends out there");
  if (STATE.view === "profile") renderProfile();
  if (STATE.view === "leaderboard") renderLeaderboard();
  renderCards();
  if (typeof renderCornerDatesStrip === "function") renderCornerDatesStrip();
  if (typeof renderWeatherBanner === "function") renderWeatherBanner();
}


function getAllCorners() {
  return [...CORNERS_OG, ...STATE.customSpots, ...Object.values(STATE.privateCorners || {})];
}

function getDescription(c) {
  if (c.isCustom) return c.description || "";
  const override = localStorage.getItem("cg.desc." + c.id);
  return override !== null ? override : (c.description || "");
}

function loadCustomSpots() {
  try {
    const raw = localStorage.getItem("cg.custom-spots");
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveCustomSpots() {
  localStorage.setItem("cg.custom-spots", JSON.stringify(STATE.customSpots));
}

function loadAchievements() {
  try { return JSON.parse(localStorage.getItem("cg.achievements") || "[]"); }
  catch (e) { return []; }
}
function saveAchievements() {
  localStorage.setItem("cg.achievements", JSON.stringify(STATE.achievements));
  if (typeof scheduleProfileSync === "function") scheduleProfileSync();
}

function loadPoints() {
  try { return JSON.parse(localStorage.getItem("cg.points") || "{}"); }
  catch (e) { return {}; }
}
function savePoints() {
  localStorage.setItem("cg.points", JSON.stringify(STATE.points));
  if (typeof scheduleProfileSync === "function") scheduleProfileSync();
}
function loadKarmaPoints() {
  try { return JSON.parse(localStorage.getItem("cg.karmaPoints") || "{}"); }
  catch (e) { return {}; }
}
function saveKarmaPoints() {
  localStorage.setItem("cg.karmaPoints", JSON.stringify(STATE.karmaPoints));
  if (typeof scheduleProfileSync === "function") scheduleProfileSync();
}

function loadVisitedCorners() {
  try { return JSON.parse(localStorage.getItem("cg.visitedCorners") || "[]"); }
  catch (e) { return []; }
}
function saveVisitedCorners() {
  localStorage.setItem("cg.visitedCorners", JSON.stringify(STATE.visitedCorners));
  if (typeof scheduleProfileSync === "function") scheduleProfileSync();
}

function loadCheckinFeedback() {
  try { return JSON.parse(localStorage.getItem("cg.checkinFeedback") || "{}"); }
  catch (e) { return {}; }
}
function saveCheckinFeedback() {
  localStorage.setItem("cg.checkinFeedback", JSON.stringify(STATE.checkinFeedback));
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

