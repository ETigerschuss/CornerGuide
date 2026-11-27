/* ====================== SLIM DATA (Phase 1) ======================
   The app used to download whole database nodes at every start — the photos
   alone were 8.6 MB, because Storage was never activated and every picture
   sat inline in the database. Now it reads small copies that Cloud Functions
   keep up to date (functions/lite.js) and loads details only where they show:
     pointsLite / karmaLite     totals and names, no history (my own logins in full)
     visitStats                 check-ins per corner (cards, ranking, karma)
     visits/<corner>            the last check-ins — only in the corner's detail
     visitsByUser / -ByName     one person's check-ins (profile map, public profile)
     photoCovers                one small cover picture per corner (cards)
     photos/<corner>            metadata + thumbnails — only in the detail
     photoData/<corner>/<id>    the full picture — only when it is opened
   Until a slim copy exists (right after an update, before the one-time
   backfill) the app falls back to the old full node, so nothing goes missing. */

var _slim = {
  reward: {
    aura: { lite: null, own: {}, ownSubs: {}, legacy: null, onData: null },
    karma: { lite: null, own: {}, ownSubs: {}, legacy: null, onData: null }
  },
  fullCache: {},                 // "kind|key" → full entry (copy check for multi-login profiles)
  fullPending: {},
  visits: { legacy: null, corners: {}, order: [], mine: {}, mineSubs: {}, person: {} },
  photos: { legacy: null, corners: {}, order: [], full: {}, wanted: false, retry: null },
  rerenderTimer: null
};
const SLIM_DETAIL_CORNERS = 4;   // per-corner subscriptions kept open (recently opened details)
const SLIM_CORNER_VISITS = 30;   // last check-ins shown in a corner's trail
const PHOTO_THUMB_MAX = 360;     // same as functions/lite.js
const PHOTO_THUMB_QUALITY = 0.6;

// One-time reads are one-shot listeners: racing get() against a listener on
// the same path left the SDK with an orphaned server listen, after which any
// new listener there failed ("listen() called twice for same path/queryId").
// As a safeguard, reads in flight are registered and a subscription to such a
// path waits a moment.
var _slimInflight = {};
function slimReadStart(path) { _slimInflight[path] = (_slimInflight[path] || 0) + 1; }
function slimReadEnd(path) { if (!(--_slimInflight[path] > 0)) delete _slimInflight[path]; }
// One-time read as a one-shot listener (see readOnce), with a time limit.
function slimGet(path, ms = 15000) {
  slimReadStart(path);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); slimReadEnd(path); fn(v); };
    const timer = setTimeout(() => finish(reject, new Error("read timeout: " + path)), ms);
    try {
      window.FB.onValue(window.FB.ref(window.FB.db, path), (snap) => finish(resolve, snap), (err) => finish(reject, err), { onlyOnce: true });
    } catch (err) { finish(reject, err); }
  });
}

// onValue may answer synchronously from the cache; the placeholder keeps a
// re-entrant call from subscribing twice.
function slimSubscribe(registry, id, target, onData, path) {
  if (registry[id]) return;
  if (path && _slimInflight[path]) { setTimeout(() => slimSubscribe(registry, id, target, onData, path), 250); return; }
  const placeholder = () => {};
  registry[id] = placeholder;
  const unsub = window.FB.onValue(target, onData, () => { if (registry[id]) delete registry[id]; });
  if (registry[id] === placeholder) registry[id] = unsub;
  else unsub();   // dropped while subscribing
}
// Subscribing inside a database callback can collide with a listener the SDK
// is still setting up for the same path (a transaction raises its events
// synchronously): "listen() called twice". So changes run on the next tick.
var _slimDeferred = {};
function deferSlim(name, fn) {
  if (_slimDeferred[name]) return;
  _slimDeferred[name] = setTimeout(() => { delete _slimDeferred[name]; fn(); }, 0);
}
function slimUnsubscribe(registry, id) {
  try { registry[id] && registry[id](); } catch (e) { /* already gone */ }
  delete registry[id];
}

function scheduleSlimRerender() {
  if (_slim.rerenderTimer) return;
  _slim.rerenderTimer = setTimeout(() => {
    _slim.rerenderTimer = null;
    try { updateNicknameBar(); renderFriendsBar(); } catch (e) { /* not ready yet */ }
    if (STATE.view === "leaderboard") renderLeaderboard();
    if (STATE.view === "profile") renderProfile();
  }, 60);
}

/* ---------------- Points (Aura) and Karma ---------------- */
function rewardPaths(kind) {
  return kind === "karma" ? { full: "karmaPoints", lite: "karmaLite" } : { full: "points", lite: "pointsLite" };
}

// Everyone from the slim copy; the old full node only while no copy exists.
function listenRewardStore(kind, onData, retry) {
  const { db, ref, onValue } = window.FB;
  const st = _slim.reward[kind];
  const paths = rewardPaths(kind);
  st.onData = onData;
  const startLegacy = () => {
    if (!st.legacy) st.legacy = onValue(ref(db, paths.full), (s) => { st.lite = s.val() || {}; applyRewardStore(kind); }, () => { st.legacy = null; });
  };
  onValue(ref(db, paths.lite), (snap) => {
    if (snap.exists()) {
      if (st.legacy) { st.legacy(); st.legacy = null; }
      st.lite = snap.val() || {};
      applyRewardStore(kind);
    } else startLegacy();
  }, () => {
    // Refused (not signed in yet, or the rules for the copy are not deployed
    // yet right after an update): the full node meanwhile, then try again.
    startLegacy();
    if (retry) retry();
  });
}

// My own logins stay complete (history included): merging profiles, the copy
// check and "last active" work exactly as before.
function applyRewardStore(kind) {
  const st = _slim.reward[kind];
  const merged = { ...(st.lite || {}) };
  Object.entries(st.own).forEach(([k, e]) => { if (e) merged[k] = e; else if (st.ownSubs[k]) delete merged[k]; });
  if (kind === "karma") STATE.karmaPoints = merged; else STATE.points = merged;
  deferSlim("ownRewards", watchOwnRewardEntries);
  if (st.onData) st.onData();
}

function watchOwnRewardEntries() {
  if (!window.FB?.firebaseReady || !STATE.points) return;
  const keys = new Set(myIdentityKeys().filter((k) => k && !/[.#$[\]/]/.test(k)));
  ["aura", "karma"].forEach((kind) => {
    const st = _slim.reward[kind];
    const path = rewardPaths(kind).full;
    keys.forEach((k) => slimSubscribe(st.ownSubs, k, window.FB.ref(window.FB.db, `${path}/${k}`), (snap) => {
      st.own[k] = snap.val();
      applyRewardStore(kind);
    }, `${path}/${k}`));
    Object.keys(st.ownSubs).forEach((k) => {
      if (keys.has(k)) return;
      slimUnsubscribe(st.ownSubs, k);
      delete st.own[k];
    });
  });
}

// Someone else's profile with several logins: the copy check compares their
// histories, which the slim copy leaves out — fetch those entries once.
function fullRewardEntry(kind, key) {
  return _slim.fullCache[kind + "|" + key] || null;
}
function requestFullRewardEntries(kind, keys) {
  if (!window.FB?.firebaseReady) return;
  const path = rewardPaths(kind).full;
  const mine = new Set(myIdentityKeys());
  keys.forEach((k) => {
    const id = kind + "|" + k;
    if (id in _slim.fullCache || _slim.fullPending[id] || !k || /[.#$[\]/]/.test(k) || mine.has(k)) return;
    _slim.fullPending[id] = true;
    slimGet(`${path}/${k}`)
      .then((snap) => { _slim.fullCache[id] = snap.val() || null; scheduleSlimRerender(); })
      .catch(() => {})
      .finally(() => { delete _slim.fullPending[id]; });
  });
}

// "Wer bist du?" and linking read the list of profiles once.
async function readRewardIndex(ms) {
  let data = null;
  try { data = await readOnce("pointsLite", ms); } catch (e) { /* fall back below */ }
  if (!data) data = await readOnce("points", ms);
  return data || {};
}
function mergeRewardIndex(data) {
  const own = {};
  Object.entries(_slim.reward.aura.own).forEach(([k, e]) => { if (e) own[k] = e; });
  STATE.points = { ...(STATE.points || {}), ...(data || {}), ...own };
}

/* ---------------- Check-ins ---------------- */
function visitNameKey(name) {   // same as nameKey() in functions/lite.js
  return String(name || "").trim().slice(0, 60).replace(/[.#$[\]/\u0000-\u001f\u007f]/g, "_") || "_";
}
function isLegacyVisits() { return !!_slim.visits.legacy; }

function statsFromVisits(all) {
  const out = {};
  Object.entries(all || {}).forEach(([c, list]) => {
    const vs = Object.values(list || {}).filter(Boolean);
    if (vs.length) out[c] = { n: vs.length, last: vs.reduce((m, v) => Math.max(m, Number(v.time) || 0), 0) };
  });
  return out;
}

function listenVisitStats(retry) {
  const { db, ref, onValue } = window.FB;
  const sv = _slim.visits;
  const startLegacy = () => {
    if (sv.legacy) return;
    sv.legacy = onValue(ref(db, "visits"), (s) => {
      STATE.visits = s.val() || {};
      STATE.visitStats = statsFromVisits(STATE.visits);
      onVisitDataChanged();
    }, () => { sv.legacy = null; });
  };
  onValue(ref(db, "visitStats"), (snap) => {
    if (snap.exists()) {
      if (sv.legacy) { sv.legacy(); sv.legacy = null; }
      // From now on STATE.visits holds only the corners whose detail is open.
      Object.keys(STATE.visits || {}).forEach((c) => { if (!sv.corners[c]) delete STATE.visits[c]; });
      STATE.visitStats = snap.val() || {};
      deferSlim("myVisits", watchMyVisits);
    } else startLegacy();
    onVisitDataChanged();
  }, () => { startLegacy(); if (retry) retry(); });
}

function onVisitDataChanged() {
  refreshAllVisitTrails();
  if (typeof updateCounts === "function") updateCounts();
  scheduleSlimRerender();
  if (typeof renderCards === "function" && STATE.view === "list") renderCards();
}

// The last check-ins of a corner, while its detail is (or was recently) open.
function ensureCornerVisits(cornerId) {
  const sv = _slim.visits;
  if (!window.FB?.firebaseReady || isLegacyVisits() || !cornerId || sv.corners[cornerId]) {
    if (sv.corners[cornerId]) sv.order = [...sv.order.filter((c) => c !== cornerId), cornerId];
    return;
  }
  const { db, ref, query, limitToLast } = window.FB;
  sv.order.push(cornerId);
  slimSubscribe(sv.corners, cornerId, query(ref(db, "visits/" + cornerId), limitToLast(SLIM_CORNER_VISITS)), (snap) => {
    if (!STATE.visits || typeof STATE.visits !== "object") STATE.visits = {};
    STATE.visits[cornerId] = snap.val() || {};
    refreshAllVisitTrails();
  });
  while (sv.order.length > SLIM_DETAIL_CORNERS) {
    const old = sv.order.shift();
    slimUnsubscribe(sv.corners, old);
    if (STATE.visits) delete STATE.visits[old];
  }
}

// My check-ins: every login of my profile, plus very old ones under my name.
function watchMyVisits() {
  const sv = _slim.visits;
  if (!window.FB?.firebaseReady || isLegacyVisits() || !STATE.visitStats) return;
  const paths = new Set(myIdentityKeys().filter((k) => k && !/[.#$[\]/]/.test(k)).map((k) => "visitsByUser/" + k));
  if (STATE.nickname) paths.add("visitsByName/" + visitNameKey(STATE.nickname));
  paths.forEach((p) => slimSubscribe(sv.mineSubs, p, window.FB.ref(window.FB.db, p), (snap) => {
    sv.mine[p] = { ...(snap.val() || {}), ...pendingMyVisits(p, snap.val() || {}) };
    scheduleSlimRerender();
  }, p));
  Object.keys(sv.mineSubs).forEach((p) => {
    if (paths.has(p)) return;
    slimUnsubscribe(sv.mineSubs, p);
    delete sv.mine[p];
  });
}

// A check-in I just made shows up before the Cloud Function has indexed it
// (and stays until the index has it, so a snapshot in between can't hide it).
var _pendingMyVisits = {};   // visitId → { path, entry, at }
function noteMyVisit(cornerId, visitId, visit) {
  if (!visitId) return;
  const p = "visitsByUser/" + currentUserKey();
  const entry = { c: cornerId, t: Number(visit.time) || Date.now(), ...(visit.team ? { tm: visit.team } : {}) };
  _pendingMyVisits[visitId] = { path: p, entry, at: Date.now() };
  _slim.visits.mine[p] = { ...(_slim.visits.mine[p] || {}), [visitId]: entry };
}
function pendingMyVisits(path, indexed) {
  const out = {};
  Object.entries(_pendingMyVisits).forEach(([vid, x]) => {
    if (indexed[vid] || Date.now() - x.at > 10 * 60000) { delete _pendingMyVisits[vid]; return; }
    if (x.path === path) out[vid] = x.entry;
  });
  return out;
}
function forgetMyVisit(visitId) {
  delete _pendingMyVisits[visitId];
  Object.values(_slim.visits.mine).forEach((m) => { if (m && m[visitId]) delete m[visitId]; });
}

// [{ cornerId, time, team, visitId }] — from the index, or the full node in legacy mode.
function myVisitEntries() {
  if (!window.FB?.firebaseReady || isLegacyVisits()) {
    const me = currentUserKey();
    const out = [];
    Object.entries(STATE.visits || {}).forEach(([cornerId, list]) => Object.entries(list || {}).forEach(([vid, v]) => {
      if (!v) return;
      const mine = v.userId ? (v.userId === me || isMyKey(v.userId)) : v.user === STATE.nickname;
      if (mine) out.push({ cornerId, time: Number(v.time || 0), team: v.team || "", visitId: vid });
    }));
    return out;
  }
  const seen = new Set();
  const out = [];
  Object.values(_slim.visits.mine).forEach((m) => Object.entries(m || {}).forEach(([vid, e]) => {
    if (!e || seen.has(vid)) return;
    seen.add(vid);
    out.push({ cornerId: e.c, time: Number(e.t || 0), team: e.tm || "", visitId: vid });
  }));
  return out;
}

// Someone else's check-ins: loaded when their profile opens (null = loading).
function personVisitEntries(key, nickname) {
  if (!window.FB?.firebaseReady || isLegacyVisits()) {
    const out = [];
    Object.entries(STATE.visits || {}).forEach(([cornerId, list]) => Object.values(list || {}).forEach((v) => {
      if (!v) return;
      if (!(v.userId ? v.userId === key : (nickname && v.user === nickname))) return;
      out.push({ cornerId, time: Number(v.time || 0), team: v.team || "" });
    }));
    return out;
  }
  const cached = _slim.visits.person[key + "|" + (nickname || "")];
  return cached && cached.data ? cached.data : null;
}

// Loads them; the profile calls this when it opens (and draws once more after).
async function loadPersonVisits(key, nickname) {
  if (!window.FB?.firebaseReady || isLegacyVisits()) return;
  const paths = [];
  if (key && !/[.#$[\]/]/.test(key)) paths.push("visitsByUser/" + key);
  if (nickname) paths.push("visitsByName/" + visitNameKey(nickname));
  const lists = await Promise.all(paths.map((p) => loadVisitIndex(p)));
  const out = [];
  const seen = new Set();
  lists.forEach((m) => Object.entries(m || {}).forEach(([vid, e]) => {
    if (!e || seen.has(vid)) return;
    seen.add(vid);
    out.push({ cornerId: e.c, time: Number(e.t || 0), team: e.tm || "" });
  }));
  _slim.visits.person[key + "|" + (nickname || "")] = { data: out, at: Date.now() };
}

// Each time a profile opens, its check-ins are read fresh.
function forgetPersonVisits(key) {
  Object.keys(_slim.visits.person).forEach((id) => { if (id.split("|")[0] === key) delete _slim.visits.person[id]; });
}

async function loadVisitIndex(path) {
  try { return (await slimGet(path)).val() || {}; }
  catch (e) { return {}; }
}

// Corners someone has visited (identity merges): from the index, or the full node.
async function visitedCornersOf(key, nickname) {
  if (!window.FB?.firebaseReady || isLegacyVisits()) {
    const out = new Set();
    Object.entries(STATE.visits || {}).forEach(([cornerId, list]) => {
      if (Object.values(list || {}).some((v) => v && (key && v.userId === key || nickname && !v.userId && v.user === nickname))) out.add(cornerId);
    });
    return [...out];
  }
  const lists = await Promise.all([
    key ? loadVisitIndex("visitsByUser/" + key) : {},
    nickname ? loadVisitIndex("visitsByName/" + visitNameKey(nickname)) : {}
  ]);
  return [...new Set(lists.flatMap((m) => Object.values(m || {}).map((e) => e && e.c).filter(Boolean)))];
}

// The check-ins of a login, with their corner: { visitId: cornerId }.
async function visitIdsOfKey(key) {
  if (!window.FB?.firebaseReady || isLegacyVisits()) {
    const out = {};
    Object.entries(STATE.visits || {}).forEach(([cornerId, list]) => Object.entries(list || {}).forEach(([vid, v]) => { if (v && v.userId === key) out[vid] = cornerId; }));
    return out;
  }
  const m = await loadVisitIndex("visitsByUser/" + key);
  const out = {};
  Object.entries(m).forEach(([vid, e]) => { if (e && e.c) out[vid] = e.c; });
  return out;
}

/* ---------------- Photos ---------------- */
function isLegacyPhotos() { return !!_slim.photos.legacy; }

// Same order as functions/lite.js: best rating, most ratings, newest.
function coversFromPhotos(all) {
  const out = {};
  Object.entries(all || {}).forEach(([cornerId, list]) => {
    const entries = Object.entries(list || {}).filter(([, p]) => p && (p.thumb || p.src));
    if (!entries.length) return;
    const ranked = entries.map(([id, p]) => {
      const r = Object.values(p.ratings || {}).map(Number).filter((x) => x > 0);
      return { id, p, avg: r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0, votes: r.length };
    }).sort((a, b) => b.avg - a.avg || b.votes - a.votes || Number(b.p.time || 0) - Number(a.p.time || 0));
    const { id, p } = ranked[0];
    out[cornerId] = { id, n: entries.length, t: Number(p.time || 0), ...(p.thumb ? { thumb: p.thumb } : {}), ...(p.src ? { src: p.src } : {}) };
  });
  return out;
}

function listenPhotoCovers(retry) {
  const { db, ref, onValue } = window.FB;
  const sp = _slim.photos;
  const changed = () => {
    renderCards();
    refreshAllPhotoGalleries();
    if (_photoCommentsOpen) renderPhotoComments();
  };
  const startLegacy = () => {
    if (sp.legacy) return;
    sp.legacy = onValue(ref(db, "photos"), (s) => {
      STATE.photos = s.val() || {};
      STATE.photoCovers = coversFromPhotos(STATE.photos);
      changed();
    }, () => { sp.legacy = null; });
  };
  onValue(ref(db, "photoCovers"), (snap) => {
    if (snap.exists()) {
      if (sp.legacy) { sp.legacy(); sp.legacy = null; }
      Object.keys(STATE.photos || {}).forEach((c) => { if (!sp.corners[c]) delete STATE.photos[c]; });
      STATE.photoCovers = snap.val() || {};
      changed();
    } else startLegacy();
  }, () => { startLegacy(); if (retry) retry(); });
}

// First time the list or a corner is opened: start loading the covers.
function wantPhotoCovers() {
  const sp = _slim.photos;
  if (sp.wanted) return;
  sp.wanted = true;
  if (window.FB?.firebaseReady) listenPhotoCovers(sp.retry);
}

// The cover for a card: the small thumbnail (already loaded with the covers);
// the full picture only where it is shown big (detail, lightbox).
function coverSrcOf(cornerId) {
  const c = STATE.photoCovers?.[cornerId];
  return c ? (c.thumb || c.src || "") : "";
}

// Metadata + thumbnails of a corner's photos, while its detail is open.
function ensureCornerPhotos(cornerId) {
  const sp = _slim.photos;
  if (!window.FB?.firebaseReady || isLegacyPhotos() || !cornerId || sp.corners[cornerId]) {
    if (sp.corners[cornerId]) sp.order = [...sp.order.filter((c) => c !== cornerId), cornerId];
    return;
  }
  const { db, ref } = window.FB;
  sp.order.push(cornerId);
  slimSubscribe(sp.corners, cornerId, ref(db, "photos/" + cornerId), (snap) => {
    if (!STATE.photos || typeof STATE.photos !== "object") STATE.photos = {};
    STATE.photos[cornerId] = snap.val() || {};
    updateDetailHero(cornerId);
    refreshAllPhotoGalleries();
    if (_photoCommentsOpen && _photoCommentsOpen.cornerId === cornerId) renderPhotoComments();
  });
  while (sp.order.length > SLIM_DETAIL_CORNERS) {
    const old = sp.order.shift();
    slimUnsubscribe(sp.corners, old);
    if (STATE.photos) delete STATE.photos[old];
  }
}

// The full picture: in the metadata (Storage URL, old inline photo) or in photoData.
async function photoFullSrc(cornerId, photoId) {
  const p = STATE.photos?.[cornerId]?.[photoId];
  if (p && p.src) return p.src;
  const cover = STATE.photoCovers?.[cornerId];
  if (cover && cover.id === photoId && cover.src) return cover.src;
  const id = cornerId + "/" + photoId;
  if (_slim.photos.full[id]) return _slim.photos.full[id];
  if (!window.FB?.firebaseReady) return (p && p.thumb) || "";
  try {
    const src = (await slimGet(`photoData/${cornerId}/${photoId}/src`)).val() || "";
    if (src) {
      _slim.photos.full[id] = src;
      const keys = Object.keys(_slim.photos.full);
      if (keys.length > 12) delete _slim.photos.full[keys[0]];   // a few full pictures in memory are enough
    }
    return src || (p && p.thumb) || "";
  } catch (e) {
    return (p && p.thumb) || "";
  }
}

// Small JPEG for cards and the gallery (same size as the Cloud Function makes).
function makeThumbDataUrl(dataUrl, maxSide = PHOTO_THUMB_MAX, quality = PHOTO_THUMB_QUALITY) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
          canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) { resolve(""); }
      };
      img.onerror = () => resolve("");
      img.src = dataUrl;
    } catch (e) { resolve(""); }
  });
}

// Opening a corner: its photos, its last check-ins and the full cover picture.
function ensureCornerDetailData(cornerId) {
  wantPhotoCovers();
  deferSlim("cornerPhotos:" + cornerId, () => ensureCornerPhotos(cornerId));
  deferSlim("cornerVisits:" + cornerId, () => ensureCornerVisits(cornerId));
  delete _heroShown[cornerId];
  // Once the detail is drawn (with the thumbnail): the full cover picture.
  setTimeout(() => {
    const cover = STATE.photoCovers?.[cornerId];
    if (cover && cover.id) showFullHero(cornerId, cover);
    updateDetailHero(cornerId);   // photos already here (reopened corner, or full node)
  }, 0);
}
// A Storage URL is the full picture already; otherwise it is in photoData.
function showFullHero(cornerId, cover) {
  if (cover.src) setDetailHero(cornerId, cover.src);
  else photoFullSrc(cornerId, cover.id).then((src) => setDetailHero(cornerId, src));
}

// The big picture at the top of an open corner: from its own photos once
// they are loaded (the covers may not be there yet), thumbnail first.
var _heroShown = {};
function updateDetailHero(cornerId) {
  if (STATE.detailCornerId !== cornerId || !$("#detail-overlay")?.classList.contains("open")) return;
  const cover = coversFromPhotos({ [cornerId]: STATE.photos?.[cornerId] || {} })[cornerId];
  if (!cover || _heroShown[cornerId] === cover.id) return;
  _heroShown[cornerId] = cover.id;
  if (cover.thumb) setDetailHero(cornerId, cover.thumb, true);
  showFullHero(cornerId, cover);
}
function setDetailHero(cornerId, src, onlyIfEmpty) {
  const hero = $("#detail-overlay .detail-hero-photo");
  if (!src || !hero || STATE.detailCornerId !== cornerId) return;
  let img = hero.querySelector("img");
  if (img && onlyIfEmpty) return;
  if (!img) {
    img = document.createElement("img");
    img.alt = getAllCorners().find((c) => c.id === cornerId)?.name || "";
    hero.innerHTML = "";
    hero.appendChild(img);
  }
  img.src = src;
}
