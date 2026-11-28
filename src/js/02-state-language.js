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
  lang: (() => { try { const l = localStorage.getItem("cg.lang"); return ["de", "en", "es"].includes(l) ? l : "de"; } catch (e) { return "de"; } })()
};

/* ====================== LANGUAGE ====================== */
/**
 * T(de, en, es) — the text in the app's language. Use for every user-visible
 * string. Spanish: the third argument, else the dictionary (00-i18n-es.js,
 * keyed by the German text), else English.
 */
const APP_LANGS = {
  de: { flag: "🇩🇪", name: "Deutsch", locale: "de-DE" },
  en: { flag: "🇬🇧", name: "English", locale: "en-GB" },
  es: { flag: "🇪🇸", name: "Español", locale: "es-ES" }
};
function T(de, en, es) {
  if (STATE.lang === "es") {
    if (es !== undefined) return es;
    if (Object.prototype.hasOwnProperty.call(I18N_ES, de)) return I18N_ES[de];
    if (window._i18nMiss) window._i18nMiss.add(de);   // tests list what is still missing
    return en;
  }
  return STATE.lang === "en" ? en : de;
}
// German-only texts that were stored or are names (achievements, levels):
// Spanish when the dictionary knows them, otherwise as they are.
function TX(de) {
  return STATE.lang === "es" && Object.prototype.hasOwnProperty.call(I18N_ES, de) ? I18N_ES[de] : de;
}
function appLocale() { return (APP_LANGS[STATE.lang] || APP_LANGS.de).locale; }
// Team names and labels from 01-data.js, defined before the language is known.
[TEAMS, CORNER_STATUSES, AMENITY_ICONS].forEach((table) => Object.values(table).forEach((e) => {
  if (e.name) e.name = TX(e.name);
  if (e.label) e.label = TX(e.label);
}));

// A new language reloads the app: every text — also the ones set up once at
// the start — comes in the new language. The view you were on stays open.
function setLang(lang) {
  if (!APP_LANGS[lang] || lang === STATE.lang) return;
  try {
    localStorage.setItem("cg.lang", lang);
    sessionStorage.setItem("cg.reopenView", STATE.view || "map");
  } catch (e) { /* private mode: switch for this page only */ }
  STATE.lang = lang;
  window.location.reload();
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

