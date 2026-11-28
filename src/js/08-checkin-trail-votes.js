/* ====================== MANUAL CHECK-IN (GPS optional) ====================== */
function startCooldownDisplay() {
  if (STATE.cooldownInterval) clearInterval(STATE.cooldownInterval);
  STATE.cooldownInterval = setInterval(() => {
    const elapsed = Date.now() - STATE.lastCheckinTime;
    if (elapsed >= COOLDOWN_MS) {
      clearInterval(STATE.cooldownInterval);
      STATE.cooldownInterval = null;
    }
    updateCheckinButtons();
  }, 1000);
}

/* ====================== VISIT TRAIL ====================== */
// "Zähl die check-ins pro Person nur einmal pro Tag" — a second check-in at the
// same corner on the same day is not stored again.
function visitedTodayAt(cornerId) {
  const today = new Date().toDateString();
  if (!window.FB?.firebaseReady) {
    const me = currentUserKey();
    return (loadLocalVisits()[cornerId] || []).some((v) => v
      && (v.userId ? (v.userId === me || isMyKey(v.userId)) : v.user === STATE.nickname)
      && new Date(Number(v.time || 0)).toDateString() === today);
  }
  // My own check-ins (all my logins) — no need for the corner's whole list.
  return myVisitEntries().some((v) => v.cornerId === cornerId && new Date(v.time).toDateString() === today);
}

function recordVisit(cornerId) {
  if (visitedTodayAt(cornerId)) return null;
  const visit = {
    user: STATE.nickname || "Anonym",
    // userId survives nickname changes; team drives the pie slices on the
    // profile map. Visits recorded before this existed simply have no team.
    userId: currentUserKey() || "",
    team: STATE.team || "",
    time: Date.now()
  };

  if (window.FB?.firebaseReady) {
    const { db, ref, push, set } = window.FB;
    const newRef = push(ref(db, "visits/" + cornerId));
    set(newRef, visit);
    noteMyVisit(cornerId, newRef.key, visit);   // shows on my profile before the index catches up
    STATE.lastVisitRef = { cornerId, key: newRef.key, at: Date.now() };
    return newRef.key;
  } else {
    const visits = loadLocalVisits();
    if (!visits[cornerId]) visits[cornerId] = [];
    visits[cornerId].push(visit);
    // Keep only last 20 visits per spot
    if (visits[cornerId].length > 20) visits[cornerId] = visits[cornerId].slice(-20);
    localStorage.setItem("cg.visits", JSON.stringify(visits));
    refreshAllVisitTrails();
  }
}

function loadLocalVisits() {
  try {
    return JSON.parse(localStorage.getItem("cg.visits") || "{}");
  } catch (e) { return {}; }
}

// Counts per corner at startup (visitStats); a corner's last check-ins load
// with its detail, my own from my index (35-slim-data.js).
function listenVisits(attempt = 0) {
  if (!window.FB?.firebaseReady) return;
  listenVisitStats(() => retryListenerAfterAuth(listenVisits, attempt));
}

function refreshAllVisitTrails() {
  $$(".visit-trail").forEach((section) => {
    const cornerId = section.dataset.cornerId;
    renderVisitTrail(cornerId, section);
  });
}

function renderVisitTrail(cornerId, container) {
  const visits = window.FB?.firebaseReady
    ? Object.values(STATE.visits?.[cornerId] || {})
    : (loadLocalVisits()[cornerId] || []);

  const sorted = visits.sort((a, b) => b.time - a.time).slice(0, 8);
  const totalVisits = Math.max(visits.length, getVisitCount(cornerId));

  if (sorted.length === 0) {
    container.innerHTML = T(`
      <p class="visit-trail-header">👣 Besucher-Trail</p>
      <p style="font-size:12px;color:var(--fg-dim);margin:0;">Noch keine Besuche — sei der Erste!</p>
    `, "\n      <p class=\"visit-trail-header\">👣 Visitor trail</p>\n      <p style=\"font-size:12px;color:var(--fg-dim);margin:0;\">No visits yet — be the first!</p>\n    ");
    return;
  }

  const chips = sorted.map((v) => `
    <li class="visit-chip" ${v.userId ? `data-user-profile="${escapeHtml(v.userId)}"` : ""}>
      <span class="visit-name">${escapeHtml(v.user)}</span>
      <span class="visit-time">${timeAgo(v.time)}</span>
    </li>
  `).join("");

  container.innerHTML = `
    <p class="visit-trail-header">👣 ${T("Besucher-Trail", "Visitor trail")} ${totalVisits > 0 ? `<span class="visit-count-badge"><span class="fire">🔥</span> ${totalVisits}x ${T("besucht", "visited")}</span>` : ""}</p>
    <ul class="visit-trail-list">${chips}</ul>
  `;
}

/* ====================== EMOJI VOTING ====================== */
function listenEmojiVotes() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  const emojiRef = ref(db, "emojiVotes");
  onValue(emojiRef, (snapshot) => {
    STATE.emojiVotes = snapshot.val() || {};
    refreshAllEmojiVotes();
  });
}

function loadLocalEmojiVotes() {
  try {
    return JSON.parse(localStorage.getItem("cg.emojiVotes") || "{}");
  } catch (e) { return {}; }
}

function refreshAllEmojiVotes() {
  $$(".emoji-votes").forEach((section) => {
    const cornerId = section.dataset.cornerId;
    renderEmojiVotes(cornerId, section);
  });
  if (typeof refreshRainVotes === "function") refreshRainVotes();   // ☂️/💧 votes live in emojiVotes too
}

function renderEmojiVotes(cornerId, container) {
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner) return;
  const amenities = Array.from(new Set([...(corner.amenities || []), ...cornerAmenityKeys(corner), ...(cornerWeed(corner) === "ok" ? ["kiffen"] : [])]));
  if (amenities.length === 0) { container.innerHTML = ""; return; }

  const chips = amenities.map((a) => {
    const info = AMENITY_ICONS[a];
    if (!info) return "";
    const { count, myVote } = getEmojiVoteData(cornerId, a);
    return `<button class="emoji-vote-chip ${myVote ? "voted" : ""}" data-corner="${cornerId}" data-amenity="${a}" title="${T("Stimme für", "Vote for", "Votar por")} ${info.label}">
      <span class="vote-emoji">${info.emoji}</span>
      <span class="vote-count">${count || ""}</span>
    </button>`;
  }).join("");

  container.innerHTML = chips;

  container.querySelectorAll(".emoji-vote-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const amenity = btn.dataset.amenity;
      const wasVoted = btn.classList.contains("voted");
      voteEmoji(cornerId, amenity);
      btn.classList.add("just-voted");
      setTimeout(() => btn.classList.remove("just-voted"), 300);
      const info = AMENITY_ICONS[amenity];
      toast(`${info?.emoji || ""} ${wasVoted ? T("Stimme entfernt", "Vote removed", "Voto quitado") : T("Abgestimmt!", "Voted!", "¡Votado!")}`);
      if (!wasVoted) addPoints(STATE.nickname, 2, "Emoji-Vote");
    });
  });
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return T("gerade eben", "just now");
  if (mins < 60) return `vor ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vor ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `vor ${days} T`;
}

function updateCounts() {
  const total = getAllCorners().length;
  $("#corner-count").textContent = String(total).padStart(2, "0");
  $("#header-count").textContent = String(total);
}

