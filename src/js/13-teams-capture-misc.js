/* ====================== TEAMS SYSTEM ====================== */
/* ====================== CORNER STATUS EMOJIS ====================== */
/* ====================== CORNER CAPTURE ====================== */
function captureCorner(cornerId, team, users) {
  if (STATE.captured[cornerId]?.team === team) return; // Already captured by same team

  const captureData = { team, capturedAt: Date.now(), capturedBy: users };

  if (window.FB?.firebaseReady) {
    const { db, ref, set } = window.FB;
    set(ref(db, "captured/" + cornerId), captureData);
  }

  STATE.captured[cornerId] = captureData;
  const t = TEAMS[team];
  toast(`${t?.emoji} Team ${t?.name} hat <strong>${escapeHtml(getAllCorners().find(c => c.id === cornerId)?.name || "")}</strong> eingenommen! 🏴`, null, () => openDetail(cornerId));

  // Points for capture participants
  users.forEach((u) => addPoints(u, 25, "Corner eingenommen"));
  unlockAchievement("first-capture", "Eroberer", "🏴", 30);
}

/* ====================== ENCOUNTERS / FRIENDSHIP ====================== */
/* ====================== LIVE LOCATION ====================== */
/* ====================== TEAM BATTLES LEADERBOARD ====================== */
function renderTeamBattles() {
  const container = document.getElementById("team-battle-section");
  if (!container) return;

  // Count captures per team
  const teamCaptures = {};
  Object.values(STATE.captured).forEach((cap) => {
    if (cap.team) {
      teamCaptures[cap.team] = (teamCaptures[cap.team] || 0) + 1;
    }
  });

  const sorted = Object.entries(TEAMS).map(([key, t]) => ({
    key, ...t, captures: teamCaptures[key] || 0
  })).sort((a, b) => b.captures - a.captures);

  const maxCaptures = Math.max(1, ...sorted.map(t => t.captures));

  const items = sorted.map((t) => `
    <div class="team-battle-item">
      <span class="tb-emoji">${t.emoji}</span>
      <span class="tb-name">${t.name}</span>
      <span class="tb-bar"><span class="tb-bar-fill" style="width:${(t.captures/maxCaptures)*100}%;background:${t.color};"></span></span>
      <span class="tb-score">${t.captures}</span>
    </div>
  `).join("");

  container.innerHTML = `<div class="team-battle-section">
    <h3>⚔️ Team Battles</h3>
    ${items || T('<p style="color:var(--fg-dim);font-size:13px;">Noch keine Corners eingenommen.</p>', "<p style=\"color:var(--fg-dim);font-size:13px;\">No corners captured yet.</p>")}
  </div>`;
}

/* ====================== PROFILE PAGE ====================== */
function renderAchievementsInProfile(container) {
  const allAchievements = [
    { id: "first-login", name: "Willkommen", emoji: "👋", desc: "Account erstellt" },
    { id: "first-checkin", name: "Erster Besuch", emoji: "📍", desc: "Erstes Check-in" },
    { id: "first-corner", name: "Entdecker", emoji: "🗺️", desc: "Ersten Corner hinzugefügt" },
    { id: "first-photo", name: "Fotograf", emoji: "📸", desc: "Erstes Foto hochgeladen" },
    { id: "first-comment", name: "Kommentator", emoji: "💬", desc: "Erster Kommentar" },
    { id: "five-checkins", name: "Stammgast", emoji: "🔥", desc: "5 verschiedene Spots" },
    { id: "ten-checkins", name: "Local Legend", emoji: "👑", desc: "10 verschiedene Spots" },
    { id: "three-corners", name: "Kartograph", emoji: "🧭", desc: "3 Corners hinzugefügt" },
    { id: "first-capture", name: "Eroberer", emoji: "🏴", desc: "Ersten Corner eingenommen" },
    { id: "five-ratings", name: "Kritiker", emoji: "⭐", desc: "5 Bewertungen abgegeben" },
  ];

  const cardsHtml = allAchievements.map((a) => {
    const unlocked = STATE.achievements.includes(a.id);
    return `<div class="achievement-card ${unlocked ? "unlocked" : "locked"}">
      <div class="achievement-emoji">${a.emoji}</div>
      <div class="achievement-name">${TX(a.name)}</div>
    </div>`;
  }).join("");

  container.innerHTML = `<div class="leaderboard-section">
    <h3>🏆 Achievements</h3>
    <div class="achievements-grid">${cardsHtml}</div>
  </div>`;
}

/* ====================== NOTIFICATIONS ====================== */
function shouldNotify(friendInfo) {
  const mode = STATE.notifPref;
  if (mode === "off") return false;
  if (mode === "team" && friendInfo.team !== STATE.team) return false;
  const blocked = STATE.notifSettings || {};
  if ((blocked.blockedTeams || []).includes(friendInfo.team)) return false;
  if (friendInfo.id && (blocked.blockedUsers || []).includes(friendInfo.id)) return false;
  return true;
}

/* ====================== SUBTLE XP / GAMIFICATION ====================== */
function bindGlobalXp() {
  // Handled by the global click listener in the final feature overrides.
}

/* ====================== TOAST ====================== */

