/* ====================== NEW SPOT BY TAPPING ======================
   Pin from GPS, name ideas, emoji toggles (uses the spot check above). */
var SPOT_DRAFT = { check: null, amen: {}, manual: {}, key: "", timer: null, nameAuto: true, loading: false, failed: false };

function resetSpotDraft() {
  clearTimeout(SPOT_DRAFT.timer);
  SPOT_DRAFT = { check: null, amen: {}, manual: {}, key: "", timer: null, nameAuto: true, loading: false, failed: false };
  renderSpotAmenities();
  renderSpotRules();
  renderSpotNameChips();
}

function renderSpotAmenities() {
  const box = $("#spot-amenities");
  if (!box) return;
  const w = SPOT_DRAFT.check ? weedVerdict(SPOT_DRAFT.check) : null;
  box.innerHTML = SPOT_AMENITIES.map((a) => {
    const on = !!SPOT_DRAFT.amen[a.key];
    const auto = !!SPOT_DRAFT.check && !SPOT_DRAFT.manual[a.key];
    let label = T(a.de, a.en);
    if (a.key === "kiffen" && w && auto) {
      if (w.v === "night") label = T("erst ab 20 Uhr", "after 8 pm");
      else if (w.v === "no") label = T("hier nicht", "not here");
      else if (w.v === "?") label = T("andere Regeln", "other rules");
    }
    return `<button type="button" class="spot-amen ${on ? "on" : ""}" data-amen="${a.key}" aria-pressed="${on}">
      <span class="spot-amen-emoji">${a.emoji}</span><span class="spot-amen-label">${escapeHtml(label)}</span>${auto && on ? `<span class="spot-amen-auto">auto</span>` : ""}
    </button>`;
  }).join("");
  box.querySelectorAll("[data-amen]").forEach((btn) => btn.addEventListener("click", () => {
    const k = btn.dataset.amen;
    SPOT_DRAFT.amen[k] = !SPOT_DRAFT.amen[k];
    SPOT_DRAFT.manual[k] = true;
    renderSpotAmenities();
  }));
}

function spotRuleLinesHtml(res) {
  const lines = spotRuleLines(res);
  const near = [];
  [["toilette", "🚻"], ["wasser", "💧"], ["kiosk", "🏪"], ["sport", "⚽"]].forEach(([k, e]) => {
    if (res.nearest && res.nearest[k] != null) near.push(`${e} ${formatDistance(res.nearest[k])}`);
  });
  return `${lines.map((l) => `<div class="spot-rule">${l.emoji} ${escapeHtml(l.text)}${l.src ? ` <a href="${escapeHtml(l.src)}" target="_blank" rel="noopener">${T("Quelle", "Source")}</a>` : ""}</div>`).join("")}
    ${near.length ? `<div class="spot-rule dim">${T("In der Nähe", "Nearby")}: ${near.join(" · ")}</div>` : ""}
    <div class="spot-rule tiny">${T("Automatisch aus OpenStreetMap, ohne Gewähr. Gemessen bis zum Gelände (strenger als bis zum Eingang). Nie vor Kindern und Jugendlichen.", "Automatic from OpenStreetMap, no guarantee. Measured to the grounds (stricter than to the entrance). Never in front of minors.")}</div>`;
}

function renderSpotRules() {
  const box = $("#spot-rules");
  if (!box) return;
  if (SPOT_DRAFT.loading) {
    box.innerHTML = `<div class="spot-rule dim">🔎 ${T("Schaue nach, was es hier gibt und was erlaubt ist …", "Checking what's here and what's allowed …")}</div>`;
    return;
  }
  if (!SPOT_DRAFT.check) {
    box.innerHTML = SPOT_DRAFT.failed
      ? `<div class="spot-rule dim">${T("Automatische Erkennung gerade nicht erreichbar — tipp die Emojis einfach selbst an.", "Automatic check not reachable right now — just tap the emojis yourself.")}</div>`
      : "";
    return;
  }
  box.innerHTML = spotRuleLinesHtml(SPOT_DRAFT.check);
}

function renderSpotNameChips() {
  const box = $("#spot-name-chips");
  if (!box) return;
  const ideas = spotNameSuggestions(SPOT_DRAFT.check);
  box.innerHTML = ideas.map((n) => `<button type="button" class="spot-chip" data-name-idea="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("");
  box.querySelectorAll("[data-name-idea]").forEach((b) => b.addEventListener("click", () => {
    $("#f-name").value = b.dataset.nameIdea;
    SPOT_DRAFT.nameAuto = true;   // still an idea: moving the pin may replace it
    box.querySelectorAll(".spot-chip").forEach((x) => x.classList.toggle("on", x === b));
  }));
  // Pre-fill the first idea as long as nobody typed a name.
  const input = $("#f-name");
  if (input && ideas.length && (SPOT_DRAFT.nameAuto || !input.value.trim())) {
    input.value = ideas[0];
    SPOT_DRAFT.nameAuto = true;
    box.querySelector(".spot-chip")?.classList.add("on");
  }
}

function scheduleSpotCheck(lat, lng) {
  clearTimeout(SPOT_DRAFT.timer);
  SPOT_DRAFT.timer = setTimeout(() => runSpotCheck(lat, lng), 450);
}

async function runSpotCheck(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  SPOT_DRAFT.key = key;
  SPOT_DRAFT.loading = true;
  SPOT_DRAFT.failed = false;
  renderSpotRules();
  try {
    const res = await fetchSpotCheck(lat, lng);
    if (SPOT_DRAFT.key !== key) return;            // the pin moved meanwhile
    SPOT_DRAFT.check = res;
    SPOT_AMENITIES.forEach((a) => { if (!SPOT_DRAFT.manual[a.key]) SPOT_DRAFT.amen[a.key] = amenityFromCheck(a.key, res); });
  } catch (err) {
    if (SPOT_DRAFT.key !== key) return;
    console.warn("spot check failed:", err);
    SPOT_DRAFT.failed = true;
  } finally {
    if (SPOT_DRAFT.key === key) SPOT_DRAFT.loading = false;
  }
  if (SPOT_DRAFT.key !== key) return;
  renderSpotAmenities();
  renderSpotRules();
  renderSpotNameChips();
}

// Compact facts saved with the spot (card emojis, detail, nobody has to re-check).
function spotCheckSummary() {
  const res = SPOT_DRAFT.check;
  if (!res) return null;
  const w = weedVerdict(res);
  const park = res.parks.find((p) => !p.square && p.hours) || null;
  const out = { at: Date.now(), weed: w.v, why: w.why.slice(0, 3), zones: [res.acvv ? "acvv" : "", res.hbf ? "hbf" : ""].filter(Boolean) };
  if (park) out.park = { name: park.name, hours: park.hours };
  return out;
}

// "Regeln & Ausstattung" in the corner detail — for every corner, old or new.
async function renderSpotCheckBlock(corner, box) {
  if (!box || !corner || typeof corner.lat !== "number") return;
  try {
    // One request at a time: the public Overpass server limits parallel queries.
    await getNearbyPlaces(corner).catch(() => null);
    const res = await fetchSpotCheck(corner.lat, corner.lng);
    if (!isPrivateCorner(corner) && !factsFresh(STATE.cornerFacts?.[corner.id])) storeCornerFacts(corner.id, res);
    if (!box.isConnected) return;
    const have = SPOT_AMENITIES.filter((a) => a.key !== "kiffen" && amenityFromCheck(a.key, res));
    const w = weedVerdict(res);
    const weedNow = weedAllowedNow(w);
    box.innerHTML = `<div class="spot-detail-amen">${have.map((a) => `<span class="spot-pill">${a.emoji} ${escapeHtml(T(a.de, a.en))}</span>`).join("")}
        ${w.v === "?" ? "" : `<span class="spot-pill ${weedNow ? "ok" : "no"}">${weedVerdictEmoji(w.v)} ${w.v === "ok" ? T("Grünes Licht", "Green light") : w.v === "night" ? T("Grünes Licht ab 20 Uhr", "Green light from 8 pm") : T("Kein grünes Licht", "No green light")}</span>`}</div>
      ${spotRuleLinesHtml(res)}`;
  } catch (err) {
    if (box.isConnected) box.innerHTML = `<div class="ci-small">${T("Regeln gerade nicht abrufbar (OpenStreetMap).", "Rules not available right now (OpenStreetMap).")}</div>`;
  }
}

