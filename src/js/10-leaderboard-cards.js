/* ====================== LEADERBOARD ====================== */
function renderPopularCorner() {
  const container = $("#popular-corner-section");
  const all = getAllCorners();
  let maxVisits = 0;
  let popular = null;

  all.forEach((c) => {
    const v = getVisitCount(c.id);
    if (v > maxVisits) { maxVisits = v; popular = c; }
  });

  if (!popular || maxVisits === 0) {
    container.innerHTML = `<div class="popular-corner"><h3>👑 ${T("Beliebtester Corner", "Most popular corner")}</h3><p style="color:var(--fg-dim);">${T("Noch keine Besuche — checke als Erster ein!", "No visits yet — be the first to check in!")}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="popular-corner">
      <h3>👑 ${T("Beliebtester Corner", "Most popular corner")}</h3>
      <p class="popular-name">${escapeHtml(popular.name)}</p>
      <p class="popular-visits">🔥 ${maxVisits}x ${T("besucht", "visited")} · ${popular.area || "—"}</p>
    </div>
  `;
}

function renderVisitLeaderboard() {
  const container = $("#leaderboard-visits");
  const all = getAllCorners();
  const cornerVisits = all.map((c) => ({
    corner: c,
    visits: getVisitCount(c.id)
  })).filter(x => x.visits > 0).sort((a, b) => b.visits - a.visits).slice(0, 10);

  if (cornerVisits.length === 0) {
    container.innerHTML = `<div class="leaderboard-section"><h3>📊 ${T("Meistbesucht", "Most visited")}</h3><p style="color:var(--fg-dim);font-size:13px;">${T("Noch keine Besuche.", "No visits yet.")}</p></div>`;
    return;
  }

  const listHtml = cornerVisits.map((x, i) => {
    const cls = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
    const badge = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
    return `<li class="leaderboard-item ${cls}">
      <span class="lb-rank">${badge || (i + 1)}</span>
      <span class="lb-name">${escapeHtml(x.corner.name)}</span>
      <span class="lb-score">${x.visits}x</span>
    </li>`;
  }).join("");

  container.innerHTML = `<div class="leaderboard-section"><h3>📊 ${T("Meistbesucht", "Most visited")}</h3><ul class="leaderboard-list">${listHtml}</ul></div>`;
}

function renderContributorsLeaderboard() {
  const container = $("#leaderboard-contributors");
  // Count corners added by each user
  const contributors = {};
  STATE.customSpots.forEach((s) => {
    const user = s.createdBy || "Anonym";
    contributors[user] = (contributors[user] || 0) + 1;
  });

  const sorted = Object.entries(contributors).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (sorted.length === 0) {
    container.innerHTML = `<div class="leaderboard-section"><h3>🗺️ ${T("Top Entdecker", "Top Explorers")}</h3><p style="color:var(--fg-dim);font-size:13px;">${T("Noch niemand hat Corners hinzugefügt.", "Nobody has added corners yet.")}</p></div>`;
    return;
  }

  const listHtml = sorted.map(([user, count], i) => {
    const cls = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
    const badge = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
    return `<li class="leaderboard-item ${cls}">
      <span class="lb-rank">${badge || (i + 1)}</span>
      <span class="lb-name">${escapeHtml(user)}</span>
      <span class="lb-score">${count} Corner${count > 1 ? "s" : ""}</span>
    </li>`;
  }).join("");

  container.innerHTML = `<div class="leaderboard-section"><h3>🗺️ ${T("Top Entdecker", "Top Explorers")}</h3><ul class="leaderboard-list">${listHtml}</ul></div>`;
}

/* ====================== TABS ====================== */
/* ====================== CARDS ====================== */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ====================== DESCRIPTION EDITING ====================== */
function startEditDescription(cornerId) {
  const container = document.getElementById("desc-container-" + cornerId);
  if (!container) return;
  const c = getAllCorners().find((x) => x.id === cornerId);
  if (!c) return;
  const currentDesc = getDescription(c);
  const hasOverride = !c.isCustom && localStorage.getItem("cg.desc." + cornerId) !== null;

  container.innerHTML = `
    <textarea class="desc-editor" placeholder="${T("Was macht den Spot aus? Kiosk-Tipps, Toiletten, Vibes, Stories...", "What makes the spot? Kiosk tips, toilets, vibes, stories...")}">${escapeHtml(currentDesc)}</textarea>
    <div class="desc-edit-actions">
      <button class="action-btn primary" data-edit="save">✓ ${T("Speichern", "Save")}</button>
      <button class="action-btn" data-edit="cancel">${T("Abbrechen", "Cancel")}</button>
      ${hasOverride ? '<button class="action-btn danger" data-edit="reset">↻ Original</button>' : ""}
    </div>
    <p class="desc-edit-hint">${T("⌘/Strg+Enter speichert · Esc bricht ab", "⌘/Ctrl+Enter saves · Esc cancels")}</p>
  `;

  const textarea = container.querySelector(".desc-editor");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  container.querySelector('[data-edit="save"]').addEventListener("click", () => {
    saveDescription(cornerId, textarea.value);
  });
  container.querySelector('[data-edit="cancel"]').addEventListener("click", () => {
    renderCards();
  });
  const resetBtn = container.querySelector('[data-edit="reset"]');
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      localStorage.removeItem("cg.desc." + cornerId);
      renderCards();
      toast(T("Auf Original zurückgesetzt ↻", "Reset to the original ↻"));
    });
  }
  textarea.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") saveDescription(cornerId, textarea.value);
    if (e.key === "Escape") renderCards();
  });

  container.scrollIntoView({ behavior: "smooth", block: "center" });
}

function saveDescription(cornerId, newText) {
  const trimmed = newText.trim();
  const c = getAllCorners().find((x) => x.id === cornerId);
  if (!c) return;

  if (c.isCustom) {
    const idx = STATE.customSpots.findIndex((x) => x.id === cornerId);
    if (idx >= 0) {
      STATE.customSpots[idx].description = trimmed;
      saveCustomSpots();
    }
  } else {
    if (trimmed) localStorage.setItem("cg.desc." + cornerId, trimmed);
    else localStorage.removeItem("cg.desc." + cornerId);
  }
  renderCards();
  toast(trimmed ? T("Beschreibung gespeichert ✓", "Description saved ✓") : T("Beschreibung gelöscht", "Description deleted"));
}

/* ====================== MINIMAPS ====================== */
function initMinimaps() {
  Object.values(STATE.miniMaps).forEach((m) => { try { m.remove(); } catch (e) {} });
  STATE.miniMaps = {};

  if (typeof L === "undefined") {
    setTimeout(initMinimaps, 300);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (!STATE.miniMaps[el.dataset.id]) {
          createMinimap(el);
        }
        observer.unobserve(el);
      }
    });
  }, { rootMargin: "200px 0px" });

  $$(".minimap").forEach((el) => observer.observe(el));
}

function createMinimap(el) {
  const lat = parseFloat(el.dataset.lat);
  const lng = parseFloat(el.dataset.lng);
  const id = el.dataset.id;
  const isCustom = el.dataset.custom === "true";

  const map = L.map(el, {
    zoomControl: false, attributionControl: false,
    dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false,
    touchZoom: false,
    zoomSnap: 0.1
  }).setView([lat, lng], 16);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    crossOrigin: true
  }).addTo(map);

  const icon = L.divIcon({
    className: "",
    html: `<div class="minimap-marker ${isCustom ? "custom" : ""}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22]
  });
  L.marker([lat, lng], { icon, interactive: false }).addTo(map);

  setTimeout(() => map.invalidateSize(), 100);

  STATE.miniMaps[id] = map;
}

/* ====================== PHOTO UPLOAD ====================== */
function handlePhotoUpload(file, cornerId) {
  if (!file.type.startsWith("image/")) { toast(T("Das ist kein Bild.", "That's not an image.")); return; }
  compressImageFile(file, { maxDim: 800, quality: 0.7 }).then((dataUrl) => {
    try {
      // Save as cover photo in localStorage
      localStorage.setItem("cg.photo." + cornerId, dataUrl);
      // Also save to Firebase/gallery
      savePhoto(cornerId, dataUrl, "");
      renderCards();
      toast(T("Foto gespeichert 📸", "Photo saved 📸"));
      addXp(10, "Foto hochgeladen");
      unlockAchievement("first-photo", "Fotograf", "📸", 15);
    } catch (err) { toast(T("Speicher voll. Lösch ein altes Foto.", "Storage full. Delete an old photo.")); }
  }).catch((err) => {
    console.warn("Cover image compression failed:", err);
    toast(T("Bild konnte nicht verarbeitet werden.", "Couldn't process the image."));
  });
}

