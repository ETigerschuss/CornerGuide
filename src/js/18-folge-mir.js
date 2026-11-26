/* ====================== FOLGE MIR ======================
   A personal link/QR that always leads to wherever its owner is checked in
   right now — unlike a corner link it keeps working when the crew moves on.
   QR scanned next to me: checked in right there, in my team, QR bonus.
   Link (WhatsApp …): opens my current corner with route and check-in.    */
function buildJoinUrl(onSite) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("join", currentUserKey());
  if (STATE.nickname) url.searchParams.set("n", STATE.nickname.slice(0, 30));
  if (onSite) url.searchParams.set("here", "1");
  return url.toString();
}

function followMeText() {
  const here = myPresenceCorner();
  const corner = here ? getAllCorners().find((c) => c.id === here) : null;
  return corner
    ? T(`${STATE.nickname} ist am ${corner.name} — komm vorbei! 🍻 Der Link führt immer dahin, wo ich gerade bin:`, `${STATE.nickname} is at ${corner.name} — come over! 🍻 This link always leads to where I am right now:`)
    : T(`Komm zum Cornern! 🍻 Der Link führt immer dahin, wo ${STATE.nickname} gerade eingecheckt ist:`, `Come cornering! 🍻 This link always leads to where ${STATE.nickname} is checked in:`);
}

function openFollowMeDialog() {
  const overlay = $("#qr-overlay");
  if (!overlay) return;
  if (!STATE.nickname || !window.FB?.firebaseReady) { toast(T("Folge-mir-Codes brauchen einen Namen und eine Verbindung.", "Follow-me codes need a name and a connection.")); return; }
  const qrUrl = buildJoinUrl(true);
  const linkUrl = buildJoinUrl(false);
  const here = myPresenceCorner();
  const corner = here ? getAllCorners().find((c) => c.id === here) : null;
  $("#qr-title").innerHTML = corner
    ? T(`Gerade bist du am <strong>${escapeHtml(corner.name)}</strong>.`, `You are at <strong>${escapeHtml(corner.name)}</strong> right now.`)
    : T("Du bist gerade nirgends eingecheckt — der Code führt zu dir, sobald du eincheckst.", "You are not checked in anywhere — the code leads to you as soon as you check in.");
  $("#qr-body").innerHTML = `
    <div class="qr-block">
      <h3>🧲 ${T("Folge mir", "Follow me")}</h3>
      <p>${T("Zeigt immer auf den Corner, an dem du gerade eingecheckt bist — auch wenn ihr weiterzieht.", "Always points to the corner you are checked in at — even when you move on.")}</p>
      <img src="${qrImageUrl(qrUrl, 320)}" alt="${T("Folge-mir-QR-Code", "Follow-me QR code")}" />
      <p class="qr-note">📷 ${T("Neben dir gescannt: direkt eingecheckt, in deinem Team — und du bekommst den QR-Bonus.", "Scanned next to you: checked in right away, in your team — and you get the QR bonus.")}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="action-btn primary" id="join-share">📤 ${T("Link teilen", "Share link")}</button>
        <button class="action-btn wa" id="join-wa">📲 WhatsApp</button>
        <button class="action-btn" data-copy="${escapeHtml(linkUrl)}">🔗 ${T("Kopieren", "Copy")}</button>
      </div>
      <p class="qr-note">🔗 ${T("Per Link (z. B. WhatsApp): öffnet deinen aktuellen Corner mit Route — eingecheckt wird erst vor Ort.", "As a link (e.g. WhatsApp): opens your current corner with a route — checking in happens on site.")}</p>
    </div>`;
  $("#qr-body").querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => { await copyText(b.dataset.copy).catch(() => {}); toast(T("🔗 Link kopiert", "🔗 Link copied")); }));
  $("#join-share")?.addEventListener("click", async () => {
    try {
      if (navigator.share) { await navigator.share({ title: "Minga Corner Guide", text: followMeText(), url: linkUrl }); return; }
    } catch (err) { if (err && err.name === "AbortError") return; }
    await copyText(linkUrl).catch(() => {});
    toast(T("🔗 Link kopiert", "🔗 Link copied"));
  });
  $("#join-wa")?.addEventListener("click", () => openWhatsApp(`${followMeText()} ${linkUrl}`));
  $("#qr-close").onclick = () => { overlay.style.display = "none"; };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
  overlay.style.display = "flex";
}

// Opened a follow-me link/QR: find where that person is right now.
var _pendingJoinTimer = null;
async function handlePendingJoin(attempt = 0) {
  clearTimeout(_pendingJoinTimer);
  const j = STATE.pendingJoin;
  if (!j || attempt > 300) return;
  const onboarding = !STATE.nickname
    || (window.FB?.firebaseReady && localStorage.getItem("cg.accessGranted") !== "1")
    || ["#access-prompt", "#claim-overlay", "#nickname-prompt"].some((sel) => $(sel)?.style.display === "flex");
  if (onboarding || !window.FB?.firebaseReady || !window.FB.getAuthUid?.()) {
    _pendingJoinTimer = setTimeout(() => handlePendingJoin(attempt + 1), 1000);
    return;
  }
  STATE.pendingJoin = null;
  ["join", "here", "n"].forEach(clearHandledQueryParam);
  if (j.id === currentUserKey() || isMyKey(j.id)) { toast(T("🧲 Das ist dein eigener Folge-mir-Code 😉", "🧲 That's your own follow-me code 😉")); return; }
  let p = STATE.friends?.[j.id] || null;
  if (!p) {
    try { p = (await window.FB.get(window.FB.ref(window.FB.db, "presence/" + j.id))).val(); } catch (err) { p = null; }
  }
  const name = (p && (p.nickname || p.name)) || STATE.points?.[j.id]?.nickname || j.name || T("Dein Freund", "Your friend");
  const corner = p && presenceIsVisible(p) && p.atCorner ? getAllCorners().find((c) => c.id === p.atCorner) : null;
  if (!corner) {
    toast(`🧲 <strong>${escapeHtml(name)}</strong> ${T("ist gerade nirgends eingecheckt — schreib eine Nachricht!", "isn't checked in anywhere right now — send a message!")}`);
    if (STATE.points?.[j.id] || p) openUserProfile(j.id);
    return;
  }
  STATE.joinContext = { cornerId: corner.id, id: j.id, name, at: Date.now() };
  if (j.here && STATE.manualCheckinId !== corner.id) {
    // Scanned on site: in their team, they get the QR bonus.
    if (p.team) STATE.pendingSharedTeam = p.team;
    STATE.pendingReferrerId = j.id;
    openDetail(corner.id);
    scheduleAutoCheckin(corner.id);
    toast(`🧲 ${T("Du bist bei", "You're with")} <strong>${escapeHtml(name)}</strong> ${T("am", "at")} <strong>${escapeHtml(corner.name)}</strong> — ${T("wirst eingecheckt", "checking you in")} 🍻`, "at-corner");
  } else {
    openDetail(corner.id);
    toast(`🧲 <strong>${escapeHtml(name)}</strong> ${T("ist gerade am", "is at")} <strong>${escapeHtml(corner.name)}</strong> — ${T("Route und Einchecken oben", "route and check-in at the top")} 👆`, "friend-alert");
  }
}

// Top of the corner detail: who you are following, plus the main actions.
function detailTopBarHtml(c) {
  const jc = STATE.joinContext;
  const following = jc && jc.cornerId === c.id && Date.now() - jc.at < 3 * 3600000 && STATE.manualCheckinId !== c.id;
  const here = STATE.manualCheckinId === c.id;
  return `${following ? `<div class="detail-follow">🧲 ${T("Du folgst", "Following")} <button class="people-chip" data-user-profile="${escapeHtml(jc.id)}">${escapeHtml(jc.name)}</button> ${T("hierher", "here")}</div>` : ""}
    <div class="detail-topbar">
      <button class="checkin-btn ${here ? "checked-in" : ""}" data-id="${c.id}">${here ? "✅ " + T("Ich bin hier", "I'm here") + " &middot; 🚪 " + T("Auschecken", "Check out") : "📍 " + T("Einchecken", "Check in")}</button>
      <button class="action-btn" data-action="route-detail" data-id="${c.id}">🧭 ${T("Route", "Route")}</button>
      <button class="action-btn" data-action="follow-me" title="${T("Folge-mir-QR für Freunde", "Follow-me QR for friends")}">🧲</button>
    </div>`;
}

// Print-ready sticker sheet for one corner.
function printCornerSticker(corner, url) {
  const w = window.open("", "_blank");
  if (!w) { toast("Bitte Pop-ups erlauben, um zu drucken."); return; }
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Aufkleber – ${escapeHtml(corner.name)}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
      .sticker { width: 74mm; border: 2px dashed #999; border-radius: 10mm; padding: 8mm; text-align: center; page-break-inside: avoid; margin: 0 auto 10mm; }
      .sticker h1 { font-size: 15pt; margin: 0 0 2mm; }
      .sticker .area { font-size: 9pt; color: #666; margin: 0 0 4mm; text-transform: uppercase; letter-spacing: 1px; }
      .sticker img { width: 52mm; height: 52mm; }
      .sticker .cta { font-size: 11pt; font-weight: 700; margin-top: 4mm; }
      .sticker .sub { font-size: 8pt; color: #666; margin-top: 1mm; }
      @media print { body { padding: 0; } .sticker { border-color: #ccc; } }
    </style></head><body>
    <div class="sticker">
      <h1>${escapeHtml(corner.name)}</h1>
      <p class="area">${escapeHtml(corner.area || "Minga Corner Guide")}</p>
      <img src="${qrImageUrl(url, 512)}" alt="QR" />
      <p class="cta">📷 Scannen &amp; einchecken</p>
      <p class="sub">Minga Corner Guide · cornern als Lebensstil 🍻</p>
    </div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 600); };<\/script>
    </body></html>`);
  w.document.close();
}

/* ====================== TEAM PICKER AFTER CHECK-IN ======================
   Shown on every check-in, skippable. It also offers "same team as the people
   already here", which is how two friends end up in one team without talking
   about it, and a shortcut to found your own team.                          */
function openCheckinTeamPicker(cornerId) {
  const overlay = $("#checkin-team-overlay");
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!overlay || !corner) return;
  $("#cto-sub").textContent = `Eingecheckt am ${corner.name}`;

  const wrap = $("#cto-teams");
  const paint = () => {
    wrap.innerHTML = allTeamKeys().map((id) => `
      <button class="team-btn ${STATE.team === id ? "active" : ""}" data-team="${id}" title="${escapeHtml(TEAMS[id]?.name || id)}" style="border-color:${STATE.team === id ? (TEAMS[id]?.color || "var(--amber)") : "var(--line)"};">
        <span>${TEAMS[id]?.emoji || "🚩"}</span><span class="team-label">${escapeHtml(TEAMS[id]?.name || id)}</span>
      </button>`).join("") +
      `<button class="team-btn" data-team-create="1" title="Eigenes Team gründen" style="border-style:dashed;"><span>➕</span><span class="team-label">Eigenes</span></button>`;
    wrap.querySelectorAll("[data-team]").forEach((b) => b.addEventListener("click", () => { selectTeam(b.dataset.team); paint(); }));
    wrap.querySelector("[data-team-create]")?.addEventListener("click", () => {
      overlay.style.display = "none";
      openTeamCreate(cornerId);
    });
  };
  paint();

  // Buddies already checked in here: one tap to join their team.
  const here = freshFriends()
    .filter((f) => f.atCorner === cornerId && f.team && TEAMS[f.team])
    .filter((f, i, arr) => arr.findIndex((x) => x.team === f.team) === i);
  const buddyBox = $("#cto-buddy");
  if (here.length) {
    buddyBox.style.display = "";
    $("#cto-buddy-list").innerHTML = here.map((f) => `
      <button class="action-btn" data-buddy-team="${escapeHtml(f.team)}" style="font-size:11px;padding:6px 10px;border-color:${TEAMS[f.team].color};">
        ${TEAMS[f.team].emoji} wie ${escapeHtml(f.nickname || "Freund")}
      </button>`).join("");
    $("#cto-buddy-list").querySelectorAll("[data-buddy-team]").forEach((b) =>
      b.addEventListener("click", () => {
        selectTeam(b.dataset.buddyTeam);
        toast(`${TEAMS[b.dataset.buddyTeam].emoji} Team ${escapeHtml(TEAMS[b.dataset.buddyTeam].name)} übernommen`);
        overlay.style.display = "none";
      }));
  } else {
    buddyBox.style.display = "none";
  }

  const wa = $("#cto-whatsapp");
  if (wa) {
    wa.textContent = "📲 " + T("WhatsApp-Gruppe Bescheid geben", "Tell your WhatsApp group");
    wa.onclick = () => openWhatsApp(cornerWhatsAppText(cornerId));
  }

  // Closing continues the chain: on a first visit the questionnaire follows.
  const close = () => {
    overlay.style.display = "none";
    const pending = STATE.pendingCheckinQuestions;
    STATE.pendingCheckinQuestions = null;
    if (pending) setTimeout(() => showCheckinPrompt(pending), 250);
  };
  $("#cto-skip").onclick = close;
  $("#cto-done").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.style.display = "flex";
}

