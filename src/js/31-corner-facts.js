/* ====================== CORNER FACTS ======================
   Existing corners: checked once, shared with everyone.
   "Wie ist's bei den bisherigen Cornern?" — every corner gets the same
   automatic check as a new one. The first phone that checks a corner stores
   the result in cornerFacts/<id> (refreshed after 30 days), so the list can
   show 🚻 💧 ☂️ ⚽ 🏪 🌿 on every card and filter by it, without every phone
   asking OpenStreetMap again. Phones fill in missing corners slowly in the
   background (one every few seconds, a dozen per session at most). */
const CORNER_FACTS_VERSION = 1;
const CORNER_FACTS_MAX_AGE_MS = 30 * 86400000;
const CORNER_FACT_KEYS = ["toilette", "wasser", "dach", "sport", "kiosk"];
STATE.cornerFacts = {};
var _factsListening = false;
var _factsBackfill = { running: false, lastRun: 0 };

function listenCornerFacts(attempt = 0) {
  if (!window.FB?.firebaseReady || _factsListening) return;
  _factsListening = true;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "cornerFacts"), (snap) => {
    STATE.cornerFacts = snap.val() || {};
    refreshCardAmenities();
  }, () => { _factsListening = false; retryListenerAfterAuth(listenCornerFacts, attempt); });
}

function factsFromCheck(res) {
  const w = weedVerdict(res);
  const has = {}, near = {};
  CORNER_FACT_KEYS.forEach((k) => {
    if (!res.has[k]) return;
    has[k] = true;
    if (res.nearest[k] != null) near[k] = res.nearest[k];
  });
  const out = { v: CORNER_FACTS_VERSION, at: Date.now(), weed: w.v === "?" ? "unknown" : w.v, why: w.why.slice(0, 3).map((x) => String(x).slice(0, 120)), has, near };
  const zones = [res.acvv ? "acvv" : "", res.hbf ? "hbf" : "", res.pedestrian ? "fz" : ""].filter(Boolean);
  if (zones.length) out.zones = zones;
  const park = res.parks.find((p) => !p.square && p.hours);
  if (park) out.park = { name: park.name, hours: park.hours };
  return out;
}
function factsFresh(f) { return !!f && f.v === CORNER_FACTS_VERSION && Date.now() - Number(f.at || 0) < CORNER_FACTS_MAX_AGE_MS; }
function storeCornerFacts(cornerId, res) {
  if (!cornerId || !res || /[.#$\[\]\/]/.test(cornerId)) return;
  const f = factsFromCheck(res);
  STATE.cornerFacts = { ...(STATE.cornerFacts || {}), [cornerId]: f };
  refreshCardAmenities();
  if (window.FB?.firebaseReady) window.FB.set(window.FB.ref(window.FB.db, "cornerFacts/" + cornerId), f).catch(() => {});
}

// Fill in corners nobody has checked yet — slowly, one at a time.
async function backfillCornerFacts() {
  const uid = window.FB?.getAuthUid?.() || "";
  if (_factsBackfill.running || !window.FB?.firebaseReady || !uid || !_accessVerified[uid] || document.hidden) return;
  if (Date.now() - _factsBackfill.lastRun < 10 * 60000) return;
  _factsBackfill.running = true;
  _factsBackfill.lastRun = Date.now();
  try {
    const todo = getAllCorners().filter((c) => !isPrivateCorner(c) && typeof c.lat === "number" && typeof c.lng === "number" && !factsFresh(STATE.cornerFacts?.[c.id]));
    todo.sort(() => Math.random() - 0.5);   // several phones at once rarely pick the same corner
    for (const c of todo.slice(0, 12)) {
      if (document.hidden) break;
      if (factsFresh(STATE.cornerFacts?.[c.id])) continue;
      try { storeCornerFacts(c.id, await fetchSpotCheck(c.lat, c.lng)); }
      catch (err) { break; }   // OpenStreetMap busy or offline: next time
      await new Promise((r) => setTimeout(r, 4000));
    }
  } finally { _factsBackfill.running = false; }
}

// What a card shows: for spots made with the new dialog, what their maker
// chose; for older ones, the stored facts plus the curated toilet/kiosk.
function cornerAmenityKeys(c) {
  const mine = c.amenities || [];
  if (c.check) return CORNER_FACT_KEYS.filter((k) => mine.includes(k));
  const f = STATE.cornerFacts?.[c.id];
  return CORNER_FACT_KEYS.filter((k) => mine.includes(k) || !!(f && f.has && f.has[k]));
}
function cornerWeed(c) {
  if (c.check) return (c.amenities || []).includes("kiffen") ? "ok" : (c.check.weed === "night" ? "night" : "no");
  const f = STATE.cornerFacts?.[c.id];
  return f && /^(ok|night|no)$/.test(f.weed || "") ? f.weed : null;
}
function cornerEmojiRowHtml(c) {
  const items = cornerAmenityKeys(c).map((k) => {
    const a = SPOT_AMENITIES.find((x) => x.key === k);
    return `<span class="card-amen" title="${escapeHtml(T(a.de, a.en))}">${a.emoji}</span>`;
  });
  const weed = cornerWeed(c);
  if (weed === "ok") items.push(`<span class="card-amen" title="${T("Kiffen erlaubt", "Weed allowed")}">🌿</span>`);
  else if (weed === "night") items.push(`<span class="card-amen" title="${T("Kiffen nur 20–7 Uhr", "Weed only 8 pm–7 am")}">🌿<small>20–7</small></span>`);
  else if (weed === "no") items.push(`<span class="card-amen no" title="${T("Kiffen hier verboten", "No weed here")}">🚫🌿</span>`);
  return items.join("");
}
function refreshCardAmenities() {
  if ((STATE.amenFilter || []).length) { scheduleCardsRerender(); return; }   // filter result may change
  getAllCorners().forEach((c) => {
    const slot = document.querySelector(`#card-${CSS.escape(c.id)} .card-amens`);
    if (slot) slot.innerHTML = cornerEmojiRowHtml(c);
  });
}
var _cardsRerenderTimer = null;
function scheduleCardsRerender() {
  clearTimeout(_cardsRerenderTimer);
  _cardsRerenderTimer = setTimeout(() => { renderCards(); updateCounts(); }, 400);
}

// List filter: tap 🚻 / 🌿 … to see only corners that have it.
STATE.amenFilter = (() => { try { const v = JSON.parse(localStorage.getItem("cg.amenFilter") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
function cornerMatchesAmenFilter(c) {
  const want = STATE.amenFilter || [];
  if (!want.length) return true;
  const have = cornerAmenityKeys(c);
  return want.every((k) => k === "kiffen" ? /^(ok|night)$/.test(cornerWeed(c) || "") : have.includes(k));
}
function renderAmenFilter() {
  const box = $("#amen-filter");
  if (!box) return;
  const on = STATE.amenFilter || [];
  box.innerHTML = SPOT_AMENITIES.map((a) => `<button type="button" class="amen-chip ${on.includes(a.key) ? "on" : ""}" data-amen-filter="${a.key}" aria-pressed="${on.includes(a.key)}">${a.emoji} ${escapeHtml(T(a.de, a.en))}</button>`).join("");
  box.querySelectorAll("[data-amen-filter]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.amenFilter;
    STATE.amenFilter = on.includes(k) ? on.filter((x) => x !== k) : [...on, k];
    try { localStorage.setItem("cg.amenFilter", JSON.stringify(STATE.amenFilter)); } catch (e) { /* private mode */ }
    renderAmenFilter();
    renderCards();
  }));
}
document.addEventListener("DOMContentLoaded", renderAmenFilter);

