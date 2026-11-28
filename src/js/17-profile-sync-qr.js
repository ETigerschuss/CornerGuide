/* ====================== PROFILE CLOUD SYNC & ACCOUNT PORTABILITY ====================== */
function buildProfileSnapshot() {
  const key = currentUserKey();
  return {
    nickname: STATE.nickname || "",
    team: STATE.team || "",
    points: STATE.points[key] || { total: 0, history: [] },
    karmaPoints: STATE.karmaPoints[key] || { total: 0, history: [] },
    achievements: Array.isArray(STATE.achievements) ? STATE.achievements : [],
    visitedCorners: Array.isArray(STATE.visitedCorners) ? STATE.visitedCorners : [],
    teamHistory: Array.isArray(STATE.teamHistory) ? STATE.teamHistory : [],
    updatedAt: Date.now()
  };
}

function applyProfileSnapshot(p, { silent = false } = {}) {
  if (!p || typeof p !== "object") return false;
  const key = currentUserKey();
  if (p.nickname) { STATE.nickname = p.nickname; localStorage.setItem("cg.nickname", p.nickname); }
  if (p.team) { STATE.team = p.team; localStorage.setItem(TEAM_STORAGE_KEY, p.team); }
  if (p.points && typeof p.points === "object") {
    STATE.points[key] = { ...p.points, nickname: STATE.nickname || p.points.nickname };
    savePoints();
  }
  if (p.karmaPoints && typeof p.karmaPoints === "object") {
    STATE.karmaPoints[key] = { ...p.karmaPoints, nickname: STATE.nickname || p.karmaPoints.nickname };
    saveKarmaPoints();
  }
  if (Array.isArray(p.achievements)) { STATE.achievements = p.achievements; saveAchievements(); }
  if (Array.isArray(p.visitedCorners)) { STATE.visitedCorners = p.visitedCorners; saveVisitedCorners(); }
  if (Array.isArray(p.teamHistory) && p.teamHistory.length) { STATE.teamHistory = p.teamHistory; saveTeamHistoryValue(); }
  ensurePointIdentity();
  updateNicknameBar();
  if (typeof renderFriendsBar === "function") renderFriendsBar();
  if (STATE.view === "profile") renderProfile();
  syncIdentity();
  // A restored profile brings its nickname — close the "Wer bist du?" prompt.
  if (STATE.nickname) { const np = $("#nickname-prompt"); if (np) np.style.display = "none"; }
  if (!silent) toast(T("✅ Profil übernommen", "✅ Profile taken over"));
  return true;
}

function syncProfileToCloud() {
  const uid = window.FB?.getAuthUid?.();
  if (!uid || !window.FB?.firebaseReady || !STATE.nickname) return;
  try {
    window.FB.set(window.FB.ref(window.FB.db, "userProfiles/" + uid), buildProfileSnapshot());
  } catch (err) { console.warn("syncProfileToCloud failed:", err); }
}

// var (not let): scheduleProfileSync is reachable during top-level init via
// ensurePointIdentity() -> savePoints(), which runs before this line. A `let`
// here would be in the temporal dead zone and throw, halting the rest of the script.
var _profileSyncTimer = null;
function scheduleProfileSync() {
  clearTimeout(_profileSyncTimer);
  _profileSyncTimer = setTimeout(syncProfileToCloud, 1500);
}

function loadProfileFromCloud(uid) {
  if (!uid || !window.FB?.firebaseReady) return;
  try {
    window.FB.get(window.FB.ref(window.FB.db, "userProfiles/" + uid)).then((snap) => {
      const remote = snap.val();
      if (!remote) { if (STATE.nickname) syncProfileToCloud(); return; }
      // Fresh browser but same (linked) account → no local profile yet: restore silently.
      if (!STATE.nickname) { applyProfileSnapshot(remote, { silent: true }); return; }
      // Both exist → keep whichever has more XP, then re-sync so cloud stays current.
      const localTotal = (STATE.points[currentUserKey()]?.total || 0) + (STATE.karmaPoints[currentUserKey()]?.total || 0);
      const remoteTotal = (remote.points?.total || 0) + (remote.karmaPoints?.total || 0);
      if (remoteTotal > localTotal) applyProfileSnapshot(remote, { silent: true });
      else syncProfileToCloud();
    }).catch((err) => console.warn("loadProfileFromCloud failed:", err));
  } catch (err) { console.warn("loadProfileFromCloud failed:", err); }
}

// After linking to Google/Email the UID may switch to an existing account;
// re-check the access grant so the code prompt doesn't reappear.
async function refreshAccessForCurrentUser() {
  const uid = window.FB?.getAuthUid?.();
  if (!uid || !window.FB?.firebaseReady) return;
  try {
    const snap = await window.FB.get(window.FB.ref(window.FB.db, "accessGranted/" + uid));
    if (snap.val() !== null) {
      localStorage.setItem("cg.accessGranted", "1");
      const prompt = $("#access-prompt");
      if (prompt) prompt.style.display = "none";
      reattachSharedListenersAfterGrant();
    }
  } catch (err) { console.warn("refreshAccessForCurrentUser failed:", err); }
}

/* ---- Anonymous recovery via a portable code (no account required) ---- */
function savedRecoveryCode() { return localStorage.getItem("cg.recoveryCode") || ""; }

// One code per person: reuse (and refresh) the saved one instead of minting a
// new code on every tap, so the code someone wrote down keeps working.
async function createRecoveryCode() {
  const uid = window.FB?.getAuthUid?.();
  if (!uid || !window.FB?.firebaseReady) { toast(T("Recovery-Code nur online verfügbar.", "Recovery code only available online.")); return null; }
  if (!STATE.nickname) { toast(T("Bitte zuerst einen Namen wählen.", "Please pick a name first.")); return null; }
  const fresh = () => (crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, "") : (Date.now().toString(36) + Math.random().toString(36).slice(2)))
    .slice(0, 10).toUpperCase();
  const snapshot = { ...buildProfileSnapshot(), createdBy: uid };
  try {
    // Bundle the access grant so recovering also unlocks the app in one step.
    const accessSnap = await window.FB.get(window.FB.ref(window.FB.db, "accessGranted/" + uid));
    if (accessSnap.val()) snapshot.accessCode = accessSnap.val();
  } catch (err) { /* access code is optional in the bundle */ }
  for (const code of [savedRecoveryCode(), fresh()].filter(Boolean)) {
    try {
      await window.FB.set(window.FB.ref(window.FB.db, "recoveryProfiles/" + code), snapshot);
      localStorage.setItem("cg.recoveryCode", code);
      return code;
    } catch (err) { console.warn("createRecoveryCode failed:", err); }
  }
  toast(T("Recovery-Code konnte nicht erstellt werden.", "Could not create a recovery code."));
  return null;
}

// Hand the code to the person's own chat/notes (outside this browser — that is the point).
async function shareRecoveryCode(code) {
  const text = T(`Mein Minga-Corner-Guide-Recovery-Code: ${code}\nProfil → Konto & Profil sichern → „Recovery-Code eingeben“.`, `My Minga Corner Guide recovery code: ${code}\nProfile → Secure account & profile → “Enter recovery code”.`, `Mi código de recuperación de Minga Corner Guide: ${code}\nPerfil → Asegurar cuenta y perfil → «Introducir código de recuperación».`);
  try {
    if (navigator.share) { await navigator.share({ title: "Recovery-Code", text }); return; }
  } catch (err) { if (err && err.name === "AbortError") return; }
  await copyText(code).catch(() => {});
  toast(`🎟️ <strong>${escapeHtml(code)}</strong> ${T("kopiert — schick ihn dir selbst (z. B. WhatsApp an dich).", "copied — send it to yourself (e.g. WhatsApp to yourself).")}`);
}

async function claimRecoveryCode(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) { toast(T("Bitte einen gültigen Code eingeben.", "Please enter a valid code.")); return; }
  if (!window.FB?.firebaseReady) { toast(T("Übernahme nur online möglich.", "Only possible online.")); return; }
  try {
    const snap = await window.FB.get(window.FB.ref(window.FB.db, "recoveryProfiles/" + code));
    const remote = snap.val();
    if (!remote) { toast(T("Code nicht gefunden — bitte prüfen.", "Code not found — please check.")); return; }
    const uid = window.FB.getAuthUid?.();
    // Restore access first (validate rule checks the code exists) so writes are allowed.
    if (remote.accessCode && uid) {
      try {
        await window.FB.set(window.FB.ref(window.FB.db, "accessGranted/" + uid), remote.accessCode);
        localStorage.setItem("cg.accessGranted", "1");
        const prompt = $("#access-prompt");
        if (prompt) prompt.style.display = "none";
        reattachSharedListenersAfterGrant();
      } catch (err) { console.warn("recovery access grant failed:", err); }
    }
    // The code proves ownership: this login joins the LIVE profile (points
    // earned since the code was made included); the old device stays signed in.
    let linked = false;
    const oldKey = remote.createdBy;
    if (oldKey && uid && oldKey !== uid) {
      try { linked = await linkToProfile(oldKey, { welcome: true }); }
      catch (err) { console.warn("recovery link failed:", err); }
    }
    if (!linked) {
      applyProfileSnapshot(remote, { silent: true });   // move the profile onto this device's uid
      syncProfileToCloud();                             // persist under the new uid as well
    }
    // Point the same code at this login, so it keeps working for the next switch.
    localStorage.setItem("cg.recoveryCode", code);
    createRecoveryCode().catch(() => {});
    if (!linked) toast(T(`✅ Profil „${escapeHtml(STATE.nickname || remote.nickname || "")}“ übernommen — willkommen zurück!`, `✅ Profile “${escapeHtml(STATE.nickname || remote.nickname || "")}” restored — welcome back!`, `✅ Perfil «${escapeHtml(STATE.nickname || remote.nickname || "")}» restaurado — ¡bienvenido de nuevo!`));
    if (STATE.view === "profile") renderProfile();
  } catch (err) {
    console.warn("claimRecoveryCode failed:", err);
    toast(T("Übernahme fehlgeschlagen.", "Takeover failed."));
  }
}

/* ====================== QR CODES ======================
   Two flavours: a personal code (carries me as referrer and my team, so the
   crew lands together) and a neutral sticker code (corner only) that can be
   printed and glued to the spot.                                          */
function qrImageUrl(data, size) {
  return "https://api.qrserver.com/v1/create-qr-code/?size=" + size + "x" + size + "&margin=10&data=" + encodeURIComponent(data);
}

function openQrDialog(corner) {
  const overlay = $("#qr-overlay");
  if (!overlay || !corner) return;
  const personal = buildShareUrl(corner.id, STATE.nickname || "", true);
  const sticker = buildStickerUrl(corner.id);
  const teamNote = STATE.team && TEAMS[STATE.team]
    ? `${T("inkl. Team", "incl. team", "con el equipo")} ${TEAMS[STATE.team].emoji} ${escapeHtml(TEAMS[STATE.team].name)}`
    : T("ohne Team", "no team", "sin equipo");
  $("#qr-title").textContent = corner.name;
  $("#qr-body").innerHTML = `
    <div class="qr-block">
      <h3>👤 ${T("Persönlicher Code", "Personal code", "Código personal")}</h3>
      <p>${T("Zum Teilen mit Freunden: sie werden eingecheckt, du bekommst Punkte", "To share with friends: they get checked in, you get points", "Para compartir con amigos: se les hace check-in y tú ganas puntos")}, ${teamNote}.</p>
      <img src="${qrImageUrl(personal, 320)}" alt="${T("Persönlicher QR-Code", "Personal QR code", "Código QR personal")}" />
      <button class="action-btn" data-copy="${escapeHtml(personal)}">🔗 ${T("Link kopieren", "Copy link", "Copiar enlace")}</button>
    </div>
    <div class="qr-block">
      <h3>🏷️ ${T("Aufkleber-Code (neutral)", "Sticker code (neutral)", "Código para pegatina (neutro)")}</h3>
      <p>${T("Ohne Person und ohne Team — zum Ausdrucken und an den Corner kleben. Wer scannt, wird direkt hier eingecheckt.", "No person, no team — print it and stick it at the corner. Whoever scans it gets checked in right here.", "Sin persona ni equipo — imprímelo y pégalo en el corner. Quien lo escanee hace check-in aquí mismo.")}</p>
      <img src="${qrImageUrl(sticker, 320)}" alt="${T("Neutraler QR-Code", "Neutral QR code", "Código QR neutro")}" />
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="action-btn" data-copy="${escapeHtml(sticker)}">🔗 ${T("Link kopieren", "Copy link", "Copiar enlace")}</button>
        <button class="action-btn primary" id="qr-print">🖨️ ${T("Aufkleber drucken", "Print sticker", "Imprimir pegatina")}</button>
      </div>
    </div>
    <div class="qr-block">
      <h3>🧲 ${T("Folge-mir-Code", "Follow-me code")}</h3>
      <p>${T("Führt immer zu dem Corner, an dem du gerade eingecheckt bist — auch wenn ihr weiterzieht.", "Always leads to the corner you are checked in at — even when you move on.")}</p>
      <button class="action-btn" id="qr-follow">🧲 ${T("Folge-mir-QR zeigen", "Show follow-me QR")}</button>
    </div>`;
  $("#qr-body").querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => { await copyText(b.dataset.copy); toast(T("🔗 Link kopiert", "🔗 Link copied")); }));
  $("#qr-print")?.addEventListener("click", () => printCornerSticker(corner, sticker));
  $("#qr-follow")?.addEventListener("click", openFollowMeDialog);
  $("#qr-close").onclick = () => { overlay.style.display = "none"; };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
  overlay.style.display = "flex";
}

