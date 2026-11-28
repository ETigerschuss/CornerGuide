/* ====================== MAIN MAP ====================== */
/* ====================== STADTBEZIRKE ======================
   Munich's 25 city districts with their official numbers ("02 Ludwigsvorstadt-
   Isarvorstadt"): outlines on the map, the district of every corner, a list
   filter. Outlines from OpenStreetMap (data/stadtbezirke.json, ~50 KB, built
   by the "Stadtbezirke-Daten" workflow), loaded once.                      */
// The service worker serves same-origin files cache-first: bump ?v= whenever
// data/stadtbezirke.json is regenerated, so phones fetch the new outlines.
const DISTRICTS_URL = "data/stadtbezirke.json?v=2026-11-20";
var _districts = null;          // [{ nr, name, label, polys, bbox, feature }]
var _districtsPromise = null;
var _districtCache = {};
function loadDistricts() {
  if (_districtsPromise) return _districtsPromise;
  _districtsPromise = fetch(DISTRICTS_URL)
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((gj) => {
      _districts = (gj.features || []).map((f) => {
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
        let minX = 180, minY = 90, maxX = -180, maxY = -90;
        polys.forEach((rings) => rings[0].forEach(([x, y]) => {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }));
        return { nr: String(f.properties.nr), name: String(f.properties.name), label: f.properties.label, polys, bbox: [minX, minY, maxX, maxY], feature: f };
      });
      _districtCache = {};
      onDistrictsLoaded();
      return _districts;
    })
    .catch((err) => { console.warn("Stadtbezirke nicht verfügbar:", err); _districtsPromise = null; return null; });
  return _districtsPromise;
}

function pointInRings(x, y, rings) {
  let inside = false;
  rings.forEach((r) => {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  });
  return inside;
}
function districtAt(lat, lng) {
  if (!_districts || typeof lat !== "number" || typeof lng !== "number") return null;
  for (const d of _districts) {
    if (lng < d.bbox[0] || lng > d.bbox[2] || lat < d.bbox[1] || lat > d.bbox[3]) continue;
    if (d.polys.some((rings) => pointInRings(lng, lat, rings))) return d;
  }
  return null;
}
function cornerDistrict(c) {
  if (!c || typeof c.lat !== "number" || !_districts) return null;
  const k = `${c.id}|${c.lat}|${c.lng}`;
  if (!(k in _districtCache)) _districtCache[k] = districtAt(c.lat, c.lng);
  return _districtCache[k];
}
function districtBadgeHtml(c) {
  const d = cornerDistrict(c);
  return d ? `<span class="district-badge" title="${T("Stadtbezirk", "District")} ${escapeHtml(d.nr)} · ${escapeHtml(d.name)}">${escapeHtml(d.nr)}</span>` : "";
}
function detailDistrictHtml(c) {
  const d = cornerDistrict(c);
  if (d) return `🏙️ ${T("Stadtbezirk", "District")} <strong>${escapeHtml(d.nr)}</strong> · ${escapeHtml(d.name)} <button class="people-chip" data-district-map="${escapeHtml(d.nr)}">🗺️ ${T("Grenzen zeigen", "Show outline")}</button>`;
  if (_districts && typeof c.lat === "number") return `🏞️ ${T("Außerhalb der Münchner Stadtbezirke", "Outside Munich's city districts")}`;
  return "";
}
function districtCornerCounts() {
  const counts = { out: 0 };
  getAllCorners().forEach((c) => {
    const d = cornerDistrict(c);
    if (d) counts[d.nr] = (counts[d.nr] || 0) + 1; else counts.out++;
  });
  return counts;
}

/* ---- main map layer: outlines, numbers (names from zoom 13), popups ---- */
var _districtLayer = null;
function districtsVisible() { return localStorage.getItem("cg.districtsOn") !== "0"; }
function updateDistrictToggle() {
  const b = $("#district-toggle");
  if (!b) return;
  b.classList.toggle("on", districtsVisible());
  b.textContent = districtsVisible() ? T("🏙️ Bezirke an", "🏙️ Districts on") : T("🏙️ Bezirke aus", "🏙️ Districts off");
}
function drawDistrictLayer() {
  const map = STATE.mainMap;
  updateDistrictToggle();
  if (!map || typeof L === "undefined") return;
  if (_districtLayer) { map.removeLayer(_districtLayer); _districtLayer = null; }
  if (!_districts || !districtsVisible()) return;
  const counts = districtCornerCounts();
  const group = L.layerGroup();
  _districts.forEach((d) => {
    const shape = L.geoJSON(d.feature, { style: { color: "#e8a93e", weight: 1.6, opacity: 0.8, dashArray: "6 5", fillColor: "#e8a93e", fillOpacity: 0.035 } });
    shape.on("click", (e) => {
      const box = document.createElement("div");
      const n = counts[d.nr] || 0;
      box.innerHTML = `<strong>${escapeHtml(d.nr)} · ${escapeHtml(d.name)}</strong><br>${n} ${n === 1 ? "Corner" : "Corners"}${n ? `<br><button class="action-btn" style="margin-top:6px;padding:5px 10px;font-size:11px;">📋 ${T("In der Liste zeigen", "Show in list")}</button>` : ""}`;
      box.querySelector("button")?.addEventListener("click", () => { map.closePopup(); setDistrictFilter(d.nr); $(`.tab[data-view="list"]`)?.click(); });
      L.popup().setLatLng(e.latlng).setContent(box).openOn(map);
    });
    group.addLayer(shape);
    if (Array.isArray(d.label)) {
      group.addLayer(L.marker(d.label, {
        icon: L.divIcon({ className: "district-label-wrap", html: `<div class="district-label"><b>${escapeHtml(d.nr)}</b><span>${escapeHtml(d.name)}</span></div>`, iconSize: [0, 0] }),
        interactive: false, keyboard: false, zIndexOffset: -1000
      }));
    }
  });
  group.addTo(map);
  _districtLayer = group;
  syncDistrictLabelZoom(map);
}
function syncDistrictLabelZoom(map) {
  if (map) map.getContainer().classList.toggle("district-names", map.getZoom() >= 13);
}
function highlightDistrict(nr) {
  const d = (_districts || []).find((x) => x.nr === nr);
  if (!d) return;
  if (!districtsVisible()) { localStorage.setItem("cg.districtsOn", "1"); }
  $(`.tab[data-view="map"]`)?.click();
  setTimeout(() => {
    const map = STATE.mainMap;
    if (!map) return;
    drawDistrictLayer();
    map.fitBounds([[d.bbox[1], d.bbox[0]], [d.bbox[3], d.bbox[2]]], { padding: [24, 24] });
    const hl = L.geoJSON(d.feature, { style: { color: "#ff2e6c", weight: 3, opacity: 1, fillColor: "#ff2e6c", fillOpacity: 0.08 }, interactive: false }).addTo(map);
    setTimeout(() => { try { map.removeLayer(hl); } catch (e) {} }, 6000);
  }, 260);
}

/* ---- list filter ---- */
function setDistrictFilter(value) {
  STATE.districtFilter = value || "";
  const sel = $("#district-filter");
  if (sel) sel.value = STATE.districtFilter;
  renderCards();
}
function refreshDistrictFilter() {
  const sel = $("#district-filter");
  if (!sel) return;
  if (!_districts) { sel.hidden = true; return; }
  const counts = districtCornerCounts();
  const opts = _districts.filter((d) => counts[d.nr]).map((d) => `<option value="${escapeHtml(d.nr)}">${escapeHtml(d.nr)} ${escapeHtml(d.name)} (${counts[d.nr]})</option>`);
  if (counts.out) opts.push(`<option value="out">🏞️ ${T("Außerhalb Münchens", "Outside Munich")} (${counts.out})</option>`);
  sel.innerHTML = `<option value="">🏙️ ${T("Alle Stadtbezirke", "All districts")}</option>${opts.join("")}`;
  sel.value = STATE.districtFilter || "";
  if (sel.value !== (STATE.districtFilter || "")) STATE.districtFilter = "";
  sel.hidden = false;
}
function cornerMatchesDistrictFilter(c) {
  const f = STATE.districtFilter || "";
  if (!f || !_districts) return true;
  const d = cornerDistrict(c);
  return f === "out" ? !d : !!d && d.nr === f;
}

function onDistrictsLoaded() {
  refreshDistrictFilter();
  renderCards();
  drawDistrictLayer();
  if ($("#detail-overlay")?.classList.contains("open") && STATE.detailCornerId) {
    const c = getAllCorners().find((x) => x.id === STATE.detailCornerId);
    const box = document.querySelector("#detail-content .detail-district");
    if (c && box) { box.innerHTML = detailDistrictHtml(c); bindDetailDistrict(box); }
  }
  if (_pinMap) drawPinDistricts();
}
function bindDetailDistrict(box) {
  box?.querySelectorAll("[data-district-map]").forEach((b) => b.addEventListener("click", () => { closeDetail(); highlightDistrict(b.dataset.districtMap); }));
}

/* ====================== PIN PICKER (new spot) ======================
   "Um einen neuen Spot hinzuzufügen sollte man auch eine Pin-setzen-auf-der-
   Karte-Funktion haben": tap the map or drag the pin; the coordinates, the
   district and (if empty) the Stadtteil field fill themselves.            */
var _pinMap = null;
var _pinMarker = null;
var _pinDistrictLayer = null;
function pinIcon() {
  return L.divIcon({ className: "", html: `<div class="spot-pin">📍</div>`, iconSize: [36, 36], iconAnchor: [18, 34] });
}
function drawPinDistricts() {
  if (!_pinMap || !_districts) return;
  if (_pinDistrictLayer) _pinMap.removeLayer(_pinDistrictLayer);
  _pinDistrictLayer = L.geoJSON({ type: "FeatureCollection", features: _districts.map((d) => d.feature) }, { style: { color: "#e8a93e", weight: 1.2, opacity: 0.7, dashArray: "5 5", fill: false }, interactive: false }).addTo(_pinMap);
}
function mountPinPicker() {
  const el = $("#spot-pin-map");
  if (!el || typeof L === "undefined") return;
  if (!_pinMap) {
    _pinMap = L.map(el, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, crossOrigin: true }).addTo(_pinMap);
    _pinMap.on("click", (e) => setSpotPin(e.latlng.lat, e.latlng.lng));
    drawPinDistricts();
  }
  if (_pinMarker) { _pinMap.removeLayer(_pinMarker); _pinMarker = null; }
  // You are probably standing at the spot: the pin starts where you are.
  if (STATE.geoActive && STATE.userPos) {
    _pinMap.setView([STATE.userPos.lat, STATE.userPos.lng], 17);
    setSpotPin(STATE.userPos.lat, STATE.userPos.lng);
  } else {
    const c = STATE.mainMap ? STATE.mainMap.getCenter() : { lat: MUNICH_CENTER[0], lng: MUNICH_CENTER[1] };
    _pinMap.setView([c.lat, c.lng], STATE.mainMap ? Math.max(14, STATE.mainMap.getZoom()) : 13);
    $("#spot-pin-info").innerHTML = `📍 ${T("Suche deinen Standort …", "Finding your location …")}`;
    currentPositionOnce(30000).then((pos) => {
      if (!$("#modal-backdrop").classList.contains("open") || _pinMarker) return;   // closed, or already tapped
      if (pos) {
        _pinMap.setView([pos.lat, pos.lng], 17);
        setSpotPin(pos.lat, pos.lng);
      } else {
        $("#spot-pin-info").innerHTML = `👆 ${T("Tipp auf die Karte, wo der Spot ist — den Pin kannst du danach noch verschieben.", "Tap the map where the spot is — you can drag the pin afterwards.")}`;
      }
    });
  }
  setTimeout(() => { try { _pinMap.invalidateSize(); } catch (e) {} }, 250);
}
function setSpotPin(lat, lng, opts = {}) {
  if (!_pinMap) return;
  if (!_pinMarker) {
    _pinMarker = L.marker([lat, lng], { draggable: true, icon: pinIcon(), zIndexOffset: 1000 }).addTo(_pinMap);
    _pinMarker.on("dragend", () => { const p = _pinMarker.getLatLng(); setSpotPin(p.lat, p.lng); });
  } else {
    _pinMarker.setLatLng([lat, lng]);
  }
  if (!opts.keepFields) {
    $("#f-lat").value = lat.toFixed(6);
    $("#f-lng").value = lng.toFixed(6);
  }
  updateSpotPinInfo(lat, lng);
  scheduleSpotCheck(lat, lng);   // amenities, name ideas and rules for this spot
}
function updateSpotPinInfo(lat, lng) {
  const info = $("#spot-pin-info");
  const d = districtAt(lat, lng);
  const parts = [];
  if (d) parts.push(`🏙️ <strong>${escapeHtml(d.nr)} ${escapeHtml(d.name)}</strong>`);
  else if (_districts) parts.push(`🏞️ ${T("Außerhalb der Münchner Stadtbezirke", "Outside Munich's districts")}`);
  let near = null, nearD = Infinity;
  getAllCorners().forEach((c) => { const m = haversine(lat, lng, c.lat, c.lng); if (m < nearD) { nearD = m; near = c; } });
  if (near && nearD < MIN_CORNER_DISTANCE_METERS) parts.push(`<span class="spot-pin-warn">⚠️ ${T(`nur ${Math.round(nearD)} m von „${escapeHtml(near.name)}“ — mindestens ${MIN_CORNER_DISTANCE_METERS} m Abstand`, `only ${Math.round(nearD)} m from “${escapeHtml(near.name)}” — keep ${MIN_CORNER_DISTANCE_METERS} m apart`, `solo a ${Math.round(nearD)} m de «${escapeHtml(near.name)}» — deja ${MIN_CORNER_DISTANCE_METERS} m de distancia`)}</span>`);
  if (info) info.innerHTML = parts.join(" · ") || "📍";
  // Fill the Stadtteil field with the district unless the user typed one.
  const area = $("#f-area");
  if (area && d && (!area.value.trim() || area.dataset.auto === "1")) { area.value = d.name; area.dataset.auto = "1"; }
}

function initMainMap() {
  if (typeof L === "undefined") { toast(T("Karte konnte nicht geladen werden. Internetverbindung prüfen?", "Couldn't load the map. Check your internet connection?")); return; }
  const map = L.map("main-map", { zoomControl: true }).setView([48.135, 11.555], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap-Mitwirkende",
    maxZoom: 19,
    crossOrigin: true
  }).addTo(map);
  STATE.mainMap = map;
  map.attributionControl?.addAttribution(T("Stadtbezirke", "Districts") + " © OpenStreetMap-Mitwirkende");
  map.on("zoomend", () => syncDistrictLabelZoom(map));
  rebuildMainMarkers();
  drawDistrictLayer();
  if (STATE.geoActive && STATE.userPos) focusMainMapOnUser(STATE.userPos.lat, STATE.userPos.lng);
  else focusMainMapOnMunich();
}

const MUNICH_CENTER = [48.137154, 11.576124];
const MUNICH_CORNER_RADIUS_M = 35000;
const MUNICH_MAP_PADDING = [40, 40];
const MUNICH_MAX_ZOOM = 13;
const MUNICH_FALLBACK_ZOOM = 12;
const MIN_USER_ZOOM_LEVEL = 14;
const USER_RECENTER_DISTANCE_M = 200;
const USER_CENTER_ANIMATION_DURATION = 0.6;

function getMunichCorners() {
  const [munichLat, munichLng] = MUNICH_CENTER;
  return getAllCorners().filter((corner) => haversine(munichLat, munichLng, corner.lat, corner.lng) <= MUNICH_CORNER_RADIUS_M);
}

function focusMainMapOnMunich() {
  if (!STATE.mainMap) return;
  const munichCorners = getMunichCorners();
  if (munichCorners.length) {
    const bounds = L.latLngBounds(munichCorners.map((corner) => [corner.lat, corner.lng]));
    STATE.mainMap.fitBounds(bounds, { padding: MUNICH_MAP_PADDING, maxZoom: MUNICH_MAX_ZOOM });
  } else {
    STATE.mainMap.setView(MUNICH_CENTER, MUNICH_FALLBACK_ZOOM);
  }
}

function focusMainMapOnUser(lat, lng, forceAnimate = false) {
  if (!STATE.mainMap) return;
  const target = L.latLng(lat, lng);
  const current = STATE.mainMap.getCenter();
  const isFirstCenter = !STATE.hasCenteredOnUser;
  const hasMovedSignificantly = current.distanceTo(target) > USER_RECENTER_DISTANCE_M;
  const shouldAnimate = forceAnimate || isFirstCenter || hasMovedSignificantly;
  const currentZoom = STATE.mainMap.getZoom();
  const targetZoom = Math.max(currentZoom, MIN_USER_ZOOM_LEVEL);
  if (shouldAnimate) STATE.mainMap.flyTo([lat, lng], targetZoom, { duration: USER_CENTER_ANIMATION_DURATION });
  else STATE.mainMap.setView([lat, lng], targetZoom);
  STATE.hasCenteredOnUser = true;
}

function refreshMainMarker(cornerId) {
  const m = STATE.mainMarkers[cornerId];
  if (!m) return;
  const el = m.getElement()?.querySelector(".corner-marker");
  const isHere = STATE.atCornerId === cornerId || STATE.manualCheckinId === cornerId;
  if (el) el.classList.toggle("at-here", isHere);
}

/* ====================== GEOLOCATION ====================== */
function bindGeo() {
  $("#locate-btn").addEventListener("click", () => STATE.geoActive ? stopGeo() : startGeo());
  $("#list-locate-btn").addEventListener("click", () => STATE.geoActive ? stopGeo() : startGeo());

  // Request notification permission early
  if ("Notification" in window && Notification.permission === "default") {
    // We'll ask on first geo activation
  }
}

// onGeoUpdate defined below in enhanced geo section
function onGeoError(err) {
  stopGeo();
  if (err.code === 1) toast(T("Standort-Zugriff verweigert.", "Location access denied."));
  else if (err.code === 2) toast(T("Standort nicht verfügbar.", "Location not available."));
  else toast(T("Standort-Fehler.", "Location error."));
}
function setGeoStatus(text, cls) {
  const el = $("#geo-status");
  el.textContent = text;
  el.className = "geo-status " + (cls || "");
}

/* ====================== HAVERSINE ====================== */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

