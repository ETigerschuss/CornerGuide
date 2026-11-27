/* ====================== MELDEN & BLOCKIEREN (Phase 2) ======================
   Seit Links ohne Code reinlassen, kommen leichter Leute dazu, die man nicht
   kennt. Darum, ohne den Start schwerer zu machen:
   - 🚫 Blockieren (Profil): ihre Komplimente lehnt der Server ab, Pushes von
     ihnen kommen nicht mehr an, ihre Chats, Kommentare und Fotos sind für mich
     ausgeblendet, und sie fliegen aus meinen engen Freunden.
     blocks/<mein Profil>/<ihr Profil> = { at, name }
   - 🚩 Melden (Profil, Kommentar, Foto): geht nur an die Admins (Push), die
     gemeldete Person erfährt nicht, wer es war. reports/<id>
   - Admin-Panel „🚩 Meldungen“: Inhalt löschen, ⛔ Rauswerfen (alle Logins
     gesperrt, Zugang weg, ihre Einladungslinks gesperrt), Erledigt; Liste der
     Rausgeworfenen mit „Wieder reinlassen“. banned/<login>                   */
const REPORT_REASONS = [
  { id: "harass", de: "🙄 Belästigung oder Beleidigung", en: "🙄 Harassment or insults" },
  { id: "spam", de: "📢 Spam oder Werbung", en: "📢 Spam or ads" },
  { id: "fake", de: "🎭 Fake — gibt sich als jemand aus", en: "🎭 Fake — pretends to be someone" },
  { id: "inapp", de: "🔞 Unangemessenes Foto oder Text", en: "🔞 Inappropriate photo or text" },
  { id: "danger", de: "⚠️ Gefährlich oder Gewalt", en: "⚠️ Dangerous or violent" },
  { id: "other", de: "✏️ Etwas anderes", en: "✏️ Something else" }
];
const REPORT_KINDS = { profile: "👤 Profil", comment: "💬 Kommentar", photo: "📸 Foto" };

var _mod = { blocks: {}, blocksRoot: "", unsub: null, report: null, rerenderTimer: null };

/* ---------- blocking ---------- */
function isBlocked(key) {
  if (!key || !_mod.blocks) return false;
  if (_mod.blocks[key]) return true;
  const root = profileRoot(key);
  return !!(root && _mod.blocks[root]);
}
// Comments from older app versions only carry the name.
function isBlockedName(name) {
  const n = String(name || "").trim().toLowerCase();
  return !!n && Object.values(_mod.blocks || {}).some((b) => b && String(b.name || "").trim().toLowerCase() === n);
}
function blockedList() {
  return Object.entries(_mod.blocks || {}).map(([root, b]) => ({ root, name: (b && b.name) || identityNickname(root) || "?" }))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
}

function watchMyBlocks() {
  if (!window.FB?.firebaseReady || !STATE.nickname) return;
  const root = myRootKey();
  if (!root || /[.#$[\]/]/.test(root) || root === _mod.blocksRoot) return;
  if (_mod.unsub) { try { _mod.unsub(); } catch (e) { /* gone */ } }
  _mod.blocksRoot = root;
  _mod.unsub = window.FB.onValue(window.FB.ref(window.FB.db, "blocks/" + root), (snap) => {
    _mod.blocks = snap.val() || {};
    muteBlockedLogins();
    scheduleModerationRerender();
  }, () => { _mod.blocksRoot = ""; _mod.unsub = null; });
}

// Pushes: the server skips senders in my notification settings (per login,
// so each of my devices adds the blocked people's logins it knows).
function muteBlockedLogins() {
  const list = STATE.notifSettings?.blockedUsers;
  if (!Array.isArray(list)) return;
  let changed = false;
  Object.keys(_mod.blocks || {}).forEach((root) => {
    identityKeysOf(root).forEach((k) => { if (!list.includes(k)) { list.push(k); changed = true; } });
  });
  if (changed) saveNotifSettings();
}

async function setBlocked(key, on) {
  if (!window.FB?.firebaseReady || !key) return false;
  const me = myRootKey();
  const root = profileRoot(key);
  if (!me || !root || root === me || isMyKey(root)) return false;
  const name = String(identityNickname(root) || personInfo(root)?.nickname || "").slice(0, 40);
  try {
    await window.FB.set(window.FB.ref(window.FB.db, `blocks/${me}/${root}`), on ? { at: Date.now(), name } : null);
  } catch (err) {
    console.warn("block failed:", err);
    toast(T("Hat nicht geklappt — Verbindung prüfen.", "Didn't work — check your connection."));
    return false;
  }
  if (on) _mod.blocks[root] = { at: Date.now(), name };
  else delete _mod.blocks[root];
  const list = STATE.notifSettings.blockedUsers;
  identityKeysOf(root).forEach((k) => {
    const i = list.indexOf(k);
    if (on && i < 0) list.push(k);
    if (!on && i >= 0) list.splice(i, 1);
  });
  saveNotifSettings();
  // Blocked people no longer see my private corners and secret dates.
  if (on && isCloseFriend(root)) await setCloseFriend(root, false);
  scheduleModerationRerender();
  return true;
}

async function toggleBlock(key, name) {
  const on = !isBlocked(key);
  if (on && !(await appConfirm(`${name || T("Diese Person", "This person")} ${T("blockieren?", "— block?")}`,
    T("Du siehst dann keine Komplimente, Nachrichten, Kommentare und Fotos mehr von dieser Person, und ihre Pushes kommen nicht an. Sie erfährt es nicht.", "You no longer see their compliments, messages, comments and photos, and get no pushes from them. They are not told."),
    T("Blockieren", "Block")))) return false;
  if (!(await setBlocked(key, on))) return false;
  toast(on ? `🚫 <strong>${escapeHtml(name || "")}</strong> ${T("ist blockiert", "is blocked")}` : `${escapeHtml(name || "")} ${T("ist nicht mehr blockiert", "is no longer blocked")}`);
  return true;
}

function scheduleModerationRerender() {
  if (_mod.rerenderTimer) return;
  _mod.rerenderTimer = setTimeout(() => {
    _mod.rerenderTimer = null;
    if (typeof refreshAllCommentSections === "function") refreshAllCommentSections();
    const gallery = document.querySelector("#detail-content .photo-gallery");
    if (gallery && STATE.detailCornerId && $("#detail-overlay")?.classList.contains("open")) renderPhotoGallery(STATE.detailCornerId, gallery);
    if ($("#chat-overlay")?.classList.contains("open")) renderChatList();
    refreshBlockedRow();
    if ($("#user-profile-overlay")?.style.display === "flex" && STATE.viewedProfileKey && typeof refreshOpenPublicProfile === "function") refreshOpenPublicProfile();
  }, 0);
}

// Profile → "Teilen & enge Freunde": whom I blocked, to undo it (updated in place).
function blockedSectionHtml() {
  return `<div id="blocked-row">${blockedRowHtml()}</div>`;
}
function refreshBlockedRow() {
  const el = document.getElementById("blocked-row");
  if (el) el.innerHTML = blockedRowHtml();
}
function blockedRowHtml() {
  const list = blockedList();
  if (!list.length) return "";
  return `<div class="share-row">🚫 <strong>${T("Blockiert", "Blocked")} (${list.length})</strong> <span class="share-dim">— ${T("nur du siehst diese Liste", "only you see this list")}</span>
    <div class="cf-chips">${list.map((b) => `<span class="cf-chip">${escapeHtml(b.name)}<button data-unblock="${escapeHtml(b.root)}" aria-label="${T("Blockierung aufheben", "Unblock")}">✕</button></span>`).join("")}</div></div>`;
}

/* ---------- reporting ---------- */
function openReportDialog(target) {
  const overlay = $("#report-overlay");
  if (!overlay || !target) return;
  if (!STATE.nickname) { toast(T("Bitte gib zuerst einen Namen ein.", "Please pick a name first.")); return; }
  if (!window.FB?.firebaseReady) { toast(T("Melden geht nur online.", "Reporting needs a connection.")); return; }
  _mod.report = { ...target, reason: "" };
  $("#report-title").textContent = target.kind === "profile"
    ? `🚩 ${target.targetName || T("Profil", "Profile")} ${T("melden", "— report")}`
    : `🚩 ${target.kind === "photo" ? T("Foto melden", "Report photo") : T("Kommentar melden", "Report comment")}`;
  $("#report-sub").textContent = target.excerpt ? `„${String(target.excerpt).slice(0, 120)}“` : T("Was ist los?", "What's wrong?");
  const reasons = $("#report-reasons");
  reasons.innerHTML = REPORT_REASONS.map((r) => `<button class="report-reason" data-report-reason="${r.id}">${T(r.de, r.en)}</button>`).join("");
  $("#report-text").value = "";
  const blockRow = $("#report-block-row");
  const canBlock = !!target.target && !isBlocked(target.target);
  blockRow.hidden = !canBlock;
  $("#report-block").checked = false;
  const send = $("#report-send");
  send.disabled = true;
  reasons.querySelectorAll("[data-report-reason]").forEach((b) => b.addEventListener("click", () => {
    _mod.report.reason = b.dataset.reportReason;
    reasons.querySelectorAll(".report-reason").forEach((x) => x.classList.toggle("active", x === b));
    send.disabled = false;
  }));
  const close = () => { overlay.style.display = "none"; _mod.report = null; };
  $("#report-close").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  send.onclick = () => sendReport();
  overlay.style.display = "flex";
}

async function sendReport() {
  const r = _mod.report;
  if (!r || !r.reason) return;
  const send = $("#report-send");
  send.disabled = true;
  const text = String($("#report-text").value || "").trim().slice(0, 500);
  const entry = {
    by: myRootKey(), byName: String(STATE.nickname || "").slice(0, 40),
    kind: r.kind, reason: r.reason, at: Date.now()
  };
  if (r.target) entry.target = String(r.target).slice(0, 128);
  if (r.targetName) entry.targetName = String(r.targetName).slice(0, 40);
  if (r.ref) entry.ref = String(r.ref).slice(0, 200);
  if (r.excerpt) entry.excerpt = String(r.excerpt).slice(0, 300);
  if (text) entry.text = text;
  try {
    await window.FB.set(window.FB.push(window.FB.ref(window.FB.db, "reports")), entry);
  } catch (err) {
    console.warn("report failed:", err);
    toast(T("Konnte nicht gesendet werden — Verbindung prüfen.", "Could not send — check your connection."));
    send.disabled = false;
    return;
  }
  const alsoBlock = !$("#report-block-row").hidden && $("#report-block").checked;
  $("#report-overlay").style.display = "none";
  _mod.report = null;
  const reason = REPORT_REASONS.find((x) => x.id === entry.reason);
  adminUids().then((admins) => sendTargetedPush(admins, {
    type: "report", title: "🚩 Neue Meldung",
    body: `${entry.targetName || REPORT_KINDS[entry.kind] || "?"}: ${reason ? reason.de : entry.reason}`,
    query: "?reports=1"
  })).catch(() => {});
  if (alsoBlock && entry.target) await setBlocked(entry.target, true);
  toast(`🚩 ${T("Danke — die Admins schauen es sich an.", "Thanks — the admins will look at it.")}${alsoBlock ? ` ${T("Blockiert.", "Blocked.")}` : ""}`);
}

function reportComment(cornerId, key) {
  const c = STATE.comments?.[cornerId]?.[key];
  if (!c) return;
  openReportDialog({ kind: "comment", target: c.authorId || "", targetName: c.author || "", ref: `comments/${cornerId}/${key}`, excerpt: c.text || "" });
}
function reportPhoto(cornerId, key) {
  const p = STATE.photos?.[cornerId]?.[key];
  if (!p) return;
  openReportDialog({ kind: "photo", target: p.authorId || "", targetName: p.author || "", ref: `photos/${cornerId}/${key}`, excerpt: p.caption || "" });
}

document.addEventListener("click", (e) => {
  const t = e.target;
  const c = t.closest?.("[data-report-comment]");
  if (c) { e.preventDefault(); const [corner, key] = c.dataset.reportComment.split("/"); reportComment(corner, key); return; }
  const p = t.closest?.("[data-report-photo]");
  if (p) { e.preventDefault(); const [corner, key] = p.dataset.reportPhoto.split("/"); reportPhoto(corner, key); return; }
  const u = t.closest?.("[data-unblock]");
  if (u) { e.preventDefault(); setBlocked(u.dataset.unblock, false).then((ok) => { if (ok) toast(T("Blockierung aufgehoben", "Unblocked")); }); }
});

/* ---------- banned: tell the person instead of asking for a code ---------- */
async function amIBanned() {
  const uid = window.FB?.getAuthUid?.() || "";
  if (!uid) return false;
  try { return (await slimGet("banned/" + uid, 6000)).exists(); } catch (e) { return false; }
}

/* ---------- admin: reports ---------- */
async function renderAdminReports() {
  const el = $("#admin-reports");
  if (!el || !STATE.isAdmin || !window.FB?.firebaseReady) return;
  el.innerHTML = `<p style="color:var(--fg-dim);font-size:12px;">Lade…</p>`;
  let reports = {};
  let banned = {};
  try {
    [reports, banned] = await Promise.all([slimGet("reports"), slimGet("banned")]).then(([a, b]) => [a.val() || {}, b.val() || {}]);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--pink);font-size:12px;">${T("Konnte Meldungen nicht laden (Regeln deployed?).", "Could not load reports (rules deployed?).")}</p>`;
    return;
  }
  const all = Object.entries(reports).map(([id, r]) => ({ id, ...r }));
  const open = all.filter((r) => !r.done).sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  const doneCount = all.length - open.length;
  const bannedPeople = {};
  Object.entries(banned).forEach(([login, b]) => {
    const root = (b && b.root) || login;
    if (!bannedPeople[root]) bannedPeople[root] = { root, name: (b && b.name) || identityNickname(root) || "?", at: Number((b && b.at) || 0) };
  });
  const reasonLabel = (id) => { const r = REPORT_REASONS.find((x) => x.id === id); return r ? T(r.de, r.en) : id; };
  const isBannedRoot = (root) => !!bannedPeople[profileRoot(root)] || !!bannedPeople[root];
  el.innerHTML = `
    ${open.length ? open.map((r) => `<div class="admin-fb admin-report">
        <div style="font-size:11px;color:var(--fg-dim);">${escapeHtml(REPORT_KINDS[r.kind] || r.kind || "")} · ${T("von", "by")} ${escapeHtml(r.byName || "?")} · ${new Date(Number(r.at || 0)).toLocaleString("de-DE")}</div>
        <div style="font-size:13px;">🚩 <strong>${escapeHtml(r.targetName || "?")}</strong> — ${escapeHtml(reasonLabel(r.reason))}${r.target && isBannedRoot(r.target) ? ` · ⛔ ${T("rausgeworfen", "removed")}` : ""}</div>
        ${r.excerpt ? `<div class="report-excerpt">„${escapeHtml(r.excerpt)}“</div>` : ""}
        ${r.text ? `<div style="font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(r.text)}</div>` : ""}
        <div class="admin-report-actions">
          ${r.target ? `<button class="action-btn admin-row-btn neutral" data-rep-profile="${escapeHtml(r.target)}">👤 ${T("Profil", "Profile")}</button>` : ""}
          ${r.ref ? `<button class="action-btn admin-row-btn" data-rep-delete="${escapeHtml(r.id)}">🗑 ${T("Inhalt löschen", "Delete content")}</button>` : ""}
          ${r.target && !isBannedRoot(r.target) ? `<button class="action-btn admin-row-btn" data-rep-ban="${escapeHtml(r.target)}" data-name="${escapeHtml(r.targetName || "")}">⛔ ${T("Rauswerfen", "Remove")}</button>` : ""}
          <button class="action-btn admin-row-btn neutral" data-rep-done="${escapeHtml(r.id)}">✓ ${T("Erledigt", "Done")}</button>
        </div>
      </div>`).join("") : `<p style="color:var(--fg-dim);font-size:12px;">${T("Keine offenen Meldungen. ✨", "No open reports. ✨")}</p>`}
    ${doneCount ? `<p style="color:var(--fg-dim);font-size:11px;margin:4px 0 0;">${doneCount} ${T("erledigt", "done")}</p>` : ""}
    ${Object.keys(bannedPeople).length ? `<div class="admin-banned"><div style="font-size:12px;margin:10px 0 6px;">⛔ ${T("Rausgeworfen", "Removed")}</div>${Object.values(bannedPeople).map((b) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-3);border:1px solid var(--line);border-radius:8px;margin-bottom:6px;">
        <span style="flex:1;font-size:13px;">${escapeHtml(b.name)}</span>
        <button class="action-btn admin-row-btn neutral" data-unban="${escapeHtml(b.root)}" data-name="${escapeHtml(b.name)}">${T("Wieder reinlassen", "Let back in")}</button>
      </div>`).join("")}</div>` : ""}`;
  el.querySelectorAll("[data-rep-profile]").forEach((b) => b.addEventListener("click", () => { $("#admin-overlay").style.display = "none"; openUserProfile(b.dataset.repProfile); }));
  el.querySelectorAll("[data-rep-done]").forEach((b) => b.addEventListener("click", async () => {
    await window.FB.update(window.FB.ref(window.FB.db, "reports/" + b.dataset.repDone), { done: true, doneAt: Date.now(), doneBy: currentUserKey() }).catch(() => toast(T("Ging nicht.", "Didn't work.")));
    renderAdminReports();
  }));
  el.querySelectorAll("[data-rep-delete]").forEach((b) => b.addEventListener("click", async () => {
    const r = reports[b.dataset.repDelete];
    if (!r || !r.ref || !/^(comments|photos)\/[^/]+\/[^/]+$/.test(r.ref)) return;
    if (!(await appConfirm(T("Inhalt löschen?", "Delete content?"), r.excerpt ? `„${String(r.excerpt).slice(0, 120)}“` : "", T("Löschen", "Delete")))) return;
    try {
      const updates = { [r.ref]: null, [`reports/${b.dataset.repDelete}/done`]: true, [`reports/${b.dataset.repDelete}/doneAt`]: Date.now() };
      if (r.ref.startsWith("photos/")) updates[r.ref.replace(/^photos\//, "photoData/")] = null;
      await window.FB.update(window.FB.ref(window.FB.db), updates);
      toast(T("🗑 Gelöscht", "🗑 Deleted"));
    } catch (err) { toast(T("Löschen fehlgeschlagen.", "Delete failed.")); }
    renderAdminReports();
  }));
  el.querySelectorAll("[data-rep-ban]").forEach((b) => b.addEventListener("click", () => adminBanPerson(b.dataset.repBan, b.dataset.name)));
  el.querySelectorAll("[data-unban]").forEach((b) => b.addEventListener("click", () => adminUnbanPerson(b.dataset.unban, b.dataset.name)));
}

// ⛔ All logins of the profile lose access and cannot come back with the code
// or a link; their own invite links stop working. Profile and points stay.
async function adminBanPerson(key, name) {
  if (!STATE.isAdmin || !window.FB?.firebaseReady || !key) return;
  const root = profileRoot(key);
  if (!root || isMyKey(root)) return;
  if (!(await appConfirm(`${name || T("Diese Person", "This person")} ${T("rauswerfen?", "— remove?")}`,
    T("Alle ihre Logins verlieren den Zugang und kommen weder mit dem Code noch mit einem Link wieder rein. Ihre Einladungslinks werden gesperrt. Profil und Punkte bleiben (rückgängig machbar).", "All their logins lose access and can't come back with the code or a link. Their invite links get blocked. Profile and points stay (can be undone)."),
    T("Rauswerfen", "Remove")))) return;
  const at = Date.now();
  const updates = {};
  identityKeysOf(root).forEach((login) => {
    if (!login || /[.#$[\]/]/.test(login)) return;
    updates[`banned/${login}`] = { at, by: currentUserKey(), name: String(name || identityNickname(root) || "").slice(0, 40), root };
    updates[`accessGranted/${login}`] = null;
  });
  try {
    const token = (await slimGet("inviteOf/" + root, 6000).catch(() => null))?.val?.();
    if (typeof token === "string" && INVITE_TOKEN_RE.test(token)) updates[`invites/${token}/revoked`] = true;
    await window.FB.update(window.FB.ref(window.FB.db), updates);
    toast(`⛔ <strong>${escapeHtml(name || "")}</strong> ${T("ist raus", "is out")}`);
  } catch (err) {
    console.warn("ban failed:", err);
    toast(T("Rauswerfen fehlgeschlagen.", "Removing failed."));
  }
  renderAdminReports();
  renderAdminInvites();
}

async function adminUnbanPerson(root, name) {
  if (!STATE.isAdmin || !window.FB?.firebaseReady || !root) return;
  if (!(await appConfirm(`${name || ""} ${T("wieder reinlassen?", "— let back in?")}`, T("Die Person kann dann wieder mit dem Code oder einem Link dazukommen.", "They can then join again with the code or a link."), T("Reinlassen", "Let in")))) return;
  try {
    const banned = (await slimGet("banned")).val() || {};
    const updates = {};
    Object.entries(banned).forEach(([login, b]) => { if (login === root || (b && b.root === root)) updates[`banned/${login}`] = null; });
    if (Object.keys(updates).length) await window.FB.update(window.FB.ref(window.FB.db), updates);
    toast(`${escapeHtml(name || "")} ${T("kann wieder rein", "can come back in")}`);
  } catch (err) {
    toast(T("Ging nicht.", "Didn't work."));
  }
  renderAdminReports();
}
