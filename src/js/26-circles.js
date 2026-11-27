/* ====================== CLOSE FRIENDS, PRIVATE CORNERS, SECRET DATES ======================
   "Bestimmte Corners sollen nur von dir und deinen engen Freunden gesehen
   werden." Everyone with the invitation stays connected and sees check-ins
   as before; each person picks their own close friends — a one-way list only
   they see. A corner can be for everyone, for close friends or only for
   yourself; a cornerdate can be secret (only close friends see it). Private
   things live in database nodes the server only hands to the owner and their
   close friends, so they never reach other phones. They give fewer points
   ("man bekommt dann halt nicht so viele Punkte").
   Known gap, agreed for now: "Wer bist du?" needs no proof, so whoever picks
   your name also sees your private things.                              */
const PRIVATE_POINTS = (n) => Math.max(1, Math.round(n / 2));
const PRIVATE_SPOT_AURA = 10;                 // a corner for everyone gives 50
const VISIBILITY = {
  all: { emoji: "🌍", de: "Alle", en: "Everyone" },
  friends: { emoji: "👯", de: "Enge Freunde", en: "Close friends" },
  me: { emoji: "🔒", de: "Nur ich", en: "Only me" }
};
STATE.closeFriends = {};       // my list, every login of each friend: key -> true
STATE.privateCorners = {};     // id -> corner (+ visibility, ownerKey)
STATE.secretDates = {};        // id -> date (+ secret, ownerKey)
var _circles = { root: "", subs: {}, ownersByKey: {}, cornerBuckets: {}, dateBuckets: {}, primed: {}, renderTimer: null, startTimer: null };

function circleSub(path, onData) {
  if (_circles.subs[path] || !window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  try {
    _circles.subs[path] = onValue(ref(db, path), (snap) => onData(snap.val() || {}), () => { delete _circles.subs[path]; });
  } catch (err) { console.warn("circle listener skipped:", path, err); }
}
function circleUnsub(path) {
  const off = _circles.subs[path];
  if (typeof off === "function") { try { off(); } catch (e) { /* already gone */ } }
  delete _circles.subs[path];
}

// Everything that depends on who I am; safe to call again and again.
function startCircles() {
  const uid = window.FB?.getAuthUid?.() || "";
  if (!window.FB?.firebaseReady || !uid || !STATE.nickname) return;
  const root = myRootKey();
  if (_circles.root && _circles.root !== root) {
    Object.keys(_circles.subs).forEach(circleUnsub);
    Object.assign(_circles, { ownersByKey: {}, cornerBuckets: {}, dateBuckets: {}, primed: {} });
    STATE.closeFriends = {};
    mergeCircleData();
  }
  _circles.root = root;
  circleSub(`closeFriends/${root}`, (v) => { STATE.closeFriends = v; syncCloseFriendKeys(); scheduleCircleRender(); });
  syncCloseFriendKeys();   // a close friend may have a new login since the list was loaded
  myIdentityKeys().filter((k) => k && !/[.#$\[\]\/]/.test(k)).forEach((k) => circleSub(`closeFriendOf/${k}`, (v) => { _circles.ownersByKey[k] = Object.keys(v); updatePrivateOwners(); }));
  watchCircleOwner(root, true);
}
function scheduleStartCircles() {
  clearTimeout(_circles.startTimer);
  _circles.startTimer = setTimeout(startCircles, 800);
}
function updatePrivateOwners() {
  const owners = new Set([].concat(...Object.values(_circles.ownersByKey)));
  owners.delete(_circles.root);
  owners.forEach((o) => watchCircleOwner(o, false));
  // Someone took me off their list: stop reading (the server refuses anyway).
  Object.keys(_circles.subs).forEach((path) => {
    const m = path.match(/^(privateCorners|secretDates)\/([^/]+)/);
    if (!m || m[2] === _circles.root || owners.has(m[2])) return;
    circleUnsub(path);
    delete _circles.cornerBuckets[`${m[2]}/friends`];
    delete _circles.dateBuckets[m[2]];
  });
  mergeCircleData();
}
function watchCircleOwner(owner, mine) {
  circleSub(`privateCorners/${owner}/friends`, (v) => { _circles.cornerBuckets[`${owner}/friends`] = v; mergeCircleData(); });
  if (mine) circleSub(`privateCorners/${owner}/me`, (v) => { _circles.cornerBuckets[`${owner}/me`] = v; mergeCircleData(); });
  circleSub(`secretDates/${owner}`, (v) => {
    const before = _circles.dateBuckets[owner] || {};
    _circles.dateBuckets[owner] = v;
    if (_circles.primed[owner] && !mine) announceSecretDates(owner, before, v);
    _circles.primed[owner] = true;
    mergeCircleData();
  });
}
function mergeCircleData() {
  const corners = {};
  Object.entries(_circles.cornerBuckets).forEach(([bucket, items]) => {
    const [owner, vis] = bucket.split("/");
    Object.entries(items || {}).forEach(([id, c]) => {
      if (c && typeof c.lat === "number" && typeof c.lng === "number") corners[id] = { ...c, id, isCustom: true, visibility: vis, ownerKey: owner };
    });
  });
  const dates = {};
  Object.entries(_circles.dateBuckets).forEach(([owner, items]) => {
    Object.entries(items || {}).forEach(([id, d]) => { if (d && d.cornerId) dates[id] = { ...d, secret: true, ownerKey: owner }; });
  });
  STATE.privateCorners = corners;
  STATE.secretDates = dates;
  scheduleCircleRender();
}
function scheduleCircleRender() {
  clearTimeout(_circles.renderTimer);
  _circles.renderTimer = setTimeout(() => {
    renderCards();
    updateCounts();
    rebuildMainMarkers();
    renderCornerDatesStrip();
    refreshCornerDateSection();
    if (STATE.view === "profile") renderProfile();
    openPendingSharedCorner();
  }, 300);
}
function announceSecretDates(owner, before, after) {
  Object.entries(after || {}).forEach(([id, d]) => {
    if (before[id] || !d || Number(d.end) < Date.now()) return;
    toast(`🤫 <strong>${escapeHtml(d.byName || "?")}</strong> ${T("lädt dich zu einem geheimen Cornerdate ein", "invites you to a secret cornerdate")}: ${escapeHtml(formatDateRange(d.start, d.end))} ${T("am", "at")} ${escapeHtml(d.cornerName || "?")}<br><span style="font-size:11px;opacity:0.8;">${T("Tippen zum Ansehen →", "Tap to see →")}</span>`, null, () => openDateInvite(id));
  });
}

/* ---- close friends ---- */
function closeFriendRoots() { return new Set(Object.keys(STATE.closeFriends || {}).map((k) => profileRoot(k))); }
function isCloseFriend(key) { return !!key && closeFriendRoots().has(profileRoot(key)); }
function closeFriendKeys() { return Object.keys(STATE.closeFriends || {}).filter((k) => !isMyKey(k)); }
async function setCloseFriend(key, on) {
  if (!window.FB?.firebaseReady || !key) return false;
  const me = myRootKey();
  const root = profileRoot(key);
  if (!root || root === me || isMyKey(root)) return false;
  const updates = {};
  const keys = new Set(identityKeysOf(root));
  Object.keys(STATE.closeFriends || {}).forEach((k) => { if (profileRoot(k) === root) keys.add(k); });
  keys.forEach((k) => {
    if (isMyKey(k) || /[.#$\[\]\/]/.test(k)) return;
    updates[`closeFriends/${me}/${k}`] = on ? true : null;
    updates[`closeFriendOf/${k}/${me}`] = on ? true : null;
  });
  if (!Object.keys(updates).length) return false;
  try { await window.FB.update(window.FB.ref(window.FB.db), updates); }
  catch (err) { console.warn("setCloseFriend failed:", err); toast(T("Ging nicht — Verbindung prüfen.", "Didn't work — check your connection.")); return false; }
  keys.forEach((k) => { if (on) STATE.closeFriends[k] = true; else delete STATE.closeFriends[k]; });
  scheduleCircleRender();
  return true;
}
// A close friend got a new phone or opened a link in the browser: add that login too.
var _cfSyncTimer = null;
function syncCloseFriendKeys() {
  clearTimeout(_cfSyncTimer);
  _cfSyncTimer = setTimeout(() => {
    if (!window.FB?.firebaseReady) return;
    const me = myRootKey();
    const updates = {};
    closeFriendRoots().forEach((root) => identityKeysOf(root).forEach((k) => {
      if (STATE.closeFriends[k] || isMyKey(k) || /[.#$\[\]\/]/.test(k)) return;
      updates[`closeFriends/${me}/${k}`] = true;
      updates[`closeFriendOf/${k}/${me}`] = true;
    }));
    if (Object.keys(updates).length) window.FB.update(window.FB.ref(window.FB.db), updates).catch(() => {});
  }, 1500);
}

function openCloseFriendPicker() {
  const overlay = $("#cf-overlay");
  if (!overlay) return;
  const render = () => {
    const q = String($("#cf-search").value || "").trim().toLowerCase();
    const me = myRootKey();
    const people = new Map();
    Object.keys(STATE.points || {}).forEach((k) => {
      const root = profileRoot(k);
      if (!root || root === me || isMyKey(root) || people.has(root)) return;
      const name = identityNickname(root);
      if (!name || name.toLowerCase() === "anonym") return;
      people.set(root, name);
    });
    const rows = [...people.entries()].sort((a, b) => a[1].localeCompare(b[1], "de", { sensitivity: "base" }))
      .filter(([, n]) => !q || n.toLowerCase().includes(q));
    $("#cf-list").innerHTML = rows.length ? rows.map(([root, name]) => {
      const on = isCloseFriend(root);
      return `<button class="claim-row cf-row ${on ? "on" : ""}" data-cf-toggle="${escapeHtml(root)}"><span class="claim-row-main"><span class="claim-row-name">${escapeHtml(name)}</span></span><span class="claim-row-cta">${on ? "✓ 👯" : "＋"}</span></button>`;
    }).join("") : `<p style="color:var(--fg-dim);font-size:13px;">${T("Niemand gefunden.", "Nobody found.")}</p>`;
    $$("#cf-list [data-cf-toggle]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      await setCloseFriend(b.dataset.cfToggle, !isCloseFriend(b.dataset.cfToggle));
      render();
    }));
  };
  $("#cf-search").value = "";
  $("#cf-search").oninput = render;
  $("#cf-close").onclick = () => { overlay.style.display = "none"; if (STATE.view === "profile") renderProfile(); };
  overlay.onclick = (e) => { if (e.target === overlay) $("#cf-close").click(); };
  overlay.style.display = "flex";
  render();
}

/* ---- corner visibility ---- */
function cornerVisibility(c) { return c && VISIBILITY[c.visibility] ? c.visibility : "all"; }
function isPrivateCorner(cOrId) {
  const c = typeof cOrId === "string" ? getAllCorners().find((x) => x.id === cOrId) : cOrId;
  return !!c && cornerVisibility(c) !== "all";
}
function cornerDbPath(c) {
  return isPrivateCorner(c) ? `privateCorners/${c.ownerKey}/${cornerVisibility(c)}/${c.id}` : `corners/${c.id}`;
}
function cleanCornerData(c) {
  const out = {};
  Object.entries(c || {}).forEach(([k, v]) => { if (!k.startsWith("_") && v !== undefined) out[k] = v; });
  return out;
}
function visibilityBadgeHtml(c) {
  const v = cornerVisibility(c);
  if (v === "all") return "";
  const info = VISIBILITY[v];
  const byOther = c.ownerKey && !isMyKey(c.ownerKey) && c.createdBy;
  return `<span class="vis-badge vis-${v}">${info.emoji} ${escapeHtml(T(info.de, info.en))}${byOther ? ` · ${T("von", "by")} ${escapeHtml(c.createdBy)}` : ""}</span>`;
}
function visibilityPickerHtml(current) {
  return Object.entries(VISIBILITY).map(([k, info]) => `<button type="button" class="vis-opt ${current === k ? "on" : ""}" data-vis="${k}" aria-pressed="${current === k}">${info.emoji} ${escapeHtml(T(info.de, info.en))}</button>`).join("");
}
function bindVisibilityPicker(box, onPick) {
  box.querySelectorAll("[data-vis]").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("[data-vis]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    onPick(b.dataset.vis);
  }));
}
function visibilityHint(v) {
  if (v === "friends") return closeFriendRoots().size
    ? T(`Nur du und deine ${closeFriendRoots().size} engen Freunde sehen ihn. Halbe Punkte.`, `Only you and your ${closeFriendRoots().size} close friends see it. Half the points.`)
    : T("Du hast noch keine engen Freunde — im Profil unter „Teilen & enge Freunde“ hinzufügen. Halbe Punkte.", "No close friends yet — add them in your profile. Half the points.");
  if (v === "me") return T("Nur du siehst ihn. Halbe Punkte.", "Only you see it. Half the points.");
  return T("Alle in der App sehen ihn auf Karte und Liste.", "Everyone in the app sees it on the map and list.");
}

/* ---- secret cornerdates: public and secret ones in one place ---- */
function allCornerDates() {
  return { ...(STATE.cornerDates || {}), ...(STATE.secretDates || {}) };
}
function cornerDatePath(id) {
  const d = allCornerDates()[id];
  return d && d.secret ? `secretDates/${d.ownerKey}/${id}` : `cornerDates/${id}`;
}
function cleanupOwnSecretDates() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, remove } = window.FB;
  Object.entries(STATE.secretDates || {}).forEach(([id, d]) => {
    if (d && isMyKey(d.ownerKey) && Number(d.end) < Date.now() - CORNERDATE_KEEP_MS) remove(ref(db, `secretDates/${d.ownerKey}/${id}`)).catch(() => {});
  });
}

/* ---- "Was teile ich mit wem?" in the profile ---- */
function sharingSectionHtml() {
  if (!window.FB?.firebaseReady || !STATE.nickname) return "";
  const mine = getAllCorners().filter((c) => c.isCustom && (c.ownerKey ? isMyKey(c.ownerKey) : !!c.createdById && isMyKey(c.createdById)));
  const counts = { all: 0, friends: 0, me: 0 };
  mine.forEach((c) => { counts[cornerVisibility(c)]++; });
  const friends = [...closeFriendRoots()].map((root) => ({ root, name: identityNickname(root) || "?" }))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  return `<div class="leaderboard-section share-section" id="share-section">
    <h3>🔐 ${T("Teilen & enge Freunde", "Sharing & close friends")}</h3>
    <div class="share-row"><strong>👯 ${T("Deine engen Freunde", "Your close friends")} (${friends.length})</strong> <span class="share-dim">— ${T("nur du siehst diese Liste", "only you see this list")}</span>
      <div class="cf-chips">${friends.map((f) => `<span class="cf-chip">${escapeHtml(f.name)}<button data-cf-remove="${escapeHtml(f.root)}" aria-label="${T("entfernen", "remove")}">✕</button></span>`).join("")}
        <button class="action-btn" id="cf-add">＋ ${T("Hinzufügen", "Add")}</button></div></div>
    <div class="share-row">📍 <strong>${T("Wo du gerade bist", "Where you are")}</strong>: ${T("sehen alle in der App, und alle mit Push bekommen eine Mitteilung. An einem privaten Corner sehen nur deine engen Freunde, welcher es ist.", "everyone in the app sees it, and everyone with push gets a notification. At a private corner only your close friends see which one.")}</div>
    ${inviteSectionHtml()}
    <div class="share-row">🗺️ <strong>${T("Deine Corners", "Your corners")}</strong>: 🌍 ${counts.all} · 👯 ${counts.friends} · 🔒 ${counts.me} <span class="share-dim">— ${T("beim Eintragen oder unter „Spot bearbeiten“ wählbar; private geben halbe Punkte", "chosen when adding or under “edit spot”; private ones give half the points")}</span></div>
    <div class="share-row">📅 <strong>Cornerdates</strong>: ${T("für alle oder 🤫 geheim — dann sehen es nur deine engen Freunde (halbe Punkte)", "for everyone or 🤫 secret — then only your close friends see it (half the points)")}</div>
    <div class="share-row share-dim">⚠️ ${T("Noch ohne Nachweis: Wer bei „Wer bist du?“ deinen Namen antippt, sieht auch deine privaten Sachen. Bevor Fremde dazukommen, sichern wir das ab.", "No proof yet: whoever taps your name under “Who are you?” also sees your private things. We'll secure that before strangers join.")}</div>
  </div>`;
}
function bindSharingSection() {
  $("#cf-add")?.addEventListener("click", openCloseFriendPicker);
  $$("#share-section [data-cf-remove]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    if (await setCloseFriend(b.dataset.cfRemove, false)) renderProfile();
    else b.disabled = false;
  }));
}

