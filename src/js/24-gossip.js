/* ====================== GOSSIP-RUNDEN ======================
   Two or more people checked in at the same corner can play a gossip round:
   one person writes the story down and/or records it with the mic, everyone
   else checked in there rates it (+2 … +20). Those points land as KARMA with
   the storyteller — karma is what other people give you. The score stays
   hidden until everybody rated or the timer ran out, then it is revealed on
   all phones at once.
   Privacy: story text and audio live in gossipContent/, which the database
   rules only let the teller and people checked in at that corner read.
   Rounds, content, votes and recordings are deleted after 24 hours.       */
const GOSSIP_SCALE = [
  { pts: 2,  emoji: "🥱", de: "Kalter Kaffee", en: "Old news" },
  { pts: 5,  emoji: "🙂", de: "Ganz nett",     en: "Kinda nice" },
  { pts: 10, emoji: "😮", de: "Uiii!",         en: "Oooh!" },
  { pts: 15, emoji: "🤯", de: "Krass!",        en: "Wild!" },
  { pts: 20, emoji: "💣", de: "Bombe!",        en: "Bombshell!" }
];
const GOSSIP_WINDOW_MS = 10 * 60 * 1000;      // rating window after a story goes out
const GOSSIP_TTL_MS = 24 * 60 * 60 * 1000;    // everything is deleted after this
const GOSSIP_TEXT_MAX = 1000;
const GOSSIP_MAX_RECORDING_S = 90;
const GOSSIP_KARMA_ROUNDS_PER_DAY = 5;        // stories per day that earn karma
const GOSSIP_TELL_AURA = 5;
const GOSSIP_RATE_AURA = 2;
const GOSSIP_INLINE_AUDIO_MAX = 1500000;      // data-URL fallback when Storage fails

STATE.gossipRounds = {};   // cornerId -> roundId -> round (public metadata)
STATE.gossipVotes = {};    // cornerId -> roundId -> voterId -> { pts, name, at }
STATE.serverTimeOffset = 0;
var GOSSIP_CONTENT = {};   // "corner/round" -> { status: loading|ok|missing|denied, data, at }
var _gossip = { roundsLoaded: false, votesLoaded: false, listening: false, primed: false, ticker: null, openSig: "", cardSig: "", lastCleanup: 0, voting: false };

function serverNow() { return Date.now() + (Number(STATE.serverTimeOffset) || 0); }
function gossipKey(cornerId, roundId) { return cornerId + "/" + roundId; }
function gossipScaleFor(pts) { return GOSSIP_SCALE.find((s) => s.pts === Number(pts)) || null; }
function gossipVerdict(avg) {
  if (avg >= 17.5) return GOSSIP_SCALE[4];
  if (avg >= 12.5) return GOSSIP_SCALE[3];
  if (avg >= 7.5) return GOSSIP_SCALE[2];
  if (avg >= 3.5) return GOSSIP_SCALE[1];
  return GOSSIP_SCALE[0];
}
function gossipVotesFor(cornerId, roundId) {
  return (STATE.gossipVotes && STATE.gossipVotes[cornerId] && STATE.gossipVotes[cornerId][roundId]) || {};
}
function gossipClosesAt(round) {
  const end = Number(round.createdAt || 0) + Number(round.windowMs || GOSSIP_WINDOW_MS);
  return round.endedAt ? Math.min(end, Number(round.endedAt)) : end;
}
function gossipAllVoted(cornerId, round) {
  const audience = Object.keys(round.audience || {});
  if (!audience.length) return false;
  const votes = gossipVotesFor(cornerId, round.id);
  return audience.every((id) => votes[id]);
}
// Open = still collecting ratings. Revealed = everyone rated or time is up.
function gossipIsOpen(cornerId, round, now = serverNow()) {
  return !!round && now < gossipClosesAt(round) && !gossipAllVoted(cornerId, round);
}
function gossipRoundsAt(cornerId) {
  const now = serverNow();
  return Object.entries((STATE.gossipRounds || {})[cornerId] || {})
    .filter(([, r]) => r && r.tellerId && now - Number(r.createdAt || 0) < GOSSIP_TTL_MS)
    .map(([id, r]) => ({ ...r, id, cornerId }))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}
function gossipOpenRoundAt(cornerId) {
  return gossipRoundsAt(cornerId).find((r) => gossipIsOpen(cornerId, r)) || null;
}
function gossipResult(cornerId, round) {
  const votes = Object.entries(gossipVotesFor(cornerId, round.id))
    .map(([id, v]) => ({ id, name: (v && v.name) || "?", pts: Number(v && v.pts) || 0 }))
    .filter((v) => gossipScaleFor(v.pts))
    .sort((a, b) => b.pts - a.pts);
  const total = votes.reduce((sum, v) => sum + v.pts, 0);
  const avg = votes.length ? total / votes.length : 0;
  return { votes, total, avg, verdict: votes.length ? gossipVerdict(avg) : null };
}
// Everyone else who counts as checked in at this corner (screen-off people included).
function gossipCrowdAt(cornerId) {
  return freshFriends()
    .filter((f) => f.atCorner === cornerId && !isMyKey(f.id))
    .map((f) => ({ id: f.id, name: f.nickname || f.name || f.id, team: f.team || "", asleep: presenceIsAsleep(f) }));
}
function iAmAtCorner(cornerId) { return !!cornerId && myPresenceCorner() === cornerId; }
function gossipLocalLog(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || "{}"); return v && typeof v === "object" ? v : {}; }
  catch (e) { return {}; }
}
function gossipLocalMark(key, id) {
  const log = gossipLocalLog(key);
  log[id] = Date.now();
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  Object.keys(log).forEach((k) => { if (Number(log[k]) < cutoff) delete log[k]; });
  localStorage.setItem(key, JSON.stringify(log));
}
function gossipKarmaRoundsToday() { return Number(gossipLocalLog("cg.gossipDays")[getTodayKey()] || 0); }
function countGossipKarmaRound() {
  const today = getTodayKey();
  localStorage.setItem("cg.gossipDays", JSON.stringify({ [today]: gossipKarmaRoundsToday() + 1 }));
}
function bumpLocalCounter(key) {
  const n = (parseInt(localStorage.getItem(key) || "0", 10) || 0) + 1;
  localStorage.setItem(key, String(n));
  return n;
}
function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function clockTime(ts) {
  return new Date(Number(ts) || 0).toLocaleTimeString(STATE.lang === "en" ? "en-GB" : "de-DE", { hour: "2-digit", minute: "2-digit" });
}
// Only replace markup that actually changed: re-rendering rating buttons in
// the middle of a tap would swallow the tap.
function setHtmlIfChanged(el, html) {
  if (!el || el._html === html) return false;
  el._html = html;
  el.innerHTML = html;
  return true;
}

function listenGossip(attempt = 0) {
  if (!window.FB?.firebaseReady || _gossip.listening) return;
  _gossip.listening = true;
  const { db, ref, onValue } = window.FB;
  let retried = false;
  const stopped = (what) => (err) => {
    _gossip.listening = false;
    console.warn(`gossip ${what} listener stopped:`, err?.message || err);
    if (!retried) { retried = true; retryListenerAfterAuth(listenGossip, attempt); }
  };
  try { onValue(ref(db, ".info/serverTimeOffset"), (snap) => { STATE.serverTimeOffset = Number(snap.val()) || 0; }); } catch (err) { /* local clock it is */ }
  onValue(ref(db, "gossipRounds"), (snap) => {
    STATE.gossipRounds = snap.val() || {};
    _gossip.roundsLoaded = true;
    onGossipData();
  }, stopped("rounds"));
  onValue(ref(db, "gossipVotes"), (snap) => {
    STATE.gossipVotes = snap.val() || {};
    _gossip.votesLoaded = true;
    onGossipData();
  }, stopped("votes"));
}

function onGossipData() {
  if (!_gossip.roundsLoaded || !_gossip.votesLoaded) return;
  processGossipEvents(!_gossip.primed);
  _gossip.primed = true;
  _gossip.openSig = openGossipSignature();
  refreshGossipViews();
  ensureGossipTicker();
  cleanupExpiredGossip();
}

function openGossipSignature() {
  return Object.keys(STATE.gossipRounds || {})
    .map((cornerId) => { const r = gossipOpenRoundAt(cornerId); return r ? gossipKey(cornerId, r.id) : ""; })
    .filter(Boolean).sort().join("|");
}

/* ---- Gossip chronicle ----
   Rounds (and the stories) are deleted after 24 h. What stays is a small
   personal record per participant: who told it, where, who was there, the
   score and the optional public headline — never the story itself.        */
STATE.gossipLog = {};
function gossipLogKey(cornerId, roundId) { return String(cornerId).replace(/[.#$\[\]\/]/g, "_") + "__" + roundId; }
function logGossipRound(cornerId, round) {
  const uid = window.FB?.getAuthUid?.() || "";
  if (!uid || !window.FB?.firebaseReady || !round || !round.id) return;
  const me = currentUserKey();
  const mine = isMyKey(round.tellerId);
  const votes = gossipVotesFor(cornerId, round.id);
  const myVote = votes[me];
  if (!mine && !myVote && !(round.audience && round.audience[me])) return;
  const open = gossipIsOpen(cornerId, round);
  const res = gossipResult(cornerId, round);
  const sig = `${open ? 1 : 0}:${res.votes.length}:${res.total}`;
  const key = gossipLogKey(cornerId, round.id);
  const sigs = gossipLocalLog("cg.gossipLogSig");
  if (sigs[key] === sig) return;
  const people = {};
  if (round.tellerId) people[round.tellerId] = String(round.tellerName || "?").slice(0, 40);
  Object.entries(round.audience || {}).forEach(([id, name]) => { people[id] = String(name || "?").slice(0, 40); });
  Object.entries(votes).forEach(([id, v]) => { people[id] = String((v && v.name) || people[id] || "?").slice(0, 40); });
  const corner = getAllCorners().find((c) => c.id === cornerId);
  const entry = {
    cornerId: String(cornerId).slice(0, 120), cornerName: String(corner?.name || "").slice(0, 80),
    roundId: round.id, at: Number(round.createdAt) || Date.now(),
    tellerId: round.tellerId || "", tellerName: String(round.tellerName || "").slice(0, 40),
    role: mine ? "teller" : "listener", people,
    total: res.total, votes: res.votes.length, verdict: res.verdict ? res.verdict.emoji : "", open
  };
  if (round.title) entry.title = String(round.title).slice(0, 60);
  if (!mine && myVote) entry.myPts = Number(myVote.pts) || 0;
  STATE.gossipLog[key] = entry;
  const { db, ref, set } = window.FB;
  set(ref(db, `gossipLog/${uid}/${key}`), entry)
    .then(() => { const all = gossipLocalLog("cg.gossipLogSig"); all[key] = sig; localStorage.setItem("cg.gossipLogSig", JSON.stringify(all)); })
    .catch((err) => console.warn("gossip log write failed:", err?.message || err));
}

var _gossipLogListening = false;
function listenGossipLog() {
  const uid = window.FB?.getAuthUid?.() || "";
  if (!uid || !window.FB?.firebaseReady || _gossipLogListening) return;
  _gossipLogListening = true;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "gossipLog/" + uid), (snap) => {
    STATE.gossipLog = snap.val() || {};
    if (STATE.view === "profile") renderProfile();
  }, () => { _gossipLogListening = false; });
}

function gossipLogEntries() {
  return Object.values(STATE.gossipLog || {}).filter((g) => g && g.cornerId).sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
}
function sharedGossipsWith(key) {
  return gossipLogEntries().filter((g) => g.tellerId === key || (g.people && key in g.people));
}
function gossipLogRowHtml(g) {
  const me = currentUserKey();
  const teller = isMyKey(g.tellerId) ? T("Du", "You") : (g.tellerName || "?");
  const others = Object.entries(g.people || {}).filter(([id]) => id !== g.tellerId && !isMyKey(id) && id !== me).map(([, n]) => n);
  const date = new Date(Number(g.at || 0)).toLocaleDateString(STATE.lang === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  return `<button class="gl-row" data-gossip-corner="${escapeHtml(g.cornerId)}">
    <span class="gl-emoji">${escapeHtml(g.verdict || "🗣️")}</span>
    <span class="gl-main">
      ${g.title ? `<span class="gl-title">„${escapeHtml(g.title)}“</span>` : ""}
      <span class="gl-line">${isMyKey(g.tellerId) ? `<strong>${T("Du", "You")}</strong> ${T("hast erzählt", "told it")}` : `<strong>${escapeHtml(teller)}</strong> ${T("erzählte", "told it")}`} · ${escapeHtml(g.cornerName || "?")} · ${date}</span>
      ${others.length ? `<span class="gl-line dim">${T("mit", "with")} ${others.slice(0, 6).map((n) => escapeHtml(n)).join(", ")}${others.length > 6 ? " …" : ""}</span>` : ""}
    </span>
    <span class="gl-pts">${g.open ? "⏳" : `${Number(g.total || 0)} P.`}${g.myPts ? `<br><small>${T("du", "you")}: +${g.myPts}</small>` : ""}</span>
  </button>`;
}
function buildGossipChronicleHtml() {
  const list = gossipLogEntries();
  if (!list.length) return `<div class="team-battle-section gossip-chronicle"><h3>🗣️ ${T("Gossip-Chronik", "Gossip chronicle")}</h3><p style="font-size:12px;color:var(--fg-dim);margin:0;">${T("Noch keine Gossip-Runden. Wenn ihr zu zweit oder mehr an einem Corner eingecheckt seid, kann jemand eine starten — hier steht dann, wer wo was erzählt hat.", "No gossip rounds yet. When two or more of you are checked in at a corner, someone can start one — this is where you'll see who told what, where.")}</p></div>`;
  const told = list.filter((g) => g.role === "teller").length;
  return `<div class="team-battle-section gossip-chronicle"><h3>🗣️ ${T("Gossip-Chronik", "Gossip chronicle")}</h3>
    <p style="font-size:12px;color:var(--fg-dim);margin:0 0 8px;">${T(`${list.length} ${list.length === 1 ? "Runde" : "Runden"} · ${told} selbst erzählt`, `${list.length} round${list.length === 1 ? "" : "s"} · ${told} told by you`)}</p>
    <div class="gl-list">${list.slice(0, 8).map(gossipLogRowHtml).join("")}</div>
    ${list.length > 8 ? `<details class="gl-more"><summary>${T(`Alle ${list.length} anzeigen`, `Show all ${list.length}`)}</summary><div class="gl-list">${list.slice(8).map(gossipLogRowHtml).join("")}</div></details>` : ""}
  </div>`;
}

// Toasts, the teller's celebration and the screen wake lock, each once per round.
function processGossipEvents(firstLoad) {
  const me = currentUserKey();
  if (!me) return;
  const announced = gossipLocalLog("cg.gossipAnnounced");
  const celebrated = gossipLocalLog("cg.gossipCelebrated");
  const revealSeen = gossipLocalLog("cg.gossipRevealSeen");
  let keepAwake = false;
  Object.keys(STATE.gossipRounds || {}).forEach((cornerId) => {
    gossipRoundsAt(cornerId).forEach((round) => {
      const key = gossipKey(cornerId, round.id);
      const mine = isMyKey(round.tellerId);
      const myVote = gossipVotesFor(cornerId, round.id)[me];
      logGossipRound(cornerId, round);
      if (gossipIsOpen(cornerId, round)) {
        if (mine || iAmAtCorner(cornerId)) keepAwake = true;
        if (!mine && !myVote && iAmAtCorner(cornerId) && !announced[key]) {
          gossipLocalMark("cg.gossipAnnounced", key);
          announceGossipRound(cornerId, round);
        }
        return;
      }
      if (mine) {
        if (!celebrated[key]) {
          gossipLocalMark("cg.gossipCelebrated", key);
          celebrateGossipResult(cornerId, round, firstLoad);
        }
      } else if (!revealSeen[key]) {
        gossipLocalMark("cg.gossipRevealSeen", key);
        const involved = !!myVote || !!(round.audience && round.audience[me]);
        if (!firstLoad && involved) toastGossipResult(cornerId, round);
      }
    });
  });
  if (keepAwake) holdWakeLock("gossip"); else dropWakeLock("gossip");
}

function announceGossipRound(cornerId, round) {
  const corner = getAllCorners().find((c) => c.id === cornerId);
  toast(`🗣️ <strong>${escapeHtml(round.tellerName || T("Jemand", "Someone"))}</strong> ${T("hat frischen Gossip", "has fresh gossip")}${corner ? ` ${T("am", "at")} ${escapeHtml(corner.name)}` : ""}!<br><span style="font-size:11px;opacity:0.8;">${T("Tippen zum Hören & Punkte vergeben →", "Tap to listen & rate →")}</span>`, "gossip", () => focusGossip(cornerId));
  try { playTeamCheckinSound(round.tellerTeam || STATE.team); } catch (err) { /* sound is optional */ }
}

function celebrateGossipResult(cornerId, round, whileAway) {
  const res = gossipResult(cornerId, round);
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!res.votes.length) {
    toast(`🗣️ ${T("Deine Story", "Your story")}${corner ? ` ${T("am", "at")} ${escapeHtml(corner.name)}` : ""}: ${T("diesmal keine Bewertungen", "no ratings this time")} 🤷`);
    return;
  }
  const v = res.verdict;
  const text = `${v.emoji} <strong>${escapeHtml(T(v.de, v.en))}</strong><br>${res.votes.length} ${res.votes.length === 1 ? T("Bewertung", "rating") : T("Bewertungen", "ratings")} · Ø ${Math.round(res.avg)}${whileAway ? `<br><span style="font-size:12px;opacity:0.8;">${T("… während du weg warst", "… while you were away")}</span>` : ""}`;
  if (round.karma !== false) showRewardCelebration(res.total, "karma", { emoji: "🗣️", text });
  else toast(`🗣️ ${T("Deine Story", "Your story")}: <strong>${res.total}</strong> ${T("Punkte", "points")} ${v.emoji} — ${T("heute ohne Karma (Tageslimit)", "no karma today (daily limit)")}`, "gossip");
  if (res.votes.length >= 2 && res.avg >= 17.5) unlockAchievement("gossip-bomb", "Bombe geplatzt", "💣", 40);
}

function toastGossipResult(cornerId, round) {
  const res = gossipResult(cornerId, round);
  if (!res.votes.length) return;
  toast(`${res.verdict.emoji} ${T("Gossip von", "Gossip by")} <strong>${escapeHtml(round.tellerName || "?")}</strong>: <strong>${res.total}</strong> ${T("Punkte", "points")} — ${escapeHtml(T(res.verdict.de, res.verdict.en))}`, "gossip", () => focusGossip(cornerId));
}

function focusGossip(cornerId) {
  const alreadyOpen = $("#detail-overlay")?.classList.contains("open") && STATE.detailCornerId === cornerId;
  if (!alreadyOpen) openDetail(cornerId);
  setTimeout(() => {
    document.querySelector(`.gossip-section[data-corner-id="${CSS.escape(cornerId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, alreadyOpen ? 0 : 250);
}

function ensureGossipTicker() {
  const anyOpen = !!openGossipSignature();
  if (anyOpen && !_gossip.ticker) _gossip.ticker = setInterval(gossipTick, 1000);
  else if (!anyOpen && _gossip.ticker) { clearInterval(_gossip.ticker); _gossip.ticker = null; }
  updateGossipCountdowns();
}
function gossipTick() {
  updateGossipCountdowns();
  const sig = openGossipSignature();
  if (sig !== _gossip.openSig) {          // a round just ran out of time
    _gossip.openSig = sig;
    processGossipEvents(false);
    refreshGossipViews();
    ensureGossipTicker();
  }
}
function updateGossipCountdowns() {
  document.querySelectorAll("[data-gossip-ends]").forEach((el) => {
    el.textContent = formatDuration(Math.max(0, Number(el.dataset.gossipEnds) - serverNow()) / 1000);
  });
}

function refreshGossipViews() {
  if ($("#detail-overlay")?.classList.contains("open") && STATE.detailCornerId) {
    const box = document.querySelector(`.gossip-section[data-corner-id="${CSS.escape(STATE.detailCornerId)}"]`);
    if (box) renderGossipSection(STATE.detailCornerId, box);
  }
  const cardSig = openGossipSignature();
  if (cardSig !== _gossip.cardSig) { _gossip.cardSig = cardSig; renderCards(); }
}

// Story text/audio is only readable for people at the corner (database rules),
// so it is fetched per round instead of being part of a big listener.
function ensureGossipContent(cornerId, roundId, attempt = 0) {
  const key = gossipKey(cornerId, roundId);
  const cur = GOSSIP_CONTENT[key];
  if (cur && (cur.status === "ok" || cur.status === "loading")) return cur;
  if (cur && Date.now() - Number(cur.at || 0) < 5000) return cur;   // missing/denied: retry later
  GOSSIP_CONTENT[key] = { status: "loading", at: Date.now() };
  const { db, ref, get } = window.FB;
  get(ref(db, `gossipContent/${cornerId}/${roundId}`)).then((snap) => {
    const data = snap.val();
    GOSSIP_CONTENT[key] = data ? { status: "ok", data, at: Date.now() } : { status: "missing", at: Date.now() };
    if (!data && attempt < 4) setTimeout(() => { if (GOSSIP_CONTENT[key]?.status === "missing") { delete GOSSIP_CONTENT[key]; ensureGossipContent(cornerId, roundId, attempt + 1); } }, 1500);
    refreshGossipViews();
  }).catch(() => {
    GOSSIP_CONTENT[key] = { status: "denied", at: Date.now() };
    refreshGossipViews();
  });
  return GOSSIP_CONTENT[key];
}

function gossipAudioSrc(data) {
  const src = String((data && (data.audioUrl || data.audioData)) || "");
  return /^(https?:|data:audio\/)/i.test(src) ? src : "";
}

function renderGossipStoryHtml(round, cs, mine) {
  const head = `<div class="gs-story-head">${mine ? `<strong>${T("Deine Story", "Your story")}</strong>` : `<strong>${escapeHtml(round.tellerName || "?")}</strong> ${T("erzählt", "tells")}`}${round.hasAudio ? ` · 🎙️ ${formatDuration(round.audioDuration)}` : ""}${round.title ? `<div class="gs-headline">„${escapeHtml(round.title)}“</div>` : ""}</div>`;
  if (cs.status === "denied") return `<div class="gs-story">${head}<p class="gs-hint">🤫 ${T("Nur für Leute, die hier eingecheckt sind.", "Only for people checked in here.")}</p></div>`;
  if (cs.status !== "ok") return `<div class="gs-story">${head}<p class="gs-hint">${T("Story wird geladen …", "Loading story …")}</p></div>`;
  const d = cs.data || {};
  const src = gossipAudioSrc(d);
  return `<div class="gs-story">${head}
    ${d.text ? `<p class="gs-story-text">${escapeHtml(d.text)}</p>` : ""}
    ${src ? `<audio controls preload="metadata" src="${escapeHtml(src)}"></audio><p class="gs-hint gs-audio-error" hidden>⚠️ ${T("Dein Gerät kann diese Aufnahme nicht abspielen — lass sie dir vorspielen 😉", "Your device can't play this recording — ask to hear it 😉")}</p>`
      : (round.hasAudio ? `<p class="gs-hint">${T("Aufnahme nicht verfügbar.", "Recording unavailable.")}</p>` : "")}
  </div>`;
}

function renderGossipResultCard(cornerId, round) {
  const res = gossipResult(cornerId, round);
  const mine = isMyKey(round.tellerId);
  const who = mine ? T("dich", "you") : escapeHtml(round.tellerName || "?");
  if (!res.votes.length) return `<div class="gs-result"><div class="gs-sub">${mine ? T("Deine Story", "Your story") : escapeHtml(round.tellerName || "?")}: ${T("keine Bewertungen", "no ratings")} 🤷</div></div>`;
  return `<div class="gs-result">
    <div class="gs-big">${res.verdict.emoji}</div>
    <div class="gs-score">${res.total} ${T("Punkte", "points")}</div>
    <div class="gs-sub">${T("für", "for")} <strong>${who}</strong> · ${escapeHtml(T(res.verdict.de, res.verdict.en))} · Ø ${Math.round(res.avg)}</div>
    <div class="gs-votes">${res.votes.map((v) => `<span>${gossipScaleFor(v.pts).emoji} ${escapeHtml(v.name)} +${v.pts}</span>`).join("")}</div>
    ${mine ? `<p class="gs-hint">${round.karma === false ? T("Just for fun — heute ohne Karma (Tageslimit erreicht).", "Just for fun — no karma today (daily limit).") : `→ <strong>+${res.total} Karma</strong> ${T("für dich", "for you")}`}</p>` : ""}
  </div>`;
}

/* Newer features (gossip rounds, cornerdates) need the current database rules.
   They contain a readable, empty "features" node: if reading it works, the
   rules are deployed. (A listener alone is no proof — the SDK can report an
   empty value for a path after earlier permission errors.)                 */
var _backendFeatures = { ok: false, checked: false, pending: null };
function checkBackendFeatures(force = false) {
  if (!window.FB?.firebaseReady || !window.FB.getAuthUid?.()) return Promise.resolve(false);
  if (_backendFeatures.ok) return Promise.resolve(true);
  if (_backendFeatures.pending) return _backendFeatures.pending;
  if (_backendFeatures.checked && !force) return Promise.resolve(false);
  const { db, ref, get } = window.FB;
  _backendFeatures.pending = get(ref(db, "features")).then(() => true, () => false).then((ok) => {
    _backendFeatures.ok = ok;
    _backendFeatures.checked = true;
    _backendFeatures.pending = null;
    if (ok) { refreshGossipViews(); refreshCornerDateSection(); }
    return ok;
  });
  return _backendFeatures.pending;
}

function renderGossipSection(cornerId, container) {
  if (!container) return;
  // Hidden until the gossip rules are deployed and data has arrived — before
  // that the server would refuse every round.
  container.hidden = !(_backendFeatures.ok && _gossip.roundsLoaded);
  if (container.hidden) return;
  if (!container._ready) {
    container.innerHTML = `<h3 class="gossip-title"><span class="gossip-live-dot" hidden></span>🗣️ ${T("Gossip-Runde", "Gossip round")}</h3><div class="gs-live"></div><div class="gs-controls"></div><div class="gs-results"></div><div class="gs-start"></div><div class="gs-history"></div>`;
    container._ready = true;
  }
  const me = currentUserKey();
  const here = iAmAtCorner(cornerId);
  const crowd = gossipCrowdAt(cornerId);
  const rounds = gossipRoundsAt(cornerId);
  const open = rounds.find((r) => gossipIsOpen(cornerId, r)) || null;
  const revealed = rounds.filter((r) => !gossipIsOpen(cornerId, r));
  container.classList.toggle("live", !!open);
  container.querySelector(".gossip-live-dot").hidden = !open;

  // 1) The story itself (the running round, else the last one told here).
  //    Rebuilt only when the round or its loading state changes, so a clip
  //    keeps playing while ratings come in and through the reveal.
  const live = container.querySelector(".gs-live");
  const featured = open || revealed[0] || null;
  let liveSig = "none";
  let liveHtml = "";
  if (featured && (here || isMyKey(featured.tellerId))) {
    const cs = ensureGossipContent(cornerId, featured.id);
    liveSig = `${featured.id}:${cs.status}`;
    liveHtml = renderGossipStoryHtml(featured, cs, isMyKey(featured.tellerId));
  }
  if (live._sig !== liveSig) {
    live._sig = liveSig;
    live.innerHTML = liveHtml;
    live.querySelectorAll("audio").forEach((a) => a.addEventListener("error", () => {
      const hint = a.nextElementSibling;
      if (hint) hint.hidden = false;
    }));
  }

  // 2) Rating / waiting state of the open round.
  let ctrl = "";
  if (open) {
    const votes = gossipVotesFor(cornerId, open.id);
    const audience = Object.entries(open.audience || {});
    const late = Object.keys(votes).filter((id) => !(open.audience || {})[id]);
    const voted = Object.keys(votes).length;
    const progress = `⏳ <span class="gs-countdown" data-gossip-ends="${gossipClosesAt(open)}"></span> · ${voted}/${audience.length + late.length} ${T("haben bewertet", "rated")}`;
    const who = `<div class="gs-who">${audience.map(([id, name]) => `<span class="${votes[id] ? "done" : ""}">${votes[id] ? "✓ " : ""}${escapeHtml(name)}</span>`).join("")}</div>`;
    const myVote = votes[me];
    if (isMyKey(open.tellerId)) {
      ctrl = `<p class="gs-meta">${progress}</p>${who}
        <p class="gs-hint">${T("Die Punkte bleiben geheim, bis alle bewertet haben oder die Zeit um ist.", "Scores stay hidden until everyone rated or time is up.")}${open.karma === false ? " " + T("Heute ohne Karma — dein Tageslimit von 5 Storys ist erreicht.", "No karma today — your daily limit of 5 stories is reached.") : ""}</p>
        <div class="gs-actions">${voted
          ? `<button class="action-btn" data-gossip-reveal>🔓 ${T("Jetzt auflösen", "Reveal now")}</button>`
          : `<button class="action-btn" data-gossip-withdraw>🗑️ ${T("Zurückziehen", "Withdraw")}</button>`}</div>`;
    } else if (!here) {
      ctrl = `<p class="gs-meta">${progress}</p><p class="gs-hint">${T("Gerade erzählt", "Right now")} <strong>${escapeHtml(open.tellerName || "?")}</strong> ${T("hier eine Story. Check ein, um mitzuhören und Punkte zu vergeben.", "is telling a story here. Check in to listen and rate.")}</p>`;
    } else if (myVote) {
      const s = gossipScaleFor(myVote.pts);
      ctrl = `<p class="gs-meta">✓ ${T("Du hast", "You gave")} ${s ? s.emoji : ""} <strong>+${myVote.pts}</strong> ${T("vergeben — warte auf die anderen", "— waiting for the others")}</p><p class="gs-meta">${progress}</p>${who}`;
    } else {
      ctrl = `<p class="gs-rate-q">${T("Wie krass ist der Gossip? Deine Punkte gehen an", "How juicy is it? Your points go to")} <strong>${escapeHtml(open.tellerName || "?")}</strong>${open.karma === false ? "" : " (Karma)"}:</p>
        <div class="gs-rate">${GOSSIP_SCALE.map((s) => `<button class="gs-rate-btn" data-gossip-rate="${s.pts}" aria-label="${escapeHtml(T(s.de, s.en))}, +${s.pts}"><span class="gs-e">${s.emoji}</span><span class="gs-l">${escapeHtml(T(s.de, s.en))}</span><span class="gs-p">+${s.pts}</span></button>`).join("")}</div>
        <p class="gs-meta">${progress}</p>`;
    }
  }
  const controls = container.querySelector(".gs-controls");
  if (setHtmlIfChanged(controls, ctrl)) {
    controls.querySelectorAll("[data-gossip-rate]").forEach((btn) => btn.addEventListener("click", () => rateGossip(cornerId, open.id, Number(btn.dataset.gossipRate))));
    controls.querySelector("[data-gossip-reveal]")?.addEventListener("click", () => revealGossipNow(cornerId, open.id));
    controls.querySelector("[data-gossip-withdraw]")?.addEventListener("click", () => withdrawGossip(cornerId, open.id));
    updateGossipCountdowns();
  }

  // 3) Start a round (or why you can't yet).
  let start = "";
  if (!open) {
    if (!window.FB?.firebaseReady) {
      start = `<p class="gs-hint">${T("Gossip-Runden brauchen eine Verbindung.", "Gossip rounds need a connection.")}</p>`;
    } else if (!here) {
      start = `<p class="gs-hint">${T("Sobald mindestens zwei Leute hier eingecheckt sind, könnt ihr eine Gossip-Runde spielen: eine Person erzählt (aufschreiben oder einsprechen), die anderen vergeben Punkte — die landen als Karma bei der Person, die erzählt.", "Once at least two people are checked in here you can play a gossip round: one person tells a story (written or recorded), the others rate it — the points land as karma with the storyteller.")}</p>`;
    } else if (!crowd.length) {
      start = `<p class="gs-hint">${T("Du bist gerade allein hier eingecheckt. Sobald noch jemand eincheckt, kannst du eine Gossip-Runde starten.", "You're the only one checked in here. As soon as someone else checks in, you can start a gossip round.")}</p>`;
    } else {
      const names = crowd.map((p) => escapeHtml(p.name) + (p.asleep ? " 💤" : "")).join(", ");
      const capped = gossipKarmaRoundsToday() >= GOSSIP_KARMA_ROUNDS_PER_DAY;
      start = `<button class="action-btn gs-start-btn" data-gossip-start>🗣️ ${revealed.length ? T("Nächste Gossip-Runde starten", "Start the next gossip round") : T("Gossip-Runde starten", "Start a gossip round")}</button>
        <p class="gs-hint">${T("Schreib deine Story auf oder sprich sie ein.", "Write your story down or record it.")} <strong>${names}</strong> ${crowd.length === 1 ? T("vergibt", "rates it with") : T("vergeben", "rate it with")} +2 ${T("bis", "to")} +20 ${T("Punkte → landen als Karma bei dir.", "points → they land as karma with you.")}${capped ? " " + T("Heute hattest du schon 5 Storys mit Karma — weitere zählen just for fun.", "You already had 5 karma stories today — more are just for fun.") : ""}</p>`;
    }
  }
  const startBox = container.querySelector(".gs-start");
  if (setHtmlIfChanged(startBox, start)) {
    startBox.querySelector("[data-gossip-start]")?.addEventListener("click", () => openGossipComposer(cornerId));
  }

  // 4) Results of the last 24 hours: the latest one big, older ones compact.
  let res = "";
  let history = "";
  if (revealed.length) {
    const [latest, ...older] = revealed;
    res = renderGossipResultCard(cornerId, latest);
    if (older.length) {
      history = `<div class="gs-history-title">${T("Vorher hier", "Earlier here")}</div>` + older.slice(0, 5).map((r) => {
        const rr = gossipResult(cornerId, r);
        return `<div class="gs-history-row"><span>${rr.verdict ? rr.verdict.emoji : "🤷"}</span><span class="gs-h-name">${escapeHtml(isMyKey(r.tellerId) ? T("Du", "You") : (r.tellerName || "?"))}</span><span class="gs-h-pts">${rr.total} ${T("P.", "pts")}</span><span class="gs-h-time">${clockTime(r.createdAt)}</span></div>`;
      }).join("");
    }
    history += `<p class="gs-hint">🤫 ${T("Storys und Aufnahmen werden nach 24 Stunden gelöscht.", "Stories and recordings are deleted after 24 hours.")}</p>`;
  }
  setHtmlIfChanged(container.querySelector(".gs-results"), res);
  setHtmlIfChanged(container.querySelector(".gs-history"), history);
}

async function rateGossip(cornerId, roundId, pts) {
  const raw = STATE.gossipRounds?.[cornerId]?.[roundId];
  const scale = gossipScaleFor(pts);
  if (!raw || !scale || !STATE.nickname || !window.FB?.firebaseReady) return;
  const round = { ...raw, id: roundId };
  const me = currentUserKey();
  if (isMyKey(round.tellerId)) { toast(T("Deine eigene Story kannst du nicht bewerten 😉", "You can't rate your own story 😉")); return; }
  if (!iAmAtCorner(cornerId)) { toast(T("Nur wer hier eingecheckt ist, darf Punkte vergeben.", "Only people checked in here can rate.")); return; }
  if (gossipVotesFor(cornerId, roundId)[me]) { toast(T("Schon bewertet ✓", "Already rated ✓")); return; }
  if (!gossipIsOpen(cornerId, round)) { toast(T("Die Runde ist schon aufgelöst.", "This round is already revealed.")); return; }
  if (_gossip.voting) return;
  _gossip.voting = true;
  document.querySelectorAll("[data-gossip-rate]").forEach((b) => { b.disabled = true; });
  const { db, ref, set, serverTimestamp } = window.FB;
  try {
    await set(ref(db, `gossipVotes/${cornerId}/${roundId}/${me}`), { pts: scale.pts, name: String(STATE.nickname).slice(0, 40), team: STATE.team || "", at: serverTimestamp() });
  } catch (err) {
    console.warn("rateGossip failed:", err);
    _gossip.voting = false;
    document.querySelectorAll("[data-gossip-rate]").forEach((b) => { b.disabled = false; });
    toast(T("Bewertung ging nicht durch — ist die Runde schon vorbei?", "Rating didn't go through — is the round over?"));
    return;
  }
  _gossip.voting = false;
  // The storyteller's karma is credited by each rater (as a transaction, so
  // simultaneous ratings can't overwrite each other).
  if (round.karma !== false) addKarmaPoints(round.tellerId, scale.pts, `Gossip: ${STATE.nickname} gab ${scale.emoji} +${scale.pts}`, round.tellerName);
  addXp(GOSSIP_RATE_AURA, "Gossip bewertet");
  if (bumpLocalCounter("cg.gossipRated") >= 10) unlockAchievement("gossip-jury", "Gossip-Jury", "⚖️", 25);
  if (gossipIsOpen(cornerId, round)) {
    toast(`${scale.emoji} <strong>+${scale.pts}</strong> ${T("für", "for")} ${escapeHtml(round.tellerName || "?")}${round.karma === false ? "" : " (Karma)"} · +${GOSSIP_RATE_AURA} Aura ${T("für dich", "for you")}`, "gossip");
  }
  maybeNotifyGossipResult(cornerId, round);
}

async function revealGossipNow(cornerId, roundId) {
  const { db, ref, update, serverTimestamp } = window.FB;
  try { await update(ref(db, `gossipRounds/${cornerId}/${roundId}`), { endedAt: serverTimestamp() }); }
  catch (err) { console.warn("revealGossipNow failed:", err); toast(T("Auflösen hat nicht geklappt.", "Couldn't reveal.")); }
}

async function withdrawGossip(cornerId, roundId) {
  if (!(await appConfirm(T("Story zurückziehen?", "Withdraw your story?"), T("Sie wird für alle gelöscht.", "It will be deleted for everyone."), T("Zurückziehen", "Withdraw")))) return;
  const raw = STATE.gossipRounds?.[cornerId]?.[roundId];
  const { db, ref, remove } = window.FB;
  try {
    await remove(ref(db, `gossipContent/${cornerId}/${roundId}`));
    await remove(ref(db, `gossipRounds/${cornerId}/${roundId}`));
    remove(ref(db, `gossipVotes/${cornerId}/${roundId}`)).catch(() => {});
    if (raw?.hasAudio && window.FB.deleteFile) window.FB.deleteFile(`gossipAudio/${cornerId}/${roundId}`).catch(() => {});
    toast(T("Story zurückgezogen.", "Story withdrawn."));
  } catch (err) {
    console.warn("withdrawGossip failed:", err);
    toast(T("Zurückziehen hat nicht geklappt.", "Couldn't withdraw."));
  }
}

// Push to the people at the corner (Cloud Function pushOnTargetedNotify).
function sendTargetedPush(toIdList, payload) {
  const toIds = {};
  toIdList.filter(Boolean).forEach((id) => { toIds[id] = true; });
  if (!Object.keys(toIds).length || !window.FB?.firebaseReady) return;
  try {
    const { db, ref, push, set } = window.FB;
    set(push(ref(db, "notifyTargeted")), {
      ...payload,
      body: String(payload.body || "").slice(0, 200),
      fromId: currentUserKey(),
      fromTeam: STATE.team || "",
      toIds,
      createdAt: Date.now()
    }).catch((err) => console.warn("targeted push event failed:", err));
  } catch (err) { console.warn("targeted push event failed:", err); }
}

function maybeNotifyGossipResult(cornerId, round) {
  if (!gossipAllVoted(cornerId, round)) return;     // the last rating triggers it
  const res = gossipResult(cornerId, round);
  if (!res.votes.length) return;
  const corner = getAllCorners().find((c) => c.id === cornerId);
  sendTargetedPush([round.tellerId], {
    type: "gossip-result",
    title: `${res.verdict.emoji} Deine Gossip-Story`,
    body: `${res.total} Punkte von ${res.votes.length} Leuten${corner ? " am " + corner.name : ""} — ${res.verdict.de}${round.karma === false ? "" : ` (+${res.total} Karma)`}`,
    query: `?corner=${encodeURIComponent(cornerId)}&gossip=1`
  });
}

// Rounds older than 24 h: delete round, story, votes and recording.
function cleanupExpiredGossip() {
  if (!window.FB?.firebaseReady || Date.now() - _gossip.lastCleanup < 10 * 60 * 1000) return;
  _gossip.lastCleanup = Date.now();
  const { db, ref, remove } = window.FB;
  const cutoff = serverNow() - GOSSIP_TTL_MS;
  Object.entries(STATE.gossipRounds || {}).forEach(([cornerId, rounds]) => {
    Object.entries(rounds || {}).forEach(([roundId, r]) => {
      if (!r || Number(r.createdAt || 0) >= cutoff) return;
      remove(ref(db, `gossipVotes/${cornerId}/${roundId}`)).catch(() => {});
      remove(ref(db, `gossipContent/${cornerId}/${roundId}`)).catch(() => {});
      if (r.hasAudio && window.FB.deleteFile) window.FB.deleteFile(`gossipAudio/${cornerId}/${roundId}`).catch(() => {});
      remove(ref(db, `gossipRounds/${cornerId}/${roundId}`)).catch(() => {});
    });
  });
  // Ratings whose round is gone (withdrawn / cleaned up elsewhere).
  Object.entries(STATE.gossipVotes || {}).forEach(([cornerId, rounds]) => {
    Object.entries(rounds || {}).forEach(([roundId, votes]) => {
      if (STATE.gossipRounds?.[cornerId]?.[roundId]) return;
      const newest = Math.max(0, ...Object.values(votes || {}).map((v) => Number(v && v.at) || 0));
      if (serverNow() - newest > 60 * 60 * 1000) remove(ref(db, `gossipVotes/${cornerId}/${roundId}`)).catch(() => {});
    });
  });
}

/* ---- Composer: write and/or record ---- */
var GOSSIP_DRAFT = { cornerId: null, publishing: false };
var GOSSIP_REC = { recorder: null, stream: null, chunks: [], blob: null, url: "", startedAt: 0, duration: 0, timer: null, ctx: null, raf: 0, discardOnStop: false };

function gossipHint(msg) { const el = $("#gossip-hint"); if (el) el.textContent = msg || ""; }
function gossipRecording() { return !!(GOSSIP_REC.recorder && GOSSIP_REC.recorder.state === "recording"); }

function pickGossipAudioMime() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  // AAC in MP4 plays everywhere (incl. iPhone); WebM/Opus is the fallback.
  const candidates = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || "";
}

function updateGossipPublishState() {
  const text = $("#gossip-text");
  const btn = $("#gossip-publish");
  if (!text || !btn) return;
  btn.disabled = GOSSIP_DRAFT.publishing || gossipRecording() || (!text.value.trim() && !GOSSIP_REC.blob);
  $("#gossip-text-count").textContent = String(text.value.length);
}

function updateGossipRecUi() {
  const btn = $("#gossip-rec-btn");
  if (!btn) return;
  const recording = gossipRecording();
  btn.classList.toggle("recording", recording);
  btn.textContent = recording ? "⏹ " + T("Stopp", "Stop") : (GOSSIP_REC.blob ? "🎙️ " + T("Neu aufnehmen", "Record again") : "🎙️ " + T("Einsprechen", "Record"));
  $("#gossip-rec-time").textContent = recording ? `● ${formatDuration((Date.now() - GOSSIP_REC.startedAt) / 1000)} / ${formatDuration(GOSSIP_MAX_RECORDING_S)}` : "";
  document.querySelector(".gossip-meter")?.classList.toggle("on", recording);
  $("#gossip-rec-preview").hidden = recording || !GOSSIP_REC.blob;
  updateGossipPublishState();
}

function stopGossipStream() {
  clearInterval(GOSSIP_REC.timer);
  GOSSIP_REC.timer = null;
  if (GOSSIP_REC.raf) cancelAnimationFrame(GOSSIP_REC.raf);
  GOSSIP_REC.raf = 0;
  if (GOSSIP_REC.ctx) { GOSSIP_REC.ctx.close().catch(() => {}); GOSSIP_REC.ctx = null; }
  if (GOSSIP_REC.stream) { GOSSIP_REC.stream.getTracks().forEach((t) => t.stop()); GOSSIP_REC.stream = null; }
  const fill = $("#gossip-meter-fill");
  if (fill) fill.style.width = "0%";
  dropWakeLock("gossip-rec");
}

function startGossipMeter(stream) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    GOSSIP_REC.ctx = ctx;
    const buf = new Uint8Array(analyser.fftSize);
    const fill = $("#gossip-meter-fill");
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      if (fill) fill.style.width = Math.min(100, Math.round(Math.sqrt(sum / buf.length) * 280)) + "%";
      GOSSIP_REC.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch (err) { /* the meter is decoration only */ }
}

async function startGossipRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    gossipHint(T("Aufnehmen klappt in diesem Browser nicht — schreib die Story einfach auf ✍️", "Recording isn't supported in this browser — just write it down ✍️"));
    return;
  }
  discardGossipRecording();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    gossipHint(T("Kein Zugriff aufs Mikro — erlaub ihn in den Einstellungen oder schreib die Story auf.", "No microphone access — allow it in your settings or write the story down."));
    return;
  }
  const mime = pickGossipAudioMime();
  let recorder;
  try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined); }
  catch (err) {
    try { recorder = new MediaRecorder(stream); }
    catch (e) { stream.getTracks().forEach((t) => t.stop()); gossipHint(T("Aufnehmen klappt hier nicht — schreib die Story auf ✍️", "Recording doesn't work here — write it down ✍️")); return; }
  }
  GOSSIP_REC.stream = stream;
  GOSSIP_REC.recorder = recorder;
  GOSSIP_REC.chunks = [];
  GOSSIP_REC.startedAt = Date.now();
  GOSSIP_REC.discardOnStop = false;
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) GOSSIP_REC.chunks.push(e.data); };
  recorder.onstop = () => {
    const duration = Math.min(GOSSIP_MAX_RECORDING_S, (Date.now() - GOSSIP_REC.startedAt) / 1000);
    const blob = GOSSIP_REC.chunks.length ? new Blob(GOSSIP_REC.chunks, { type: recorder.mimeType || mime || "audio/webm" }) : null;
    stopGossipStream();
    if (GOSSIP_REC.recorder === recorder) GOSSIP_REC.recorder = null;
    if (GOSSIP_REC.discardOnStop) { GOSSIP_REC.discardOnStop = false; updateGossipRecUi(); return; }
    GOSSIP_REC.blob = blob && blob.size ? blob : null;
    GOSSIP_REC.duration = duration;
    if (GOSSIP_REC.url) URL.revokeObjectURL(GOSSIP_REC.url);
    GOSSIP_REC.url = GOSSIP_REC.blob ? URL.createObjectURL(GOSSIP_REC.blob) : "";
    const audio = $("#gossip-rec-audio");
    if (audio) audio.src = GOSSIP_REC.url;
    updateGossipRecUi();
  };
  recorder.start(1000);
  holdWakeLock("gossip-rec");
  startGossipMeter(stream);
  GOSSIP_REC.timer = setInterval(() => {
    if ((Date.now() - GOSSIP_REC.startedAt) / 1000 >= GOSSIP_MAX_RECORDING_S) stopGossipRecording();
    else updateGossipRecUi();
  }, 250);
  gossipHint("");
  updateGossipRecUi();
}

function stopGossipRecording() {
  clearInterval(GOSSIP_REC.timer);
  GOSSIP_REC.timer = null;
  const r = GOSSIP_REC.recorder;
  if (r && r.state === "recording") { try { r.stop(); } catch (err) { stopGossipStream(); } }
}

function discardGossipRecording() {
  if (gossipRecording()) { GOSSIP_REC.discardOnStop = true; stopGossipRecording(); }
  GOSSIP_REC.blob = null;
  GOSSIP_REC.duration = 0;
  GOSSIP_REC.chunks = [];
  if (GOSSIP_REC.url) { URL.revokeObjectURL(GOSSIP_REC.url); GOSSIP_REC.url = ""; }
  const audio = $("#gossip-rec-audio");
  if (audio) { try { audio.pause(); } catch (e) {} audio.removeAttribute("src"); }
  updateGossipRecUi();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function openGossipComposer(cornerId) {
  if (!STATE.nickname) { toast(T("Bitte zuerst einen Namen wählen.", "Please pick a name first.")); return; }
  if (!window.FB?.firebaseReady) { toast(T("Gossip-Runden brauchen eine Verbindung.", "Gossip rounds need a connection.")); return; }
  if (!iAmAtCorner(cornerId)) { toast(T("Check zuerst hier ein 📍", "Check in here first 📍")); return; }
  const crowd = gossipCrowdAt(cornerId);
  if (!crowd.length) { toast(T("Gerade ist sonst niemand hier eingecheckt.", "Nobody else is checked in here right now.")); return; }
  if (gossipOpenRoundAt(cornerId)) { toast(T("Es läuft schon eine Runde — erst auflösen 😉", "A round is already running 😉")); return; }
  const corner = getAllCorners().find((c) => c.id === cornerId);
  GOSSIP_DRAFT.cornerId = cornerId;
  GOSSIP_DRAFT.publishing = false;
  $("#gossip-title").textContent = "🗣️ " + T("Gossip-Runde", "Gossip round");
  $("#gossip-sub").innerHTML = `${corner ? `${T("am", "at")} <strong>${escapeHtml(corner.name)}</strong> · ` : ""}${T("Es hören zu", "Listening")}: ${crowd.map((p) => escapeHtml(p.name) + (p.asleep ? " 💤" : "")).join(", ")}`;
  $("#gossip-text-label").textContent = T("Deine Story (aufschreiben, einsprechen oder beides)", "Your story (write it, record it or both)");
  $("#gossip-headline-label").textContent = T("Schlagzeile für eure Chronik (optional — sehen alle, die Story selbst nicht)", "Headline for your chronicle (optional — visible to everyone, the story itself is not)");
  $("#gossip-headline").placeholder = T("z. B. Die Sache mit dem Hausboot", "e.g. The houseboat thing");
  $("#gossip-text").placeholder = T("Was ist passiert? Wer, wo, wann … 👀", "What happened? Who, where, when … 👀");
  $("#gossip-privacy").textContent = T("🤫 Bleibt am Corner: Nur wer hier eingecheckt ist, kann deine Story lesen und hören — und nach 24 Stunden wird alles gelöscht. Die anderen bekommen eine Push-Nachricht.", "🤫 Stays at the corner: only people checked in here can read and hear your story — and everything is deleted after 24 hours. The others get a push notification.");
  $("#gossip-cancel").textContent = T("Abbrechen", "Cancel");
  $("#gossip-publish").textContent = "🚀 " + T("Raushauen", "Spill it");
  gossipHint(gossipKarmaRoundsToday() >= GOSSIP_KARMA_ROUNDS_PER_DAY ? T("Heute schon 5 Storys mit Karma — diese zählt just for fun.", "Already 5 karma stories today — this one is just for fun.") : "");
  discardGossipRecording();
  $("#gossip-overlay").classList.add("open");
  holdWakeLock("gossip-compose");
  updateGossipRecUi();
  if (!window.matchMedia("(pointer: coarse)").matches) setTimeout(() => $("#gossip-text")?.focus(), 80);
}

function closeGossipComposer() {
  discardGossipRecording();
  $("#gossip-overlay")?.classList.remove("open");
  dropWakeLock("gossip-compose");
}

async function publishGossip() {
  const cornerId = GOSSIP_DRAFT.cornerId;
  if (!cornerId || GOSSIP_DRAFT.publishing) return;
  const text = ($("#gossip-text").value || "").trim().slice(0, GOSSIP_TEXT_MAX);
  const headline = ($("#gossip-headline")?.value || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const blob = GOSSIP_REC.blob;
  if (!text && !blob) { gossipHint(T("Schreib deine Story auf oder sprich sie ein 🎙️", "Write or record your story 🎙️")); return; }
  if (!iAmAtCorner(cornerId)) { gossipHint(T("Du bist hier nicht mehr eingecheckt.", "You're no longer checked in here.")); return; }
  const crowd = gossipCrowdAt(cornerId);
  if (!crowd.length) { gossipHint(T("Gerade ist sonst niemand hier eingecheckt.", "Nobody else is checked in here right now.")); return; }
  if (gossipOpenRoundAt(cornerId)) { gossipHint(T("Jemand war schneller — es läuft schon eine Runde.", "Someone was faster — a round is already running.")); return; }
  GOSSIP_DRAFT.publishing = true;
  const pubBtn = $("#gossip-publish");
  const label = pubBtn.textContent;
  pubBtn.textContent = T("Wird gesendet …", "Sending …");
  updateGossipPublishState();
  const { db, ref, push, set, remove, serverTimestamp } = window.FB;
  const me = currentUserKey();
  const roundRef = push(ref(db, "gossipRounds/" + cornerId));
  const roundId = roundRef.key;
  const contentRef = ref(db, `gossipContent/${cornerId}/${roundId}`);
  const audioPath = `gossipAudio/${cornerId}/${roundId}`;
  let uploaded = false;
  const fail = (msg) => {
    GOSSIP_DRAFT.publishing = false;
    pubBtn.textContent = label;
    gossipHint(msg);
    updateGossipPublishState();
  };
  try {
    await broadcastPresence();   // the database rules check that I'm at this corner
    const content = { by: me, createdAt: serverTimestamp() };
    if (text) content.text = text;
    let hasAudio = false;
    if (blob) {
      const mime = String(blob.type || "audio/webm").split(";")[0] || "audio/webm";
      try {
        if (typeof window.FB.uploadBlob !== "function") throw new Error("storage unavailable");
        content.audioUrl = await window.FB.uploadBlob(audioPath, blob, mime);
        uploaded = true;
        hasAudio = true;
      } catch (err) {
        console.warn("Gossip audio upload failed, storing inline:", err);
        const dataUrl = await blobToDataUrl(blob).catch(() => "");
        if (dataUrl && dataUrl.length <= GOSSIP_INLINE_AUDIO_MAX) { content.audioData = dataUrl; hasAudio = true; }
      }
      if (hasAudio) content.audioMime = mime;
      if (!hasAudio && !text) return fail(T("Die Aufnahme konnte nicht hochgeladen werden — schreib die Story bitte kurz auf.", "The recording couldn't be uploaded — please write the story down."));
    }
    const karma = gossipKarmaRoundsToday() < GOSSIP_KARMA_ROUNDS_PER_DAY;
    const audience = {};
    crowd.forEach((p) => { audience[p.id] = String(p.name).slice(0, 40); });
    await set(contentRef, content);
    try {
      await set(roundRef, {
        tellerId: me,
        tellerName: String(STATE.nickname).slice(0, 40),
        tellerTeam: STATE.team || "",
        createdAt: serverTimestamp(),
        windowMs: GOSSIP_WINDOW_MS,
        hasText: !!text,
        hasAudio,
        audioDuration: hasAudio ? Math.round(GOSSIP_REC.duration) : 0,
        karma,
        audience,
        ...(headline ? { title: headline } : {})
      });
    } catch (err) {
      remove(contentRef).catch(() => {});
      throw err;
    }
    GOSSIP_CONTENT[gossipKey(cornerId, roundId)] = { status: "ok", data: { ...content, createdAt: Date.now() }, at: Date.now() };
    if (karma) countGossipKarmaRound();
    addXp(GOSSIP_TELL_AURA, "Gossip erzählt");
    unlockAchievement("first-gossip", "Klatschbase", "🗣️", 15);
    if (bumpLocalCounter("cg.gossipTold") >= 10) unlockAchievement("gossip-legend", "Stammtisch-Legende", "👑", 75);
    const corner = getAllCorners().find((c) => c.id === cornerId);
    sendTargetedPush(crowd.map((p) => p.id), {
      type: "gossip",
      title: "🗣️ Gossip-Runde!",
      body: `${STATE.nickname} hat frischen Gossip${corner ? " am " + corner.name : ""} — hör rein und vergib Punkte!`,
      query: `?corner=${encodeURIComponent(cornerId)}&gossip=1`
    });
    $("#gossip-text").value = "";
    if ($("#gossip-headline")) $("#gossip-headline").value = "";
    GOSSIP_DRAFT.publishing = false;
    pubBtn.textContent = label;
    closeGossipComposer();
    toast(`🗣️ <strong>${T("Gossip ist raus!", "Gossip is out!")}</strong><br><span style="font-size:11px;opacity:0.8;">${T("Jetzt erzählen — die anderen vergeben gleich Punkte.", "Tell it now — the others are about to rate it.")}</span>`, "gossip");
    focusGossip(cornerId);
  } catch (err) {
    console.warn("publishGossip failed:", err);
    if (uploaded && window.FB.deleteFile) window.FB.deleteFile(audioPath).catch(() => {});
    const denied = /permission/i.test(String(err?.code || "") + String(err?.message || ""));
    fail(denied
      ? T("Der Server lässt die Runde nicht zu — bist du hier noch eingecheckt? (Neu eingerichtet? Dann müssen die Datenbank-Regeln deployt werden.)", "The server refused the round — are you still checked in here? (Freshly set up? Then the database rules need deploying.)")
      : T("Gossip konnte nicht gesendet werden — Verbindung prüfen.", "Couldn't send the gossip — check your connection."));
  }
}

function bindGossipComposer() {
  const overlay = $("#gossip-overlay");
  if (!overlay || overlay._bound) return;
  overlay._bound = true;
  $("#gossip-cancel").addEventListener("click", () => { if (!GOSSIP_DRAFT.publishing) closeGossipComposer(); });
  $("#gossip-publish").addEventListener("click", publishGossip);
  $("#gossip-rec-btn").addEventListener("click", () => { if (gossipRecording()) stopGossipRecording(); else startGossipRecording(); });
  $("#gossip-rec-discard").addEventListener("click", discardGossipRecording);
  $("#gossip-text").addEventListener("input", updateGossipPublishState);
  // A stray tap next to the card must not throw away a recorded story.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && !GOSSIP_DRAFT.publishing && !gossipRecording() && !GOSSIP_REC.blob && !$("#gossip-text").value.trim()) closeGossipComposer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open") && !GOSSIP_DRAFT.publishing) closeGossipComposer();
  });
}
document.addEventListener("DOMContentLoaded", bindGossipComposer);

