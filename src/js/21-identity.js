/* ====================== ONE PROFILE, SEVERAL LOGINS ======================
   "Wenn wir die App wieder öffnen, sollte es gleich direkt weitergehen."
   Every browser has its own anonymous login: the installed app, the browser
   a WhatsApp link opens in (on the iPhone that is never the installed app),
   a new phone. Picking your profile used to MOVE it to the new login and
   throw the other device out ("Wer bist du hier?") — and the next pick moved
   it back. Now a login simply joins the profile: its points entry carries
   `aliasOf: <profile key>`. Profile and ranking add up all logins of one
   person, nothing is moved and every device stays signed in.            */
function profileRoot(key, store) {
  const src = store || STATE.points || {};
  let k = key;
  const seen = new Set();
  while (k && !seen.has(k)) {
    seen.add(k);
    const next = src[k] && src[k].aliasOf;
    if (!next || typeof next !== "string" || next === k || seen.has(next)) break;
    k = next;
  }
  return k;
}
function myRootKey() {
  const cur = currentUserKey();
  const viaPoints = profileRoot(cur);
  if (viaPoints && viaPoints !== cur) return viaPoints;
  // Known on this device even before the points have loaded.
  const stored = localStorage.getItem("cg.profileRoot") || "";
  return stored && stored !== cur ? profileRoot(stored) : cur;
}
function identityKeysOf(root, store) {
  const src = store || STATE.points || {};
  const keys = new Set([root]);
  Object.keys(src).forEach((k) => { if (profileRoot(k, src) === root) keys.add(k); });
  return keys;
}
// Every key that is me: this login, my profile, its other logins and the
// earlier logins of this device.
function myIdentityKeys() {
  const keys = identityKeysOf(myRootKey());
  keys.add(currentUserKey());
  myKeys().forEach((k) => keys.add(k));
  return [...keys].filter(Boolean);
}
// A leftover copy of an old merge must not be counted twice.
function rewardLooksCopied(entry, other) {
  const a = rewardHistoryList(entry), b = rewardHistoryList(other);
  if (!a.length || !b.length) return false;
  const seen = new Set(b.map((h) => `${h && h.time}|${h && h.pts}`));
  const last = a[a.length - 1];
  const shared = a.filter((h) => seen.has(`${h && h.time}|${h && h.pts}`)).length;
  return !!((last && seen.has(`${last.time}|${last.pts}`)) || shared >= a.length / 2);
}
function identityRewardTotal(kind, key, includeDeviceKeys = false) {
  const store = rewardStore(kind) || {};
  const root = profileRoot(key);
  const keys = identityKeysOf(root);
  if (includeDeviceKeys || root === myRootKey()) myIdentityKeys().forEach((k) => keys.add(k));
  const entries = [...keys].map((k) => ({ k, e: store[k] })).filter((x) => x.e && Number(x.e.total || 0) > 0)
    .sort((a, b) => Number(b.e.total || 0) - Number(a.e.total || 0));
  // The copy check compares histories. The slim copy has none, so with more
  // than one login the full entries are fetched once (35-slim-data.js).
  if (entries.length > 1) requestFullRewardEntries(kind, entries.filter((x) => !x.e.history).map((x) => x.k));
  const withHistory = (x) => (x.e.history ? x.e : fullRewardEntry(kind, x.k));
  const counted = [];
  let total = 0;
  entries.forEach((x) => {
    const h = withHistory(x);
    if (h && counted.some((c) => c && rewardLooksCopied(h, c))) return;
    counted.push(h);
    total += Number(x.e.total || 0);
  });
  return total;
}
function identityNickname(key, store) {
  const src = store || STATE.points || {};
  const root = profileRoot(key, src);
  const good = (n) => !!n && !!String(n).trim() && String(n).trim().toLowerCase() !== "anonym";
  if (good(src[root]?.nickname)) return src[root].nickname;
  let best = "", bestAt = -1;
  identityKeysOf(root, src).forEach((k) => {
    const p = src[k];
    if (p && good(p.nickname) && lastRewardTime(p) > bestAt) { best = p.nickname; bestAt = lastRewardTime(p); }
  });
  return best || (src[root] && src[root].nickname) || "";
}

// Mark `key` as a login of profile `root` (only the link; points stay put).
async function setProfileAlias(key, root) {
  if (!key || !root || key === root || profileRoot(root) === key) return false;
  if (!STATE.points || typeof STATE.points !== "object") STATE.points = {};
  STATE.points[key] = { ...(STATE.points[key] || { total: 0, history: [] }), aliasOf: root };
  savePoints();
  if (!window.FB?.firebaseReady) return true;
  const { db, ref, runTransaction } = window.FB;
  try {
    await withTimeout(runTransaction(ref(db, "points/" + key), (cur) => {
      const base = cur && typeof cur === "object" ? cur : { total: 0 };
      return { ...base, aliasOf: root };
    }), 15000, "alias");
    return true;
  } catch (err) {
    console.warn("profile link failed:", err);
    return false;
  }
}

// A new name shows on every login of my profile (the ranking uses the profile's).
function propagateNickname(name) {
  if (!name || !window.FB?.firebaseReady) return;
  const { db, ref, set } = window.FB;
  identityKeysOf(myRootKey()).forEach((k) => {
    if (STATE.points?.[k]) STATE.points[k].nickname = name;
    if (k !== currentUserKey()) set(ref(db, `points/${k}/nickname`), name).catch(() => {});
  });
  savePoints();
}

/* "Wer bist du?" → tap your name: this login joins that profile. One write,
   nothing moves, the other device keeps working. A tap on the welcome toast
   undoes it (wrong name tapped). */
async function linkToProfile(targetKey, opts = {}) {
  if (!targetKey || !window.FB?.firebaseReady) return false;
  const me = currentUserKey();
  const uid = window.FB.getAuthUid?.() || "";
  if (!me || !uid) { toast(T("Bitte zuerst Zugang oder Login.", "Please get access or log in first.")); return false; }
  try { mergeRewardIndex(await readRewardIndex(8000)); } catch (e) { /* use what we have */ }
  const root = profileRoot(targetKey, STATE.points);
  if (!root) return false;
  if (root === me || profileRoot(me) === root) {
    $("#claim-overlay").style.display = "none";
    return true;
  }
  const nickname = identityNickname(root) || STATE.nickname || "";
  if (!(await setProfileAlias(me, root))) {
    toast(T("Hat nicht geklappt — Verbindung prüfen und nochmal tippen.", "Didn't work — check your connection and tap again."));
    return false;
  }
  const previousName = STATE.nickname;
  localStorage.setItem("cg.profileRoot", root);
  rememberMyKey(root);
  STATE.nickname = nickname;
  localStorage.setItem("cg.nickname", nickname);
  forgetInviteJoin();   // already here before: nobody to thank for a new member
  ensurePointIdentity();
  if (window.FB?.set) window.FB.set(window.FB.ref(window.FB.db, `points/${me}/nickname`), nickname).catch(() => {});
  const { db, ref, set } = window.FB;
  // The profile's team, achievements and visited corners show here too.
  try {
    const t = await readOnce("teams/" + root, 6000).catch(() => null);
    if (t && t.team) {
      STATE.team = t.team;
      localStorage.setItem(TEAM_STORAGE_KEY, t.team);
      ensureTeamHistoryEntry(t.team);
      set(ref(db, "teams/" + me), t).catch(() => {});
    }
  } catch (e) { /* team is optional */ }
  try {
    const a = (await readOnce("achievements/" + root, 6000).catch(() => null)) || {};
    const ids = Object.keys(a);
    if (ids.length) { STATE.achievements = Array.from(new Set([...(STATE.achievements || []), ...ids])); saveAchievements(); }
  } catch (e) { /* achievements are optional */ }
  const visited = (await Promise.all([...identityKeysOf(root)].map((k) => visitedCornersOf(k, "")))).flat();
  if (visited.length) { STATE.visitedCorners = Array.from(new Set([...(STATE.visitedCorners || []), ...visited])); saveVisitedCorners(); }
  $("#claim-overlay").style.display = "none";
  $("#nickname-prompt").style.display = "none";
  syncIdentity();
  updateNicknameBar();
  renderFriendsBar();
  if (STATE.view === "profile") renderProfile();
  if (STATE.view === "leaderboard") renderLeaderboard();
  const lv = getLevel(getCurrentAura()).level;
  scheduleStartCircles();
  toast(`👋 ${T("Willkommen zurück", "Welcome back")}, <strong>${escapeHtml(nickname)}</strong> — Lv. ${lv}, ${T("alles da", "all there")}.<br><span style="font-size:11px;opacity:0.75;">${T("Nicht du? Tippen zum Ändern", "Not you? Tap to change")}</span>`,
    "at-corner", () => unlinkProfile(previousName));
  runPendingLinkActions();
  return true;
}

// Wrong name tapped: this login leaves that profile again.
async function unlinkProfile(previousName = "") {
  const me = currentUserKey();
  const root = localStorage.getItem("cg.profileRoot") || "";
  localStorage.removeItem("cg.profileRoot");
  if (root) forgetMyKey(root);
  if (STATE.points?.[me]) { delete STATE.points[me].aliasOf; savePoints(); }
  if (window.FB?.firebaseReady) window.FB.set(window.FB.ref(window.FB.db, `points/${me}/aliasOf`), null).catch(() => {});
  STATE.nickname = previousName || "";
  if (STATE.nickname) localStorage.setItem("cg.nickname", STATE.nickname);
  else localStorage.removeItem("cg.nickname");
  updateNicknameBar();
  renderFriendsBar();
  if (STATE.view === "profile") renderProfile();
  if (!STATE.nickname) openClaimOverlay({ welcome: true });
}

/* Earlier logins of this phone (login lost, app reinstalled) belong to the
   same person: link them to the profile once access is confirmed, so the
   profile, the ranking and everyone else's view show one person.         */
var _linkingLogins = false;
var _linkRetries = 0;
var _linkVisibilityBound = false;
async function linkMyEarlierLogins() {
  const uid = window.FB?.getAuthUid?.() || "";
  if (!uid || _linkingLogins || !window.FB?.firebaseReady) return;
  _linkingLogins = true;
  let linked = 0, failed = false;
  try {
    const all = await readRewardIndex(8000).catch(() => { failed = true; return null; });   // totals + links are enough
    const cur = currentUserKey();
    for (const key of (all ? myKeys() : [])) {
      if (!key || key === cur || /[.#$\[\]\/]/.test(key)) continue;
      const p = all[key];
      if (!p || Number(p.total || 0) <= 0) continue;
      const myRoot = profileRoot(cur, all);
      const keyRoot = profileRoot(key, all);
      if (keyRoot === myRoot) continue;
      let ok = false;
      if (myRoot === cur) {
        ok = await setProfileAlias(cur, keyRoot);        // this login is new: it joins the earlier profile
        if (ok) { all[cur] = { ...(all[cur] || {}), aliasOf: keyRoot }; localStorage.setItem("cg.profileRoot", keyRoot); }
      } else {
        ok = await setProfileAlias(keyRoot, myRoot);     // an older stand-alone login joins my profile
        if (ok) all[keyRoot] = { ...(all[keyRoot] || {}), aliasOf: myRoot };
      }
      if (ok) linked++; else failed = true;
    }
  } finally { _linkingLogins = false; }
  if (failed && _linkRetries++ < 4) setTimeout(linkMyEarlierLogins, 10000 * _linkRetries);
  if (linked) {
    updateNicknameBar();
    if (STATE.view === "profile") renderProfile();
    if (STATE.view === "leaderboard") renderLeaderboard();
    const lv = getLevel(getCurrentAura()).level;
    toastWhenFree(`🔗 <strong>${T("Deine früheren Logins gehören jetzt zu deinem Profil", "Your earlier logins now belong to your profile")}</strong><br><span style="font-size:11px;opacity:0.8;">${T(`Profil und Ranking zeigen beide Lv. ${lv}.`, `Profile and ranking both show Lv. ${lv}.`, `El perfil y el ranking muestran Lv. ${lv}.`)}</span>`, "at-corner");
  }
}

// Another profile with exactly my name and more points is almost certainly
// me on an earlier phone — offer to merge it right in the profile.
function profileTwinBannerHtml() {
  if (!STATE.nickname || !window.FB?.firebaseReady) return "";
  const twin = findProfileTwin(STATE.nickname);
  if (!twin) return "";
  const lv = getLevel(twin.total).level;
  return `<div class="backup-banner twin-banner">👀 ${T(`Es gibt noch ein Profil <strong>„${escapeHtml(twin.nickname)}“</strong> (Lv. ${lv}, ${twin.total} Aura). Bist du das? Dann leg beide zusammen — die Punkte werden addiert, beide Geräte bleiben angemeldet.`, `There is another profile <strong>“${escapeHtml(twin.nickname)}”</strong> (Lv. ${lv}, ${twin.total} aura). Is that you? Merge them — the points are added up and both devices stay signed in.`, `Hay otro perfil <strong>«${escapeHtml(twin.nickname)}»</strong> (Lv. ${lv}, ${twin.total} de aura). ¿Eres tú? Únelos — los puntos se suman y ambos dispositivos siguen con la sesión iniciada.`)}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"><button class="action-btn primary" data-twin-merge="${escapeHtml(twin.key)}">🔗 ${T("Ja, zusammenführen", "Yes, merge")}</button></div></div>`;
}

function openAdminSection(sel) {
  renderAdminPanel().then(() => setTimeout(() => $(sel)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150));
}

// Two entries of the same person: add them up — unless one is a copy of the
// other (an old recovery snapshot), which would double the points.
function mergeClaimedRewards(current, incoming, nickname) {
  if (!incoming) return current ? { ...current, nickname: nickname || current.nickname || "" } : null;
  if (!current || !Number(current.total || 0)) return { ...incoming, history: rewardHistoryList(incoming).slice(-REWARD_HISTORY_MAX), nickname: nickname || incoming.nickname || "" };
  const curHist = rewardHistoryList(current);
  const incHist = rewardHistoryList(incoming);
  const seen = new Set(curHist.map((h) => `${h && h.time}|${h && h.pts}`));
  const shared = incHist.filter((h) => seen.has(`${h && h.time}|${h && h.pts}`)).length;
  const last = incHist[incHist.length - 1];
  // A copy carries the old profile's latest entry (nothing is added to a lost login).
  const isCopy = incHist.length && ((last && seen.has(`${last.time}|${last.pts}`)) || shared >= incHist.length / 2);
  if (isCopy) {
    const best = pickClaimRewardEntry(current, incoming, nickname);
    return { ...best, nickname: nickname || best.nickname || "" };
  }
  const history = [...curHist, ...incHist.filter((h) => !seen.has(`${h && h.time}|${h && h.pts}`))]
    .sort((a, b) => Number(a && a.time || 0) - Number(b && b.time || 0))
    .slice(-REWARD_HISTORY_MAX);
  return { total: Number(current.total || 0) + Number(incoming.total || 0), history, nickname: nickname || current.nickname || incoming.nickname || "" };
}

/* Move a profile (oldKey) onto my current login. Used for unlocked profiles,
   approved requests, recovery codes and admins. Returns true on success.    */
async function claimExistingProfile(oldKey, opts = {}) {
  if (!oldKey || !window.FB?.firebaseReady) return false;
  const newKey = currentUserKey();
  if (!newKey) { toast(T("Bitte zuerst Zugang oder Login.", "Please get access or log in first.")); return false; }
  if (oldKey === newKey) return false;
  if (!STATE.points || typeof STATE.points !== "object") STATE.points = {};
  if (!STATE.karmaPoints || typeof STATE.karmaPoints !== "object") STATE.karmaPoints = {};
  const { db, ref, get, set, update, remove, runTransaction } = window.FB;
  const uid = window.FB.getAuthUid?.() || "";
  try {
    // Take the lock first: the device that had this profile watches its lock
    // and asks "who are you?" again once it moves here.
    try {
      await withTimeout(set(ref(db, "profileLocks/" + oldKey), { by: uid, at: Date.now(), nickname: STATE.nickname || "" }), 15000, "lock");
    } catch (lockErr) {
      console.warn("profile lock refused:", lockErr);
      if (!opts.quiet && !opts.quietFail) {
        toast(T("Übernahme ging nicht — fehlt der Zugang? Bitte Einladungscode prüfen.", "Takeover failed — missing access? Please check the invite code."));
        verifyAccessGrant({ interactive: true });
      }
      return false;
    }
    const [oldPoints, oldKarma, oldAchievements, oldTeam] = await Promise.all([
      readOnce("points/" + oldKey),
      readOnce("karmaPoints/" + oldKey).catch(() => null),
      readOnce("achievements/" + oldKey).catch(() => null),
      readOnce("teams/" + oldKey).catch(() => null)
    ]);
    if (!oldPoints && !oldKarma) { if (!opts.quiet && !opts.quietFail) toast(T("Profil nicht gefunden.", "Profile not found.")); return false; }
    // Name and team: the profile I pick wins. When merging my own earlier
    // logins, the bigger profile wins, and "Anonym" never replaces a name.
    const oldNick = String(oldPoints?.nickname || oldKarma?.nickname || "").trim();
    const oldIsBigger = Number(oldPoints?.total || 0) >= Number(STATE.points?.[newKey]?.total || 0);
    const takeOld = !!oldNick && oldNick.toLowerCase() !== "anonym" && (!opts.consolidate || !STATE.nickname || oldIsBigger);
    const nickname = takeOld ? oldNick : (STATE.nickname || oldNick || "");
    if (nickname) { STATE.nickname = nickname; localStorage.setItem("cg.nickname", nickname); }
    const team = oldTeam && oldTeam.team;
    if (team && (!opts.consolidate || !STATE.team || oldIsBigger)) { STATE.team = team; localStorage.setItem(TEAM_STORAGE_KEY, team); ensureTeamHistoryEntry(team); }
    // Merge on the server copy atomically (others may be rewarding me right now).
    const mergeInto = async (node, incoming) => {
      if (!incoming) return null;
      const path = ref(db, node + "/" + newKey);
      if (typeof runTransaction === "function") {
        const res = await runTransaction(path, (cur) => mergeClaimedRewards(cur && typeof cur === "object" ? cur : null, incoming, nickname));
        return res && res.snapshot ? res.snapshot.val() : null;
      }
      const merged = mergeClaimedRewards(STATE[node === "points" ? "points" : "karmaPoints"][newKey], incoming, nickname);
      await set(path, merged);
      return merged;
    };
    const [auraEntry, karmaEntry] = await Promise.all([mergeInto("points", oldPoints), mergeInto("karmaPoints", oldKarma)]);
    if (auraEntry) STATE.points[newKey] = auraEntry;
    if (karmaEntry) STATE.karmaPoints[newKey] = karmaEntry;
    savePoints();
    saveKarmaPoints();
    // Visited corners: from the old key's check-ins (and, for very old
    // check-ins without a user id, from the nickname).
    const claimedVisited = await visitedCornersOf(oldKey, nickname);
    if (claimedVisited.length) {
      STATE.visitedCorners = Array.from(new Set([...(STATE.visitedCorners || []), ...claimedVisited]));
      saveVisitedCorners();
    }
    const oldAch = oldAchievements || {};
    const achIds = Object.keys(oldAch);
    const updates = {};
    if (achIds.length) {
      STATE.achievements = Array.from(new Set([...(STATE.achievements || []), ...achIds]));
      saveAchievements();
      achIds.forEach((id) => { updates[`achievements/${newKey}/${id}`] = oldAch[id]; });
    }
    if (team && STATE.team === team) updates[`teams/${newKey}`] = oldTeam;
    // Re-attribute the check-in history (profile map, history playback) and the
    // "met each other" counts to the new login.
    // (the Cloud Function then moves them to the new login's index)
    Object.entries(await visitIdsOfKey(oldKey)).forEach(([vid, cornerId]) => {
      updates[`visits/${cornerId}/${vid}/userId`] = newKey;
    });
    Object.entries(STATE.encounters || {}).forEach(([pairKey, e]) => {
      const users = (e && e.users) || {};
      if (!(oldKey in users)) return;
      const other = Object.keys(users).find((id) => id !== oldKey);
      if (!other || other === newKey) { updates[`encounters/${pairKey}`] = null; return; }
      const nk = [newKey, other].sort().join("__");
      const existing = STATE.encounters[nk] || updates[`encounters/${nk}`] || null;
      updates[`encounters/${nk}`] = {
        count: Number(existing?.count || 0) + Number(e.count || 0),
        lastSeen: Math.max(Number(existing?.lastSeen || 0), Number(e.lastSeen || 0)),
        lastCorner: (Number(existing?.lastSeen || 0) > Number(e.lastSeen || 0) ? existing?.lastCorner : e.lastCorner) || "",
        users: { [newKey]: nickname, [other]: users[other] }
      };
      updates[`encounters/${pairKey}`] = null;
    });
    // Gossip chronicle of the old login (readable now that its lock is mine).
    try {
      const oldLog = (await readOnce("gossipLog/" + oldKey)) || {};
      Object.entries(oldLog).forEach(([id, g]) => { if (g && typeof g === "object") updates[`gossipLog/${uid}/${id}`] = g; });
      if (Object.keys(oldLog).length) updates[`gossipLog/${oldKey}`] = null;
    } catch (err) { /* no chronicle yet */ }
    if (Object.keys(updates).length) await update(ref(db), updates).catch((err) => console.warn("claim: re-attribution failed:", err));
    // Remove the old identity so the same person doesn't appear twice.
    await Promise.all([
      remove(ref(db, "points/" + oldKey)),
      remove(ref(db, "karmaPoints/" + oldKey)).catch(() => {}),
      remove(ref(db, "achievements/" + oldKey)),
      remove(ref(db, "teams/" + oldKey)),
      remove(ref(db, "presence/" + oldKey)).catch(() => {})
    ]);
    rememberMyKey(oldKey);
    // Gone locally too, so the ranking never keeps showing the old login.
    delete STATE.points[oldKey];
    delete STATE.karmaPoints[oldKey];
    savePoints();
    saveKarmaPoints();
    ensurePointIdentity();
    syncIdentity();
    syncProfileToCloud();
    localStorage.removeItem("cg.profileLocked"); // the key changed — re-reserve
    ensureOwnProfileLock();
    updateNicknameBar();
    renderFriendsBar();
    if (STATE.view === "profile") renderProfile();
    const overlay = $("#claim-overlay");
    if (overlay) overlay.style.display = "none";
    // Claimed profile brings its nickname — skip the "Wer bist du?" step.
    const nickPrompt = $("#nickname-prompt");
    if (nickPrompt && STATE.nickname) nickPrompt.style.display = "none";
    const total = Number(auraEntry?.total || 0);
    if (!opts.quiet) {
      if (opts.approved) showRewardCelebration(total, "aura", { emoji: "🛟", text: T(`„${escapeHtml(nickname)}“ ist zurück!`, `“${escapeHtml(nickname)}” is back!`, `¡«${escapeHtml(nickname)}» ha vuelto!`) });
      toast(T(`✅ Profil „${escapeHtml(nickname)}“ übernommen — willkommen zurück!`, `✅ Profile “${escapeHtml(nickname)}” restored — welcome back!`, `✅ Perfil «${escapeHtml(nickname)}» restaurado — ¡bienvenido de nuevo!`));
    }
    return true;
  } catch (err) {
    console.warn("claimExistingProfile failed:", err);
    if (!opts.quiet && !opts.quietFail) toast(T("Übernahme fehlgeschlagen.", "Takeover failed."));
    return false;
  }
}

async function initFirebase() {
  // Parse ?corner= / ?checkin= / ?invite= / ?ref= / ?gossip= links. This call
  // got lost in an earlier refactor, which silently broke shared corner links
  // and QR-sticker check-ins. Must run before openPendingSharedCorner().
  applyIncomingLinks();
  if (!window.FB || !window.FB.firebaseReady) {
    const status = $("#fb-status");
    status.style.display = "block";
    status.className = "firebase-status offline";
    status.textContent = T("⚡ Offline-Modus — Firebase nicht konfiguriert (Kommentare & Freunde lokal)", "⚡ Offline mode — Firebase not configured (comments & friends local)");
    loadLocalComments();
    loadLocalBarometer();
    STATE.emojiVotes = loadLocalEmojiVotes();
    STATE.visits = loadLocalVisits();
    STATE.cornerVotes = loadLocalCornerVotes();
    STATE.directMessages = loadLocalDirectMessages();
    updateNicknameBar();
    return;
  }
  if (window.FB.authReady) await window.FB.authReady;
  // If the page was opened via an email sign-in link, complete it now.
  try {
    const linkedEmail = await window.FB.completeEmailLinkSignIn?.();
    if (linkedEmail) {
      await refreshAccessForCurrentUser();
      const luid = window.FB.getAuthUid?.();
      if (luid) loadProfileFromCloud(luid);
      try { window.history.replaceState({}, "", window.location.href.split("?")[0].split("#")[0]); } catch (e) {}
      toast(`✅ Angemeldet als ${escapeHtml(linkedEmail)}`);
      unlockAchievement("secured", "Abgesichert", "🔐", 20);
    }
  } catch (err) { console.warn("Email-link sign-in failed:", err); }
  const authUid = window.FB.getAuthUid?.() || "";
  if (!authUid) {
    // Auth not yet ready but DB reads are public — still attach listeners so content is visible
    const status = $("#fb-status");
    status.style.display = "block";
    status.className = "firebase-status offline";
    status.textContent = T("⚡ Verbindung wird hergestellt — Inhalte werden geladen", "⚡ Connecting — loading content");
    loadLocalComments();
    loadLocalBarometer();
    STATE.emojiVotes = loadLocalEmojiVotes();
    STATE.visits = loadLocalVisits();
    STATE.cornerVotes = loadLocalCornerVotes();
    STATE.directMessages = loadLocalDirectMessages();
    updateNicknameBar();
    // Attach read-only listeners
    listenSharedCorners();
    listenComments();
    listenCheckinFeedback();
    listenBarometer();
    listenVisits();
    listenEmojiVotes();
    listenPhotos();
    listenPoints();
    listenKarmaPoints();
    listenTeams();
    listenCornerStatuses();
    listenCaptured();
    listenCornerVotes();
    listenSupplyRuns();
    listenGossip();
    listenCornerDates();
    listenCornerFacts();
    openPendingSharedCorner();
    // This onAuthChange handler covers the case where auth was initially absent.
    // It activates write-gated features once auth eventually succeeds.
    window.FB.onAuthChange?.((uid) => {
      if (!uid) return;
      migrateUserIdentity(STATE.userId, uid);
      _activateAuthDependentFeatures(uid, $("#fb-status"));
    });
    return;
  }
  const previousUserId = STATE.userId;
  migrateUserIdentity(previousUserId, authUid);
  const status = $("#fb-status");
  status.style.display = "block";
  // Set up status, VAPID key, presence and auth-gated listeners via shared helper
  _activateAuthDependentFeatures(authUid, status);
  // This onAuthChange handler covers the case where the UID changes after initial auth
  // (e.g., anonymous session gets upgraded). Not the same scenario as the handler above.
  window.FB.onAuthChange?.((uid) => {
    if (!uid || uid === STATE.userId) return;
    // Remember + consolidate the previous key, otherwise XP and messages stay
    // stranded under it (this path was missing the migration entirely).
    migrateUserIdentity(STATE.userId, uid);
    STATE.userId = uid;
    localStorage.setItem(USER_ID_STORAGE_KEY, uid);
    ensurePointIdentity();
    migrateInboxFromLegacyKeys();
    syncIdentity();
  });
  window.FB.bindForegroundPush?.((payload) => {
    const body = payload?.notification?.body || payload?.data?.body;
    if (!body) return;
    // With the app open, gossip rounds already show their own toast / celebration.
    if (/^gossip/.test(String(payload?.data?.type || ""))) return;
    // Pushes carry an in-app link (?chat=…, ?corner=…, ?profile=…) — the toast
    // opens the same place the system notification would.
    const link = payload?.data?.url || payload?.fcmOptions?.link || "";
    const action = link ? deepLinkAction(link) : null;
    toast(`🔔 ${escapeHtml(body)}${action ? `<br><span style="font-size:11px;opacity:0.7;">${T("Tippen zum Öffnen →", "Tap to open →")}</span>` : ""}`, null, action);
  });
  listenFriendPresence();
  listenSharedCorners();
  listenComments();
  listenCheckinFeedback();
  listenBarometer();
  listenVisits();
  listenEmojiVotes();
  listenPhotos();
  listenPoints();
  listenKarmaPoints();
  listenTeams();
  listenCornerStatuses();
  listenCaptured();
  listenCornerVotes();
  listenSupplyRuns();
  listenGossip();
  listenCornerDates();
  listenCornerFacts();
}

// The corner I count as being at. An explicit check-in wins over GPS proximity.
function myPresenceCorner() {
  return STATE.manualCheckinId || STATE.atCornerId || null;
}

function broadcastPresence() {
  applyKeepAwakePref();
  if (!window.FB?.firebaseReady || !STATE.nickname) return Promise.resolve();
  const { db, ref, set, onDisconnect, serverTimestamp } = window.FB;
  const activeCorner = myPresenceCorner();
  const myRef = ref(db, "presence/" + currentUserKey());
  const since = activeCorner ? (parseInt(localStorage.getItem("cg.checkedInAt") || "0", 10) || null) : null;
  const write = set(myRef, {
    nickname: STATE.nickname, name: STATE.nickname, team: STATE.team || "",
    atCorner: activeCorner, checkedInAt: since,
    status: STATE.availability || "available",
    lastSeen: Date.now(),
    online: !document.hidden
  });
  // Screen locked, app killed or tab closed: keep the entry (deleting it made
  // people vanish from their corner the moment their phone locked) and only
  // mark it offline. presenceIsVisible() decides how long it still counts.
  try { onDisconnect(myRef).update({ online: false, offlineAt: serverTimestamp() }).catch(() => {}); }
  catch (err) { console.warn("presence onDisconnect failed:", err); }
  return Promise.resolve(write).catch((err) => console.warn("broadcastPresence failed:", err));
}

/* ---- Screen wake lock ----
   A web app cannot keep running once the screen is locked (iOS freezes it
   completely), but it can stop the screen from locking: automatically during
   gossip rounds, and while checked in if the user enables it in the profile.
   Browsers drop the lock whenever the app is hidden, so it is re-requested
   when the app becomes visible again.                                       */
const WAKE = { sentinel: null, reasons: new Set(), pending: false };
function wakeLockSupported() { return typeof navigator !== "undefined" && "wakeLock" in navigator; }
async function syncWakeLock() {
  if (!wakeLockSupported() || WAKE.pending) return;
  const want = WAKE.reasons.size > 0 && !document.hidden;
  if (want && !WAKE.sentinel) {
    WAKE.pending = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => { if (WAKE.sentinel === sentinel) WAKE.sentinel = null; });
      WAKE.sentinel = sentinel;
    } catch (err) { /* refused (battery saver / not focused) — not fatal */ }
    finally { WAKE.pending = false; }
    if (!WAKE.reasons.size && WAKE.sentinel) syncWakeLock(); // dropped meanwhile
  } else if (!want && WAKE.sentinel) {
    const sentinel = WAKE.sentinel;
    WAKE.sentinel = null;
    try { await sentinel.release(); } catch (err) { /* already released */ }
  }
}
function holdWakeLock(reason) { if (!WAKE.reasons.has(reason)) { WAKE.reasons.add(reason); } syncWakeLock(); }
function dropWakeLock(reason) { if (WAKE.reasons.delete(reason)) syncWakeLock(); }
function keepAwakeWhileCheckedIn() { return localStorage.getItem("cg.keepAwake") === "1"; }
function applyKeepAwakePref() {
  if (keepAwakeWhileCheckedIn() && myPresenceCorner()) holdWakeLock("checkin");
  else dropWakeLock("checkin");
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncWakeLock(); });

// Called when the app goes to the background (screen lock, app switch): others
// see 💤 right away instead of only after the connection times out.
function markPresenceAsleep() {
  if (!window.FB?.firebaseReady || !STATE.nickname || typeof window.FB.update !== "function") return;
  try {
    const { db, ref, update } = window.FB;
    update(ref(db, "presence/" + currentUserKey()), { online: false, lastSeen: Date.now() }).catch(() => {});
  } catch (err) { /* best effort */ }
}

function broadcastLiveLocation() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, set, onDisconnect, remove } = window.FB;
  const liveRef = ref(db, "liveLocations/" + currentUserKey());
  if (!STATE.geoActive || !STATE.userPos || !STATE.nickname) { remove(liveRef); return; }
  set(liveRef, { lat: STATE.userPos.lat, lng: STATE.userPos.lng, nickname: STATE.nickname, team: STATE.team || "", timestamp: Date.now() });
  onDisconnect(liveRef).remove();
}

function startPresenceHeartbeat() {
  if (STATE.presenceHeartbeat) clearInterval(STATE.presenceHeartbeat);
  autoCheckoutIfStale();
  STATE.presenceHeartbeat = setInterval(() => {
    autoCheckoutIfStale();
    broadcastPresence();
    broadcastLiveLocation();
    checkDwellAutoCheckin();
  }, PRESENCE_HEARTBEAT_INTERVAL_MS);
  if (!STATE.presenceVisibilityHookBound) {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        autoCheckoutIfStale(); // app was backgrounded overnight
        broadcastPresence();
        broadcastLiveLocation();
      } else {
        markPresenceAsleep();
      }
    });
    window.addEventListener("pagehide", markPresenceAsleep);
    STATE.presenceVisibilityHookBound = true;
  }
}

/* Who still counts as "around"?
   - Checked in at a corner: stays there while the phone sleeps (screen locked,
     app in the background) for up to CHECKIN_STICKY_MS after the last sign of
     life — cornering takes hours and nobody stares at their phone the whole time.
   - Not checked in: visible for PRESENCE_FRESH_MS after the last sign of life.
   Old clients (no `online` flag) still delete their entry on disconnect.     */
function presenceIsVisible(f, now = Date.now()) {
  if (!f) return false;
  const age = now - Number(f.lastSeen || 0);
  return age < (f.atCorner ? CHECKIN_STICKY_MS : PRESENCE_FRESH_MS);
}

// App closed / screen off right now (push still reaches them, in-app toasts don't).
function presenceIsAsleep(f, now = Date.now()) {
  if (!f) return false;
  return f.online === false || now - Number(f.lastSeen || 0) > PRESENCE_ASLEEP_MS;
}

function asleepSinceLabel(f) {
  const mins = Math.max(1, Math.round((Date.now() - Number(f.lastSeen || 0)) / 60000));
  return mins < 60 ? T(`vor ${mins} min`, `${mins} min ago`, `hace ${mins} min`) : T(`vor ${Math.floor(mins / 60)} h`, `${Math.floor(mins / 60)} h ago`, `hace ${Math.floor(mins / 60)} h`);
}

// Returns only presence entries that still count as online / at their corner.
// Mirrors the filter in renderFriendsBar so all corner-level logic stays consistent.
function freshFriends() {
  // One entry per person: someone with the app AND a browser open shows once.
  const byPerson = {};
  Object.values(STATE.friends || {}).forEach((f) => {
    if (!presenceIsVisible(f) || isMyKey(f.id)) return;
    const root = profileRoot(f.id);
    const prev = byPerson[root];
    const score = (x) => (x.atCorner ? 1e15 : 0) + Number(x.lastSeen || 0);
    if (!prev || score(f) > score(prev)) byPerson[root] = f;
  });
  return Object.values(byPerson);
}

// Only who was seen recently (query on lastSeen, indexed in the rules) — not
// every login that ever opened the app. The window moves on every half hour.
var _presenceUnsub = null;
var _presenceRefreshTimer = null;
const PRESENCE_QUERY_WINDOW_MS = CHECKIN_STICKY_MS + 30 * 60 * 1000;
function listenFriendPresence() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue, query, orderByChild, startAt } = window.FB;
  if (_presenceUnsub) { try { _presenceUnsub(); } catch (e) { /* already gone */ } }
  clearTimeout(_presenceRefreshTimer);
  _presenceRefreshTimer = setTimeout(listenFriendPresence, 30 * 60 * 1000);
  const recent = query(ref(db, "presence"), orderByChild("lastSeen"), startAt(Date.now() - PRESENCE_QUERY_WINDOW_MS));
  _presenceUnsub = onValue(recent, (snapshot) => {
    const data = snapshot.val() || {};
    const oldFriends = { ...STATE.friends };
    STATE.friends = {};
    Object.entries(data).forEach(([id, info]) => {
      if (id === currentUserKey() || isMyKey(id)) return;   // me, also on my other devices
      const friend = { ...info, id, nickname: info.nickname || info.name || id };
      STATE.friends[id] = friend;
      if (friend.atCorner && (!oldFriends[id] || oldFriends[id].atCorner !== friend.atCorner)) {
        // Only alarm for fresh arrivals — skip stale DB entries on reconnect.
        if (Date.now() - Number(friend.lastSeen || 0) <= CHECKIN_ALARM_WINDOW_MS) {
          const corner = getAllCorners().find((c) => c.id === friend.atCorner);
          if (corner) friendAtCornerAlarm(friend, corner);
        }
      }
    });
    renderFriendsBar();
    refreshGossipViews();   // who can listen / start a round depends on who is here
  });
}

function friendAtCornerAlarm(friend, corner) {
  if (!shouldNotify(friend)) return;
  toast(`🍻 <strong>${escapeHtml(getDisplayName(friend.nickname, friend.team))}</strong> ${T("ist am", "is at")} <strong>${escapeHtml(corner.name)}</strong>!<br><span style="font-size:11px;opacity:0.75;">${T("Tippen = zum Corner →", "Tap = open corner →")}</span>`, "friend-alert", () => openDetail(corner.id));
  if ("Notification" in window) {
    if (Notification.permission === "granted" && document.hidden) {
      try {
        const n = new Notification("Minga Corner Guide", { body: `${friend.nickname} ${T("ist gerade am", "is now at")} ${corner.name}!` });
        n.onclick = () => { try { window.focus(); } catch (e) {} openDetail(corner.id); n.close(); };
      } catch (err) { /* some browsers only allow notifications from the service worker */ }
    } else if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
}

function renderFriendsBar() {
  const bar = $("#friends-bar");
  const list = $("#friends-list");
  // Hide stale presence entries (see presenceIsVisible); people whose screen is
  // off stay listed with 💤 instead of vanishing.
  const friends = freshFriends()
    .sort((a, b) => (b.atCorner ? 1 : 0) - (a.atCorner ? 1 : 0)
      || (presenceIsAsleep(a) ? 1 : 0) - (presenceIsAsleep(b) ? 1 : 0)
      || Number(b.lastSeen || 0) - Number(a.lastSeen || 0));
  if (!friends.length) { bar.classList.remove("has-friends"); list.innerHTML = ""; return; }
  bar.classList.add("has-friends");
  list.innerHTML = friends.map((friend) => {
    const corner = friend.atCorner ? getAllCorners().find((c) => c.id === friend.atCorner) : null;
    const xp = identityRewardTotal("aura", friend.id);
    const { level } = getLevel(xp);
    const tier = getLevelTier(level);
    const avail = AVAILABILITY[friend.status] || null;
    const statusLabel = corner ? "@ " + escapeHtml(corner.name) : friend.atCorner ? "🔒 " + T("privat", "private") : escapeHtml(avail?.label || T("online", "online"));
    const asleep = presenceIsAsleep(friend);
    return `<li class="friend-chip ${corner ? "" : "away"} ${asleep ? "asleep" : ""}" style="border-color:${TEAMS[friend.team]?.color || 'var(--line)'};">
      <span class="friend-dot" title="${escapeHtml(avail?.label || "")}" style="background:${avail?.color || TEAMS[friend.team]?.color || 'var(--fg-dim)'};"></span>
      <button class="friend-name" data-user-profile="${escapeHtml(friend.id)}" title="${T("Profil ansehen", "View profile")}">${escapeHtml(getDisplayName(friend.nickname, friend.team))}</button>
      ${asleep ? `<span class="friend-asleep" title="${T("Display aus — bekommt Push, sieht aber gerade nichts live", "Screen off — gets push, not watching live")}">💤 ${asleepSinceLabel(friend)}</span>` : ""}
      ${corner
        ? `<button class="friend-corner friend-goto" data-goto-corner="${escapeHtml(corner.id)}" title="${T("Zum Corner springen", "Go to corner")}">${statusLabel} →</button>`
        : `<span class="friend-corner">${statusLabel}</span>`}
      <span class="friend-level">${tier.emoji} Lv.${level}</span>
      ${corner ? `<button class="action-btn" style="padding:4px 8px;font-size:10px;" data-supply-user="${friend.id}" title="${T("Frag ob Nachschub gebraucht wird", "Ask if supplies are needed")}">🛒 ${T("Nachschub?", "Supplies?")}</button>` : ""}
      <button class="action-btn" style="padding:4px 8px;font-size:10px;" data-dm-user="${friend.id}">💬</button>
    </li>`;
  }).join("");
  list.querySelectorAll("[data-dm-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const friend = STATE.friends[btn.dataset.dmUser];
      sendDirectMessagePrompt(btn.dataset.dmUser, friend?.nickname || friend?.name || btn.dataset.dmUser);
    });
  });
  // "Wenn man sieht dass jemand eingecheckt ist, muss man draufklicken können
  //  dass man direkt zu diesem Corner kommt" — aus den App-Kommentaren.
  list.querySelectorAll("[data-goto-corner]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openDetail(btn.dataset.gotoCorner); });
  });
  list.querySelectorAll("[data-supply-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const friend = STATE.friends[btn.dataset.supplyUser];
      const name = friend?.nickname || friend?.name || btn.dataset.supplyUser;
      sendQuickMessage(btn.dataset.supplyUser, name, T("Brauchst du Nachschub? 🍺🛒", "Need supplies? 🍺🛒"));
    });
  });
}

// One-tap preset message (used by the Nachschub button). Sends immediately,
// no prompt — the recipient gets a push via the messages Cloud Function.
// Stable conversation id for a pair of users (order-independent, path-safe).
function chatPairId(a, b) {
  const clean = (x) => String(x || "").replace(/[.#$\[\]/]/g, "_");
  return [clean(a), clean(b)].sort().join("__");
}

// Local per-conversation activity log so the chat list can sort by "last
// written" even for messages *I* sent (the inbox only holds received ones).
function loadChatActivity() {
  try { return JSON.parse(localStorage.getItem("cg.chatActivity") || "{}"); }
  catch (e) { return {}; }
}

function receiptTime(value) {
  return typeof value === "object" ? Number(value?.time || 0) : Number(value || 0);
}

function receiptThreadPath(peerId) {
  const authUid = window.FB?.getAuthUid?.();
  const peer = String(peerId || "");
  if (!authUid || !peer || peer.startsWith("user-")) return "";
  const ids = [authUid, peer].sort();
  return "messageReadReceipts/" + ids[0] + "/" + ids[1];
}

function peerReadAt(reads, peerId) {
  if (!peerId) return 0;
  return receiptTime(reads?.[peerId]);
}

function pushChatReadReceipt(peerId) {
  if (!peerId || !window.FB?.firebaseReady) return;
  const readerId = window.FB.getAuthUid?.();
  if (!readerId) return;
  const { db, ref, set } = window.FB;
  const threadPath = receiptThreadPath(peerId);
  if (!threadPath) return;
  Promise.resolve(set(ref(db, threadPath + "/" + readerId), Date.now()))
      .catch((err) => console.warn("chat read receipt write failed:", err));
}

/* ---- Social gamification: XP + achievements for chatting & meeting friends ---- */
var _lastChatXpAt = 0;
function grantChatXp(toName) {
  // Small XP per message, max once per minute so spamming doesn't farm points.
  if (Date.now() - _lastChatXpAt > 60 * 1000) {
    _lastChatXpAt = Date.now();
    addXp(2, `Nachricht an ${toName}`);
  }
  const partners = Object.keys(loadChatActivity()).length;
  if (partners >= 1) unlockAchievement("first-dm", "Erste DM", "✉️", 10);
  if (partners >= 3) unlockAchievement("three-chats", "Quasselstrippe", "🗣️", 30);
  if (partners >= 5) unlockAchievement("five-chats", "Sozialer Schmetterling", "🦋", 60);
  if (partners >= 10) unlockAchievement("ten-chats", "Netzwerker", "🕸️", 150);
  if (partners >= 20) unlockAchievement("twenty-chats", "Stimme von Minga", "📣", 400);
}

// Distinct friends I have checked in together with (from the encounters node).
function distinctEncounterFriends() {
  const me = currentUserKey();
  const others = new Set();
  Object.values(STATE.encounters || {}).forEach((entry) => {
    const users = entry?.users || {};
    if (!(me in users)) return;
    Object.keys(users).forEach((id) => { if (id !== me) others.add(id); });
  });
  return others.size;
}

function checkEncounterAchievements() {
  const n = distinctEncounterFriends();
  if (n >= 1) unlockAchievement("first-encounter", "Nicht allein", "🤝", 15);
  if (n >= 3) unlockAchievement("three-encounters", "Cliquen-Kern", "👥", 40);
  if (n >= 5) unlockAchievement("five-encounters", "Rudelführer", "🐺", 75);
  if (n >= 10) unlockAchievement("ten-encounters", "Ganz Minga kennt di", "🏙️", 150);
  if (n >= 20) unlockAchievement("twenty-encounters", "Stadtbekannt", "🌆", 300);
  if (n >= 50) unlockAchievement("fifty-encounters", "Minga-Legende", "🦁", 750);
}
function recordChatActivity(peerId, peerName, text, time) {
  if (!peerId) return;
  const log = loadChatActivity();
  const prev = log[peerId];
  if (prev && (prev.time || 0) >= (time || 0)) return;
  log[peerId] = { name: peerName || peerId, text: text || "", time: time || Date.now() };
  localStorage.setItem("cg.chatActivity", JSON.stringify(log));
}

// Core send: writes to messages/{toId} (drives the push + inbox) AND to
// chats/{pairId} (the two-sided thread both participants can read).
function sendMessage(toId, toName, text, opts = {}) {
  if (!STATE.nickname) { toast(T("Bitte gib zuerst einen Namen ein.", "Please enter a name first.")); return false; }
  if (!toId || toId === currentUserKey()) return false;
  const clean = String(text || "").trim();
  if (!clean) return false;
  const payload = {
    fromId: currentUserKey(),
    fromName: STATE.nickname,
    fromTeam: STATE.team || "",
    toId,
    toName: toName || toId,
    text: clean,
    time: Date.now(),
    cornerId: opts.cornerId || STATE.manualCheckinId || STATE.atCornerId || null
  };
  if (window.FB?.firebaseReady) {
    const { db, ref, push, set } = window.FB;
    Promise.resolve(set(push(ref(db, "messages/" + toId)), payload))
      .catch((err) => { console.warn("message write failed:", err); toast(T("⚠️ Nachricht konnte nicht zugestellt werden.", "⚠️ Message could not be delivered.")); });
    const pairId = chatPairId(currentUserKey(), toId);
    Promise.resolve(set(push(ref(db, "chats/" + pairId)), payload))
      .catch((err) => console.warn("chat thread write failed (rules deployed?):", err));
    recordChatActivity(toId, toName, clean, payload.time);
    grantChatXp(toName || toId);
  } else {
    STATE.directMessages.push({ ...payload, local: true, incoming: false });
    saveLocalDirectMessages();
  }
  if (opts.toastMsg !== false) toast(opts.toastMsg || `💬 Nachricht an <strong>${escapeHtml(toName || toId)}</strong> gesendet`);
  return true;
}

function sendQuickMessage(toId, toName, text) {
  sendMessage(toId, toName, text, { toastMsg: `🛒 ${T("Nachschub-Frage an", "Supply question sent to", "Pregunta de provisiones enviada a")} <strong>${escapeHtml(toName || toId)}</strong>${T(" gesendet", "", "")}` });
}

function sendDirectMessagePrompt(toId, toName, cornerId) {
  // Opening the chat thread is the primary path now; keep prompt as a fallback.
  openChatThread(toId, toName);
}

var _inboxByKey = {};   // messages per identity key, merged for display
function listenDirectMessages() {
  if (!window.FB?.firebaseReady || !STATE.nickname) return;
  const { db, ref, onValue } = window.FB;
  // Listen on EVERY key this person has used — a message sent to an older key
  // would otherwise silently vanish.
  myKeys().forEach((key) => attachInboxListener(key, ref, onValue, db));
}

function attachInboxListener(key, ref, onValue, db) {
  onValue(ref(db, "messages/" + key), (snapshot) => {
    _inboxByKey[key] = Object.entries(snapshot.val() || {}).map(([id, msg]) => ({ id, ...msg }));
    const seen = new Set();
    const messages = Object.values(_inboxByKey).flat()
      .filter((m) => { const k = m.id + "|" + m.time; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (a.time || 0) - (b.time || 0));
    STATE.directMessages = messages.slice(-MAX_DIRECT_MESSAGES);
    saveLocalDirectMessages();
    const newest = messages[messages.length - 1];
    if (newest?.time && newest.time > STATE.lastDirectMessageAt && !isMyKey(newest.fromId) && !isBlocked(newest.fromId)) {
      const fromName = newest.fromName || newest.fromId || "Unbekannt";
      toast(
        `💬 <strong>${escapeHtml(fromName)}</strong>: ${escapeHtml((newest.text || "").slice(0, 60))}<br><span style="font-size:11px;opacity:0.7;">${T("Tippen zum Antworten →", "Tap to reply →", "Toca para responder →")}</span>`,
        null,
        () => openChatThread(newest.fromId, fromName)
      );
    }
    STATE.lastDirectMessageAt = Math.max(STATE.lastDirectMessageAt || 0, Number(newest?.time || 0));
    localStorage.setItem("cg.lastDirectMessageAt", String(STATE.lastDirectMessageAt || 0));
    if (STATE.view === "profile") renderProfile();
    if ($("#detail-overlay")?.classList.contains("open")) {
      const chatBox = $("#detail-content .corner-chat-section");
      const activeId = chatBox?.dataset.cornerId || STATE.detailCornerId;
      if (activeId) renderCornerChatSection(activeId, chatBox);
    }
    updateChatBadge();
    if ($("#chat-overlay")?.classList.contains("open") && !_chatActivePeer) renderChatList();
  });
}

