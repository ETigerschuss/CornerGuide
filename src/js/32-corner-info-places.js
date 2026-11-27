/* ====================== CORNER-INFO: PLACES, WEATHER, MAP ====================== */
function getNearbyPlaces(corner) {
  const { lat, lng } = corner;
  const q = `[out:json][timeout:25];(` +
    `nwr["shop"~"^(kiosk|convenience|beverages|alcohol|supermarket)$"](around:800,${lat},${lng});` +
    `nwr["amenity"="fuel"](around:800,${lat},${lng});` +
    `nwr["amenity"="shelter"](around:600,${lat},${lng});` +
    `nwr["covered"~"^(yes|arcade)$"]["highway"](around:400,${lat},${lng});` +
    `nwr["building"="roof"](around:400,${lat},${lng});` +
    `nwr["amenity"="toilets"](around:800,${lat},${lng});` +
    `nwr["amenity"="drinking_water"](around:800,${lat},${lng});` +
    `nwr["amenity"="recycling"]["recycling:glass_bottles"="yes"](around:600,${lat},${lng});` +
    `nwr["amenity"="waste_basket"](around:200,${lat},${lng});` +
    `nwr["amenity"="bench"](around:150,${lat},${lng});` +
    `);out center tags 400;`;
  const tryMirror = (i) => fetchJson(`${OVERPASS_URLS[i]}?data=${encodeURIComponent(q)}`, 25000)
    .catch((err) => { if (i + 1 < OVERPASS_URLS.length) return tryMirror(i + 1); throw err; });
  // v2: the query now also brings toilets, water, bins and benches.
  return cachedFetch(`cg.osm2.${corner.id}`, PLACES_TTL_MS, () => tryMirror(0).then((json) => condensePlaces(json, corner)));
}
function condensePlaces(json, corner) {
  const out = [];
  ((json && json.elements) || []).forEach((el) => {
    const lat = typeof el.lat === "number" ? el.lat : el.center && el.center.lat;
    const lng = typeof el.lon === "number" ? el.lon : el.center && el.center.lon;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    const t = el.tags || {};
    let kind = null;
    if (t.shop === "kiosk") kind = "kiosk";
    else if (t.shop === "convenience") kind = "spaeti";
    else if (t.shop === "beverages" || t.shop === "alcohol") kind = "drinks";
    else if (t.shop === "supermarket") kind = "super";
    else if (t.amenity === "fuel") kind = "fuel";
    else if (t.amenity === "shelter") kind = t.shelter_type === "public_transport" ? "stop" : "shelter";
    else if (t.covered && t.highway) kind = "arcade";
    else if (t.building === "roof") kind = "roof";
    else if (t.amenity === "toilets") kind = "toilet";
    else if (t.amenity === "drinking_water") kind = "water";
    else if (t.amenity === "recycling") kind = "glass";
    else if (t.amenity === "waste_basket") kind = "bin";
    else if (t.amenity === "bench") kind = "bench";
    if (!kind) return;
    const entry = { kind, name: String(t.name || t.brand || t.operator || "").slice(0, 60), hours: String(t.opening_hours || "").slice(0, 120), lat, lng, d: Math.round(haversine(corner.lat, corner.lng, lat, lng)) };
    if (kind === "toilet") { entry.fee = t.fee === "no" ? "no" : t.fee === "yes" ? "yes" : ""; entry.wc = t.wheelchair === "yes"; }
    out.push(entry);
  });
  const counts = {};
  return out.sort((a, b) => a.d - b.d).filter((p) => {
    counts[p.kind] = (counts[p.kind] || 0) + 1;
    return counts[p.kind] <= (PLACE_CAPS[p.kind] || 6);
  });
}

// Extra facts shown with a place (formatted at render time, not cached).
function placeInfo(p) {
  const out = [];
  if (p.fee === "no") out.push(T("kostenlos", "free"));
  else if (p.fee === "yes") out.push(T("kostenpflichtig", "paid"));
  if (p.wc) out.push("♿");
  return out.join(" · ");
}

function placeRowHtml(p) {
  const k = PLACE_KINDS[p.kind];
  const open = PLACE_KINDS[p.kind].supply || p.kind === "toilet" ? osmOpenNow(p.hours) : null;
  const status = open === true ? `<span class="ci-open">● ${T("offen", "open")}</span> · ` : open === false ? `<span class="ci-closed">● ${T("zu", "closed")}</span> · ` : "";
  return `<div class="ci-place">
    <div class="ci-p-main">
      <div class="ci-p-name">${k.emoji} ${escapeHtml(p.name || T(k.de, k.en))}</div>
      <div class="ci-p-meta">${status}${formatDistance(p.d)}${p.name ? ` · ${escapeHtml(T(k.de, k.en))}` : ""}${placeInfo(p) ? ` · ${escapeHtml(placeInfo(p))}` : ""}${p.hours && open === null ? ` · ${escapeHtml(p.hours)}` : ""}</div>
    </div>
    <a class="action-btn" href="${escapeHtml(walkingRouteUrl(p.lat, p.lng))}" target="_blank" rel="noopener">🧭 Route</a>
  </div>`;
}

function supplyBlockHtml(places, corner) {
  const supply = places.filter((p) => PLACE_KINDS[p.kind].supply && p.d <= 800)
    .map((p) => ({ ...p, open: osmOpenNow(p.hours) }))
    .sort((a, b) => (a.open === false) - (b.open === false) || a.d - b.d)
    .slice(0, 4);
  if (!supply.length) {
    return `<div class="ci-small">${T("Laut OpenStreetMap kein Kiosk/Späti im Umkreis von 800 m.", "No kiosk/corner shop within 800 m according to OpenStreetMap.")} <a href="https://www.google.com/maps/search/kiosk/@${corner.lat},${corner.lng},16z" target="_blank" rel="noopener">${T("In Google Maps suchen", "Search Google Maps")}</a></div>`;
  }
  return supply.map(placeRowHtml).join("");
}

function rainProofScore(cornerId) {
  return getEmojiVoteData(cornerId, "ueberdacht").count - getEmojiVoteData(cornerId, "nass").count;
}
function rainVoteHtml(cornerId) {
  const yes = getEmojiVoteData(cornerId, "ueberdacht");
  const no = getEmojiVoteData(cornerId, "nass");
  const verdict = yes.count > no.count
    ? `☂️ <strong>${T("Regenfest", "Rain-proof")}</strong> — ${T("laut Community überdacht", "covered according to the crew")}`
    : no.count > yes.count
      ? `💧 <strong>${T("Wird nass", "Gets wet")}</strong> — ${T("bei Regen besser ausweichen", "better go elsewhere when it rains")}`
      : T("Kann man hier bei Regen cornern? Noch keine Einschätzung — sag's den anderen:", "Can you corner here when it rains? No verdict yet — tell the others:");
  return `<div class="ci-line">${verdict}</div>
    <div class="ci-votes">
      <button class="action-btn ${yes.myVote ? "voted" : ""}" data-rain-vote="ueberdacht">☂️ ${T("Überdacht", "Covered")} ${yes.count || ""}</button>
      <button class="action-btn ${no.myVote ? "voted" : ""}" data-rain-vote="nass">💧 ${T("Wird nass", "Gets wet")} ${no.count || ""}</button>
    </div>`;
}
function bindRainVotes(box, cornerId) {
  box.querySelectorAll("[data-rain-vote]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.dataset.rainVote;
    const other = key === "ueberdacht" ? "nass" : "ueberdacht";
    if (getEmojiVoteData(cornerId, other).myVote) voteEmoji(cornerId, other);   // one opinion per person
    voteEmoji(cornerId, key);
    setTimeout(refreshRainVotes, 120);
  }));
}
function refreshRainVotes() {
  $$(".ci-rain-vote").forEach((box) => { box.innerHTML = rainVoteHtml(box.dataset.cornerId); bindRainVotes(box, box.dataset.cornerId); });
}
function rainAlternativesHtml(corner) {
  const alts = getAllCorners()
    .filter((c) => c.id !== corner.id && typeof c.lat === "number" && rainProofScore(c.id) > 0)
    .map((c) => ({ c, d: haversine(corner.lat, corner.lng, c.lat, c.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  if (!alts.length) return `<div class="ci-small">${T("Noch keine Corners als ☂️ überdacht markiert — sobald ihr welche markiert, schlägt die App sie hier bei Regen vor.", "No corners marked ☂️ covered yet — once you mark some, the app suggests them here when it rains.")}</div>`;
  return `<div class="ci-small" style="margin-top:6px;">${T("Regenfeste Corners zum Ausweichen", "Rain-proof corners nearby")}:</div>` + alts.map(({ c, d }) => `<div class="ci-place">
      <div class="ci-p-main"><div class="ci-p-name">☂️ ${escapeHtml(c.name)}</div><div class="ci-p-meta">${formatDistance(d)}</div></div>
      <button class="action-btn" data-open-corner="${escapeHtml(c.id)}">${T("Ansehen", "Open")}</button>
      <a class="action-btn" href="${escapeHtml(walkingRouteUrl(c.lat, c.lng))}" target="_blank" rel="noopener">🧭</a>
    </div>`).join("");
}

// Nearest toilet and drinking fountain ("No bathroom" / "Trinkwasser auch dabei").
function amenityBlockHtml(places) {
  const toilets = places.filter((p) => p.kind === "toilet").slice(0, 2);
  const water = places.filter((p) => p.kind === "water").slice(0, 1);
  const rows = [...toilets, ...water];
  if (!rows.length) return `<div class="ci-small">${T("Laut OpenStreetMap keine öffentliche Toilette und kein Trinkbrunnen im Umkreis von 800 m — eure Check-in-Notizen helfen den anderen.", "No public toilet or drinking fountain within 800 m according to OpenStreetMap — your check-in notes help the others.")}</div>`;
  return rows.map(placeRowHtml).join("") + (toilets.length ? "" : `<div class="ci-small">${T("Keine öffentliche Toilette im Umkreis von 800 m eingetragen.", "No public toilet within 800 m on the map.")}</div>`);
}

function ciGroupOn(g) {
  try { const v = JSON.parse(localStorage.getItem("cg.ciLayers") || "{}"); return g.id in v ? !!v[g.id] : g.on; }
  catch (e) { return g.on; }
}
function setCiGroupOn(g, on) {
  let v = {};
  try { v = JSON.parse(localStorage.getItem("cg.ciLayers") || "{}"); } catch (e) { v = {}; }
  v[g.id] = !!on;
  localStorage.setItem("cg.ciLayers", JSON.stringify(v));
}

// The little map at the bottom of the corner info. Built when it scrolls into
// view (saves tiles), one map at a time.
var _ciMap = null;
function mountCornerInfoMap(container, corner) {
  const el = container.querySelector(".ci-map");
  if (!el || typeof L === "undefined") return;
  const build = () => {
    if (!el.isConnected || container._ciMap) return;
    if (_ciMap) { try { _ciMap.remove(); } catch (e) {} _ciMap = null; }
    const map = L.map(el, { zoomControl: true, attributionControl: false, scrollWheelZoom: false, tap: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, crossOrigin: true }).addTo(map);
    map.setView([corner.lat, corner.lng], 16);
    _ciMap = container._ciMap = map;
    container._ciLayers = [];
    drawCornerInfoMap(container, corner);
    setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 80);
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); build(); }
    }, { rootMargin: "200px" });
    io.observe(el);
  } else {
    build();
  }
}

function drawCornerInfoMap(container, corner) {
  const map = container._ciMap;
  if (!map) return;
  (container._ciLayers || []).forEach((l) => { try { map.removeLayer(l); } catch (e) {} });
  container._ciLayers = [];
  const add = (layer) => { layer.addTo(map); container._ciLayers.push(layer); };
  add(L.marker([corner.lat, corner.lng], {
    icon: L.divIcon({ className: "", html: `<div class="ci-map-corner">📍</div>`, iconSize: [34, 34], iconAnchor: [17, 32] }),
    zIndexOffset: 1000
  }).bindPopup(`<strong>${escapeHtml(corner.name)}</strong>`));
  if (STATE.geoActive && STATE.userPos) {
    add(L.circleMarker([STATE.userPos.lat, STATE.userPos.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#6cb6ff", fillOpacity: 1 }).bindPopup(T("Du", "You")));
  }
  const places = container._places || [];
  const counts = {};
  const visible = [];
  CI_MAP_GROUPS.forEach((g) => {
    const list = places.filter((p) => g.kinds.includes(p.kind));
    counts[g.id] = list.length;
    if (ciGroupOn(g)) visible.push(...list);
  });
  visible.forEach((p) => {
    const k = PLACE_KINDS[p.kind];
    const open = k.supply || p.kind === "toilet" ? osmOpenNow(p.hours) : null;
    const status = open === true ? `<span class="ci-open">● ${T("offen", "open")}</span><br>` : open === false ? `<span class="ci-closed">● ${T("zu", "closed")}</span><br>` : "";
    add(L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: "", html: `<div class="ci-map-pin ${open === false ? "closed" : ""}">${k.emoji}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] })
    }).bindPopup(`<strong>${escapeHtml(p.name || T(k.de, k.en))}</strong><br>${status}${formatDistance(p.d)}${placeInfo(p) ? ` · ${escapeHtml(placeInfo(p))}` : ""}${p.hours && open === null ? `<br><small>${escapeHtml(p.hours)}</small>` : ""}<br><a href="${escapeHtml(walkingRouteUrl(p.lat, p.lng))}" target="_blank" rel="noopener">🧭 Route</a>`));
  });
  container.querySelectorAll("[data-ci-group]").forEach((b) => {
    const n = b.querySelector(".ci-chip-n");
    if (n) n.textContent = counts[b.dataset.ciGroup] ? String(counts[b.dataset.ciGroup]) : "";
  });
  // Frame the corner and what is switched on (within 600 m, so one far
  // supermarket doesn't zoom the map out).
  const near = visible.filter((p) => p.d <= 600).map((p) => [p.lat, p.lng]);
  if (near.length && !container._ciFramed) {
    container._ciFramed = true;
    map.fitBounds(L.latLngBounds([[corner.lat, corner.lng], ...near]), { padding: [24, 24], maxZoom: 17 });
  }
}

function renderCornerInfoSection(cornerId, container) {
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!container || !corner || typeof corner.lat !== "number") return;
  container.innerHTML = `<h3>🌤️ ${T("Corner-Check", "Corner check")}</h3>
    <div class="ci-block"><div class="ci-h">📋 ${T("Regeln & Ausstattung", "Rules & amenities")}</div>
      <div class="ci-spotcheck"><div class="ci-small">${T("Prüfe Schulen, Spielplätze, Fußgängerzone, Parks …", "Checking schools, playgrounds, pedestrian zones, parks …")}</div></div>
    </div>
    <div class="ci-block"><div class="ci-h">☀️ ${T("Sonne & Wetter heute", "Sun & weather today")}</div>
      <div class="ci-wx"><div class="ci-small">${T("Wetter wird geladen …", "Loading weather …")}</div></div>
      <div class="ci-sun">${sunBlockHtml(corner)}</div>
    </div>
    <div class="ci-block"><div class="ci-h">🏪 ${T("Nachschub in der Nähe", "Supplies nearby")}</div>
      <div class="ci-supply"><div class="ci-small">${T("Suche Kiosk, Späti & Tankstelle …", "Looking for kiosks, shops & petrol stations …")}</div></div>
    </div>
    <div class="ci-block"><div class="ci-h">🚻 ${T("Toilette & Trinkwasser", "Toilet & drinking water")}</div>
      <div class="ci-amen"><div class="ci-small">${T("Suche Toiletten & Trinkbrunnen …", "Looking for toilets & fountains …")}</div></div>
    </div>
    <div class="ci-block ci-rainblock"><div class="ci-h">☔ ${T("Bei Regen", "When it rains")}</div>
      <div class="ci-rain-vote" data-corner-id="${escapeHtml(corner.id)}">${rainVoteHtml(corner.id)}</div>
      <div class="ci-shelter"></div>
      <div class="ci-alt">${rainAlternativesHtml(corner)}</div>
    </div>
    <div class="ci-block ci-mapblock"><div class="ci-h">🗺️ ${T("Karte: was ist in der Nähe?", "Map: what's nearby?")}</div>
      <div class="ci-map-legend">${CI_MAP_GROUPS.map((g) => `<button class="ci-chip ${ciGroupOn(g) ? "on" : ""}" data-ci-group="${g.id}">${g.emoji} ${T(g.de, g.en)} <span class="ci-chip-n"></span></button>`).join("")}</div>
      <div class="ci-map" id="ci-map-${escapeHtml(corner.id)}"></div>
    </div>
    <div class="ci-attr">${T("Wetter", "Weather")}: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · ${T("Orte & Karte", "Places & map")}: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>`;
  bindRainVotes(container.querySelector(".ci-rain-vote"), corner.id);
  bindPlaceVotes(container, corner);
  renderSpotCheckBlock(corner, container.querySelector(".ci-spotcheck"));
  container.querySelectorAll("[data-open-corner]").forEach((b) => b.addEventListener("click", () => focusDetailSection(b.dataset.openCorner, ".corner-info-section")));
  container.querySelectorAll("[data-ci-group]").forEach((b) => b.addEventListener("click", () => {
    const g = CI_MAP_GROUPS.find((x) => x.id === b.dataset.ciGroup);
    if (!g) return;
    setCiGroupOn(g, !ciGroupOn(g));
    b.classList.toggle("on", ciGroupOn(g));
    drawCornerInfoMap(container, corner);
  }));
  mountCornerInfoMap(container, corner);
  const stillHere = () => container.isConnected && STATE.detailCornerId === cornerId;
  getWeather(corner.lat, corner.lng).then((wx) => {
    if (!stillHere()) return;
    const an = analyzeWeather(wx);
    container.querySelector(".ci-wx").innerHTML = weatherBlockHtml(an);
    container.querySelector(".ci-rainblock").classList.toggle("alert", !!(an && (an.rainingNow || an.rainSoon)));
  }).catch(() => {
    if (stillHere()) container.querySelector(".ci-wx").innerHTML = `<div class="ci-small">${T("Wetter gerade nicht erreichbar.", "Weather unreachable right now.")}</div>`;
  });
  getNearbyPlaces(corner).then((places) => {
    if (!stillHere()) return;
    container.querySelector(".ci-supply").innerHTML = supplyBlockHtml(places, corner);
    const shelters = places.filter((p) => PLACE_KINDS[p.kind].rain && p.d <= 600).slice(0, 3);
    container.querySelector(".ci-shelter").innerHTML = shelters.length
      ? `<div class="ci-small" style="margin-top:6px;">${T("Überdacht in der Nähe", "Covered spots nearby")}:</div>${shelters.map(placeRowHtml).join("")}`
      : "";
    container.querySelector(".ci-amen").innerHTML = amenityBlockHtml(places);
    container._places = places;
    if (container._ciMap) drawCornerInfoMap(container, corner);
  }).catch(() => {
    if (stillHere()) container.querySelector(".ci-amen").innerHTML = `<div class="ci-small">${T("Gerade nicht erreichbar.", "Unreachable right now.")}</div>`;
    if (!stillHere()) return;
    container.querySelector(".ci-supply").innerHTML = `<div class="ci-small">${T("Karte gerade nicht erreichbar.", "Map data unreachable right now.")} <a href="https://www.google.com/maps/search/kiosk/@${corner.lat},${corner.lng},16z" target="_blank" rel="noopener">${T("Kiosk in Google Maps suchen", "Search kiosks on Google Maps")}</a></div>`;
  });
}

// Compact weather line on the list: sun window today, sunset, rain warning.
function renderWeatherBanner() {
  const box = $("#weather-banner");
  if (!box) return;
  getWeather(MUNICH_CENTER[0], MUNICH_CENTER[1]).then((wx) => {
    const an = analyzeWeather(wx);
    if (!an) { box.innerHTML = ""; return; }
    const sun = sunDay(Date.now(), MUNICH_CENTER[0], MUNICH_CENTER[1]);
    const rainy = an.rainingNow || an.rainSoon;
    const proof = rainy ? getAllCorners().filter((c) => rainProofScore(c.id) > 0).slice(0, 3) : [];
    box.innerHTML = `<div class="weather-banner">${sunVerdictHtml(an)}${sun.set && sun.set > Date.now() ? ` · 🌇 ${clockOf(sun.set)}` : ""}<br>${rainVerdictHtml(an)}${rainy
      ? (proof.length
        ? ` · ${T("Regenfest", "Rain-proof")}: ${proof.map((c) => `<button data-open-corner="${escapeHtml(c.id)}">☂️ ${escapeHtml(c.name)}</button>`).join(", ")}`
        : ` · ${T("Markiert überdachte Corners mit ☂️ (Corner-Info), dann stehen sie hier.", "Mark covered corners with ☂️ (corner info) and they show up here.")}`)
      : ""}</div>`;
    box.querySelectorAll("[data-open-corner]").forEach((b) => b.addEventListener("click", () => focusDetailSection(b.dataset.openCorner, ".corner-info-section")));
  }).catch(() => { box.innerHTML = ""; });
}
document.addEventListener("DOMContentLoaded", () => {
  renderWeatherBanner();
  setInterval(renderWeatherBanner, WEATHER_TTL_MS);
});

function updateCheckinButtons() {
  const hasCooldown = STATE.lastCheckinCorner && (Date.now() - STATE.lastCheckinTime) < COOLDOWN_MS;
  const remaining = hasCooldown ? COOLDOWN_MS - (Date.now() - STATE.lastCheckinTime) : 0;
  const cooldownStr = hasCooldown ? `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}` : "";
  $$(".checkin-btn").forEach((btn) => {
    const cId = btn.dataset.id;
    const isThis = cId === STATE.manualCheckinId;
    const corner = getAllCorners().find((c) => c.id === cId);
    const blocked = hasCooldown && cId !== STATE.lastCheckinCorner && !isThis;
    btn.classList.toggle("checked-in", isThis);
    btn.classList.toggle("cooldown", blocked);
    if (isThis) btn.innerHTML = "✅ " + T("Ich bin hier", "I'm here") + " &middot; 🚪 " + T("Auschecken", "Check out");
    else if (blocked) btn.innerHTML = `⏳ ${cooldownStr}`;
    else if (STATE.geoActive && STATE.userPos && corner) {
      const dist = haversine(STATE.userPos.lat, STATE.userPos.lng, corner.lat, corner.lng);
      btn.innerHTML = `📍 ${T("Einchecken", "Check in")} <span class="checkin-distance">${dist < 1000 ? Math.round(dist) + "m" : (dist/1000).toFixed(1) + "km"}</span>`;
    } else btn.innerHTML = "📍 " + T("Einchecken", "Check in");
  });
}

// "Wär ganz gut wenn man auch immer den Standort sehen würde in der
//  Detailansicht" — distance to the spot, or its area when GPS is off.
function distanceLabel(c) {
  if (!STATE.geoActive || !STATE.userPos || typeof c.lat !== "number") return "—";
  const d = haversine(STATE.userPos.lat, STATE.userPos.lng, c.lat, c.lng);
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
}

// "Es muss erkennbar sein wer der Urheber des Corners ist und Datum"
function cornerOriginHtml(c) {
  if (!c.isCustom) return `🗺️ ${T("Aus der Original-Liste „Cornern als Lebensstil“", "From the original list “Cornern als Lebensstil”")}`;
  const who = c.createdBy ? (c.createdById ? `<button class="people-chip" data-user-profile="${escapeHtml(c.createdById)}">${escapeHtml(c.createdBy)}</button>` : `<strong>${escapeHtml(c.createdBy)}</strong>`) : T("jemandem aus der Crew", "someone from the crew");
  const ts = Number(c.createdAt) || Number(String(c.id || "").split("-")[1]) || 0;
  const when = ts > 1500000000000 ? ` ${T("am", "on")} ${new Date(ts).toLocaleDateString(STATE.lang === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}` : "";
  return `✍️ ${T("Eingetragen von", "Added by")} ${who}${when}`;
}

function openDetail(cornerId) {
  const c = getAllCorners().find((x) => x.id === cornerId);
  if (!c) return;
  ensureCornerDetailData(cornerId);   // photos, last check-ins, full cover — only for this corner
  if (detailXpCornerId !== cornerId) addXp(2, "Spot-Detail angesehen");
  detailXpCornerId = cornerId;
  const overlay = $("#detail-overlay");
  $("#detail-title").textContent = c.name;
  const photoSrc = getCornerCoverPhoto(c.id);
  const effectiveDesc = getDescription(c);
  const visits = getVisitCount(cornerId);
  const { avg, count: baroCount } = getBarometerData(cornerId);
  const peopleHere = getPeopleAtCorner(cornerId);
  const peopleMessageTargets = freshFriends().filter((friend) => friend.atCorner === cornerId);
  const capturedInfo = STATE.captured[cornerId];
  const capturedHtml = capturedInfo?.team ? `<div class="detail-people-here" style="border-color:${TEAMS[capturedInfo.team]?.color || 'var(--line)'};color:${TEAMS[capturedInfo.team]?.color || 'var(--fg)'};background:rgba(255,255,255,0.05);">${TEAMS[capturedInfo.team]?.emoji || ''} ${T("Eingenommen von Team", "Captured by team")} ${TEAMS[capturedInfo.team]?.name || capturedInfo.team}</div>` : "";
  const teamPickerHtml = STATE.manualCheckinId === cornerId ? renderTeamPickerHtml() : "";
  $("#detail-content").innerHTML = `
    ${detailTopBarHtml(c)}
    <div class="detail-hero-photo">${photoSrc ? `<img src="${photoSrc}" alt="${escapeHtml(c.name)}" />` : `<div class="card-photo-empty" style="height:100%"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h3l2-3h8l2 3h3v13H3z"/><circle cx="12" cy="13" r="4"/></svg></div>`}</div>
    <div class="detail-stats">
      <div class="detail-stat"><span class="stat-num">${visits}</span><span class="stat-label">${T("Besuche", "Visits")}</span></div>
      <div class="detail-stat"><span class="stat-num">${baroCount > 0 ? avg.toFixed(1) : "—"}</span><span class="stat-label">${T("Rating", "Rating")}</span></div>
      <div class="detail-stat"><span class="stat-num">${peopleHere.length}</span><span class="stat-label">${T("Hier jetzt", "Here now")}</span></div>
      <div class="detail-stat"><span class="stat-num">${distanceLabel(c)}</span><span class="stat-label">${T("Entfernung", "Distance")}</span></div>
    </div>
    <div class="detail-where">📍 ${escapeHtml(c.area || "München")}${typeof c.lat === "number" ? ` · <span class="dw-coords">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</span>` : ""}</div>
    ${isPrivateCorner(c) ? `<div class="detail-visibility">${visibilityBadgeHtml(c)} <span class="share-dim">${cornerVisibility(c) === "friends" ? T("Nur für die engen Freunde von", "Only for the close friends of") + " " + escapeHtml(isMyKey(c.ownerKey) ? T("dir", "you") : (c.createdBy || "?")) : T("Nur für dich", "Only for you")}</span></div>` : ""}
    <div class="detail-district">${detailDistrictHtml(c)}</div>
    <div class="detail-origin">${cornerOriginHtml(c)}</div>
    ${capturedHtml}
    ${peopleHere.length ? `<div class="detail-people-here">🟢 ${peopleHere.length} ${T("gerade hier", "here now")}: ${peopleAtCornerDetailed(c.id).map((p) => p.id ? `<button class="people-chip" data-user-profile="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>` : escapeHtml(p.label)).join(" ")}</div>` : ""}
    ${peopleMessageTargets.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px;">${peopleMessageTargets.map((friend) => `<button class="action-btn" data-dm-user="${friend.id}">💬 ${escapeHtml(friend.nickname || friend.name || friend.id)}</button><button class="action-btn cmp-quick" data-compliment-to="${escapeHtml(friend.id)}" data-compliment-name="${escapeHtml(friend.nickname || friend.name || "")}" title="${T("Kompliment machen", "Pay a compliment")}">💐</button>`).join("")}</div>` : ""}
    <div class="gossip-section" data-corner-id="${c.id}"></div>
    <div class="detail-quick-actions">
      <button class="detail-quick-btn" data-scroll-target=".corner-info-section">🌤️ ${T("Regeln · Sonne · Kiosk", "Rules · Sun · Kiosk")}</button>
      <button class="detail-quick-btn" data-scroll-target=".ci-mapblock">🗺️ ${T("Kiosk · Klo · Wasser", "Kiosk · Loo · Water")}</button>
      ${_backendFeatures.ok && _cornerDates.primed ? `<button class="detail-quick-btn" data-scroll-target=".cornerdate-section">📅 Cornerdate</button>` : ""}
      <button class="detail-quick-btn" data-scroll-target=".corner-chat-section">💬 ${T("Chat", "Chat")}</button>
      <button class="detail-quick-btn" data-scroll-target=".comments-section">📝 ${T("Kommentare", "Comments")}</button>
      <button class="detail-quick-btn" data-scroll-target=".photo-gallery">📸 ${T("Fotos", "Photos")}</button>
      <button class="detail-quick-btn" data-scroll-target=".visit-trail">👣 ${T("Besuche", "Visits")}</button>
    </div>
    <p class="card-area" style="margin-top:14px;">${escapeHtml(c.area || "—")}</p>
    <h2 class="card-name" style="margin-bottom:14px;">${escapeHtml(c.name)}</h2>
    ${effectiveDesc ? `<p class="card-desc">${escapeHtml(effectiveDesc)}</p>` : ""}
    <div class="detail-feedback" data-corner-id="${c.id}">${renderFeedbackSummary(c.id)}</div>
    <ul class="card-tags" style="margin-bottom:14px;">${(c.tags || []).map((t) => `<li>#${escapeHtml(t)}</li>`).join("")}</ul>
    <div class="corner-info-section" data-corner-id="${c.id}"></div>
    <div class="cornerdate-section" data-corner-id="${c.id}"></div>
    ${teamPickerHtml}
    <div class="corner-chat-section" data-corner-id="${c.id}"></div>
    <div class="corner-voting" data-corner-id="${c.id}"></div>
    <div class="corner-status-section" data-corner-id="${c.id}"></div>
    <div class="emoji-votes" data-corner-id="${c.id}"></div>
    <div class="barometer-section" data-corner-id="${c.id}"></div>
    <div class="supply-section" data-corner-id="${c.id}"></div>
    <div class="photo-gallery" data-corner-id="${c.id}"></div>
    <div class="visit-trail" data-corner-id="${c.id}"></div>
    <div class="comments-section" data-corner-id="${c.id}"></div>
    <div class="card-actions" style="padding:18px 0;">
      <button class="checkin-btn ${STATE.manualCheckinId === c.id ? "checked-in" : ""}" data-id="${c.id}">${STATE.manualCheckinId === c.id ? "✅ " + T("Ich bin hier", "I'm here") + " &middot; 🚪 " + T("Auschecken", "Check out") : "📍 " + T("Einchecken", "Check in")}</button>
      <button class="action-btn primary" data-action="map-detail" data-id="${c.id}">📍 ${T("Auf Karte", "On map")}</button>
      <button class="action-btn" data-action="route-detail" data-id="${c.id}">🧭 ${T("Route", "Route")}</button>
      <button class="action-btn" data-action="share-corner" data-id="${c.id}">🔗 ${T("Teilen", "Share")}</button>
      <button class="action-btn wa" data-action="whatsapp-corner" data-id="${c.id}">📲 WhatsApp</button>
      <button class="action-btn" data-action="qr-corner" data-id="${c.id}">🧾 QR</button>
      ${canEditCorner(c) ? `<button class="action-btn" data-action="edit-corner" data-id="${c.id}">✏️ ${T("Bearbeiten", "Edit")}</button>` : ""}
    </div>`;
  const detailContent = $("#detail-content");
  detailContent.querySelectorAll(".checkin-btn").forEach((b) => b.addEventListener("click", (e) => { manualCheckin(e.target.closest("[data-id]").dataset.id); setTimeout(() => openDetail(cornerId), 100); }));
  detailContent.querySelector('[data-action="follow-me"]')?.addEventListener("click", openFollowMeDialog);
  bindDetailDistrict(detailContent.querySelector(".detail-district"));
  detailContent.querySelector('[data-action="map-detail"]')?.addEventListener("click", () => { closeDetail(); $(`.tab[data-view="map"]`).click(); setTimeout(() => STATE.mainMap?.flyTo([c.lat, c.lng], 17, { duration: 0.7 }), 250); });
  detailContent.querySelectorAll('[data-action="route-detail"]').forEach((b) => b.addEventListener("click", () => { window.open(walkingRouteUrl(c.lat, c.lng), "_blank"); }));
  detailContent.querySelector('[data-action="share-corner"]')?.addEventListener("click", () => { shareCornerLink(c.id); });
  detailContent.querySelector('[data-action="whatsapp-corner"]')?.addEventListener("click", () => openWhatsApp(cornerWhatsAppText(c.id)));
  detailContent.querySelector('[data-action="qr-corner"]')?.addEventListener("click", () => openQrDialog(c));
  detailContent.querySelector('[data-action="edit-corner"]')?.addEventListener("click", () => openCornerEditor(c.id));
  detailContent.querySelectorAll("[data-scroll-target]").forEach((btn) => btn.addEventListener("click", () => detailContent.querySelector(btn.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" })));
  detailContent.querySelectorAll(".team-btn").forEach((btn) => btn.addEventListener("click", () => { selectTeam(btn.dataset.team); setTimeout(() => openDetail(cornerId), 50); }));
  detailContent.querySelectorAll("[data-dm-user]").forEach((btn) => btn.addEventListener("click", () => {
    const friend = STATE.friends[btn.dataset.dmUser];
    sendDirectMessagePrompt(btn.dataset.dmUser, friend?.nickname || friend?.name || btn.dataset.dmUser, c.id);
  }));
  renderCornerChatSection(cornerId, detailContent.querySelector(".corner-chat-section"));
  renderCornerVotingSection(cornerId, detailContent.querySelector(".corner-voting"));
  renderCornerStatusSection(cornerId, detailContent.querySelector(".corner-status-section"));
  renderEmojiVotes(cornerId, detailContent.querySelector(".emoji-votes"));
  renderBarometer(cornerId, detailContent.querySelector(".barometer-section"));
  STATE.detailCornerId = cornerId;
  renderGossipSection(cornerId, detailContent.querySelector(".gossip-section"));
  renderCornerInfoSection(cornerId, detailContent.querySelector(".corner-info-section"));
  renderCornerDateSection(cornerId, detailContent.querySelector(".cornerdate-section"));
  refreshSupplySection(cornerId);
  renderPhotoGallery(cornerId, detailContent.querySelector(".photo-gallery"));
  renderVisitTrail(cornerId, detailContent.querySelector(".visit-trail"));
  renderCommentSection(cornerId, detailContent.querySelector(".comments-section"));
  overlay.classList.add("open");
}

function closeDetail() { detailXpCornerId = null; $("#detail-overlay").classList.remove("open"); }

function renderCards() {
  const root = $("#cards");
  root.innerHTML = "";
  const all = getSortedCorners().filter(cornerMatchesDistrictFilter).filter(cornerMatchesAmenFilter);
  if (!all.length && STATE.districtFilter) {
    root.innerHTML = `<p class="district-empty">${T("Keine Corners in diesem Stadtbezirk — noch nicht! Tipp auf ➕, um den ersten einzutragen.", "No corners in this district — yet! Tap ➕ to add the first.")}</p>`;
  } else if (!all.length && (STATE.amenFilter || []).length) {
    root.innerHTML = `<p class="district-empty">${T("Kein Corner passt zu allen gewählten Emojis — oben eins abwählen. Noch nicht geprüfte Corners füllt die App nach und nach auf.", "No corner matches all chosen emojis — untick one above. Corners not checked yet are filled in bit by bit.")}</p>`;
  }
  all.forEach((c, i) => {
    const photoSrc = getCornerCoverPhoto(c.id);
    const peopleHere = getPeopleAtCorner(c.id);
    const capture = STATE.captured[c.id];
    const card = document.createElement("article");
    const isMySpot = c.isCustom && (c.createdById ? c.createdById === currentUserKey() : c.createdBy === STATE.nickname);
    card.className = "card" + (c.isCustom ? " custom" : "") + (isMySpot ? " mine" : "") + (STATE.manualCheckinId === c.id ? " at-here" : "");
    card.id = "card-" + c.id;
    card.innerHTML = `
      <div class="card-photo">
        <div class="card-num">${String(cornerNumber(c.id)).padStart(2, "0")}</div>
        <span class="mine-badge">${T("Mein Spot", "My Spot")}</span>
        <span class="at-badge">${T("Du bist hier", "You are here")}</span>
        ${capture ? `<span class="captured-badge"><span class="cap-emoji">${TEAMS[capture.team]?.emoji || "🏳️"}</span><span class="cap-label">Captured</span></span>` : ""}
        ${c._visits > 0 ? `<span class="card-visit-rank">🔥 ${c._visits}</span>` : ""}
        ${photoSrc ? `<img src="${photoSrc}" alt="${escapeHtml(c.name)}">` : `<div class="card-photo-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h3l2-3h8l2 3h3v13H3z"/><circle cx="12" cy="13" r="4"/></svg><span>${T("Foto hochladen", "Upload photo")}</span></div>`}
        <input type="file" accept="image/*" class="photo-input" data-id="${c.id}">
        <button class="photo-btn" data-id="${c.id}">📷 ${photoSrc ? T("Ändern", "Change") : T("Hinzufügen", "Add")}</button>
      </div>
      <div class="card-body">
        <p class="card-area">${visibilityBadgeHtml(c)}${districtBadgeHtml(c)}${escapeHtml(c.area || "—")} ${c.isCustom && c.createdBy ? `<span class="creator-label"> · von ${escapeHtml(c.createdBy)}</span>` : ""}</p>
        <h2 class="card-name">${escapeHtml(c.name)}</h2>
        <div class="card-amens">${cornerEmojiRowHtml(c)}</div>
        ${peopleHere.length ? `<div class="detail-people-here">🟢 ${peopleHere.length} ${T("hier", "here")}: ${peopleHere.map((n) => escapeHtml(n)).join(", ")}</div>` : ""}
        ${gossipOpenRoundAt(c.id) ? `<button class="card-gossip-live" data-gossip-card="${c.id}">🗣️ ${T("Gossip-Runde läuft", "Gossip round live")} →</button>` : ""}
        ${getDescription(c) ? `<p class="card-desc short-desc">${escapeHtml(getDescription(c))}</p>` : ""}
        ${feedbackCount(c.id) ? `<div class="card-feedback-teaser">💬 ${feedbackCount(c.id)} ${T("Community-Notizen", "community notes")}</div>` : ""}
      </div>
      <div class="card-actions">
        <button class="detail-link" data-id="${c.id}">ℹ️ ${T("Corner Info", "Corner info")}</button>
        <button class="checkin-btn ${STATE.manualCheckinId === c.id ? "checked-in" : ""}" data-id="${c.id}">${STATE.manualCheckinId === c.id ? "✅ " + T("Ich bin hier", "I'm here") + " &middot; 🚪 " + T("Auschecken", "Check out") : "📍 " + T("Einchecken", "Check in")}</button>
        <button class="action-btn primary" data-action="map" data-id="${c.id}">📍 ${T("Karte", "Map")}</button>
        <button class="action-btn" data-action="route" data-id="${c.id}">🧭 ${T("Route", "Route")}</button>
      </div>`;
    root.appendChild(card);
  });
  root.querySelectorAll(".photo-btn").forEach((btn) => btn.addEventListener("click", () => $(`.photo-input[data-id="${btn.dataset.id}"]`).click()));
  root.querySelectorAll(".photo-input").forEach((inp) => inp.addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f, inp.dataset.id); }));
  root.querySelectorAll(".detail-link").forEach((btn) => btn.addEventListener("click", () => openDetail(btn.dataset.id)));
  // "der Detailsbutton ist schwierig zu erkennen": the whole card opens it.
  $$("#cards .card").forEach((card) => {
    const id = card.id.replace(/^card-/, "");
    card.querySelectorAll(".card-body, .card-photo img").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input")) return;
      openDetail(id);
    }));
  });
  root.querySelectorAll("[data-gossip-card]").forEach((btn) => btn.addEventListener("click", () => focusGossip(btn.dataset.gossipCard)));
  root.querySelectorAll('[data-action="map"]').forEach((btn) => btn.addEventListener("click", () => { const c = getAllCorners().find((x) => x.id === btn.dataset.id); $(`.tab[data-view="map"]`).click(); setTimeout(() => { if (STATE.mainMap) { STATE.mainMap.flyTo([c.lat, c.lng], 17, { duration: 0.7 }); STATE.mainMarkers[c.id]?.openPopup?.(); } }, 250); }));
  root.querySelectorAll('[data-action="route"]').forEach((btn) => btn.addEventListener("click", () => { const c = getAllCorners().find((x) => x.id === btn.dataset.id); window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`, "_blank"); }));
  // Only the list's own buttons: binding every .checkin-btn in the document
  // also hit the open corner detail again on each re-render, so one tap there
  // checked in and right back out.
  root.querySelectorAll(".checkin-btn").forEach((btn) => btn.addEventListener("click", () => manualCheckin(btn.dataset.id)));
  updateCheckinButtons();
}

function rebuildMainMarkers() {
  if (!STATE.mainMap) return;
  Object.values(STATE.mainMarkers).forEach((m) => STATE.mainMap.removeLayer(m));
  STATE.mainMarkers = {};
  getSortedCorners().forEach((c, i) => {
    const capture = STATE.captured[c.id];
    const icon = L.divIcon({ className: "", html: `<div class="corner-marker ${c.isCustom ? "custom" : ""}" data-id="${c.id}">${isPrivateCorner(c) ? `<span class="lock-badge">${VISIBILITY[cornerVisibility(c)].emoji}</span>` : ""}<span class="num">${cornerNumber(c.id)}</span>${capture ? `<span class="team-badge">${TEAMS[capture.team]?.emoji || "🏳️"}</span>` : ""}</div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
    const marker = L.marker([c.lat, c.lng], { icon }).addTo(STATE.mainMap);
    marker.bindPopup(`<strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.area || "")}</small>${capture ? `<br><small>${TEAMS[capture.team]?.emoji || ''} ${TEAMS[capture.team]?.name || ''}</small>` : ""}`);
    // The map is the landing page now: a tap opens the corner right away.
    marker.on("click", () => { marker.closePopup(); openDetail(c.id); });
    STATE.mainMarkers[c.id] = marker;
  });
  renderLiveLocationMarkers();
}

function startGeo() {
  if (!navigator.geolocation) { toast("Geolocation wird nicht unterstützt."); return; }
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  setGeoStatus("Suche…", "");
  if (STATE.userPos && STATE.mainMap) focusMainMapOnUser(STATE.userPos.lat, STATE.userPos.lng, true);
  STATE.geoWatch = navigator.geolocation.watchPosition(onGeoUpdate, onGeoError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  STATE.geoActive = true;
  $("#locate-btn").classList.add("active");
  $("#locate-btn").textContent = "📍 Standort aus";
  $("#list-locate-btn").classList.add("active");
  $("#list-locate-btn").textContent = "📍 Standort aus";
}

function stopGeo() {
  if (STATE.geoWatch !== null) navigator.geolocation.clearWatch(STATE.geoWatch);
  STATE.geoWatch = null;
  STATE.geoActive = false;
  $("#locate-btn").classList.remove("active");
  $("#locate-btn").textContent = "📍 Standort an";
  $("#list-locate-btn").classList.remove("active");
  $("#list-locate-btn").textContent = "📍 Standort an";
  setGeoStatus("Standort aus", "");
  $("#me-position-meta").textContent = "Standort aus";
  if (STATE.userMainMarker && STATE.mainMap) { STATE.mainMap.removeLayer(STATE.userMainMarker); STATE.userMainMarker = null; }
  if (STATE.atCornerId) { const old = STATE.atCornerId; STATE.atCornerId = null; refreshMainMarker(old); document.getElementById("card-" + old)?.classList.remove("at-here"); }
  STATE.hasCenteredOnUser = false;
  updateCheckinButtons();
  broadcastPresence();
  broadcastLiveLocation();
  focusMainMapOnMunich();
}

function onGeoUpdate(pos) {
  const { latitude, longitude } = pos.coords;
  STATE.userPos = { lat: latitude, lng: longitude };
  focusMainMapOnUser(latitude, longitude);
  if (STATE.mainMap) {
    const team = getTeamInfo(STATE.team);
    const icon = L.divIcon({ className: "", html: `<div class="live-user-marker" style="background:${team?.color || '#6cb6ff'};"><span class="live-nick">${escapeHtml(STATE.nickname || 'Du')}</span>${team?.emoji || '📍'}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    if (!STATE.userMainMarker) STATE.userMainMarker = L.marker([latitude, longitude], { icon, zIndexOffset: 1000 }).addTo(STATE.mainMap); else { STATE.userMainMarker.setIcon(icon); STATE.userMainMarker.setLatLng([latitude, longitude]); }
  }
  let nearest = null, nDist = Infinity;
  getAllCorners().forEach((c) => { const d = haversine(latitude, longitude, c.lat, c.lng); if (d < nDist) { nDist = d; nearest = c; } });
  const newAt = nDist <= STATE.PROXIMITY_M ? nearest.id : null;
  checkDwellAutoCheckin();
  if (newAt !== STATE.atCornerId) {
    const prev = STATE.atCornerId;
    STATE.atCornerId = newAt;
    if (prev) {
      refreshMainMarker(prev);
      document.getElementById("card-" + prev)?.classList.remove("at-here");
    }
    if (newAt) {
      refreshMainMarker(newAt);
      document.getElementById("card-" + newAt)?.classList.add("at-here");
      checkCaptureCondition(newAt);
      logEncounters(newAt);
    }
    broadcastPresence();
    renderCards();   // the corner you just walked up to moves to the top
  }
  if (STATE.atCornerId) { setGeoStatus(`AM SPOT: ${nearest.name.toUpperCase()}`, "at-corner"); $("#me-position-meta").innerHTML = `<span style="color:var(--green)">📍 ${escapeHtml(nearest.name)}</span>`; } else { const dStr = nDist < 1000 ? `${Math.round(nDist)} m` : `${(nDist / 1000).toFixed(1)} km`; setGeoStatus(`${dStr} bis ${nearest.name}`, "live"); $("#me-position-meta").innerHTML = `<span style="color:var(--blue)">📍 ${dStr} bis ${escapeHtml(nearest.name)}</span>`; }
  updateCheckinButtons();
  broadcastLiveLocation();
}

async function saveNewSpot() {
  const name = $("#f-name").value.trim();
  const desc = $("#f-desc").value.trim();
  const lat = parseFloat($("#f-lat").value);
  const lng = parseFloat($("#f-lng").value);
  if (!name) { toast("Name fehlt."); $("#f-name").focus(); return; }
  if (isNaN(lat) || isNaN(lng)) { toast(T("Tipp auf die Karte, wo der Spot ist.", "Tap the map where the spot is.")); return; }
  const tooClose = getAllCorners().find((corner) => !isPrivateCorner(corner) && haversine(lat, lng, corner.lat, corner.lng) < MIN_CORNER_DISTANCE_METERS);
  if (tooClose) { toast(`Zu nah an <strong>${escapeHtml(tooClose.name)}</strong> — bitte mindestens ${MIN_CORNER_DISTANCE_METERS}m Abstand.`); return; }
  const vis = window.FB?.firebaseReady && VISIBILITY[SPOT_DRAFT.visibility] ? SPOT_DRAFT.visibility : "all";
  const spot = { id: (vis === "all" ? "custom-" : "private-") + Date.now() + "-" + Math.random().toString(36).slice(2, 7), name, area: $("#f-area").value.trim() || "Eigener Spot", lat, lng, description: desc, tags: $("#f-tags").value.split(",").map((s) => s.trim()).filter(Boolean), amenities: SPOT_AMENITIES.filter((a) => SPOT_DRAFT.amen[a.key]).map((a) => a.key), isCustom: true, createdBy: STATE.nickname || "Anonym", createdById: currentUserKey(), createdAt: Date.now() };
  const facts = spotCheckSummary();
  if (facts) spot.check = facts;
  if (vis !== "all") { spot.visibility = vis; spot.ownerKey = myRootKey(); }
  if (window.FB?.firebaseReady) {
    try {
      const { db, ref, set } = window.FB;
      await set(ref(db, cornerDbPath(spot)), spot);
      if (vis === "all" && SPOT_DRAFT.check) storeCornerFacts(spot.id, SPOT_DRAFT.check);
      if (vis !== "all") STATE.privateCorners = { ...(STATE.privateCorners || {}), [spot.id]: spot };
    } catch (err) {
      if (/permission/i.test(String(err?.code || "") + String(err?.message || ""))) {
        // Usually a missing access grant for this login — repair or ask for the code.
        const ok = await verifyAccessGrant({ interactive: true });
        toast(ok
          ? "🔑 Zugang wurde erneuert — tipp bitte nochmal auf „Speichern“."
          : "🔑 Für dieses Gerät fehlt der Zugang — Einladungscode eingeben, dann nochmal speichern. Deine Eingaben bleiben stehen.");
        return;
      }
      const reason = err?.message ? ` (${escapeHtml(err.message)})` : "";
      toast(`❌ Spot konnte nicht in Firebase gespeichert werden${reason}`);
      return;
    }
  } else {
    STATE.customSpots.push(spot);
    saveCustomSpots();
    toast(`💾 Spot <strong>${escapeHtml(name)}</strong> lokal gespeichert (nur auf diesem Gerät)`);
  }
  const spotAura = vis === "all" ? 50 : PRIVATE_SPOT_AURA;
  closeModal(); renderCards(); updateCounts(); rebuildMainMarkers(); unlockAchievement("first-corner", "Entdecker", "🗺️", 30); addXp(spotAura, `Corner hinzugefügt: ${name}`); if (STATE.customSpots.filter((s) => (s.createdById || s.createdBy) === currentUserKey()).length >= 3) unlockAchievement("three-corners", "Kartograph", "🧭", 50);
  // Last, so the achievement toast does not replace it.
  if (window.FB?.firebaseReady) toast(vis === "all"
    ? `✅ <strong>${escapeHtml(name)}</strong> ist eingetragen — alle sehen den Spot sofort auf Karte und Liste. +50 Aura 🍻`
    : `${VISIBILITY[vis].emoji} <strong>${escapeHtml(name)}</strong> ist eingetragen — ${vis === "friends" ? T("nur du und deine engen Freunde sehen ihn", "only you and your close friends see it") : T("nur du siehst ihn", "only you see it")}. +${PRIVATE_SPOT_AURA} Aura`, "at-corner", () => openDetail(spot.id));
}

function openLightbox(src, author) { $("#lightbox-img").src = src; $("#lightbox-author").textContent = author ? `📸 von ${author}` : ""; $("#lightbox").classList.add("open"); addXp(2, "Lightbox"); }

// Totals and names of everyone from the slim copy, my own logins in full
// (35-slim-data.js). A listener attached before sign-in is refused; try again
// once signed in.
function listenPoints(attempt = 0) {
  if (!window.FB?.firebaseReady) return;
  listenRewardStore("aura", () => { ensurePointIdentity(false); updateNicknameBar(); renderFriendsBar(); if (STATE.view === "leaderboard") renderLeaderboard(); if (STATE.view === "profile") renderProfile(); scheduleStartCircles(); deferSlim("myVisits", watchMyVisits); deferSlim("myCompliments", watchMyCompliments); deferSlim("myInvite", ensureMyInviteToken); deferSlim("myBlocks", watchMyBlocks); },
    () => retryListenerAfterAuth(listenPoints, attempt));
}

function listenKarmaPoints(attempt = 0) {
  if (!window.FB?.firebaseReady) return;
  listenRewardStore("karma", () => { ensurePointIdentity(false); if (STATE.view === "leaderboard") renderLeaderboard(); if (STATE.view === "profile") renderProfile(); },
    () => retryListenerAfterAuth(listenKarmaPoints, attempt));
}

// One row per person: all logins of a profile are added up.
function getRewardLeaders(kind, limit = 10) {
  const me = currentUserKey();
  const myRoot = myRootKey();
  const roots = new Set();
  Object.keys(rewardStore(kind) || {}).forEach((k) => roots.add(isMyKey(k) ? myRoot : profileRoot(k)));
  return [...roots].map((root) => {
    const mine = root === myRoot;
    return {
      user: mine ? me : root,
      total: identityRewardTotal(kind, root, mine),
      nickname: (mine ? STATE.nickname : identityNickname(root)) || root
    };
  }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, limit);
}

function renderRewardLeaderboard(container, {
  kind = "aura",
  title = kind === "karma" ? T("Karma-Ranking", "Karma Ranking") : T("Aura-Ranking", "Aura Ranking"),
  emptyText = kind === "karma" ? T("Noch keine Karma-Punkte gesammelt.", "No karma points collected yet.") : T("Noch keine Aura gesammelt.", "No aura collected yet."),
  accent = kind === "karma" ? "var(--green)" : "var(--blue)"
} = {}) {
  if (!container) return;
  const sorted = getRewardLeaders(kind);
  if (!sorted.length) {
    container.innerHTML = `<div class="leaderboard-section"><h3>${kind === "karma" ? "🎁" : "✨"} ${title}</h3><p style="color:var(--fg-dim);font-size:13px;">${emptyText}</p></div>`;
    return;
  }
  container.innerHTML = `<div class="leaderboard-section"><h3>${kind === "karma" ? "🎁" : "✨"} ${title}</h3><ul class="leaderboard-list">${sorted.map((x, i) => { const level = getLevel(x.total).level; const tier = getLevelTier(level); const team = TEAMS[STATE.teams[x.user]?.team] || TEAMS[x.user === currentUserKey() ? STATE.team : ""]; return `<li class="leaderboard-item ${x.user === currentUserKey() ? 'current-user' : ''}"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span><span class="lb-name lb-person" data-user-profile="${escapeHtml(x.user)}">${team?.emoji || '👤'} ${escapeHtml(x.nickname)} ${x.user === currentUserKey() ? T('(du)', '(you)') : ''}</span><span class="lb-score" style="color:${accent};">${tier.emoji} Lv.${level} · ${x.total}</span></li>`; }).join("")}</ul></div>`;
}

function renderPointsLeaderboard() {
  const container = $("#leaderboard-points");
  renderRewardLeaderboard(container, { kind: "aura" });
}

function renderKarmaLeaderboard() {
  const container = $("#leaderboard-karma");
  renderRewardLeaderboard(container, { kind: "karma" });
}

function getAchievementCardsHtml() {
  const items = [
    { id: "first-login", name: "Willkommen", emoji: "👋", desc: "Account erstellt" },
    { id: "first-checkin", name: "Erster Besuch", emoji: "📍", desc: "Erstes Check-in" },
    { id: "first-corner", name: "Entdecker", emoji: "🗺️", desc: "Ersten Corner hinzugefügt" },
    { id: "first-photo", name: "Fotograf", emoji: "📸", desc: "Erstes Foto hochgeladen" },
    { id: "first-comment", name: "Kommentator", emoji: "💬", desc: "Erster Kommentar" },
    { id: "five-checkins", name: "Stammgast", emoji: "🔥", desc: "5 Check-ins" },
    { id: "ten-checkins", name: "Local Legend", emoji: "👑", desc: "10 Check-ins" },
    { id: "three-corners", name: "Kartograph", emoji: "🧭", desc: "3 Corners hinzugefügt" },
    { id: "first-capture", name: "Eroberer", emoji: "🏴", desc: "Ersten Corner erobert" },
    { id: "first-encounter", name: "Nicht allein", emoji: "🤝", desc: "Mit einem Freund eingecheckt" },
    { id: "three-encounters", name: "Cliquen-Kern", emoji: "👥", desc: "Mit 3 Freunden gecornert" },
    { id: "five-encounters", name: "Rudelführer", emoji: "🐺", desc: "Mit 5 Freunden gecornert" },
    { id: "ten-encounters", name: "Ganz Minga kennt di", emoji: "🏙️", desc: "Mit 10 Freunden gecornert" },
    { id: "twenty-encounters", name: "Stadtbekannt", emoji: "🌆", desc: "Mit 20 Freunden gecornert" },
    { id: "fifty-encounters", name: "Minga-Legende", emoji: "🦁", desc: "Mit 50 Freunden gecornert" },
    { id: "first-dm", name: "Erste DM", emoji: "✉️", desc: "Erste Nachricht geschrieben" },
    { id: "three-chats", name: "Quasselstrippe", emoji: "🗣️", desc: "Mit 3 Leuten geschrieben" },
    { id: "five-chats", name: "Sozialer Schmetterling", emoji: "🦋", desc: "Mit 5 Leuten geschrieben" },
    { id: "ten-chats", name: "Netzwerker", emoji: "🕸️", desc: "Mit 10 Leuten geschrieben" },
    { id: "twenty-chats", name: "Stimme von Minga", emoji: "📣", desc: "Mit 20 Leuten geschrieben" },
    { id: "checkins-25", name: "Eckensteher Deluxe", emoji: "🍻", desc: "25 Check-ins gesamt" },
    { id: "checkins-50", name: "Corner-Institution", emoji: "🏛️", desc: "50 Check-ins gesamt" },
    { id: "checkins-100", name: "Unsterblich", emoji: "⭐", desc: "100 Check-ins gesamt" },
    { id: "qr-scanned", name: "Code-Knacker", emoji: "🧾", desc: "Per QR-Code eingecheckt" },
    { id: "first-supply", name: "Retter in der Not", emoji: "🆘", desc: "Nachschub-Ruf gesendet" },
    { id: "team-spirit", name: "Teamgeist", emoji: "🧬", desc: "Einem Team beigetreten" },
    { id: "team-founder", name: "Gründer", emoji: "🚩", desc: "Eigenes Team gegründet" },
    { id: "recruiter", name: "Anwerber", emoji: "📨", desc: "Freunde eingeladen" },
    { id: "always-on", name: "Immer erreichbar", emoji: "🔔", desc: "Push aktiviert" },
    { id: "secured", name: "Abgesichert", emoji: "🔐", desc: "Profil gesichert (Google/Code)" },
    { id: "first-gossip", name: "Klatschbase", emoji: "🗣️", desc: "Erste Gossip-Story erzählt" },
    { id: "gossip-bomb", name: "Bombe geplatzt", emoji: "💣", desc: "Gossip mit Ø „Bombe!“ (ab 2 Bewertungen)" },
    { id: "gossip-jury", name: "Gossip-Jury", emoji: "⚖️", desc: "10 Gossip-Storys bewertet" },
    { id: "gossip-legend", name: "Stammtisch-Legende", emoji: "👑", desc: "10 Gossip-Storys erzählt" },
    { id: "first-cornerdate", name: "Date-Planer", emoji: "📅", desc: "Erstes Cornerdate geplant" },
    { id: "level-100", name: "Vollendet", emoji: "🏆", desc: `Level ${MILESTONE_LEVEL} erreicht` }
  ];
  return items.map((a) => `<div class="achievement-card ${STATE.achievements.includes(a.id) ? 'unlocked' : 'locked'}"><div class="achievement-emoji">${a.emoji}</div><div class="achievement-name">${a.name}</div><div class="achievement-pts">${a.desc}</div></div>`).join("");
}

function renderAchievementsSection() {
  $("#achievements-section").innerHTML = `<div class="leaderboard-section"><h3>🏆 Achievements</h3><p style="font-size:12px;color:var(--fg-dim);margin:0 0 14px;">${T("Schalte Achievements frei durch Aktivität!", "Unlock achievements through activity!")}</p><div class="achievements-grid">${getAchievementCardsHtml()}</div></div>`;
}

function getTeamBattleRows() {
  return TEAM_ORDER.map((teamId) => {
    const held = Object.entries(STATE.captured).filter(([, capture]) => capture?.team === teamId);
    const total = Math.max(held.length, Object.values(STATE.captureHistory).filter((entry) => entry.team === teamId).length);
    return { teamId, total, held };
  }).sort((a, b) => b.total - a.total || b.held.length - a.held.length);
}

function renderTeamBattleSection() {
  const rows = getTeamBattleRows();
  $("#team-battle-section").innerHTML = `<div class="team-battle-section"><h3>⚔️ ${T("Team Battles", "Team Battles")}</h3>${rows.map((row) => `<div class="team-battle-item"><span class="tb-emoji">${TEAMS[row.teamId].emoji}</span><span class="tb-name">${TEAMS[row.teamId].name}<br><small>${row.held.length ? row.held.map(([cornerId]) => escapeHtml(getAllCorners().find((c) => c.id === cornerId)?.name || cornerId)).join(', ') : T('Noch keine gehaltenen Corner', 'No corners held yet')}</small></span><div class="tb-bar"><div class="tb-bar-fill" style="width:${Math.min(100, Math.max(4, row.total * 8))}%;background:${TEAMS[row.teamId].color};"></div></div><span class="tb-score">${row.total}</span></div>`).join("")}</div>`;
}

function renderLeaderboard() {
  const helpBtn = $("#points-help-btn");
  if (helpBtn) helpBtn.textContent = "📖 " + T("So sammelst du Punkte", "How to earn points");
  renderPopularCorner();
  renderTeamBattleSection();
  renderVisitLeaderboard();
  renderContributorsLeaderboard();
  renderPointsLeaderboard();
  renderKarmaLeaderboard();
  renderAchievementsSection();
}

function buildNotifSettingsHtml() {
  const pref = STATE.notifPref;
  const blocked = STATE.notifSettings || {};
  const blockedTeams = blocked.blockedTeams || [];
  const blockedUsers = blocked.blockedUsers || [];
  const teamChips = Object.entries(TEAMS).map(([id, t]) =>
    `<button class="team-chip ${blockedTeams.includes(id) ? "muted" : ""}" data-team="${id}">${t.emoji} ${t.name}</button>`
  ).join("");
  const knownUsers = Object.values(STATE.friends || {});
  const userRows = knownUsers.length
    ? knownUsers.map((f) => {
        const fid = f.id;
        if (!fid) return "";
        const isMuted = blockedUsers.includes(fid);
        const teamEmoji = TEAMS[f.team]?.emoji || "👤";
        return `<div class="user-filter-item">
          <span>${teamEmoji}</span>
          <span class="ufi-name">${escapeHtml(f.nickname || f.name || fid)}</span>
          <button class="ufi-toggle ${isMuted ? "muted" : ""}" data-user="${fid}">${isMuted ? "🔕 Stumm" : "🔔 Aktiv"}</button>
        </div>`;
      }).join("")
    : `<p style="color:var(--fg-dim);font-size:13px;margin:4px 0 0;">${T("Keine Nutzer derzeit online.", "No users currently online.")}</p>`;
  return `
    <div class="notif-settings-label">${T("Modus", "Mode")}</div>
    <div class="notif-options">
      <button class="notif-opt ${pref === "all" ? "active" : ""}" data-pref="all">${T("Alle", "All")}</button>
      <button class="notif-opt ${pref === "team" ? "active" : ""}" data-pref="team">${T("Nur mein Team", "My team only")}</button>
      <button class="notif-opt ${pref === "off" ? "active" : ""}" data-pref="off">${T("Aus", "Off")}</button>
    </div>
    ${pref !== "off" ? `
    <div class="notif-settings-label">${T("Teams stummschalten", "Mute teams")}</div>
    <div class="team-filter-chips">${teamChips}</div>
    <div class="notif-settings-label">${T("Nutzer stummschalten", "Mute users")}</div>
    <div class="user-filter-list">${userRows}</div>` : ""}
    <div style="margin-top:14px;">
      <button class="notif-opt" id="enable-push-btn">🔔 ${T("Push verbinden", "Connect push")}</button>
    </div>
    <div class="notif-settings-label">${T("Handy gesperrt?", "Phone locked?")}</div>
    <p class="notif-hint">${T(
      "Du bleibst eingecheckt und für die anderen sichtbar (mit 💤), auch wenn dein Display aus ist — Push-Nachrichten (Nachschub, Gossip-Runden) kommen trotzdem an. Live-GPS und In-App-Hinweise pausieren, bis du die App wieder öffnest.",
      "You stay checked in and visible to the others (with 💤) while your screen is off — push messages (supplies, gossip rounds) still arrive. Live GPS and in-app alerts pause until you reopen the app.")}</p>
    ${wakeLockSupported() ? `<button class="notif-opt ${keepAwakeWhileCheckedIn() ? "active" : ""}" id="keep-awake-btn">📱 ${keepAwakeWhileCheckedIn()
      ? T("Display bleibt an, solange ich eingecheckt bin", "Screen stays on while I'm checked in")
      : T("Display wach halten, solange ich eingecheckt bin", "Keep screen on while checked in")}</button>
    <p class="notif-hint">${T("Kostet Akku — praktisch, wenn das Handy beim Cornern auf dem Tisch liegt. Während Gossip-Runden bleibt das Display automatisch an.", "Costs battery — handy when your phone lies on the table. During gossip rounds the screen stays on automatically.")}</p>` : ""}
    <div class="notif-settings-label">WhatsApp</div>
    <button class="notif-opt ${autoWhatsAppOnCheckin() ? "active" : ""}" id="auto-wa-btn">📲 ${autoWhatsAppOnCheckin()
      ? T("WhatsApp öffnet nach jedem Check-in", "WhatsApp opens after every check-in")
      : T("Nach jedem Check-in WhatsApp öffnen", "Open WhatsApp after every check-in")}</button>
    <p class="notif-hint">${T("Die Nachricht ist fertig geschrieben (wo du bist, wer schon da ist, Link) — du wählst nur noch Chat oder Gruppe und tippst auf Senden. Ganz ohne Tippen geht's nicht: WhatsApp lässt Apps nicht von selbst in Chats posten.", "The message is ready (where you are, who's there, link) — you just pick the chat or group and tap send. Fully automatic isn't possible: WhatsApp doesn't let apps post into chats on their own.")}</p>`;
}

/* ---- Visit-history map: heat-style dots sized by how often you were there ---- */
