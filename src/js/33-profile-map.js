/* ====================== PROFILE CORNER MAP ======================
   The map lives in a DOM node kept OUTSIDE the re-rendered profile markup and
   re-attached after every render. Rebuilding it each time (as before) threw
   away the Leaflet instance and reset the view, which looked like the map
   "zooming back out" whenever data arrived.                                */
const NEUTRAL_TEAM_COLOR = "#c9bfa8";
var _profileMapWrap = null;   // persistent wrapper (map + controls)
var _pmapLayers = [];         // markers/lines currently drawn
var _pmapTimer = null;        // animation interval
var _pmapIndex = null;        // visits shown (null = all)

// My visits, chronologically, enriched with the corner's coordinates. One
// entry per corner and day (repeated check-ins the same day count once), and
// old check-ins without a team get the team I had back then.
function myVisitLog() {
  const me = currentUserKey();
  const byId = {};
  getAllCorners().forEach((c) => { byId[c.id] = c; });
  const raw = [];
  Object.entries(STATE.visits || {}).forEach(([cornerId, entries]) => {
    const corner = byId[cornerId];
    if (!corner || typeof corner.lat !== "number" || typeof corner.lng !== "number") return;
    Object.values(entries || {}).forEach((v) => {
      if (!v) return;
      const mine = v.userId ? (v.userId === me || isMyKey(v.userId)) : v.user === STATE.nickname;
      if (!mine) return;
      raw.push({ cornerId, name: corner.name, area: corner.area || "", lat: corner.lat, lng: corner.lng, team: v.team || teamAtTime(Number(v.time || 0)), time: Number(v.time || 0) });
    });
  });
  raw.sort((a, b) => a.time - b.time);
  const seen = new Set();
  return raw.filter((v) => {
    const k = v.cornerId + "|" + new Date(v.time).toDateString();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Which team did I have at a given moment? (teamHistory: newest first)
function teamAtTime(ms) {
  const hist = Array.isArray(STATE.teamHistory) ? STATE.teamHistory.filter((h) => h && h.team) : [];
  if (!hist.length) return "";
  const hit = hist.find((h) => Number(h.changedAt || 0) <= ms);
  return (hit || hist[hist.length - 1]).team;
}

function myVisitCount(cornerId) {
  return myVisitLog().filter((v) => v.cornerId === cornerId).length;
}

function pieIconHtml(slices, size, extraClass = "") {
  // conic-gradient pie; kept semi-transparent so the map stays readable
  let acc = 0;
  const stops = slices.map((sl) => {
    const from = acc * 360, to = (acc + sl.frac) * 360;
    acc += sl.frac;
    return `${sl.color} ${from.toFixed(2)}deg ${to.toFixed(2)}deg`;
  }).join(", ");
  const bg = slices.length ? `conic-gradient(${stops})` : NEUTRAL_TEAM_COLOR;
  return `<div class="cg-pie ${extraClass}" style="width:${size}px;height:${size}px;background:${bg};"></div>`;
}

// Aggregate visits into per-corner totals and team slices.
function aggregateVisits(log) {
  const byCorner = {};
  log.forEach((v) => {
    const e = byCorner[v.cornerId] || (byCorner[v.cornerId] = { cornerId: v.cornerId, name: v.name, lat: v.lat, lng: v.lng, count: 0, teams: {}, last: 0 });
    e.count++;
    const key = v.team || "__none";
    e.teams[key] = (e.teams[key] || 0) + 1;
    if (v.time > e.last) e.last = v.time;
  });
  return byCorner;
}

function teamColor(teamKey) {
  return !teamKey || teamKey === "__none" ? NEUTRAL_TEAM_COLOR : (getTeamInfo(teamKey)?.color || NEUTRAL_TEAM_COLOR);
}

function clearProfileMapLayers() {
  const map = STATE.profileMap;
  _pmapLayers.forEach((l) => { try { map.removeLayer(l); } catch (e) {} });
  _pmapLayers = [];
}

/* Draw the map for the first `upto` visits (undefined = all). `focus` (a
   visit) gets a pulsing ring in its team colour and pops in.              */
function drawProfileMap(upto, focus = null) {
  const map = STATE.profileMap;
  if (!map) return;
  const full = myVisitLog();
  const log = typeof upto === "number" ? full.slice(0, upto) : full;
  clearProfileMapLayers();

  // faint markers for corners never visited — the "still to explore" layer
  const visitedIds = new Set(log.map((v) => v.cornerId));
  getAllCorners().forEach((c) => {
    if (typeof c.lat !== "number" || typeof c.lng !== "number") return;
    if (visitedIds.has(c.id)) return;
    const m = L.circleMarker([c.lat, c.lng], { radius: 4, color: "#666", fillColor: "#666", fillOpacity: 0.3, weight: 1, interactive: true })
      .bindPopup(`<strong>${escapeHtml(c.name)}</strong><br>${T("Noch nie da — auf geht's! 🍻", "Never been — let's go! 🍻")}`);
    m.addTo(map); _pmapLayers.push(m);
  });

  // thin trail connecting consecutive visits; the newest leg in team colour
  if (log.length > 1) {
    const line = L.polyline(log.map((v) => [v.lat, v.lng]), { color: "#e8a93e", weight: 1.5, opacity: 0.45, dashArray: "4 4", interactive: false });
    line.addTo(map); _pmapLayers.push(line);
    if (focus) {
      const a = log[log.length - 2], b = log[log.length - 1];
      const leg = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: teamColor(b.team), weight: 3, opacity: 0.9, interactive: false, className: "pmap-leg" });
      leg.addTo(map); _pmapLayers.push(leg);
    }
  }

  // one pie per visited corner: size = number of visits, slices = teams
  const agg = aggregateVisits(log);
  Object.values(agg).forEach((e) => {
    const size = Math.min(64, 18 + (e.count - 1) * 7);   // grows only
    const slices = Object.entries(e.teams).map(([teamKey, n]) => ({
      color: teamColor(teamKey),
      frac: n / e.count,
      label: teamKey === "__none" ? T("ohne Team", "no team") : (getTeamInfo(teamKey)?.name || teamKey),
      n
    }));
    const isFocus = focus && focus.cornerId === e.cornerId;
    const ring = isFocus ? `<div class="pmap-ring" style="border-color:${teamColor(focus.team)};"></div>` : "";
    const icon = L.divIcon({ className: "cg-pie-wrap", html: ring + pieIconHtml(slices, size, isFocus ? "pop" : ""), iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    const breakdown = slices.sort((a, b) => b.n - a.n)
      .map((sl) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sl.color};margin-right:4px;"></span>${escapeHtml(sl.label)}: ${sl.n}x`)
      .join("<br>");
    const m = L.marker([e.lat, e.lng], { icon, riseOnHover: true, zIndexOffset: isFocus ? 1000 : 500 })
      .bindPopup(`<strong>${escapeHtml(e.name)}</strong><br>${e.count}x ${T("eingecheckt", "checked in")}<br><small>${breakdown}</small><br><small>${T("zuletzt", "last")}: ${e.last ? new Date(e.last).toLocaleDateString("de-DE") : "—"}</small>`);
    m.addTo(map); _pmapLayers.push(m);
  });

  // scrub label
  const dateEl = document.getElementById("pmap-date");
  if (dateEl) {
    const shown = log.length, total = full.length;
    const last = log[log.length - 1];
    dateEl.textContent = total === 0 ? T("noch keine Check-ins", "no check-ins yet")
      : `${shown}/${total} Check-ins${last ? " · " + new Date(last.time).toLocaleDateString("de-DE") : ""}`;
  }
  const scrub = document.getElementById("pmap-scrub");
  if (scrub) { scrub.max = String(Math.max(1, full.length)); if (typeof upto !== "number") scrub.value = String(full.length); }
}

/* ---- History playback: a little flight through my cornering life ----
   Munich corners are visited up close; a trip out of town zooms out until
   both places are visible, flies there, and zooms out again on the way back.
   Finally everything is shown at once.                                     */
const MUNICH_RADIUS_M = 20000;   // around MUNICH_CENTER (Marienplatz)
const PMAP_CORNER_ZOOM = 15;
var _pmapTour = null;     // { id } of the running playback
var _pmapSpeed = 1;

function isInMunich(v) { return haversine(v.lat, v.lng, MUNICH_CENTER[0], MUNICH_CENTER[1]) <= MUNICH_RADIUS_M; }
function pmapSleep(ms) { return new Promise((r) => setTimeout(r, Math.max(0, ms / _pmapSpeed))); }
function reducedMotion() { return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; }

// Leaflet camera moves as promises (resolve on moveend, with a safety timeout).
function pmapMove(fn, seconds) {
  const map = STATE.profileMap;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; map.off("moveend", finish); resolve(); };
    map.on("moveend", finish);
    setTimeout(finish, (seconds * 1000) / _pmapSpeed + 600);
    try { fn(); } catch (e) { finish(); }
  });
}
function pmapFlyTo(latlng, zoom, seconds) {
  const map = STATE.profileMap;
  if (reducedMotion()) { map.setView(latlng, zoom, { animate: false }); return Promise.resolve(); }
  return pmapMove(() => map.flyTo(latlng, zoom, { duration: seconds / _pmapSpeed }), seconds);
}
function pmapFlyToBounds(points, seconds, maxZoom = PMAP_CORNER_ZOOM) {
  const map = STATE.profileMap;
  const b = L.latLngBounds(points);
  if (reducedMotion()) { map.fitBounds(b, { padding: [36, 36], maxZoom, animate: false }); return Promise.resolve(); }
  return pmapMove(() => map.flyToBounds(b, { padding: [36, 36], maxZoom, duration: seconds / _pmapSpeed }), seconds);
}

function setPmapCaption(html) {
  const el = document.getElementById("pmap-caption");
  if (!el) return;
  el.innerHTML = html || "";
  el.classList.toggle("on", !!html);
}

function stopProfileMapAnimation() {
  _pmapTour = null;
  setPmapCaption("");
  const btn = document.getElementById("pmap-play");
  if (btn) btn.textContent = "▶︎ " + T("Historie abspielen", "Play history");
}

async function playProfileMapHistory() {
  const map = STATE.profileMap;
  const log = myVisitLog();
  if (!log.length) { toast(T("Noch keine Check-ins zum Abspielen.", "No check-ins to play yet.")); return; }
  if (_pmapTour) { stopProfileMapAnimation(); _pmapIndex = null; drawProfileMap(); return; }
  if (!map) return;
  const tour = _pmapTour = { id: Date.now() };
  const alive = () => _pmapTour === tour && document.body.contains(document.getElementById("profile-map"));
  const btn = document.getElementById("pmap-play");
  if (btn) btn.textContent = "⏹ " + T("Stopp", "Stop");
  // Long histories run faster, so a tour stays around a minute.
  const pace = Math.max(0.3, Math.min(1, 40 / log.length));
  const all = log.map((v) => [v.lat, v.lng]);
  _pmapIndex = 0;
  drawProfileMap(0);
  setPmapCaption(`🗺️ ${T(`${log.length} Check-ins — los geht's!`, `${log.length} check-ins — here we go!`)}`);
  await pmapFlyToBounds(all, 1.0);
  await pmapSleep(700);
  let prev = null;
  for (let i = 0; i < log.length; i++) {
    if (!alive()) return;
    const v = log[i];
    const here = isInMunich(v);
    if (prev && prev.cornerId !== v.cornerId) {
      const dist = haversine(prev.lat, prev.lng, v.lat, v.lng);
      if (dist > 30000 || here !== isInMunich(prev)) {
        // Trip out of town (or back home): zoom out until both are visible, then in.
        setPmapCaption(here ? `🏠 ${T("Zurück nach München", "Back to Munich")}` : `✈️ ${T("Ausflug", "Trip")}${v.area ? ` · ${escapeHtml(v.area)}` : ""}`);
        await pmapFlyToBounds([[prev.lat, prev.lng], [v.lat, v.lng]], 1.4, 12);
        if (!alive()) return;
        await pmapSleep(500);
        await pmapFlyTo([v.lat, v.lng], here ? PMAP_CORNER_ZOOM : 13, 1.6);
      } else if (dist > 700 || map.getZoom() < PMAP_CORNER_ZOOM - 1) {
        await pmapFlyTo([v.lat, v.lng], PMAP_CORNER_ZOOM, 0.6 + 0.6 * pace);
      } else {
        await pmapMove(() => map.panTo([v.lat, v.lng], { duration: 0.4 / _pmapSpeed }), 0.4);
      }
    } else if (!prev) {
      await pmapFlyTo([v.lat, v.lng], here ? PMAP_CORNER_ZOOM : 13, 1.2);
    }
    if (!alive()) return;
    _pmapIndex = i + 1;
    drawProfileMap(i + 1, v);
    const scrub = document.getElementById("pmap-scrub");
    if (scrub) scrub.value = String(i + 1);
    const team = getTeamInfo(v.team);
    const date = new Date(v.time).toLocaleDateString(STATE.lang === "en" ? "en-GB" : "de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
    setPmapCaption(`<span class="pmap-dot" style="background:${teamColor(v.team)};"></span><strong>${escapeHtml(v.name)}</strong> · ${date}${team ? ` · ${team.emoji} ${escapeHtml(team.name)}` : ""}${here ? "" : " · ✈️"}`);
    await pmapSleep(500 + 900 * pace);
    prev = v;
  }
  if (!alive()) return;
  // Finale: zoom back out to the whole picture.
  const corners = new Set(log.map((v) => v.cornerId)).size;
  setPmapCaption(`🎉 <strong>${log.length}</strong> Check-ins · <strong>${corners}</strong> Corners`);
  drawProfileMap();
  await pmapFlyToBounds(all, 1.6);
  await pmapSleep(2500);
  if (_pmapTour === tour) { stopProfileMapAnimation(); _pmapIndex = null; }
}

function cyclePmapSpeed() {
  _pmapSpeed = _pmapSpeed >= 4 ? 1 : _pmapSpeed * 2;
  const b = document.getElementById("pmap-speed");
  if (b) b.textContent = `⏩ ${_pmapSpeed}x`;
}

// Build the persistent wrapper once, then re-attach it after each profile render.
function mountProfileMap() {
  const slot = document.getElementById("profile-map-slot");
  if (!slot || typeof L === "undefined") return;
  if (!_profileMapWrap) {
    _profileMapWrap = document.createElement("div");
    _profileMapWrap.innerHTML = `
      <div class="pmap-frame">
        <div id="profile-map" style="height:300px;border-radius:12px;overflow:hidden;background:var(--bg-3);"></div>
        <div id="pmap-caption" class="pmap-caption"></div>
      </div>
      <div class="pmap-controls">
        <button class="action-btn" id="pmap-play">▶︎ ${T("Historie abspielen", "Play history")}</button>
        <button class="action-btn" id="pmap-speed" title="${T("Tempo", "Speed")}">⏩ 1x</button>
        <input type="range" id="pmap-scrub" min="0" max="1" value="1" aria-label="${T("Zeitpunkt", "Point in time")}" />
        <span id="pmap-date"></span>
      </div>`;
  }
  if (_profileMapWrap.parentElement !== slot) slot.appendChild(_profileMapWrap);
  if (!STATE.profileMap) {
    const el = _profileMapWrap.querySelector("#profile-map");
    const map = L.map(el, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, crossOrigin: true }).addTo(map);
    STATE.profileMap = map;
    const log = myVisitLog();
    if (log.length) map.fitBounds(log.map((v) => [v.lat, v.lng]), { padding: [30, 30], maxZoom: 15 });
    else map.setView([48.135, 11.555], 12);
    _profileMapWrap.querySelector("#pmap-play").addEventListener("click", playProfileMapHistory);
    _profileMapWrap.querySelector("#pmap-speed").addEventListener("click", cyclePmapSpeed);
    _profileMapWrap.querySelector("#pmap-scrub").addEventListener("input", (e) => {
      stopProfileMapAnimation();
      const v = parseInt(e.target.value, 10) || 0;
      const full = myVisitLog();
      _pmapIndex = v >= full.length ? null : v;
      const focus = v > 0 ? full[v - 1] : null;
      drawProfileMap(_pmapIndex === null ? undefined : v, focus);
      if (focus) STATE.profileMap.panTo([focus.lat, focus.lng], { animate: true });
    });
  }
  // While a playback runs it owns the map; re-renders must not reset it.
  if (!_pmapTour) drawProfileMap(_pmapIndex === null ? undefined : _pmapIndex);
  setTimeout(() => { try { STATE.profileMap.invalidateSize(); } catch (e) {} }, 60);
}

