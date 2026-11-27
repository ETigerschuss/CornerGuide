/* ====================== EDIT OWN CORNER ====================== */
// Only the creator (or the host) may edit a user-created spot.
function canEditCorner(c) {
  if (!c || !c.isCustom) return false;
  if (c.ownerKey) return isMyKey(c.ownerKey);   // private corners: only the owner
  if (STATE.isAdmin) return true;
  if (!STATE.nickname) return false;
  return c.createdById ? isMyKey(c.createdById) : c.createdBy === STATE.nickname;
}
var CE_VISIBILITY = "all";

function openCornerEditor(cornerId) {
  const c = getAllCorners().find((x) => x.id === cornerId);
  if (!c || !canEditCorner(c)) return;
  const overlay = $("#corner-edit-overlay");
  if (!overlay) return;
  $("#ce-name").value = c.name || "";
  $("#ce-area").value = c.area || "";
  $("#ce-desc").value = getDescription(c) || "";
  $("#ce-tags").value = Array.isArray(c.tags) ? c.tags.join(", ") : "";
  CE_VISIBILITY = cornerVisibility(c);
  const vbox = $("#ce-visibility");
  if (vbox) {
    vbox.innerHTML = visibilityPickerHtml(CE_VISIBILITY);
    $("#ce-visibility-hint").textContent = visibilityHint(CE_VISIBILITY);
    bindVisibilityPicker(vbox, (v) => { CE_VISIBILITY = v; $("#ce-visibility-hint").textContent = visibilityHint(v); });
  }
  const close = () => { overlay.style.display = "none"; };
  $("#ce-cancel").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  $("#ce-save").onclick = () => saveCornerEdit(cornerId);
  $("#ce-delete").style.display = "";
  $("#ce-delete").onclick = async () => {
    if (!(await appConfirm(`Spot „${c.name}" löschen?`, "Der Spot verschwindet für alle. Das ist endgültig.", "Löschen"))) return;
    close();
    await deleteOwnCorner(cornerId);
  };
  overlay.style.display = "flex";
  setTimeout(() => $("#ce-name")?.focus(), 100);
}

async function saveCornerEdit(cornerId) {
  const c = getAllCorners().find((x) => x.id === cornerId);
  if (!c || !canEditCorner(c)) return;
  const name = $("#ce-name").value.trim();
  const desc = $("#ce-desc").value.trim();
  if (!name) { toast("Bitte einen Namen eingeben."); return; }
  const updated = {
    ...c,
    name: name.slice(0, 80),
    area: $("#ce-area").value.trim().slice(0, 60) || "Eigener Spot",
    description: desc.slice(0, 500),
    tags: $("#ce-tags").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8),
    editedAt: Date.now()
  };
  // Who sees it may change too: then the spot moves to the other place.
  const fromPath = cornerDbPath(c);
  const target = { ...cleanCornerData(updated) };
  delete target.visibility; delete target.ownerKey;
  if (CE_VISIBILITY !== "all") { target.visibility = CE_VISIBILITY; target.ownerKey = c.ownerKey || myRootKey(); }
  const toPath = cornerDbPath(target);
  const idx = STATE.customSpots.findIndex((s) => s.id === cornerId);
  if (CE_VISIBILITY === "all" && idx >= 0) STATE.customSpots[idx] = target;
  saveCustomSpots();
  // A local per-device description override would mask the new shared text.
  localStorage.removeItem("cg.desc." + cornerId);
  if (window.FB?.firebaseReady) {
    try {
      const updates = { [toPath]: target };
      if (fromPath !== toPath) {
        updates[fromPath] = null;
        if (CE_VISIBILITY !== "all") updates[`cornerFacts/${cornerId}`] = null;   // nothing about it stays public
      }
      await window.FB.update(window.FB.ref(window.FB.db), updates);
      if (fromPath !== toPath && CE_VISIBILITY !== "all") STATE.customSpots = STATE.customSpots.filter((s) => s.id !== cornerId);
    } catch (err) {
      console.warn("saveCornerEdit failed:", err);
      toast("⚠️ Änderung konnte nicht gespeichert werden.");
      return;
    }
  }
  $("#corner-edit-overlay").style.display = "none";
  renderCards(); updateCounts(); rebuildMainMarkers();
  openDetail(cornerId);
  toast(`✅ <strong>${escapeHtml(updated.name)}</strong> aktualisiert`);
}

async function deleteOwnCorner(cornerId) {
  const c = getAllCorners().find((x) => x.id === cornerId);
  if (!c || !canEditCorner(c)) return;
  if (window.FB?.firebaseReady) {
    try { await window.FB.remove(window.FB.ref(window.FB.db, cornerDbPath(c))); }
    catch (err) { console.warn("deleteOwnCorner failed:", err); toast("⚠️ Löschen fehlgeschlagen."); return; }
  }
  if (STATE.privateCorners?.[cornerId]) delete STATE.privateCorners[cornerId];
  STATE.customSpots = STATE.customSpots.filter((s) => s.id !== cornerId);
  saveCustomSpots();
  closeDetail();
  renderCards(); updateCounts(); rebuildMainMarkers();
  toast(`🗑️ Spot „${escapeHtml(c.name)}" gelöscht`);
}

/* ====================== APP DIALOG (prompt/confirm replacement) ====================== */
var _dialogResolve = null;
function _closeDialog(result) {
  const ov = $("#app-dialog");
  if (ov) ov.style.display = "none";
  document.removeEventListener("keydown", _dialogKeyHandler);
  if (_dialogResolve) { const r = _dialogResolve; _dialogResolve = null; r(result); }
}
function _dialogKeyHandler(e) {
  if (e.key === "Escape") _closeDialog(null);
  if (e.key === "Enter" && document.activeElement === $("#app-dialog-input")) $("#app-dialog-ok").click();
}
function showDialog({ title, text = "", input = false, value = "", placeholder = "", okLabel = "OK", cancelLabel = "Abbrechen", codeStyle = false, danger = false }) {
  return new Promise((resolve) => {
    // If a dialog is already open, cancel it first.
    if (_dialogResolve) _closeDialog(null);
    _dialogResolve = resolve;
    $("#app-dialog-title").textContent = title || "";
    $("#app-dialog-text").textContent = text || "";
    $("#app-dialog-text").style.display = text ? "" : "none";
    const inp = $("#app-dialog-input");
    inp.style.display = input ? "" : "none";
    inp.value = value || "";
    inp.placeholder = placeholder || "";
    inp.classList.toggle("code-input", !!codeStyle);
    const ok = $("#app-dialog-ok");
    ok.textContent = okLabel;
    ok.style.borderColor = danger ? "var(--pink)" : "";
    ok.style.color = danger ? "var(--pink)" : "";
    $("#app-dialog-cancel").textContent = cancelLabel;
    ok.onclick = () => _closeDialog(input ? inp.value.trim() : true);
    $("#app-dialog-cancel").onclick = () => _closeDialog(null);
    const ov = $("#app-dialog");
    ov.onclick = (e) => { if (e.target === ov) _closeDialog(null); };
    ov.style.display = "flex";
    document.addEventListener("keydown", _dialogKeyHandler);
    if (input) setTimeout(() => inp.focus(), 80);
  });
}
function appPrompt(title, value = "", placeholder = "", opts = {}) {
  return showDialog({ title, input: true, value, placeholder, ...opts });
}
async function appConfirm(title, text = "", okLabel = "Ja") {
  const r = await showDialog({ title, text, okLabel, danger: true });
  return r === true;
}

/* ====================== FEEDBACK TO THE MAKERS ====================== */
async function sendAppFeedback() {
  if (!window.FB?.firebaseReady || !STATE.nickname) { toast(T("Feedback braucht eine Verbindung und einen Namen.", "Feedback needs a connection and a name.")); return; }
  const text = await appPrompt(T("💡 Idee oder Problem", "💡 Idea or problem"), "", T("Was sollen wir besser machen?", "What should we improve?"), { text: T("Geht direkt an die Admins.", "Goes straight to the admins."), okLabel: T("Senden", "Send") });
  if (!text || !text.trim()) return;
  const { db, ref, push, set } = window.FB;
  try {
    await set(push(ref(db, "feedback")), {
      by: currentUserKey(), name: String(STATE.nickname).slice(0, 40), text: text.trim().slice(0, 1000),
      at: Date.now(), view: STATE.view || "", corner: STATE.detailCornerId || "", lang: STATE.lang || "de"
    });
    const admins = await adminUids();
    sendTargetedPush(admins, { type: "feedback", title: "💡 Neues Feedback", body: `${STATE.nickname}: ${text.trim().slice(0, 120)}`, query: "?feedback=1" });
    addXp(3, "Feedback gegeben");
    toast(T("💡 Danke! Ist bei den Admins angekommen.", "💡 Thanks! The admins got it."));
  } catch (err) {
    console.warn("sendAppFeedback failed:", err);
    toast(T("Konnte nicht gesendet werden.", "Could not send."));
  }
}

async function renderAdminFeedback() {
  const el = $("#admin-feedback");
  if (!el || !window.FB?.firebaseReady) return;
  try {
    const data = (await window.FB.get(window.FB.ref(window.FB.db, "feedback"))).val() || {};
    const rows = Object.entries(data).map(([id, f]) => ({ id, ...f })).sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).slice(0, 30);
    el.innerHTML = rows.length ? rows.map((f) => `<div class="admin-fb">
        <div style="font-size:11px;color:var(--fg-dim);">${escapeHtml(f.name || "?")} · ${new Date(Number(f.at || 0)).toLocaleString("de-DE")}</div>
        <div style="font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(f.text || "")}</div>
        <button class="action-btn" data-fb-del="${escapeHtml(f.id)}" style="padding:3px 8px;font-size:10px;margin-top:4px;">✓ ${T("Erledigt", "Done")}</button>
      </div>`).join("") : `<p style="color:var(--fg-dim);font-size:12px;">${T("Noch kein Feedback.", "No feedback yet.")}</p>`;
    el.querySelectorAll("[data-fb-del]").forEach((b) => b.addEventListener("click", async () => {
      await window.FB.remove(window.FB.ref(window.FB.db, "feedback/" + b.dataset.fbDel)).catch(() => {});
      renderAdminFeedback();
    }));
  } catch (err) {
    el.innerHTML = `<p style="color:var(--pink);font-size:12px;">${T("Konnte Feedback nicht laden (Regeln deployed?).", "Could not load feedback (rules deployed?).")}</p>`;
  }
}

/* "Zähl die check-ins pro Person nur einmal pro Tag, lösche auch zu viele
   check-ins!" — keeps the first check-in per person, corner and day.      */
async function adminDedupeVisits() {
  if (!STATE.isAdmin || !window.FB?.firebaseReady) return;
  const { db, ref, get, update } = window.FB;
  const data = (await get(ref(db, "visits"))).val() || {};
  const updates = {};
  Object.entries(data).forEach(([cornerId, entries]) => {
    const seen = new Set();
    Object.entries(entries || {}).sort((a, b) => Number(a[1]?.time || 0) - Number(b[1]?.time || 0)).forEach(([vid, v]) => {
      if (!v) return;
      const k = `${v.userId || v.user || "?"}|${new Date(Number(v.time || 0)).toDateString()}`;
      if (seen.has(k)) updates[`visits/${cornerId}/${vid}`] = null; else seen.add(k);
    });
  });
  const n = Object.keys(updates).length;
  if (!n) { toast(T("Keine doppelten Check-ins gefunden. ✨", "No duplicate check-ins found. ✨")); return; }
  if (!(await appConfirm(T(`${n} doppelte Check-ins löschen?`, `Delete ${n} duplicate check-ins?`), T("Pro Person, Corner und Tag bleibt der erste Check-in.", "The first check-in per person, corner and day stays."), T("Aufräumen", "Clean up")))) return;
  try {
    await update(ref(db), updates);
    toast(T(`🧹 ${n} doppelte Check-ins gelöscht`, `🧹 ${n} duplicate check-ins deleted`));
  } catch (err) { toast(T("Aufräumen fehlgeschlagen.", "Cleanup failed.")); }
}

/* ====================== ADMIN PANEL (host only) ====================== */
const ADMIN_USER_NODES = ["points", "karmaPoints", "presence", "teams", "achievements", "pushTokens", "userPrefs", "userProfiles", "liveLocations"];

async function adminDeleteProfile(key, nickname) {
  if (!STATE.isAdmin || !window.FB?.firebaseReady) return;
  if (!(await appConfirm(`Profil „${nickname || key}" löschen?`, "Wird überall entfernt (Punkte, Presence, Team, Achievements). Das ist endgültig.", "Endgültig löschen"))) return;
  const { db, ref, remove } = window.FB;
  try {
    await Promise.all(ADMIN_USER_NODES.map((node) => remove(ref(db, node + "/" + key)).catch(() => {})));
    toast(`🗑️ Profil „${escapeHtml(nickname || key)}" gelöscht`);
    renderAdminPanel();
  } catch (err) {
    console.warn("adminDeleteProfile failed:", err);
    toast("Löschen fehlgeschlagen.");
  }
}

async function adminDeleteCorner(cornerId, name) {
  if (!STATE.isAdmin || !window.FB?.firebaseReady) return;
  if (!(await appConfirm(`Spot „${name || cornerId}" löschen?`, "Der Spot verschwindet für alle Nutzer.", "Löschen"))) return;
  const { db, ref, remove } = window.FB;
  try {
    await remove(ref(db, "corners/" + cornerId));
    STATE.customSpots = STATE.customSpots.filter((s) => s.id !== cornerId);
    renderCards(); rebuildMainMarkers(); updateCounts();
    toast(`🗑️ Spot „${escapeHtml(name || cornerId)}" gelöscht`);
    renderAdminPanel();
  } catch (err) {
    console.warn("adminDeleteCorner failed:", err);
    toast("Löschen fehlgeschlagen.");
  }
}

async function adminCleanPresence() {
  if (!STATE.isAdmin || !window.FB?.firebaseReady) return;
  const { db, ref, get, remove } = window.FB;
  try {
    const snap = await get(ref(db, "presence"));
    const data = snap.val() || {};
    const stale = Object.entries(data).filter(([, v]) => !presenceIsVisible(v));
    if (!stale.length) { toast("Keine Geister gefunden. ✨"); return; }
    await Promise.all(stale.map(([k]) => remove(ref(db, "presence/" + k)).catch(() => {})));
    toast(`🧹 ${stale.length} Geister-Presence entfernt`);
  } catch (err) {
    console.warn("adminCleanPresence failed:", err);
    toast("Aufräumen fehlgeschlagen.");
  }
}

/* Find people whose XP got split across several identity keys (same nickname,
   different keys). "Anonym" is excluded on purpose — those are usually
   different people who never picked a name. */
function findDuplicateProfiles(pointsData) {
  const groups = {};
  Object.entries(pointsData || {}).forEach(([key, p]) => {
    const nick = ((p && p.nickname) || "").trim();
    if (!nick || nick.toLowerCase() === "anonym") return;
    (groups[nick.toLowerCase()] = groups[nick.toLowerCase()] || []).push({ key, nickname: nick, total: (p && p.total) || 0 });
  });
  return Object.values(groups)
    .filter((entries) => entries.length > 1)
    .map((entries) => entries.sort((a, b) => b.total - a.total));
}

async function renderAdminDuplicates(pointsData) {
  const el = $("#admin-dupes");
  if (!el) return;
  const groups = findDuplicateProfiles(pointsData);
  if (!groups.length) { el.innerHTML = `<p style="color:var(--fg-dim);font-size:12px;">Keine doppelten Profile. ✨</p>`; return; }
  el.innerHTML = groups.map((g, gi) => {
    const sum = g.reduce((s, e) => s + e.total, 0);
    return `<div style="padding:10px 12px;background:var(--bg-3);border:1px solid var(--line);border-radius:8px;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${escapeHtml(g[0].nickname)} — ${g.length} Einträge</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--fg-dim);margin-bottom:8px;">
        ${g.map((e) => `${e.total} Aura`).join(" + ")} = <strong style="color:var(--amber);">${sum} Aura</strong>
      </div>
      <button class="action-btn primary" data-merge-group="${gi}" style="padding:6px 10px;font-size:11px;">Zusammenführen</button>
    </div>`;
  }).join("");
  el.querySelectorAll("[data-merge-group]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const g = groups[parseInt(btn.dataset.mergeGroup, 10)];
      if (!g) return;
      const sum = g.reduce((s, e) => s + e.total, 0);
      if (!(await appConfirm(`„${g[0].nickname}" zusammenführen?`, `${g.length} Einträge werden zu einem Profil mit ${sum} Aura verschmolzen. Nur ausführen, wenn das wirklich dieselbe Person ist.`, "Zusammenführen"))) return;
      const target = g[0].key;               // keep the richest key
      let ok = 0;
      for (const e of g.slice(1)) {
        if (await mergeProfileKeys(e.key, target)) ok++;
      }
      toast(ok ? `🔗 „${escapeHtml(g[0].nickname)}" zusammengeführt (${sum} Aura)` : "Zusammenführen fehlgeschlagen.");
      renderAdminPanel();
    });
  });
}

async function renderAdminPanel() {
  const overlay = $("#admin-overlay");
  if (!overlay || !STATE.isAdmin) return;
  overlay.style.display = "flex";
  $("#admin-close").onclick = () => { overlay.style.display = "none"; };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
  $("#admin-clean-presence").onclick = adminCleanPresence;
  $("#admin-dedupe-visits").onclick = adminDedupeVisits;
  renderAdminFeedback();
  renderAdminInvites();
  const profilesEl = $("#admin-profiles");
  profilesEl.innerHTML = `<p style="color:var(--fg-dim);font-size:12px;">Lade…</p>`;
  try {
    const snap = await window.FB.get(window.FB.ref(window.FB.db, "points"));
    const data = snap.val() || {};
    renderAdminDuplicates(data);
    const rows = Object.entries(data)
      .map(([key, p]) => ({ key, nickname: (p && p.nickname) || key, total: (p && p.total) || 0 }))
      .sort((a, b) => b.total - a.total);
    profilesEl.innerHTML = rows.map((r) => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-3);border:1px solid var(--line);border-radius:8px;margin-bottom:6px;">
        <span style="flex:1;font-size:13px;">${escapeHtml(r.nickname)}${r.key === currentUserKey() ? " (du)" : ""}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--fg-dim);">${r.total} Aura</span>
        ${r.key !== currentUserKey() ? `<button class="action-btn admin-row-btn" data-admin-del-user="${escapeHtml(r.key)}" data-nick="${escapeHtml(r.nickname)}">Löschen</button>` : ""}
      </div>`).join("") || `<p style="color:var(--fg-dim);font-size:12px;">Keine Profile.</p>`;
    profilesEl.querySelectorAll("[data-admin-del-user]").forEach((b) =>
      b.addEventListener("click", () => adminDeleteProfile(b.dataset.adminDelUser, b.dataset.nick)));
  } catch (err) {
    profilesEl.innerHTML = `<p style="color:var(--pink);font-size:12px;">Konnte Profile nicht laden (Regeln deployed?).</p>`;
  }
  const cornersEl = $("#admin-corners");
  const spots = STATE.customSpots || [];
  cornersEl.innerHTML = spots.map((s) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-3);border:1px solid var(--line);border-radius:8px;margin-bottom:6px;">
      <span style="flex:1;font-size:13px;">${escapeHtml(s.name)} <span style="color:var(--fg-dim);font-size:11px;">von ${escapeHtml(s.createdBy || "?")}</span></span>
      <button class="action-btn admin-row-btn" data-admin-del-corner="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}">Löschen</button>
    </div>`).join("") || `<p style="color:var(--fg-dim);font-size:12px;">Keine eigenen Spots.</p>`;
  cornersEl.querySelectorAll("[data-admin-del-corner]").forEach((b) =>
    b.addEventListener("click", () => adminDeleteCorner(b.dataset.adminDelCorner, b.dataset.name)));
}

// Is this profile safe if the browser forgets everything?
function profileBackupState() {
  const online = !!window.FB?.firebaseReady;
  const info = window.FB?.getAccountInfo?.() || { anonymous: true, email: "", providers: [] };
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  return { online, info, linked: online && !info.anonymous, code: savedRecoveryCode(), iosBrowser: isIOS && !standalone };
}

// iPhone in Safari: the home-screen app starts with its own (empty) storage.
// Tell people what to do there — pick their name — before they wonder.
function buildBackupBannerHtml() {
  const st = profileBackupState();
  if (!st.online || st.linked || !STATE.nickname || !st.iosBrowser) return "";
  return `<div class="backup-banner">${T("📲 iPhone: Fügst du die App zum Home-Bildschirm hinzu, startet sie mit eigenem Speicher — tipp dort bei „Wer bist du?“ einfach deinen Namen an. Mit Google gesichert bist du überall automatisch du.", "📲 iPhone: add the app to your home screen and it starts with its own storage — just tap your name at “Who are you?” there. Secured with Google you are yourself everywhere.")}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
    <button class="action-btn primary" data-backup-action="google">🔗 ${T("Mit Google sichern", "Secure with Google")}</button>
    <button class="action-btn" data-backup-action="more">${T("Mehr…", "More…")}</button>
  </div></div>`;
}

function buildAccountSectionHtml() {
  const st = profileBackupState();
  const { online, info, linked } = st;
  const providerLabel = info.email ? escapeHtml(info.email)
    : (info.providers || []).includes("google.com") ? "Google-Konto" : T("Verknüpftes Konto", "Linked account");
  const statusLine = !online
    ? `<p style="color:var(--fg-dim);font-size:13px;">${T("Offline — Konto-Funktionen brauchen eine Verbindung.", "Offline — account features need a connection.")}</p>`
    : linked
      ? `<p style="color:var(--green);font-size:13px;margin-bottom:10px;">✅ ${T("Gesichert als", "Secured as")} <strong>${providerLabel}</strong>. ${T("Dein Profil ist auf jedem Gerät mit diesem Login verfügbar.", "Your profile is available on every device with this login.")}</p>`
      : `<p style="color:var(--fg-dim);font-size:13px;margin-bottom:10px;">${T("Du bist anonym unterwegs. Sichere dein Profil, damit es beim Browser- oder Gerätewechsel erhalten bleibt.", "You are anonymous. Secure your profile so it survives a new browser or phone.")}</p>`;
  const uid = window.FB?.getAuthUid?.() || "";
  const codeLine = online && st.code
    ? `<div class="acct-code-line">🎟️ ${T("Dein Recovery-Code", "Your recovery code")}: <strong class="acct-code">${escapeHtml(st.code)}</strong>
        <button class="action-btn" id="acct-code-share-btn" style="padding:4px 8px;font-size:11px;">📤 ${T("An mich schicken", "Send to myself")}</button></div>`
    : "";
  const buttons = online ? `
      <div class="account-actions" style="display:flex;flex-wrap:wrap;gap:8px;">
        ${linked ? "" : `<button class="notif-opt" id="acct-google-btn">🔗 ${T("Mit Google sichern", "Secure with Google")}</button>
        <button class="notif-opt" id="acct-email-btn">✉️ ${T("Mit E-Mail sichern", "Secure with email")}</button>`}
        ${st.code ? "" : `<button class="notif-opt" id="acct-code-create-btn">🎟️ ${T("Recovery-Code erstellen", "Create recovery code")}</button>`}
        <button class="notif-opt" id="acct-code-claim-btn">📥 ${T("Recovery-Code eingeben", "Enter recovery code")}</button>
        <button class="notif-opt" id="acct-claim-btn">👥 ${T("Profil wählen (Gerät gewechselt?)", "Pick your profile (new device?)")}</button>
      </div>` : "";
  const idLine = uid
    ? `<p class="acct-uid">${T("Deine Nutzer-ID", "Your user ID")}: <code>${escapeHtml(uid)}</code> <button class="action-btn" id="acct-uid-copy" style="padding:2px 8px;font-size:10px;">📋</button><br><span>${T("Brauchst du nur, wenn ein Admin dir helfen soll.", "Only needed when an admin helps you.")}</span></p>`
    : "";
  return `<div class="notification-toggle account-section" id="account-section"><h3>🔐 ${T("Konto & Profil sichern", "Secure account & profile")}</h3>${statusLine}${codeLine}${buttons}${idLine}</div>`;
}

// Reserve my own profile so it is never offered to anyone else in the claim
// list. Safe to call repeatedly: the rule allows re-writing your own lock.
async function ensureOwnProfileLock() {
  if (!window.FB?.firebaseReady || !STATE.nickname) return;
  const uid = window.FB.getAuthUid?.() || "";
  const key = currentUserKey();
  if (!uid || !key) return;
  if (localStorage.getItem("cg.profileLocked") === key) { watchOwnProfileLock(); return; }
  try {
    await window.FB.set(window.FB.ref(window.FB.db, "profileLocks/" + key), { by: uid, at: Date.now(), nickname: STATE.nickname });
    localStorage.setItem("cg.profileLocked", key);
    watchOwnProfileLock();
  } catch (err) { console.warn("ensureOwnProfileLock failed:", err); }
}

