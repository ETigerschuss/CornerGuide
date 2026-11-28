/* ====================== CHAT ====================== */
var _chatThreadUnsub = null;
var _chatActivePeer = null;

function bindChatUI() {
  $("#chat-fab")?.addEventListener("click", openChat);
  $("#chat-close")?.addEventListener("click", closeChat);
  $("#chat-back")?.addEventListener("click", showChatList);
  $("#chat-overlay")?.addEventListener("click", (e) => { if (e.target.id === "chat-overlay") closeChat(); });
  $("#chat-send")?.addEventListener("click", sendFromChatInput);
  $("#chat-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") sendFromChatInput(); });
  updateChatBadge();
  // Deep link from a DM push notification: ?chat=<peerId>&chatName=<name>
  const params = new URLSearchParams(window.location.search);
  const chatPeer = (params.get("chat") || "").trim();
  if (chatPeer) {
    const chatName = (params.get("chatName") || "").trim() || chatPeer;
    clearHandledQueryParam("chat");
    clearHandledQueryParam("chatName");
    // Retry briefly: auth/nickname may not be restored yet right after launch.
    let attempts = 0;
    const tryOpen = () => {
      attempts++;
      if (STATE.nickname) { openChatThread(chatPeer, chatName); return; }
      if (attempts < 12) setTimeout(tryOpen, 500);
    };
    setTimeout(tryOpen, 700);
  }
}

/* Read state is tracked PER CONVERSATION. Previously one global timestamp was
   set as soon as the chat list opened, so everything looked read even if you
   never opened the conversation. */
function loadChatRead() {
  try { return JSON.parse(localStorage.getItem("cg.chatRead") || "{}"); }
  catch (e) { return {}; }
}
function saveChatRead(map) {
  localStorage.setItem("cg.chatRead", JSON.stringify(map || {}));
}
function markConversationRead(peerId) {
  if (!peerId) return;
  const map = loadChatRead();
  map[peerId] = Date.now();
  saveChatRead(map);
  pushChatReadReceipt(peerId);
  updateChatBadge();
}
// Messages received from this peer that arrived after I last opened the thread.
function unreadForPeer(peerId) {
  if (!peerId) return 0;
  const since = loadChatRead()[peerId] || parseInt(localStorage.getItem("cg.lastChatReadAt") || "0") || 0;
  return (STATE.directMessages || []).filter((m) => m.fromId === peerId && (m.time || 0) > since).length;
}
function totalUnread() {
  const peers = new Set((STATE.directMessages || []).filter((m) => !isMyKey(m.fromId)).map((m) => m.fromId));
  let n = 0;
  peers.forEach((p) => { n += unreadForPeer(p); });
  return n;
}

function updateChatBadge() {
  const badge = $("#chat-badge");
  if (!badge) return;
  const unread = totalUnread();
  if (unread > 0) { badge.textContent = unread > 9 ? "9+" : String(unread); badge.hidden = false; }
  else { badge.hidden = true; }
}

// Kept for compatibility; opening the list no longer marks anything read.
function markChatsRead() { updateChatBadge(); }

function openChat() {
  $("#chat-overlay").classList.add("open");
  showChatList();
  markChatsRead();
}

function closeChat() {
  $("#chat-overlay").classList.remove("open");
  if (_chatThreadUnsub) { _chatThreadUnsub(); _chatThreadUnsub = null; }
  _chatActivePeer = null;
}

function showChatList() {
  if (_chatThreadUnsub) { _chatThreadUnsub(); _chatThreadUnsub = null; }
  _chatActivePeer = null;
  $("#chat-thread").style.display = "none";
  $("#chat-list").style.display = "block";
  $("#chat-back").style.display = "none";
  $("#chat-title").textContent = "💬 Chats";
  renderChatList();
}

function renderChatList() {
  const list = $("#chat-list");
  if (!list) return;
  const me = currentUserKey();
  const convs = {};
  (STATE.directMessages || []).forEach((m) => {
    const peerId = m.fromId === me ? m.toId : m.fromId;
    const peerName = m.fromId === me ? (m.toName || peerId) : (m.fromName || peerId);
    if (!peerId || peerId === me) return;
    const prev = convs[peerId];
    if (!prev || (m.time || 0) > prev.time) convs[peerId] = { id: peerId, name: peerName, text: m.text || "", time: m.time || 0 };
  });
  // Merge in locally recorded activity (covers messages I sent).
  Object.entries(loadChatActivity()).forEach(([peerId, a]) => {
    if (!peerId || peerId === me) return;
    const prev = convs[peerId];
    if (!prev || (a.time || 0) > prev.time) convs[peerId] = { id: peerId, name: a.name || peerId, text: a.text || "", time: a.time || 0 };
  });
  Object.values(STATE.friends || {}).forEach((f) => {
    if (f.id && f.id !== me && !convs[f.id]) convs[f.id] = { id: f.id, name: f.nickname || f.name || f.id, text: "", time: 0 };
  });
  const rows = Object.values(convs).filter((c) => !isBlocked(c.id)).sort((a, b) => b.time - a.time);
  if (!rows.length) { list.innerHTML = T(`<div class="chat-empty">Noch keine Chats. Tippe in der Freunde-Leiste auf 💬, um jemandem zu schreiben.</div>`, "<div class=\"chat-empty\">No chats yet. Tap 💬 in the friends bar to message someone.</div>"); return; }
  list.innerHTML = rows.map((c) => {
    const started = (c.time || 0) > 0;
    const when = started ? new Date(c.time).toLocaleString(appLocale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const unread = unreadForPeer(c.id);
    return `
    <div class="chat-conv ${started ? "started" : ""} ${unread ? "unread" : ""}" data-peer-id="${escapeHtml(c.id)}" data-peer-name="${escapeHtml(c.name)}">
      <span class="friend-dot" style="background:${unread ? "var(--pink)" : started ? "var(--amber)" : "var(--line)"};width:10px;height:10px;border-radius:50%;flex:0 0 auto;"></span>
      <div class="cc-body">
        <div class="cc-name">${escapeHtml(c.name)}${unread ? ` <span class="cc-unread">${unread}</span>` : ""}</div>
        <div class="cc-preview">${c.text ? escapeHtml(c.text) : "Neuen Chat starten…"}</div>
      </div>
      ${when ? `<span class="cc-time">${escapeHtml(when)}</span>` : ""}
    </div>`;
  }).join("");
  list.querySelectorAll("[data-peer-id]").forEach((el) => {
    el.addEventListener("click", () => openChatThread(el.dataset.peerId, el.dataset.peerName));
  });
}

function openChatThread(peerId, peerName) {
  if (!peerId || peerId === currentUserKey()) return;
  if (!STATE.nickname) { toast(T("Bitte gib zuerst einen Namen ein.", "Please enter a name first.")); return; }
  $("#chat-overlay").classList.add("open");
  _chatActivePeer = { id: peerId, name: peerName || peerId };
  $("#chat-list").style.display = "none";
  $("#chat-thread").style.display = "flex";
  $("#chat-back").style.display = "";
  $("#chat-title").textContent = peerName || peerId;
  $("#chat-messages").innerHTML = T(`<div class="chat-empty">Lädt…</div>`, "<div class=\"chat-empty\">Loading…</div>");
  markConversationRead(peerId);
  if (_chatThreadUnsub) { _chatThreadUnsub(); _chatThreadUnsub = null; }
  const renderLocalFallback = () => {
    const msgs = (STATE.directMessages || []).filter((m) => m.fromId === peerId || m.toId === peerId).sort((a, b) => (a.time || 0) - (b.time || 0));
    renderChatMessages(msgs);
  };
  if (window.FB?.firebaseReady) {
    const { db, ref, onValue } = window.FB;
    // A thread may live under an older key pairing — read them all and merge.
    const pairIds = Array.from(new Set(myKeys().map((k) => chatPairId(k, peerId))));
    const byPair = {};
    let readReceipts = {};
    const unsubs = [];
    const renderMerged = () => {
      const seen = new Set();
      const readAt = peerReadAt(readReceipts, peerId);
      const msgs = Object.values(byPair).flat()
        .filter((m) => { const k = (m.time || 0) + "|" + (m.fromId || "") + "|" + (m.text || ""); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.time || 0) - (b.time || 0));
      renderChatMessages(msgs, { peerReadAt: readAt });
    };
    pairIds.forEach((pid) => {
      const u = onValue(ref(db, "chats/" + pid), (snap) => {
        byPair[pid] = Object.values(snap.val() || {});
        renderMerged();
      }, (err) => {
        // Permission denied (e.g. rules not deployed yet) or network error:
        // never leave the thread stuck on "Lädt…" — show the local inbox copy.
        console.warn("chat thread listener failed:", err);
        if (!Object.keys(byPair).length) {
          renderLocalFallback();
          toast(T("⚠️ Chat-Verlauf nicht ladbar — zeige lokale Nachrichten.", "⚠️ Chat history unavailable — showing local messages."));
        }
      });
      if (typeof u === "function") unsubs.push(u);
    });
    const threadPath = receiptThreadPath(peerId);
    if (threadPath) {
      const ru = onValue(ref(db, threadPath), (snap) => {
        readReceipts = snap.val() || {};
        renderMerged();
      }, (err) => console.warn("chat receipt listener failed:", err));
      if (typeof ru === "function") unsubs.push(ru);
    }
    _chatThreadUnsub = () => unsubs.forEach((fn) => { try { fn(); } catch (e) {} });
  } else {
    renderLocalFallback();
  }
  setTimeout(() => $("#chat-input")?.focus(), 120);
}

function renderChatMessages(msgs, opts = {}) {
  const box = $("#chat-messages");
  if (!box) return;
  // Blocked (38-moderation.js): their messages stay hidden, mine stay.
  const blockedPeer = _chatActivePeer && isBlocked(_chatActivePeer.id) ? _chatActivePeer.id : "";
  if (blockedPeer) msgs = msgs.filter((m) => !isBlocked(m.fromId));
  const notice = blockedPeer ? `<div class="chat-empty">🚫 ${T("Blockiert — ihre Nachrichten sind ausgeblendet.", "Blocked — their messages are hidden.")} <button class="action-btn cmp-quick" data-unblock="${escapeHtml(profileRoot(blockedPeer))}">${T("Aufheben", "Unblock")}</button></div>` : "";
  if (!msgs.length) { box.innerHTML = notice || T(`<div class="chat-empty">Noch keine Nachrichten. Schreib die erste! 👋</div>`, "<div class=\"chat-empty\">No messages yet. Write the first! 👋</div>"); return; }
  const me = currentUserKey();
  const peerReadAt = Number(opts.peerReadAt || 0);
  const lastMineTime = [...msgs].reverse().find((m) => m.fromId === me)?.time || 0;
  box.innerHTML = notice + msgs.map((m) => {
    const mine = m.fromId === me;
    const t = m.time ? new Date(m.time).toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" }) : "";
    const readLine = mine && m.time === lastMineTime ? `<span class="cb-read">${peerReadAt >= (m.time || 0) ? T("✓✓ Gelesen", "✓✓ Read") : T("✓ Gesendet", "✓ Sent")}</span>` : "";
    return `<div class="chat-bubble ${mine ? "me" : "them"}">${escapeHtml(m.text || "")}<span class="cb-time">${escapeHtml(t)}</span>${readLine}</div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

function formatShortDateTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(appLocale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function recentCornerMessages(cornerId) {
  return (STATE.directMessages || [])
    .filter((msg) => msg && (isMyKey(msg.fromId) || isMyKey(msg.toId)))
    .filter((msg) => msg && msg.cornerId === cornerId)
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .slice(0, 4);
}

function renderCornerChatSection(cornerId, container) {
  if (!container) return;
  const rows = recentCornerMessages(cornerId);
  container.innerHTML = `
    <h4>💬 ${T("Deine Corner Nachrichten", "Your corner messages")}</h4>
    ${rows.length ? rows.map((msg) => {
      const peerId = isMyKey(msg.fromId) ? msg.toId : msg.fromId;
      const peerName = isMyKey(msg.fromId) ? (msg.toName || peerId) : (msg.fromName || peerId);
      return `<div class="corner-chat-row">
        <div class="corner-chat-copy">
          <div class="corner-chat-name">${escapeHtml(peerName || T("Unbekannt", "Unknown"))}</div>
          <div class="corner-chat-preview">${escapeHtml(msg.text || "")}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="corner-chat-meta">${escapeHtml(formatShortDateTime(msg.time))}</span>
          ${peerId ? `<button class="action-btn" data-corner-reply="${escapeHtml(peerId)}" data-corner-name="${escapeHtml(peerName || peerId)}">${T("Öffnen", "Open")}</button>` : ""}
        </div>
      </div>`;
    }).join("") : `<p class="corner-chat-empty">${T("Noch keine Nachrichten zu diesem Corner. Starte hier direkt einen Chat.", "No messages for this corner yet. Start one right here.")}</p>`}
  `;
  container.querySelectorAll("[data-corner-reply]").forEach((btn) => {
    btn.addEventListener("click", () => openChatThread(btn.dataset.cornerReply, btn.dataset.cornerName));
  });
}

function sendFromChatInput() {
  const input = $("#chat-input");
  if (!input || !_chatActivePeer) return;
  const text = input.value.trim();
  if (!text) return;
  const ok = sendMessage(_chatActivePeer.id, _chatActivePeer.name, text, { toastMsg: false });
  if (ok) {
    input.value = "";
    if (!window.FB?.firebaseReady) {
      const msgs = (STATE.directMessages || []).filter((m) => m.fromId === _chatActivePeer.id || m.toId === _chatActivePeer.id).sort((a, b) => (a.time || 0) - (b.time || 0));
      renderChatMessages(msgs);
    }
  }
}

/* Stable corner numbers.
   The list/map used the index of the CURRENT sort order, so a corner's number
   changed whenever someone checked in somewhere. Numbers are now fixed:
   built-in corners keep their catalogue order, custom spots follow by creation
   time — identical in the list, on the map and over time.                   */
var _cornerNumberCache = null;
function cornerNumberMap() {
  const list = getAllCorners();
  const signature = list.map((c) => c.id).join("|");
  if (_cornerNumberCache && _cornerNumberCache.signature === signature) return _cornerNumberCache.map;
  const ordered = [
    ...list.filter((c) => !c.isCustom),
    ...list.filter((c) => c.isCustom).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)))
  ];
  const map = {};
  ordered.forEach((c, i) => { map[c.id] = i + 1; });
  _cornerNumberCache = { signature, map };
  return map;
}
function cornerNumber(id) { return cornerNumberMap()[id] || 0; }

function getSortedCorners() {
  // Where you are checked in always comes first — that is the corner you act on.
  const here = STATE.manualCheckinId || STATE.atCornerId || null;
  return getAllCorners().map((corner) => ({
    ...corner,
    _visits: getVisitCount(corner.id),
    _active: getPeopleAtCorner(corner.id).length,
    _here: corner.id === here ? 1 : 0
  })).sort((a, b) => b._here - a._here || b._active - a._active || b._visits - a._visits || a.name.localeCompare(b.name));
}

function getCornerVoteStats(cornerId) {
  const votes = STATE.cornerVotes?.[cornerId] || {};
  let up = 0, down = 0, mine = 0;
  Object.entries(votes).forEach(([userId, value]) => {
    const num = Number(value || 0);
    if (num > 0) up += 1;
    if (num < 0) down += 1;
    if (userId === currentUserKey()) mine = num;
  });
  return { up, down, mine };
}

function listenCornerVotes() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "cornerVotes"), (snapshot) => {
    STATE.cornerVotes = snapshot.val() || {};
    saveLocalCornerVotes();
    if ($("#detail-overlay")?.classList.contains("open")) {
      const activeId = $("#detail-content .corner-voting")?.dataset.cornerId;
      if (activeId) renderCornerVotingSection(activeId, $("#detail-content .corner-voting"));
    }
  });
}

function setCornerVote(cornerId, nextValue) {
  if (!STATE.nickname) { toast(T("Bitte gib zuerst einen Namen ein.", "Please enter a name first.")); return; }
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner) return;
  const voteKey = currentUserKey();
  const currentValue = Number(STATE.cornerVotes?.[cornerId]?.[voteKey] || 0);
  const normalized = Number(nextValue || 0);
  const finalValue = currentValue === normalized ? 0 : normalized;
  const ownerId = corner.createdById || corner.createdBy || null;
  if (ownerId && ownerId !== voteKey) {
    if (currentValue <= 0 && finalValue > 0) addPoints(ownerId, 2, "Corner positiv bewertet");
    if (currentValue > 0 && finalValue <= 0) addPoints(ownerId, -2, "Positive Corner-Stimme entfernt");
  }
  if (!STATE.cornerVotes[cornerId]) STATE.cornerVotes[cornerId] = {};
  if (finalValue === 0) delete STATE.cornerVotes[cornerId][voteKey];
  else STATE.cornerVotes[cornerId][voteKey] = finalValue;
  if (window.FB?.firebaseReady) {
    const { db, ref, set, remove } = window.FB;
    const voteRef = ref(db, "cornerVotes/" + cornerId + "/" + voteKey);
    if (finalValue === 0) remove(voteRef);
    else set(voteRef, finalValue);
  } else {
    saveLocalCornerVotes();
  }
  if (finalValue !== 0) addXp(2, "Corner bewertet");
  const stats = getCornerVoteStats(cornerId);
  const checkins = getVisitCount(cornerId);
  if (corner.isCustom && stats.down > checkins) {
    if (ownerId) addPoints(ownerId, -30, "Corner von Community entfernt");
    const { db, ref, remove } = window.FB || {};
    if (window.FB?.firebaseReady) {
      remove(ref(db, "corners/" + corner.id));
      remove(ref(db, "cornerVotes/" + corner.id));
    } else {
      STATE.customSpots = STATE.customSpots.filter((spot) => spot.id !== corner.id);
      saveCustomSpots();
      delete STATE.cornerVotes[corner.id];
      saveLocalCornerVotes();
      renderCards();
      rebuildMainMarkers();
      updateCounts();
    }
    toast("🗑️ Corner wurde durch Community-Voting entfernt");
    return;
  }
  renderCornerVotingSection(cornerId, $("#detail-content .corner-voting"));
}

function renderCornerVotingSection(cornerId, container) {
  if (!container) return;
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner) return;
  const stats = getCornerVoteStats(cornerId);
  const checkins = getVisitCount(cornerId);
  const deleteHint = corner.isCustom ? T(` · Löschung wenn Downvotes höher als Check-ins sind (${stats.down}/${checkins})`, ` · deleted when downvotes outnumber check-ins (${stats.down}/${checkins})`, ` · se borra si los votos en contra superan los check-ins (${stats.down}/${checkins})`) : "";
  container.dataset.cornerId = cornerId;
  container.innerHTML = `
    <h4>${T("Community Voting", "Community voting", "Votación de la comunidad")}</h4>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button class="action-btn ${stats.mine > 0 ? "primary" : ""}" data-vote="1">👍 Corner (${stats.up})</button>
      <button class="action-btn ${stats.mine < 0 ? "primary" : ""}" data-vote="-1">🤨 ${T("Hä, kein Corner", "Huh, not a corner", "Eh, esto no es un corner")} (${stats.down})</button>
      <span style="font-size:11px;color:var(--fg-dim);">${deleteHint}</span>
    </div>
  `;
  container.querySelectorAll("[data-vote]").forEach((btn) => btn.addEventListener("click", () => setCornerVote(cornerId, Number(btn.dataset.vote))));
}

function getCornerCoverPhoto(cornerId) {
  // Online: the cover the Cloud Function picked (small thumbnail or Storage
  // URL) — the corner's photos themselves are only loaded in its detail.
  if (window.FB?.firebaseReady) return coverSrcOf(cornerId) || localStorage.getItem("cg.photo." + cornerId);
  const photos = getPhotos(cornerId) || [];
  if (photos.length) {
    const ranked = photos.map((photo) => {
      const ratings = Object.values(photo.ratings || {});
      const avg = ratings.length ? ratings.reduce((a, b) => a + Number(b || 0), 0) / ratings.length : 0;
      return { photo, avg, votes: ratings.length };
    }).sort((a, b) => b.avg - a.avg || b.votes - a.votes || Number(b.photo.time || 0) - Number(a.photo.time || 0));
    const src = ranked[0]?.photo?.src;
    if (src) return src;
  }
  return localStorage.getItem("cg.photo." + cornerId);
}

function playTeamCheckinSound(teamId) {
  if (!teamId) return;
  const toneMap = {
    plant: [440, 554],
    insect: [392, 523],
    alien: [330, 495],
    wolf: [294, 392],
    bird: [523, 659],
    octopus: [262, 349]
  };
  const tones = toneMap[teamId] || [440, 554];
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.07, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.17);
    });
  } catch (e) {}
}

function addComment(cornerId, author, text) {
  if (!text.trim()) return;
  const comment = { author: author || "Anonym", authorId: currentUserKey() || "", text: text.trim(), time: Date.now(), team: STATE.team || "" };
  if (window.FB?.firebaseReady) {
    const { db, ref, push, set } = window.FB;
    const newRef = push(ref(db, "comments/" + cornerId));
    set(newRef, comment);
  } else {
    if (!STATE.comments[cornerId]) STATE.comments[cornerId] = {};
    STATE.comments[cornerId]["local-" + Date.now()] = comment;
    saveLocalComments();
    refreshAllCommentSections();
  }
  addXp(5, "Kommentar");
}

function addReply(cornerId, commentKey, author, text) {
  const reply = { author: author || "Anonym", authorId: currentUserKey() || "", text: text.trim(), time: Date.now(), team: STATE.team || "" };
  if (window.FB?.firebaseReady) {
    const { db, ref, push, set } = window.FB;
    const newRef = push(ref(db, `comments/${cornerId}/${commentKey}/replies`));
    set(newRef, reply);
  } else {
    if (!STATE.comments[cornerId]?.[commentKey]) return;
    if (!STATE.comments[cornerId][commentKey].replies) STATE.comments[cornerId][commentKey].replies = {};
    STATE.comments[cornerId][commentKey].replies["reply-" + Date.now()] = reply;
    saveLocalComments();
    refreshAllCommentSections();
  }
  addXp(5, "Antwort");
}

function voteBarometer(cornerId, score) {
  const today = getTodayKey();
  const voteKey = currentUserKey();
  if (!STATE.nickname) { toast(T("Bitte gib zuerst einen Namen ein.", "Please enter a name first.")); return; }
  if (window.FB?.firebaseReady) {
    const { db, ref, set } = window.FB;
    set(ref(db, `barometer/${today}/${cornerId}/${voteKey}`), score);
  } else {
    if (!STATE.barometer[cornerId]) STATE.barometer[cornerId] = {};
    STATE.barometer[cornerId][voteKey] = score;
    saveLocalBarometer();
    refreshAllBarometers();
  }
  addXp(2, "Barometer");
}

function getBarometerData(cornerId) {
  const votes = STATE.barometer[cornerId] || {};
  const values = Object.values(votes);
  const myVote = votes[currentUserKey()] || 0;
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return { avg, count: values.length, myVote };
}

function voteEmoji(cornerId, amenityKey) {
  const voteKey = currentUserKey();
  let adding = false;
  if (!STATE.nickname) { toast(T("Bitte gib zuerst einen Namen ein.", "Please enter a name first.")); return; }
  if (window.FB?.firebaseReady) {
    const { db, ref, set, remove: fbRemove } = window.FB;
    const voteRef = ref(db, `emojiVotes/${cornerId}/${amenityKey}/${voteKey}`);
    const currentVotes = STATE.emojiVotes?.[cornerId]?.[amenityKey] || {};
    adding = !currentVotes[voteKey];
    if (currentVotes[voteKey]) fbRemove(voteRef); else set(voteRef, true);
  } else {
    const votes = loadLocalEmojiVotes();
    if (!votes[cornerId]) votes[cornerId] = {};
    if (!votes[cornerId][amenityKey]) votes[cornerId][amenityKey] = {};
    adding = !votes[cornerId][amenityKey][voteKey];
    if (votes[cornerId][amenityKey][voteKey]) delete votes[cornerId][amenityKey][voteKey];
    else votes[cornerId][amenityKey][voteKey] = true;
    localStorage.setItem("cg.emojiVotes", JSON.stringify(votes));
    STATE.emojiVotes = votes;
    refreshAllEmojiVotes();
  }
  // Aura once per vote — toggling a vote back and forth used to farm +2 each tap.
  const voted = gossipLocalLog("cg.voteXp");
  const vk = cornerId + "|" + amenityKey;
  if (adding && !voted[vk]) { gossipLocalMark("cg.voteXp", vk); addXp(2, "Emoji Vote"); }
}

function getEmojiVoteData(cornerId, amenityKey) {
  const votes = window.FB?.firebaseReady ? (STATE.emojiVotes?.[cornerId]?.[amenityKey] || {}) : (loadLocalEmojiVotes()[cornerId]?.[amenityKey] || {});
  return { count: Object.keys(votes).length, myVote: !!votes[currentUserKey()] };
}

function getStatusCounts(cornerId) {
  const source = STATE.cornerStatuses?.[cornerId] || {};
  const now = Date.now();
  return Object.entries(CORNER_STATUSES).map(([key, info]) => {
    const votes = source[key] || {};
    const activeEntries = Object.entries(votes).filter(([, value]) => now - Number(value || 0) <= STATUS_WINDOW_MS);
    return { key, ...info, count: activeEntries.length, active: activeEntries.some(([user]) => user === currentUserKey()) };
  });
}

function toggleCornerStatus(cornerId, statusKey) {
  if (!STATE.nickname) { toast(T("Bitte gib zuerst einen Namen ein.", "Please enter a name first.")); return; }
  const active = getStatusCounts(cornerId).find((s) => s.key === statusKey)?.active;
  if (window.FB?.firebaseReady) {
    const { db, ref, set, remove } = window.FB;
    const statusRef = ref(db, `cornerStatus/${cornerId}/${statusKey}/${currentUserKey()}`);
    if (active) remove(statusRef); else set(statusRef, Date.now());
  } else {
    if (!STATE.cornerStatuses[cornerId]) STATE.cornerStatuses[cornerId] = {};
    if (!STATE.cornerStatuses[cornerId][statusKey]) STATE.cornerStatuses[cornerId][statusKey] = {};
    if (active) delete STATE.cornerStatuses[cornerId][statusKey][currentUserKey()]; else STATE.cornerStatuses[cornerId][statusKey][currentUserKey()] = Date.now();
  }
  addXp(2, "Corner Status");
  refreshAllCornerStatusSections();
}

function renderCornerStatusSection(cornerId, container) {
  if (!container) return;
  const buttons = getStatusCounts(cornerId).map((status) => `
    <button class="status-btn ${status.active ? "active" : ""}" data-status="${status.key}">
      <span class="status-emoji">${status.emoji}</span>
      <span class="status-count">${status.count}</span>
    </button>
  `).join("");
  container.innerHTML = `<h4>Status · letzte 2h</h4><div class="status-buttons">${buttons}</div>`;
  container.querySelectorAll(".status-btn").forEach((btn) => btn.addEventListener("click", () => toggleCornerStatus(cornerId, btn.dataset.status)));
}

function refreshAllCornerStatusSections() {
  $$(".corner-status-section").forEach((section) => renderCornerStatusSection(section.dataset.cornerId, section));
}

// Same as getPeopleAtCorner, with ids so the names can open profiles.
function peopleAtCornerDetailed(cornerId) {
  const people = [];
  if (STATE.manualCheckinId === cornerId || STATE.atCornerId === cornerId) people.push({ id: currentUserKey(), label: getDisplayName(STATE.nickname || "Du", STATE.team) });
  freshFriends().forEach((friend) => {
    if (friend.atCorner === cornerId) people.push({ id: friend.id, label: getDisplayName(friend.nickname || friend.name, friend.team) + (presenceIsAsleep(friend) ? " 💤" : "") });
  });
  return people;
}

function getPeopleAtCorner(cornerId) {
  const people = [];
  const meAtCorner = STATE.manualCheckinId === cornerId || STATE.atCornerId === cornerId;
  if (meAtCorner) people.push(getDisplayName(STATE.nickname || "Du", STATE.team));
  freshFriends().forEach((friend) => {
    if (friend.atCorner === cornerId) people.push(getDisplayName(friend.nickname || friend.name, friend.team) + (presenceIsAsleep(friend) ? " 💤" : ""));
  });
  return people;
}

function checkCaptureCondition(cornerId) {
  if (!STATE.team || isPrivateCorner(cornerId)) return;   // private corners are not in the team battles
  const occupants = [];
  if (STATE.manualCheckinId === cornerId || STATE.atCornerId === cornerId) occupants.push({ id: currentUserKey(), team: STATE.team });
  freshFriends().forEach((friend) => { if (friend.atCorner === cornerId && friend.team) occupants.push({ id: friend.id, team: friend.team }); });
  const sameTeam = occupants.filter((person) => person.team === STATE.team);
  if (sameTeam.length < 3) return;
  if (STATE.captured[cornerId]?.team === STATE.team) return;
  const capture = { team: STATE.team, capturedAt: Date.now(), capturedBy: sameTeam.map((person) => person.id) };
  STATE.captured[cornerId] = capture;
  const captureKey = cornerId + "-" + capture.capturedAt;
  STATE.captureHistory[captureKey] = { ...capture, cornerId };
  if (window.FB?.firebaseReady) {
    const { db, ref, set } = window.FB;
    set(ref(db, "captured/" + cornerId), capture);
    set(ref(db, "captureHistory/" + captureKey), { ...capture, cornerId });
  }
  renderCards();
  rebuildMainMarkers();
  if (STATE.view === "leaderboard") renderLeaderboard();
  if (STATE.view === "profile") renderProfile();
}

function logEncounters(cornerId) {
  const people = [];
  if (STATE.manualCheckinId === cornerId || STATE.atCornerId === cornerId) people.push({ id: currentUserKey(), nickname: STATE.nickname });
  freshFriends().forEach((friend) => { if (friend.atCorner === cornerId) people.push({ id: friend.id, nickname: friend.nickname || friend.name || friend.id }); });
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const ids = [people[i].id, people[j].id].sort();
      const pairKey = ids.join("__");
      const prev = STATE.encounters[pairKey] || { count: 0, users: {} };
      if (Date.now() - Number(prev.lastSeen || 0) < 5 * 60 * 1000 && prev.lastCorner === cornerId) continue;
      const next = { count: prev.count + 1, lastSeen: Date.now(), lastCorner: cornerId, users: { [people[i].id]: people[i].nickname, [people[j].id]: people[j].nickname } };
      STATE.encounters[pairKey] = next;
      // Meeting a friend at a corner is the heart of the app — reward it.
      if (ids.includes(currentUserKey())) {
        const other = people[i].id === currentUserKey() ? people[j] : people[i];
        addXp(8, `Mit ${other.nickname || "einem Freund"} gecornert`);
        setTimeout(checkEncounterAchievements, 50);
      }
      if (window.FB?.firebaseReady) {
        const { db, ref, set } = window.FB;
        set(ref(db, "encounters/" + pairKey), next);
      }
    }
  }
}

function manualCheckin(cornerId) {
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner) return;
  const wasCheckedIn = STATE.manualCheckinId === cornerId;
  if (!wasCheckedIn && STATE.lastCheckinCorner && STATE.lastCheckinCorner !== cornerId) {
    const elapsed = Date.now() - STATE.lastCheckinTime;
    if (elapsed < COOLDOWN_MS) {
      const remaining = COOLDOWN_MS - elapsed;
      toast(`⏳ ${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")} ${T("bis zum nächsten Spot", "until the next spot", "para el próximo spot")}`);
      updateCheckinButtons();
      return;
    }
  }
  if (STATE.manualCheckinId) {
    document.getElementById("card-" + STATE.manualCheckinId)?.classList.remove("at-here");
    refreshMainMarker(STATE.manualCheckinId);
  }
  if (wasCheckedIn) {
    STATE.manualCheckinId = null;
    localStorage.removeItem("cg.checkedInAt");
    localStorage.removeItem("cg.manualCheckinId");
    STATE._autoCheckedCorner = null; // allow a fresh dwell auto-checkin later
    toast(T("Ausgecheckt 👋", "Checked out 👋"));
  } else {
    STATE.manualCheckinId = cornerId;
    STATE.lastCheckinTime = Date.now();
    STATE.lastCheckinCorner = cornerId;
    localStorage.setItem("cg.lastCheckinTime", String(STATE.lastCheckinTime));
    localStorage.setItem("cg.lastCheckinCorner", cornerId);
    playTeamCheckinSound(STATE.team);
    document.getElementById("card-" + cornerId)?.classList.add("at-here");
    refreshMainMarker(cornerId);
    localStorage.setItem("cg.checkedInAt", String(Date.now()));
    localStorage.setItem("cg.manualCheckinId", cornerId);
    // "Ups falsch eingecheckt" — offer a one-tap undo right in the confirmation.
    toast(
      `${T("Eingecheckt am", "Checked in at")} <strong>${escapeHtml(corner.name)}</strong> 🍻<br><span style="font-size:11px;opacity:0.75;">${T("Tippen = rückgängig", "Tap to undo")}</span>`,
      "at-corner",
      () => { if (STATE.manualCheckinId === cornerId) { manualCheckin(cornerId); undoCheckin(cornerId); toast(T("↩️ Check-in zurückgenommen", "↩️ Check-in undone")); } }
    );
    const grant = STATE.lastCheckinGrant = { cornerId, at: Date.now(), aura: 0, firstVisit: false, today: false, visitKey: recordVisit(cornerId) };
    // Aura only once per day per corner, and it scales with the spot.
    if (checkedInTodayAt(cornerId)) {
      toast(T("Schon heute hier gewesen — keine Extra-Aura, aber schön dass du da bist 🍻", "Already been here today — no extra aura, but glad you're here 🍻"));
    } else {
      markCheckedInToday(cornerId);
      const k = checkinKarma(cornerId);
      if (isPrivateCorner(corner)) { k.total = PRIVATE_POINTS(k.total); k.social = 0; k.popular = 0; }
      addXp(k.total, `Check-in: ${corner.name}`);
      grant.aura += k.total;
      grant.today = true;
      const extras = [];
      if (k.social) extras.push(`+${k.social} ${T("weil was los ist", "social bonus")}`);
      if (k.popular) extras.push(`+${k.popular} ${T("beliebter Spot", "popular spot")}`);
      toast(`✨ <strong>+${k.total} Aura</strong>${extras.length ? `<br><span style="font-size:11px;opacity:0.8;">${extras.join(" · ")}</span>` : ""}`);
    }
    const totalCheckins = parseInt(localStorage.getItem("cg.totalCheckins") || "0") + 1;
    localStorage.setItem("cg.totalCheckins", String(totalCheckins));
    if (totalCheckins >= 25) unlockAchievement("checkins-25", "Eckensteher Deluxe", "🍻", 150);
    if (totalCheckins >= 50) unlockAchievement("checkins-50", "Corner-Institution", "🏛️", 300);
    if (totalCheckins >= 100) unlockAchievement("checkins-100", "Unsterblich", "⭐", 750);
    const isFirstVisit = !STATE.visitedCorners.includes(cornerId);
    if (isFirstVisit) {
      STATE.visitedCorners.push(cornerId);
      saveVisitedCorners();
      addXp(10, `Neuer Corner: ${corner.name}`);
      grant.aura += 10;
      grant.firstVisit = true;
    }
    // Only the team picker on check-in. Describing a corner (Kiosk, Klo, Vibe)
    // is the owner's job via "Spot bearbeiten", not a quiz for every visitor.
    STATE.pendingCheckinQuestions = null;
    setTimeout(() => openCheckinTeamPicker(cornerId), 500);
    if (STATE.visitedCorners.length === 1) unlockAchievement("first-checkin", "Erster Besuch", "📍", 20);
    if (STATE.visitedCorners.length >= 5) unlockAchievement("five-checkins", "Stammgast", "🔥", 50);
    if (STATE.visitedCorners.length >= 10) unlockAchievement("ten-checkins", "Local Legend", "👑", 100);
    if (corner.isCustom && corner.createdBy && corner.createdBy !== STATE.nickname) addPoints(corner.createdById || corner.createdBy, 3, "Jemand hat deinen Corner besucht");
    checkCaptureCondition(cornerId);
    logEncounters(cornerId);
    rewardCornerDateArrival(cornerId);
    startCooldownDisplay();
    broadcastCheckinPush(corner);
    // Opt-in: open WhatsApp with the message ready. Only on a real tap — an
    // automatic (GPS) check-in must never yank you out of the app.
    if (autoWhatsAppOnCheckin() && navigator.userActivation && navigator.userActivation.isActive) {
      const text = cornerWhatsAppText(cornerId);
      setTimeout(() => openWhatsApp(text), 0);
    }
    // Scanned a personal QR: join the sharer's team automatically.
    if (STATE.pendingSharedTeam) {
      const wanted = STATE.pendingSharedTeam;
      const apply = (attempt = 0) => {
        if (TEAMS[wanted]) {
          STATE.pendingSharedTeam = null;
          clearHandledQueryParam("team");
          if (STATE.team !== wanted) {
            selectTeam(wanted);
            toast(`${TEAMS[wanted].emoji} ${T("Im Team", "Checked in with team", "Check-in con el equipo")} <strong>${escapeHtml(TEAMS[wanted].name)}</strong>${T(" eingecheckt", "", "")}`);
          }
        } else if (attempt < 10) {
          setTimeout(() => apply(attempt + 1), 400); // custom teams may still be loading
        } else {
          STATE.pendingSharedTeam = null;
        }
      };
      apply();
    }
    // QR referral: reward the person whose code was scanned + the scanner.
    if (STATE.pendingReferrerId && STATE.pendingReferrerId !== currentUserKey()) {
      addPoints(STATE.pendingReferrerId, 15, "Dein QR-Code wurde gescannt");
      addXp(10, "Per QR-Code eingecheckt");
      toast(T("🎉 QR-Bonus: +10 Aura für dich, +15 Aura für den Ersteller!", "🎉 QR bonus: +10 aura for you, +15 aura for the creator!"));
      unlockAchievement("qr-scanned", "Code-Knacker", "🧾", 15);
      STATE.pendingReferrerId = null;
      clearHandledQueryParam("ref");
    }
  }
  updateCheckinButtons();
  broadcastPresence();
  renderCards();   // re-sort: the corner you are at moves to the top
  onGossipData();  // a round may be running where you just checked in
}

// Fan-out push: writes a lightweight event that the Cloud Function delivers to
// everyone's push token (so friends get pinged even with the app closed).
function broadcastCheckinPush(corner) {
  if (!window.FB?.firebaseReady || !STATE.nickname || !corner) return;
  // Private corner: only close friends hear about it (nobody for "only me").
  if (isPrivateCorner(corner)) {
    if (cornerVisibility(corner) === "friends") sendTargetedPush(closeFriendKeys(), { type: "checkin", title: "🍻 Minga Corner Guide", body: `${STATE.nickname} ist gerade am ${corner.name} 👯`, query: `?corner=${encodeURIComponent(corner.id)}` });
    return;
  }
  try {
    const { db, ref, push, set } = window.FB;
    set(push(ref(db, "notify")), {
      type: "checkin",
      title: "🍻 Minga Corner Guide",
      body: `${STATE.nickname} ist gerade am ${corner.name}!`,
      query: `?corner=${encodeURIComponent(corner.id)}`,
      fromId: currentUserKey(),
      fromTeam: STATE.team || "",
      createdAt: Date.now()
    });
  } catch (err) { console.warn("broadcastCheckinPush failed:", err); }
}

/* Full-screen celebration when a supply run pays out — and an extra beat when
   it pushes you over a level boundary. */
function showRewardCelebration(amount, kind = "karma", opts = {}) {
  const el = $("#celebration");
  if (!el) return;
  setTimeout(() => {
    const label = kind === "karma" ? "Karma" : "Aura";
    const total = getRewardTotal(kind);
    const info = getLevel(total);
    // The reward is already credited by the time we get here, so derive the previous level from the
    // delta instead of reading it before — otherwise a level-up is never seen.
    const before = getLevel(Math.max(0, total - Number(amount || 0))).level;
    const leveledUp = info.level > before;
    const tier = getLevelTier(info.level);
    el.innerHTML = `
      <div class="cel-card">
        <div class="cel-emoji">${leveledUp ? "🎊" : (opts.emoji || "🛒")}</div>
        <div class="cel-karma">+${amount} ${label}</div>
        <div class="cel-text">${leveledUp
          ? `<strong>LEVEL ${info.level}!</strong><br>${tier.emoji} ${escapeHtml(tier.name)}${opts.text ? `<br><span style="font-size:14px;">${opts.text}</span>` : ""}`
          : (opts.text || T("Danke für den Nachschub! 🍻", "Thanks for the supplies! 🍻"))}</div>
        <div class="cel-sub">${leveledUp ? "" : T(`noch ${info.xpToNext} ${label} bis Level ${info.level + 1}`, `${info.xpToNext} ${label} to level ${info.level + 1}`, `faltan ${info.xpToNext} de ${label} para el nivel ${info.level + 1}`)}</div>
      </div>
      <div class="cel-confetti">${Array.from({ length: 28 }, (_, i) =>
        `<span style="--i:${i};--d:${(i % 7) * 0.13}s;--x:${(i * 37) % 100}%;--c:${["#e8a93e","#ff2e6c","#b8ff3a","#6cb6ff","#c77dff"][i % 5]};"></span>`).join("")}</div>`;
    el.classList.add("show");
    try { playTeamCheckinSound(STATE.team); } catch (e) {}
    setTimeout(() => el.classList.remove("show"), leveledUp ? 5200 : 3800);
  }, 260);
}

