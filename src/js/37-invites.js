/* ====================== INVITE LINKS (Phase 2) ======================
   "Es muss super einfach bleiben zu starten, wenn ich jemandem einen Link
   teile": every member has a personal invite inside all the links they share
   (corner, WhatsApp, cornerdate, follow-me, 📨 Einladen). Whoever opens such a
   link is in with one tap — no code to type — and only picks a name.
   Each invite is traceable (who brought whom in) and can be replaced or
   blocked; the inviter gets Karma once the newcomer has picked a name (from a
   Cloud Function, a few times a day). The old group code keeps working;
   neutral stickers for public places carry no invite.
   invites/<token> { by, byName, at, uses, revoked } · inviteOf/<profile> = token
   inviteJoins/<token>/<login> { name, at } — written by the newcomer's app.  */
const INVITE_LINK_PARAM = "i";
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,40}$/;
const INVITE_TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const INVITE_KARMA = 30;                 // given by the Cloud Function (functions/index.js)
const INVITE_REWARDS_PER_DAY = 3;

function readInviteLocal(key) {
  try { const t = localStorage.getItem(key) || ""; return INVITE_TOKEN_RE.test(t) ? t : ""; } catch (e) { return ""; }
}

var _invite = {
  mine: readInviteLocal("cg.inviteToken"),
  mineRoot: (() => { try { return localStorage.getItem("cg.inviteRoot") || ""; } catch (e) { return ""; } })(),
  fromLink: (() => { try { const t = new URLSearchParams(window.location.search).get(INVITE_LINK_PARAM) || ""; return INVITE_TOKEN_RE.test(t) ? t : ""; } catch (e) { return ""; } })(),
  joined: readInviteLocal("cg.joinedInvite"),   // the invite this login came in with, until a name is picked
  checkedRoot: "",
  failedAt: 0,
  pending: null,
  uses: null
};

function newInviteToken() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => INVITE_TOKEN_CHARS[b % INVITE_TOKEN_CHARS.length]).join("");
}

// Only the invite of the profile I am now (not one from before a profile switch).
function myInviteToken() {
  return _invite.mine && _invite.mineRoot === myRootKey() ? _invite.mine : "";
}

// Every link I share carries my invite (and never the one this page was opened with).
function withMyInvite(url) {
  url.searchParams.delete(INVITE_LINK_PARAM);
  const token = localStorage.getItem("cg.accessGranted") === "1" ? myInviteToken() : "";
  if (token) url.searchParams.set(INVITE_LINK_PARAM, token);
  return url;
}

// My personal invite: made once, the same on all my devices (inviteOf/<profile>).
function ensureMyInviteToken() {
  if (!window.FB?.firebaseReady || !STATE.nickname || localStorage.getItem("cg.accessGranted") !== "1") return Promise.resolve(myInviteToken());
  const root = myRootKey();
  if (!root || /[.#$[\]/]/.test(root)) return Promise.resolve("");
  if (_invite.checkedRoot === root) return Promise.resolve(myInviteToken());
  if (_invite.pending) return _invite.pending;
  if (Date.now() - _invite.failedAt < 60000) return Promise.resolve(myInviteToken());
  _invite.pending = (async () => {
    const { db, ref, set } = window.FB;
    try {
      let token = (await slimGet("inviteOf/" + root)).val();
      let inv = typeof token === "string" && INVITE_TOKEN_RE.test(token) ? (await slimGet("invites/" + token)).val() : null;
      if (!inv || inv.revoked || inv.by !== root) {
        token = newInviteToken();
        inv = { by: root, byName: String(STATE.nickname).slice(0, 40), at: Date.now() };
        await set(ref(db, "invites/" + token), inv);
        await set(ref(db, "inviteOf/" + root), token);
      }
      _invite.mine = token;
      _invite.mineRoot = root;
      _invite.uses = Number(inv.uses || 0);
      _invite.checkedRoot = root;
      try { localStorage.setItem("cg.inviteToken", token); localStorage.setItem("cg.inviteRoot", root); } catch (e) { /* private mode */ }
      if (STATE.view === "profile") renderProfile();
    } catch (err) {
      _invite.failedAt = Date.now();
      console.warn("invite link not ready:", err);
    } finally {
      _invite.pending = null;
    }
    return myInviteToken();
  })();
  return _invite.pending;
}

// Opened with someone's invite and no access yet: in with one tap. The rules
// check that the invite exists and was not blocked.
async function redeemInviteLink() {
  const token = _invite.fromLink;
  const uid = window.FB?.getAuthUid?.() || "";
  if (!token || !uid) return false;
  try {
    await withTimeout(window.FB.set(window.FB.ref(window.FB.db, "accessGranted/" + uid), token), 15000, "invite");
  } catch (err) {
    console.warn("invite link not accepted:", err);
    return false;
  }
  clearHandledQueryParam(INVITE_LINK_PARAM);
  if (!STATE.nickname) {
    _invite.joined = token;
    try { localStorage.setItem("cg.joinedInvite", token); } catch (e) { /* private mode */ }
  }
  let byName = "";
  try { byName = String((await slimGet(`invites/${token}/byName`, 3000)).val() || ""); } catch (e) { /* the welcome works without it */ }
  onAccessGranted(token, { invited: true, byName });
  return true;
}

// The newcomer picked a name: the inviter gets thanked (Cloud Function).
function noteInviteJoin(name) {
  const token = _invite.joined;
  const uid = window.FB?.getAuthUid?.() || "";
  if (!token || !uid || !window.FB?.firebaseReady) return;
  forgetInviteJoin();
  window.FB.set(window.FB.ref(window.FB.db, `inviteJoins/${token}/${uid}`), { name: String(name || "").slice(0, 40), at: Date.now() })
    .catch((err) => console.warn("invite join not noted:", err));
}
// …or turned out to be someone who is already here (picked their profile).
function forgetInviteJoin() {
  _invite.joined = "";
  try { localStorage.removeItem("cg.joinedInvite"); } catch (e) { /* private mode */ }
}

// A link went to the wrong people: the old one stops working, a new one is made.
async function replaceMyInviteLink() {
  const token = myInviteToken();
  if (!token || !window.FB?.firebaseReady) return;
  if (!(await appConfirm(T("Neuen Einladungslink machen?", "Make a new invite link?"),
    T("Dein alter Link lässt dann niemanden mehr neu rein. Wer schon dabei ist, bleibt dabei.", "Your old link then lets nobody new in. Everyone already in stays in."),
    T("Neuer Link", "New link")))) return;
  try {
    await window.FB.set(window.FB.ref(window.FB.db, `invites/${token}/revoked`), true);
  } catch (err) {
    toast(T("Hat nicht geklappt — Verbindung prüfen.", "Didn't work — check your connection."));
    return;
  }
  _invite.mine = "";
  _invite.checkedRoot = "";
  _invite.failedAt = 0;
  try { localStorage.removeItem("cg.inviteToken"); } catch (e) { /* private mode */ }
  await ensureMyInviteToken();
  toast(myInviteToken() ? `📨 ${T("Neuer Einladungslink ist bereit", "New invite link is ready")}` : T("Neuer Link folgt, sobald du online bist.", "New link follows once you are online."));
}

// Profile → "Teilen & enge Freunde": my link and how many came in with it.
function inviteSectionHtml() {
  deferSlim("myInvite", ensureMyInviteToken);
  if (!window.FB?.firebaseReady || !myInviteToken()) return "";
  const n = Number(_invite.uses || 0);
  return `<div class="share-row">📨 <strong>${T("Dein Einladungslink", "Your invite link")}</strong>: ${T("steckt in allem, was du teilst — wer ihn öffnet, ist mit einem Tipp dabei, ohne Code", "is inside everything you share — whoever opens it is in with one tap, no code")}. +${INVITE_KARMA} Karma ${T("pro neuer Person", "per new person")}${n ? ` · ${n} ${T(n === 1 ? "Person so dazugekommen" : "Leute so dazugekommen", n === 1 ? "person joined this way" : "people joined this way")}` : ""}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;"><button class="action-btn cmp-quick" id="share-invite-link">📨 ${T("Teilen", "Share")}</button><button class="action-btn cmp-quick" id="replace-invite-link">🔄 ${T("Neuer Link", "New link")}</button></div></div>`;
}

document.addEventListener("click", (e) => {
  if (e.target.closest?.("#share-invite-link")) { e.preventDefault(); inviteFriends(); return; }
  if (e.target.closest?.("#replace-invite-link")) { e.preventDefault(); replaceMyInviteLink(); }
});

/* Admin: all invite links — who made it, who came in with it — and a block. */
async function renderAdminInvites() {
  const el = $("#admin-invites");
  if (!el || !STATE.isAdmin || !window.FB?.firebaseReady) return;
  el.innerHTML = `<p style="color:var(--fg-dim);font-size:12px;">Lade…</p>`;
  try {
    const [invites, joins] = await Promise.all([slimGet("invites"), slimGet("inviteJoins")]).then(([a, b]) => [a.val() || {}, b.val() || {}]);
    const rows = Object.entries(invites)
      .map(([token, v]) => ({
        token,
        by: String((v && (v.byName || v.by)) || "?"),
        uses: Number((v && v.uses) || 0),
        at: Number((v && v.at) || 0),
        revoked: !!(v && v.revoked),
        names: Object.values(joins[token] || {}).map((j) => j && j.name).filter(Boolean)
      }))
      .sort((a, b) => (a.revoked - b.revoked) || (b.uses - a.uses) || (b.at - a.at));
    el.innerHTML = rows.map((r) => `
      <div class="admin-invite-row" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-3);border:1px solid var(--line);border-radius:8px;margin-bottom:6px;${r.revoked ? "opacity:0.55;" : ""}">
        <span style="flex:1;font-size:13px;">${escapeHtml(r.by)} <span style="color:var(--fg-dim);font-size:11px;">· ${r.uses} ${T("dabei", "joined")}${r.names.length ? ": " + r.names.slice(-8).map(escapeHtml).join(", ") : ""}</span></span>
        ${r.revoked ? `<span style="font-size:10px;color:var(--fg-dim);">${T("gesperrt", "blocked")}</span>` : `<button class="action-btn admin-row-btn" data-admin-revoke-invite="${escapeHtml(r.token)}" data-by="${escapeHtml(r.by)}">${T("Sperren", "Block")}</button>`}
      </div>`).join("") || `<p style="color:var(--fg-dim);font-size:12px;">${T("Noch keine Einladungslinks.", "No invite links yet.")}</p>`;
    el.querySelectorAll("[data-admin-revoke-invite]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await appConfirm(`${T("Link von", "Link by")} „${b.dataset.by}“ ${T("sperren?", "block?")}`, T("Über diesen Link kommt niemand mehr neu rein. Wer schon dabei ist, bleibt dabei.", "Nobody new gets in with this link. Everyone already in stays in."), T("Sperren", "Block")))) return;
      try {
        await window.FB.set(window.FB.ref(window.FB.db, `invites/${b.dataset.adminRevokeInvite}/revoked`), true);
        toast(T("🔒 Link gesperrt", "🔒 Link blocked"));
        renderAdminInvites();
      } catch (err) {
        toast(T("Sperren fehlgeschlagen.", "Blocking failed."));
      }
    }));
  } catch (err) {
    el.innerHTML = `<p style="color:var(--pink);font-size:12px;">${T("Konnte Einladungen nicht laden (Regeln deployed?).", "Could not load invites (rules deployed?).")}</p>`;
  }
}
