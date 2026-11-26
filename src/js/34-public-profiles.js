/* ====================== PUBLIC PROFILES ======================
   Tap a name anywhere (friends bar, ranking, best friends, "gerade hier",
   visitor trail, notifications) to see that person: where they are right
   now, level, favourite corners, how often you met, their corner map.     */
// Check-ins of any person, oldest first (by user id; very old check-ins
// without an id are matched by nickname).
function visitLogFor(key, nickname) {
  const byId = {};
  getAllCorners().forEach((c) => { byId[c.id] = c; });
  const log = [];
  // That person's check-in index, loaded when the profile opens (null = still loading).
  const entries = personVisitEntries(key, nickname);
  if (entries === null) return null;
  entries.forEach((v) => {
    const corner = byId[v.cornerId];
    if (!corner || typeof corner.lat !== "number" || typeof corner.lng !== "number") return;
    log.push({ cornerId: v.cornerId, name: corner.name, area: corner.area || "", lat: corner.lat, lng: corner.lng, team: v.team || "", time: v.time });
  });
  // one check-in per corner and day, like on my own profile
  const seen = new Set();
  return log.sort((a, b) => a.time - b.time).filter((v) => {
    const k = v.cornerId + "|" + new Date(v.time).toDateString();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function personInfo(key) {
  const p = STATE.points?.[key] || {};
  const k = STATE.karmaPoints?.[key] || {};
  const presence = STATE.friends?.[key] || null;
  const nickname = identityNickname(key) || (p.nickname && p.nickname !== "Anonym" ? p.nickname : "") || k.nickname || presence?.nickname || presence?.name || T("Unbekannt", "Unknown");
  const teamId = STATE.teams?.[key]?.team || presence?.team || "";
  return {
    key, nickname, teamId,
    aura: identityRewardTotal("aura", key), karma: identityRewardTotal("karma", key), presence,
    visible: !!(presence && presenceIsVisible(presence)),
    lastActive: Math.max(lastRewardTime(p), lastRewardTime(k), Number(presence?.lastSeen || 0))
  };
}

function encounterCountWith(key) {
  const me = currentUserKey();
  const e = STATE.encounters?.[[me, key].sort().join("__")];
  return Number(e?.count || 0);
}

var _upMap = null;
var _upMapLayers = [];
function drawUserProfileMap(log) {
  const el = document.getElementById("up-map");
  if (!el || typeof L === "undefined") return;
  if (!_upMap) {
    _upMap = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, crossOrigin: true }).addTo(_upMap);
  }
  _upMapLayers.forEach((l) => { try { _upMap.removeLayer(l); } catch (e) {} });
  _upMapLayers = [];
  const agg = Object.values(aggregateVisits(log));
  agg.forEach((e) => {
    const size = Math.min(44, 14 + (e.count - 1) * 5);
    const slices = Object.entries(e.teams).map(([teamKey, n]) => ({ color: teamKey === "__none" ? NEUTRAL_TEAM_COLOR : (getTeamInfo(teamKey)?.color || NEUTRAL_TEAM_COLOR), frac: n / e.count }));
    const icon = L.divIcon({ className: "cg-pie-wrap", html: pieIconHtml(slices, size), iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    const m = L.marker([e.lat, e.lng], { icon }).bindPopup(`<strong>${escapeHtml(e.name)}</strong><br>${e.count}x`);
    m.addTo(_upMap);
    _upMapLayers.push(m);
  });
  setTimeout(() => {
    try {
      _upMap.invalidateSize();
      if (agg.length) _upMap.fitBounds(agg.map((e) => [e.lat, e.lng]), { padding: [24, 24], maxZoom: 14 });
      else _upMap.setView([48.137, 11.575], 11);
    } catch (e) {}
  }, 60);
}

function renderUserProfile(key, achievements) {
  const info = personInfo(key);
  const team = getTeamInfo(info.teamId);
  const auraLv = getLevel(info.aura).level;
  const karmaLv = getLevel(info.karma).level;
  const tier = getLevelTier(auraLv);
  const matrix = getMatrixIdentity(info.aura, info.karma);
  const logRaw = visitLogFor(key, info.nickname);
  const visitsLoading = logRaw === null;   // their check-ins are still on the way
  const log = logRaw || [];
  const agg = Object.values(aggregateVisits(log)).sort((a, b) => b.count - a.count || b.last - a.last);
  const corner = info.visible && info.presence?.atCorner ? getAllCorners().find((c) => c.id === info.presence.atCorner) : null;
  const avail = AVAILABILITY[info.presence?.status] || null;
  let status;
  if (corner) {
    const since = Number(info.presence.checkedInAt || 0);
    status = `<div class="up-status live">🟢 ${T("Gerade am", "Right now at")} <strong>${escapeHtml(corner.name)}</strong>${since ? ` · ${T("seit", "since")} ${clockOf(since)}` : ""}${presenceIsAsleep(info.presence) ? " 💤" : ""}
      <div class="up-status-actions">
        <button class="action-btn primary" data-up-corner="${escapeHtml(corner.id)}">📍 ${T("Zum Corner", "Open corner")}</button>
        <button class="action-btn" data-up-route="${escapeHtml(corner.id)}">🧭 ${T("Hingehen", "Go there")}</button>
      </div></div>`;
  } else if (info.visible && info.presence?.atCorner) {
    status = `<div class="up-status live">🟢 ${T("Gerade an einem privaten Corner", "At a private corner right now")} 🔒</div>`;
  } else if (info.visible) {
    status = `<div class="up-status">🟢 ${T("Online", "Online")}${avail ? ` · ${escapeHtml(avail.label)}` : ""}</div>`;
  } else {
    status = `<div class="up-status off">⚪ ${info.lastActive ? sinceLabel(info.lastActive) : T("Gerade nicht online", "Not online right now")}</div>`;
  }
  const met = encounterCountWith(key);
  const gossips = typeof sharedGossipsWith === "function" ? sharedGossipsWith(key) : [];
  const together = [
    met ? `🤝 ${T(`${met}x zusammen gecornert`, `cornered together ${met}x`)}` : "",
    gossips.length ? `🗣️ ${T(`${gossips.length} Gossip-Runde${gossips.length === 1 ? "" : "n"} zusammen`, `${gossips.length} gossip round${gossips.length === 1 ? "" : "s"} together`)}` : ""
  ].filter(Boolean);
  const ach = Object.entries(achievements || {}).sort((a, b) => Number(b[1]?.time || 0) - Number(a[1]?.time || 0));
  $("#up-top").innerHTML = `
    <div class="up-head">
      <div class="up-avatar" style="border-color:${team?.color || "var(--line)"};">${team?.emoji || "👤"}</div>
      <div style="min-width:0;">
        <h2 class="up-name">${escapeHtml(info.nickname)}</h2>
        <div class="up-sub">${team ? `${team.emoji} ${escapeHtml(team.name)} · ` : ""}${tier.emoji} ${escapeHtml(tier.name)}</div>
      </div>
    </div>
    ${status}
    <div class="up-stats">
      <div><strong>${info.aura}</strong><span>✨ Aura · Lv.${auraLv}</span></div>
      <div><strong>${info.karma}</strong><span>🎁 Karma · Lv.${karmaLv}</span></div>
      <div><strong>${visitsLoading ? "…" : log.length}</strong><span>🍻 Check-ins</span></div>
      <div><strong>${visitsLoading ? "…" : agg.length}</strong><span>📍 Corners</span></div>
    </div>
    <div class="up-matrix">${matrix.emoji} <strong>${escapeHtml(matrix.name)}</strong> — ${escapeHtml(matrix.desc)}</div>
    ${together.length ? `<div class="up-together">${together.join(" · ")}</div>` : ""}`;
  $("#up-bottom").innerHTML = `
    ${agg.length ? `<h3>⭐ ${T("Lieblings-Corner", "Favourite corners")}</h3>
      <div class="up-favs">${agg.slice(0, 3).map((e) => `<button class="up-fav" data-up-corner="${escapeHtml(e.cornerId)}"><span>${escapeHtml(e.name)}</span><span class="up-fav-n">${e.count}x</span></button>`).join("")}</div>` : `<p class="up-empty">${T("Noch keine Check-ins.", "No check-ins yet.")}</p>`}
    ${publicComplimentsHtml(key)}
    ${gossips.length ? `<h3>🗣️ ${T("Eure Gossips", "Your gossips")}</h3>${gossips.slice(0, 5).map((g) => gossipLogRowHtml(g)).join("")}` : ""}
    ${ach.length ? `<h3>🏆 Achievements (${ach.length})</h3><div class="up-ach">${ach.slice(0, 24).map(([id, a]) => `<span title="${escapeHtml(a?.name || id)}">${escapeHtml(a?.emoji || "🏆")}</span>`).join("")}</div>` : ""}
    <div class="up-actions">
      <button class="action-btn primary" id="up-dm">💬 ${T("Nachricht", "Message")}</button>
      ${window.FB?.firebaseReady ? `<button class="action-btn" id="up-cf">${isCloseFriend(key) ? "✓ 👯 " + T("Enge Freunde", "Close friends") : "👯 " + T("Zu engen Freunden", "Add to close friends")}</button>` : ""}
      <button class="action-btn" id="up-close-2">${T("Schließen", "Close")}</button>
    </div>`;
  const body = $("#user-profile-overlay");
  body.querySelectorAll("[data-up-corner]").forEach((b) => b.addEventListener("click", () => { closeUserProfile(); openDetail(b.dataset.upCorner); }));
  body.querySelectorAll("[data-up-route]").forEach((b) => b.addEventListener("click", () => {
    const c = getAllCorners().find((x) => x.id === b.dataset.upRoute);
    if (c) window.open(walkingRouteUrl(c.lat, c.lng), "_blank");
  }));
  $("#up-dm")?.addEventListener("click", () => { closeUserProfile(); openChatThread(key, info.nickname); });
  $("#up-cf")?.addEventListener("click", async () => {
    const btn = $("#up-cf");
    btn.disabled = true;
    const on = !isCloseFriend(key);
    if (await setCloseFriend(key, on)) {
      btn.textContent = on ? "✓ 👯 " + T("Enge Freunde", "Close friends") : "👯 " + T("Zu engen Freunden", "Add to close friends");
      toast(on ? `👯 <strong>${escapeHtml(info.nickname)}</strong> ${T("sieht jetzt deine privaten Corners und geheimen Dates", "now sees your private corners and secret dates")}` : `${escapeHtml(info.nickname)} ${T("ist nicht mehr bei deinen engen Freunden", "is no longer a close friend")}`);
    }
    btn.disabled = false;
  });
  $("#up-close-2")?.addEventListener("click", closeUserProfile);
  body.querySelectorAll("[data-gossip-corner]").forEach((b) => b.addEventListener("click", () => { closeUserProfile(); openDetail(b.dataset.gossipCorner); }));
  drawUserProfileMap(log);
}

async function openUserProfile(key) {
  if (!key) return;
  if (key === currentUserKey() || isMyKey(key)) {
    closeUserProfile();
    $(`.tab[data-view="profile"]`)?.click();
    return;
  }
  const overlay = $("#user-profile-overlay");
  if (!overlay) return;
  STATE.viewedProfileKey = key;
  STATE.viewedProfileAchievements = null;
  forgetPersonVisits(key);
  forgetPersonCompliments(profileRoot(key));
  $("#up-close").onclick = closeUserProfile;
  overlay.onclick = (e) => { if (e.target === overlay) closeUserProfile(); };
  overlay.style.display = "flex";
  overlay.scrollTop = 0;
  overlay.querySelector(".user-profile-card").scrollTop = 0;
  renderUserProfile(key, null);
  if (!window.FB?.firebaseReady) return;
  try {
    const snap = await window.FB.get(window.FB.ref(window.FB.db, "achievements/" + key));
    if (STATE.viewedProfileKey === key && overlay.style.display === "flex") {
      STATE.viewedProfileAchievements = snap.val() || {};
      renderUserProfile(key, STATE.viewedProfileAchievements);
    }
  } catch (err) { /* achievements are optional */ }
}

// Their check-ins arrived (loaded on demand): draw the profile again.
function refreshOpenPublicProfile() {
  const overlay = $("#user-profile-overlay");
  if (overlay && overlay.style.display === "flex" && STATE.viewedProfileKey) renderUserProfile(STATE.viewedProfileKey, STATE.viewedProfileAchievements || null);
}

function closeUserProfile() {
  const overlay = $("#user-profile-overlay");
  if (overlay) overlay.style.display = "none";
  STATE.viewedProfileKey = null;
}

// One delegated handler: any element with data-user-profile="<key>" opens it.
document.addEventListener("click", (e) => {
  const el = e.target && e.target.closest ? e.target.closest("[data-user-profile]") : null;
  if (!el || !el.dataset.userProfile) return;
  e.preventDefault();
  e.stopPropagation();
  openUserProfile(el.dataset.userProfile);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#user-profile-overlay")?.style.display === "flex") closeUserProfile(); });

// Someone (?profile=<key> link, push) wants a profile — open it once the
// onboarding (access code, "warst du schon mal da?", name) is done and the
// person's data has arrived.
var _pendingProfileTimer = null;
function openPendingProfile(attempt = 0) {
  clearTimeout(_pendingProfileTimer);
  const key = STATE.pendingProfileKey;
  if (!key || attempt > 300) return;
  const onboarding = !STATE.nickname
    || (window.FB?.firebaseReady && localStorage.getItem("cg.accessGranted") !== "1")
    || ["#access-prompt", "#claim-overlay", "#nickname-prompt"].some((sel) => $(sel)?.style.display === "flex");
  const known = !!(STATE.points?.[key] || STATE.friends?.[key]);
  if (onboarding || (!known && attempt < 10)) {
    _pendingProfileTimer = setTimeout(() => openPendingProfile(attempt + 1), 1000);
    return;
  }
  STATE.pendingProfileKey = null;
  clearHandledQueryParam("profile");
  const focus = STATE.pendingProfileFocus;
  STATE.pendingProfileFocus = null;
  clearHandledQueryParam("focus");
  if (focus === "compliments" && (isMyKey(key) || key === myRootKey())) openMyCompliments();
  else openUserProfile(key);
}

/* ---- Tappable notifications ----
   Every push/notification link is a plain query string (?corner=…, ?chat=…,
   ?profile=…, ?claims=1). The same parser turns it into an in-app action, so
   a toast for a push received while the app is open opens the same place.  */
function deepLinkAction(link) {
  let p;
  try { p = new URL(link, window.location.href).searchParams; } catch (e) { return null; }
  const chat = p.get("chat");
  if (chat) return () => openChatThread(chat, p.get("chatName") || chat);
  const profile = p.get("profile");
  const corner = p.get(SHARE_CORNER_PARAM);
  if (corner) {
    if (p.get("gossip") === "1") return () => focusGossip(corner);
    if (p.get("date") === "1") return () => focusDetailSection(corner, ".cornerdate-section");
    return () => openDetail(corner);
  }
  if (profile && p.get("focus") === "compliments") return () => (isMyKey(profile) || profile === myRootKey() ? openMyCompliments() : openUserProfile(profile));
  if (profile) return () => openUserProfile(profile);
  if (p.get("feedback") === "1" && STATE.isAdmin) return () => openAdminSection("#admin-feedback");
  return null;
}

function renderProfile() {
  const aura = getCurrentAura();
  const karma = getCurrentKarma();
  const levelInfo = getLevel(aura);
  const karmaLevelInfo = getLevel(karma);
  const { level, progress } = levelInfo;
  const tier = getLevelTier(level);
  const karmaTier = getLevelTier(karmaLevelInfo.level);
  const matrixIdentity = getMatrixIdentity(aura, karma);
  const teamInfo = getTeamInfo(STATE.team);
  const captureCount = Object.values(STATE.captureHistory).filter((entry) => entry.capturedBy?.includes(currentUserKey())).length;
  const commentCount = Object.values(STATE.comments).reduce((sum, entry) => sum + Object.values(entry || {}).filter((comment) => comment.author === STATE.nickname).length, 0);
  const totalCheckins = myVisitLog().length;   // one per corner and day, all my logins
  const bestFriends = Object.entries(STATE.encounters).filter(([, entry]) => entry.users && Object.keys(entry.users).includes(currentUserKey())).map(([, entry]) => { const other = Object.entries(entry.users).find(([id]) => id !== currentUserKey()); return { id: other?.[0], name: other?.[1] || 'Anonym', count: entry.count || 0 }; }).sort((a, b) => b.count - a.count).slice(0, 8);
  const recentMessages = (STATE.directMessages || []).slice(-8).reverse();

  const allAuraPlayers = getRewardLeaders("aura", Number.MAX_SAFE_INTEGER);
  const allKarmaPlayers = getRewardLeaders("karma", Number.MAX_SAFE_INTEGER);
  const auraRankPos = allAuraPlayers.findIndex((x) => x.user === currentUserKey());
  const karmaRankPos = allKarmaPlayers.findIndex((x) => x.user === currentUserKey());
  const auraRank = auraRankPos >= 0 ? auraRankPos + 1 : null;
  const karmaRank = karmaRankPos >= 0 ? karmaRankPos + 1 : null;
  const auraRankLabel = auraRank ? `#${auraRank} ${T("von", "of")} ${allAuraPlayers.length}` : T("Noch kein Aura-Ranking", "Not ranked in aura yet");
  const karmaRankLabel = karmaRank ? `#${karmaRank} ${T("von", "of")} ${allKarmaPlayers.length}` : T("Noch kein Karma-Ranking", "Not ranked in karma yet");
  const auraAbove = auraRank && auraRank > 1 ? allAuraPlayers[auraRankPos - 1] : null;
  const auraToOvertake = auraAbove ? auraAbove.total - aura + 1 : null;

  $("#profile-content").innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${teamInfo?.emoji || '👤'}</div>
      <h2 class="profile-name">${escapeHtml(STATE.nickname || 'Anonym')}</h2>
      <div class="profile-level-info">${teamInfo ? teamInfo.emoji + ' ' + teamInfo.name + ' · ' : ''}${tier.emoji} ${T("Aura-Level", "Aura Level")} ${level} · ${tier.name}</div>
      <div class="profile-progress"><div class="profile-progress-fill" style="width:${Math.round(progress * 100)}%"></div></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--fg-dim);margin-top:6px;">
        ${aura} Aura · ${T("noch", "only")} <strong style="color:var(--amber);">${levelInfo.xpToNext}</strong> Aura ${T("bis Level", "to Level")} ${level + 1}
        ${levelInfo.reachedMilestone ? ` · 🏆 Lv.${MILESTONE_LEVEL} ${T("geschafft", "reached")}` : ` · 🎖️ Lv.${MILESTONE_LEVEL} = ${T("Meilenstein", "Milestone")}`}
      </div>
    </div>
    ${profileTwinBannerHtml()}
    ${buildBackupBannerHtml()}
    ${sharingSectionHtml()}
    <div class="stream-grid">
      <div class="stream-card">
        <div class="stream-kicker">✨ ${T("Aura Stream", "Aura stream")}</div>
        <div class="stream-value aura">${aura}</div>
        <div class="stream-desc">${tier.emoji} ${T("Level", "Level")} ${level} · ${escapeHtml(auraRankLabel)}${auraToOvertake ? ` · ${T("noch", "only")} ${auraToOvertake}` : ""}</div>
      </div>
      <div class="stream-card">
        <div class="stream-kicker">🎁 ${T("Karma Stream", "Karma stream")}</div>
        <div class="stream-value karma">${karma}</div>
        <div class="stream-desc">${karmaTier.emoji} ${T("Level", "Level")} ${karmaLevelInfo.level} · ${escapeHtml(karmaRankLabel)}</div>
      </div>
      <div class="stream-card" id="matrix-stream-card" style="cursor:pointer;" title="${T("Zur Reward Matrix", "Go to the reward matrix")}">
        <div class="stream-kicker">🧬 ${T("Matrix", "Matrix")}</div>
        <div class="stream-value matrix">${matrixIdentity.emoji} ${matrixIdentity.name}</div>
        <div class="stream-desc">${matrixIdentity.desc}</div>
      </div>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><div class="stat-icon">📍</div><div class="stat-value">${STATE.visitedCorners.length}</div><div class="stat-label">${T("Corners besucht", "Corners visited")}</div></div>
      <div class="profile-stat"><div class="stat-icon">🍻</div><div class="stat-value">${totalCheckins}</div><div class="stat-label">${T("Check-ins total", "Total check-ins")}</div></div>
      <div class="profile-stat"><div class="stat-icon">⚔️</div><div class="stat-value">${captureCount}</div><div class="stat-label">${T("Captures dabei", "Captures")}</div></div>
      <div class="profile-stat"><div class="stat-icon">💬</div><div class="stat-value">${commentCount}</div><div class="stat-label">${T("Kommentare", "Comments")}</div></div>
    </div>
    ${complimentsSectionHtml()}
    <div class="team-battle-section" id="reward-matrix-section">
      <h3>🧭 ${T("Reward Matrix", "Reward Matrix")}</h3>
      <p style="font-size:12px;color:var(--fg-dim);margin:0 0 12px;">${T("✨ Aura = was du tust (da sein, mitmachen). 🎁 Karma = was andere dir geben (Komplimente, bestätigter Nachschub, Gossip-Punkte). Dein Feld ergibt sich aus beiden.", "✨ Aura = what you do (show up, join in). 🎁 Karma = what others give you (compliments, confirmed supplies, gossip points). Your cell comes from both.")}</p>
      ${buildMatrixGridHtml(aura, karma)}
      <button class="action-btn" id="profile-points-help" style="margin-top:12px;">📖 ${T("Alle Wege, Punkte zu sammeln", "All ways to earn points")}</button>
    </div>
    <div class="team-battle-section"><h3>🗺️ ${T("Deine Corner-Map", "Your Corner Map")}</h3><p style="font-size:12px;color:var(--fg-dim);margin:0 0 10px;">${T("Kreisgröße = Anzahl Besuche, Tortenstücke = Team, mit dem du eingecheckt hast.", "Circle size = visit count, pie slices = team at check-in.")}</p><div id="profile-map-slot"></div></div>
    <div class="team-history"><h3>🧬 ${T("Team History", "Team History")}</h3><div class="team-history-grid">${TEAM_ORDER.map((teamId) => { const count = STATE.teamHistory.filter((entry) => entry.team === teamId).length; return `<div class="team-history-item"><div class="th-emoji">${TEAMS[teamId].emoji}</div><div class="th-count">${count}</div><div class="th-name">${TEAMS[teamId].name}</div></div>`; }).join("")}</div></div>
    <div class="team-battle-section"><h3>🏆 ${T("Team Leaderboard", "Team Leaderboard")}</h3>${getTeamBattleRows().map((row) => `<div class="team-battle-item"><span class="tb-emoji">${TEAMS[row.teamId].emoji}</span><span class="tb-name">${TEAMS[row.teamId].name}</span><div class="tb-bar"><div class="tb-bar-fill" style="width:${Math.min(100, Math.max(4, row.total * 8))}%;background:${TEAMS[row.teamId].color};"></div></div><span class="tb-score">${row.total}</span></div>`).join("")}</div>
    ${buildGossipChronicleHtml()}
    <div class="best-friends-section"><h3>🤝 ${T("Best Friends", "Best Friends")}</h3>${bestFriends.length ? bestFriends.map((friend) => `<div class="friend-encounter"><span class="fe-name lb-person" ${friend.id ? `data-user-profile="${escapeHtml(friend.id)}"` : ""}>${escapeHtml(friend.name)}</span><span class="fe-count">${friend.count}x</span></div>`).join("") : `<p style="color:var(--fg-dim);font-size:13px;">${T("Noch keine Begegnungen geloggt.", "No encounters logged yet.")}</p>`}</div>
    ${STATE.isAdmin ? `<div class="team-battle-section"><h3>🛠 Admin</h3><p style="font-size:12px;color:var(--fg-dim);margin:0 0 10px;">${T("Host-Werkzeuge: Profile & Spots verwalten.", "Host tools: manage profiles & spots.")}</p><button class="notif-opt" id="admin-open-btn">🛠 ${T("Admin-Panel öffnen", "Open admin panel")}</button></div>` : ""}
    <div class="team-battle-section feedback-box"><h3>💡 ${T("Idee oder Problem?", "Idea or problem?")}</h3>
      <p style="font-size:12px;color:var(--fg-dim);margin:0 0 10px;">${T("Schreib's direkt an die Macher — landet nicht in den Corner-Kommentaren.", "Tell the makers directly — it does not end up in the corner comments.")}</p>
      <button class="notif-opt" id="feedback-btn">💡 ${T("Feedback senden", "Send feedback")}</button></div>
    ${buildAccountSectionHtml()}
    <div class="notification-toggle"><h3>🔔 ${T("Benachrichtigungen", "Notifications")}</h3>${buildNotifSettingsHtml()}</div>
    <div class="notification-toggle" style="margin-top:12px;">
      <h3>🌐 ${T("Sprache", "Language")}</h3>
      <div class="notif-options">
        <button class="notif-opt ${STATE.lang === "de" ? "active" : ""}" id="lang-de-btn">🇩🇪 Deutsch</button>
        <button class="notif-opt ${STATE.lang === "en" ? "active" : ""}" id="lang-en-btn">🇬🇧 English</button>
      </div>
    </div>
    <div class="best-friends-section"><h3>💬 ${T("Direktnachrichten", "Direct messages")}</h3>${recentMessages.length ? recentMessages.map((msg) => `<div class="friend-encounter"><span class="fe-name">${escapeHtml(msg.fromName || msg.fromId || T("Unbekannt", "Unknown"))}: ${escapeHtml(msg.text || "")}</span><button class="action-btn" style="padding:4px 8px;font-size:10px;" data-reply-id="${msg.fromId}">${T("Antworten", "Reply")}</button></div>`).join("") : `<p style="color:var(--fg-dim);font-size:13px;">${T("Noch keine Direktnachrichten.", "No direct messages yet.")}</p>`}</div>
    <div class="leaderboard-section"><h3>🏆 Achievements</h3><div class="achievements-grid">${getAchievementCardsHtml()}</div></div>`;
  $$('[data-pref]').forEach((btn) => btn.addEventListener("click", () => {
    STATE.notifPref = btn.dataset.pref;
    localStorage.setItem(NOTIF_STORAGE_KEY, STATE.notifPref);
    localStorage.setItem("cg.notifPref", STATE.notifPref); // Backward-compatible key used by legacy `loadNotifPref()`.
    saveNotifSettings();
    renderProfile();
  }));
  document.getElementById("lang-de-btn")?.addEventListener("click", () => setLang("de"));
  document.getElementById("lang-en-btn")?.addEventListener("click", () => setLang("en"));
  $$("#profile-content .team-chip[data-team]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const team = btn.dataset.team;
      const list = STATE.notifSettings.blockedTeams;
      const idx = list.indexOf(team);
      if (idx >= 0) list.splice(idx, 1); else list.push(team);
      saveNotifSettings();
      btn.classList.toggle("muted", list.includes(team));
    });
  });
  $$("#profile-content .ufi-toggle[data-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.user;
      const list = STATE.notifSettings.blockedUsers;
      const idx = list.indexOf(uid);
      if (idx >= 0) list.splice(idx, 1); else list.push(uid);
      saveNotifSettings();
      const isMuted = list.includes(uid);
      btn.classList.toggle("muted", isMuted);
      btn.textContent = isMuted ? T("🔕 Stumm", "🔕 Muted") : T("🔔 Aktiv", "🔔 Active");
    });
  });
  $("#enable-push-btn")?.addEventListener("click", enableFirebasePush);
  $("#profile-points-help")?.addEventListener("click", openRewardGuide);
  $("#auto-wa-btn")?.addEventListener("click", () => {
    const on = !autoWhatsAppOnCheckin();
    localStorage.setItem("cg.autoWhatsApp", on ? "1" : "0");
    toast(on ? T("📲 Ab jetzt öffnet WhatsApp nach dem Check-in", "📲 WhatsApp now opens after you check in") : T("📲 WhatsApp bleibt nach dem Check-in zu", "📲 WhatsApp stays closed after check-in"));
    renderProfile();
  });
  $("#matrix-stream-card")?.addEventListener("click", () => $("#reward-matrix-section")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  $("#keep-awake-btn")?.addEventListener("click", () => {
    const on = !keepAwakeWhileCheckedIn();
    localStorage.setItem("cg.keepAwake", on ? "1" : "0");
    applyKeepAwakePref();
    toast(on
      ? (myPresenceCorner() ? T("📱 Display bleibt an, solange du eingecheckt bist", "📱 Screen stays on while you're checked in") : T("📱 Aktiv ab deinem nächsten Check-in", "📱 Active from your next check-in"))
      : T("📱 Display darf wieder ausgehen", "📱 Screen may turn off again"));
    renderProfile();
  });
  $("#acct-google-btn")?.addEventListener("click", async () => {
    try {
      const email = await window.FB.linkGoogle();
      await refreshAccessForCurrentUser();
      const uid = window.FB.getAuthUid?.();
      if (uid) loadProfileFromCloud(uid);
      syncProfileToCloud();
      toast(`✅ ${T("Mit Google gesichert", "Secured with Google")}${email ? " (" + escapeHtml(email) + ")" : ""}`);
      unlockAchievement("secured", "Abgesichert", "🔐", 20);
      renderProfile();
    } catch (err) {
      if (err?.code === "auth/popup-closed-by-user") return;
      toast(`${T("Google-Login fehlgeschlagen", "Google login failed")} (${escapeHtml(err?.code || "?")}): ${escapeHtml(err?.message || "")}`);
    }
  });
  $("#acct-email-btn")?.addEventListener("click", async () => {
    const email = await appPrompt(T("Mit E-Mail sichern", "Secure with email"), "", "deine@mail.de", { text: T("Wir schicken dir einen Anmelde-Link — kein Passwort nötig.", "We'll send you a sign-in link — no password needed."), okLabel: T("Link senden", "Send link") });
    if (!email || !email.trim()) return;
    try {
      await window.FB.sendEmailLink(email.trim());
      toast(T("✉️ Link gesendet — öffne die Mail auf diesem Gerät und tippe den Link an.", "✉️ Link sent — open the email on this device and tap the link."));
    } catch (err) {
      toast(`${T("Konnte Link nicht senden", "Could not send link")}: ${escapeHtml(err?.message || "")}`);
    }
  });
  const createAndShareCode = async () => {
    const code = await createRecoveryCode();
    if (!code) return;
    unlockAchievement("secured", "Abgesichert", "🔐", 20);
    renderProfile();
    await shareRecoveryCode(code);
  };
  $("#acct-code-create-btn")?.addEventListener("click", createAndShareCode);
  $("#acct-code-share-btn")?.addEventListener("click", () => { const c = savedRecoveryCode(); if (c) { createRecoveryCode(); shareRecoveryCode(c); } });
  $("#acct-uid-copy")?.addEventListener("click", async () => {
    await copyText(window.FB?.getAuthUid?.() || "").catch(() => {});
    toast(T("📋 Nutzer-ID kopiert", "📋 User ID copied"));
  });
  $$("#profile-content [data-backup-action]").forEach((btn) => btn.addEventListener("click", () => {
    const a = btn.dataset.backupAction;
    if (a === "google") $("#acct-google-btn")?.click();
    else if (a === "code") createAndShareCode();
    else $("#account-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("#acct-code-claim-btn")?.addEventListener("click", async () => {
    const code = await appPrompt(T("Recovery-Code eingeben", "Enter recovery code"), "", "CODE", { codeStyle: true, text: T("Stellt dein Profil von einem anderen Gerät wieder her.", "Restores your profile from another device."), okLabel: T("Übernehmen", "Apply") });
    if (code) await claimRecoveryCode(code);
  });
  $("#acct-claim-btn")?.addEventListener("click", openClaimOverlay);
  $("#admin-open-btn")?.addEventListener("click", renderAdminPanel);
  $("#feedback-btn")?.addEventListener("click", sendAppFeedback);
  bindSharingSection();
  $$("#profile-content [data-twin-merge]").forEach((btn) => btn.addEventListener("click", async () => {
    btn.disabled = true;
    const ok = await linkToProfile(btn.dataset.twinMerge);
    if (!ok) btn.disabled = false;
  }));
  $$("#profile-content [data-gossip-corner]").forEach((btn) => btn.addEventListener("click", () => openDetail(btn.dataset.gossipCorner)));
  $$("#profile-content [data-reply-id]").forEach((btn) => btn.addEventListener("click", () => {
    const msg = recentMessages.find((entry) => entry.fromId === btn.dataset.replyId);
    sendDirectMessagePrompt(btn.dataset.replyId, msg?.fromName || btn.dataset.replyId);
  }));
  mountProfileMap();
}

function bindTabs() {
  $$(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const v = t.dataset.view;
      STATE.view = v;
      document.body.classList.toggle("map-first", v === "map");
      document.body.classList.toggle("home-view", v === "map" || v === "list");
      $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
      $$(".view").forEach((x) => x.classList.toggle("active", x.id === "view-" + v));
      if (v === "map") { if (!STATE.mainMap) initMainMap(); setTimeout(() => STATE.mainMap?.invalidateSize(), 50); }
      if (v === "leaderboard") renderLeaderboard();
      if (v === "profile") renderProfile();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  let lastClickXp = 0;
  document.addEventListener("click", (e) => { if (e.isTrusted && Date.now() - lastClickXp > 10000) { lastClickXp = Date.now(); addXp(1, "Tap"); } }, { passive: true });
  if (STATE.lastCheckinCorner && Date.now() - STATE.lastCheckinTime < COOLDOWN_MS) startCooldownDisplay();
  // Apply saved language to static elements on startup
  if (STATE.lang === "en") {
    document.querySelectorAll(".tab[data-view]").forEach((t) => {
      const labels = { list: "List", map: "Map", leaderboard: "🏆 Ranking", profile: "👤 Profile" };
      if (labels[t.dataset.view]) t.textContent = labels[t.dataset.view];
    });
    const fbTitle = document.getElementById("friends-bar-title");
    if (fbTitle) fbTitle.textContent = "🍻 Friends out there";
  }
});

// Tips and reminders wait until no other message is on screen — they used to
// replace things like "Ben ist am Corner" a second after they appeared.
function toastWhenFree(html, variant, onClick, tries = 0) {
  const el = $("#toast");
  if (el && el.classList.contains("show") && tries < 20) {
    setTimeout(() => toastWhenFree(html, variant, onClick, tries + 1), 2500);
    return;
  }
  toast(html, variant, onClick);
}

let toastTimer = null;
function toast(html, variant, onClick) {
  const el = $("#toast");
  el.innerHTML = html;
  el.className = "toast" + (variant ? " " + variant : "") + (onClick ? " tappable" : "");
  el.hidden = false;
  // Replacing the node drops any handler from a previous toast.
  el.onclick = null;
  if (typeof onClick === "function") {
    el.onclick = () => {
      el.classList.remove("show");
      setTimeout(() => (el.hidden = true), 200);
      clearTimeout(toastTimer);
      onClick();
    };
  }
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 200);
  }, 4500);
}
