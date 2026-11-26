/* ====================== LEVELS ======================
   Progressive curve instead of a flat 100 XP per level: a level costs
   50 + 15*(level-1) XP, so level 2 costs 65 and level 100 costs 1535.
   Cumulative XP for level L is 7.5*L^2 + 42.5*L, i.e. 400 XP for level 5,
   ~3.9k for level 20, ~21k for level 50 and 79,250 XP for level 100 — the
   big milestone — it should FEEL like the finish line — but the game does not
   stop there: levels keep going for anyone who passes it.                */
const MILESTONE_LEVEL = 100;      // the "feels like the end" milestone
const LEVEL_MILESTONE_STEP = 10;  // every 10th level is celebrated (future partner rewards)
function xpForLevel(level) {
  // total XP required to REACH `level`
  const L = Math.max(1, level) - 1;
  return Math.round(7.5 * L * L + 42.5 * L);
}
function getLevel(xp) {
  const total = Math.max(0, Number(xp || 0));
  let level = 1;
  // No cap: keep climbing. The loop bound is just a runaway guard.
  while (level < 10000 && total >= xpForLevel(level + 1)) level++;
  const prevThreshold = xpForLevel(level);
  const nextThreshold = xpForLevel(level + 1);
  const span = nextThreshold - prevThreshold;
  return {
    level,
    progress: Math.max(0, Math.min(1, (total - prevThreshold) / (span || 1))),
    xpIntoLevel: Math.max(0, total - prevThreshold),
    xpForNext: span,
    xpToNext: Math.max(0, nextThreshold - total),
    reachedMilestone: level >= MILESTONE_LEVEL
  };
}

const LEVEL_RANKS = [
  { max: 5,        name: "Corner Newbie",     emoji: "✨" },
  { max: 12,       name: "Corner Explorer",   emoji: "🗺️" },
  { max: 22,       name: "Corner Regular",    emoji: "🔥" },
  { max: 35,       name: "Corner Guide",      emoji: "🧭" },
  { max: 50,       name: "Corner Veteran",    emoji: "⭐" },
  { max: 70,       name: "Corner Legend",     emoji: "👑" },
  { max: 89,       name: "Minga Institution", emoji: "🏛️" },
  { max: 99,       name: "Ewige Ecke",        emoji: "🌟" },
  { max: 149,      name: "Vollendet",         emoji: "🏆" },  // milestone reached
  { max: 249,      name: "Über die Ecke",     emoji: "🚀" },  // and beyond…
  { max: Infinity, name: "Mythos von Minga",  emoji: "🐉" }
];
function getLevelTier(level) {
  const lvl = Number(level || 1);
  for (const r of LEVEL_RANKS) if (lvl <= r.max) return { name: r.name, emoji: r.emoji };
  return { name: "Mythos von Minga", emoji: "🐉" };
}

/* Every 10th level is a milestone. Level 100 gets the big "feels like the end"
   moment, but play continues afterwards. Partner rewards can later hook in
   here: LEVEL_REWARDS[level] -> what the user unlocked.                     */
const LEVEL_REWARDS = {}; // e.g. 10: { label: "Freigetränk bei X", code: "…" }

function claimedMilestones() {
  try { return JSON.parse(localStorage.getItem("cg.milestones") || "[]"); }
  catch (e) { return []; }
}

function checkLevelMilestones() {
  const level = getLevel(getCurrentXp()).level;
  const done = claimedMilestones();
  let changed = false;
  for (let m = LEVEL_MILESTONE_STEP; m <= level; m += LEVEL_MILESTONE_STEP) {
    if (done.includes(m)) continue;
    done.push(m);
    changed = true;
    const reward = LEVEL_REWARDS[m];
    if (m === MILESTONE_LEVEL) {
      unlockAchievement("level-100", "Vollendet", "🏆", 1000);
      toast(`🏆 <strong>LEVEL 100!</strong><br>Du hast den Minga Corner Guide vollendet — und es geht weiter. 🍻`, "at-corner");
    } else {
      toast(`🎖️ <strong>Meilenstein Level ${m}</strong>${reward ? `<br>Belohnung: ${escapeHtml(reward.label)}` : ""}`, "at-corner");
    }
  }
  if (changed) localStorage.setItem("cg.milestones", JSON.stringify(done));
}

function currentUserKey() { return STATE.userId || STATE.nickname; }
// Everything a person has, over all their logins (see "one profile, several logins").
function getRewardTotal(kind, userKey) {
  return userKey ? identityRewardTotal(kind, userKey) : identityRewardTotal(kind, myRootKey(), true);
}
function getCurrentAura() { return getRewardTotal("aura"); }
function getCurrentKarma() { return getRewardTotal("karma"); }
function getCurrentXp() { return getCurrentAura(); }
/* ====================== REWARD MATRIX ======================
   Two streams, one rule that is easy to explain:
     ✨ Aura  = what YOU do (being there, joining in) — drives your level.
     🎁 Karma = what OTHERS give you (confirmed supplies, gossip points).
   Your identity is a cell in a 3×3 grid: Aura tier × Karma tier, both
   measured in levels of the same curve. The old ratio formula collapsed to
   "Aura Magnet" for nearly everyone (karma had one source and aura many),
   while "Matrix Legend" only needed 180 aura + 80 karma.                  */
const MATRIX_AURA_LEVELS = [5, 15];   // aura level where the middle / right column starts
const MATRIX_KARMA_LEVELS = [2, 6];   // karma level where the middle / top row starts
const MATRIX_CELLS = [                // [karmaTier][auraTier]
  [
    { emoji: "🌱", name: "Rookie", de: "Gerade angekommen — check ein, bring Nachschub, erzähl Gossip.", en: "Just arrived — check in, bring supplies, tell some gossip." },
    { emoji: "🔥", name: "Regular", de: "Du bist oft da. Jetzt mal was für die Crew tun: Nachschub holen oder Gossip erzählen!", en: "You're around a lot. Now do something for the crew: fetch supplies or tell gossip!" },
    { emoji: "✨", name: "Aura Magnet", de: "Deine Präsenz macht den Corner lebendig — die Crew wartet auf deinen Nachschub.", en: "Your presence lights up the corner — the crew is waiting for your supplies." }
  ],
  [
    { emoji: "🤲", name: "Good Soul", de: "Selten da, aber wenn, dann hilfst du.", en: "Not around often, but when you are, you help." },
    { emoji: "⚖️", name: "Balanced Connector", de: "Zwischen Präsenz und Hilfe hältst du die Ecke zusammen.", en: "You balance presence and help for the corner crew." },
    { emoji: "🌟", name: "Corner Star", de: "Viel Präsenz, gute Vibes — die Crew mag dich.", en: "Lots of presence, good vibes — the crew likes you." }
  ],
  [
    { emoji: "🎁", name: "Karma Carrier", de: "Du bringst Leuten, was sie brauchen — mehr, als du dich zeigst.", en: "You bring people what they need — more than you show up." },
    { emoji: "🦸", name: "Corner Hero", de: "Die Crew liebt dich.", en: "The crew loves you." },
    { emoji: "🪩", name: "Matrix Legend", de: "Präsent, hilfreich, nicht zu stoppen.", en: "Present, helpful, unstoppable." }
  ]
];
function matrixTier(level, bounds) { return level >= bounds[1] ? 2 : level >= bounds[0] ? 1 : 0; }
function getMatrixPosition(aura, karma) {
  const auraLevel = getLevel(aura).level;
  const karmaLevel = getLevel(karma).level;
  const col = matrixTier(auraLevel, MATRIX_AURA_LEVELS);
  const row = matrixTier(karmaLevel, MATRIX_KARMA_LEVELS);
  return { col, row, cell: MATRIX_CELLS[row][col], auraLevel, karmaLevel };
}
function getMatrixIdentity(aura, karma) {
  const { cell } = getMatrixPosition(aura, karma);
  return { emoji: cell.emoji, name: cell.name, desc: T(cell.de, cell.en) };
}

// The concrete next steps out of your current cell (right = more aura, up = more karma).
function matrixNextSteps(aura, karma) {
  const { col, row } = getMatrixPosition(aura, karma);
  const steps = [];
  if (row < 2) {
    const need = Math.max(1, xpForLevel(MATRIX_KARMA_LEVELS[row]) - Number(karma || 0));
    const cell = MATRIX_CELLS[row + 1][col];
    const runs = Math.ceil(need / SUPPLY_KARMA_PER_CONFIRM);
    steps.push(`↑ ${cell.emoji} <strong>${cell.name}</strong>: ${T("noch", "another")} <strong>${need} Karma</strong> <span class="mx-how">(${T(`z. B. ${runs}× bestätigter Nachschub, ein paar gut bewertete Gossip-Storys — oder Komplimente von den anderen`, `e.g. ${runs}× confirmed supplies, a few well-rated gossip stories — or compliments from the others`)})</span>`);
  }
  if (col < 2) {
    const need = Math.max(1, xpForLevel(MATRIX_AURA_LEVELS[col]) - Number(aura || 0));
    const cell = MATRIX_CELLS[row][col + 1];
    steps.push(`→ ${cell.emoji} <strong>${cell.name}</strong>: ${T("noch", "another")} <strong>${need} Aura</strong> <span class="mx-how">(${T("einchecken, Leute treffen, neue Corners entdecken", "check in, meet people, discover new corners")})</span>`);
  }
  return steps;
}

function buildMatrixGridHtml(aura, karma) {
  const pos = getMatrixPosition(aura, karma);
  const cells = [2, 1, 0].map((row) => [0, 1, 2].map((col) => {
    const c = MATRIX_CELLS[row][col];
    const me = row === pos.row && col === pos.col;
    return `<div class="mx-cell${me ? " me" : ""}" title="${escapeHtml(T(c.de, c.en))}"><span class="mx-e">${c.emoji}</span><span class="mx-n">${escapeHtml(c.name)}</span>${me ? `<span class="mx-you">${T("du", "you")}</span>` : ""}</div>`;
  }).join("")).join("");
  const steps = matrixNextSteps(aura, karma);
  return `<div class="mx">
      <div class="mx-y">🎁 Karma ↑</div>
      <div class="mx-grid">${cells}</div>
      <div class="mx-x">✨ Aura →</div>
    </div>
    <p class="mx-legend">${T("Spalten", "Columns")}: Aura-Lv. &lt;${MATRIX_AURA_LEVELS[0]} · ${MATRIX_AURA_LEVELS[0]}–${MATRIX_AURA_LEVELS[1] - 1} · ${MATRIX_AURA_LEVELS[1]}+ &nbsp;|&nbsp; ${T("Zeilen", "Rows")}: Karma-Lv. &lt;${MATRIX_KARMA_LEVELS[0]} · ${MATRIX_KARMA_LEVELS[0]}–${MATRIX_KARMA_LEVELS[1] - 1} · ${MATRIX_KARMA_LEVELS[1]}+</p>
    <p class="mx-now">${pos.cell.emoji} <strong>${escapeHtml(pos.cell.name)}</strong> (Aura Lv. ${pos.auraLevel} · Karma Lv. ${pos.karmaLevel}) — ${escapeHtml(T(pos.cell.de, pos.cell.en))}</p>
    ${steps.length ? `<div class="mx-next">${steps.map((s) => `<div>${s}</div>`).join("")}</div>` : `<p class="mx-now">🏁 ${T("Oberstes Feld erreicht — Respekt!", "Top cell reached — respect!")}</p>`}`;
}

// The complete, truthful list of ways to earn points (mirrors the code).
function buildRewardGuideHtml() {
  const row = (emoji, de, en, pts) => `<tr><td>${emoji} ${T(de, en)}</td><td class="rg-pts">${pts}</td></tr>`;
  return `<div class="rg">
    <div class="rg-streams">
      <div class="rg-stream aura"><div class="rg-k">✨ Aura</div><div class="rg-d">${T("= was <strong>du</strong> tust: da sein, mitmachen. Bestimmt dein Level.", "= what <strong>you</strong> do: show up, join in. Drives your level.")}</div></div>
      <div class="rg-stream karma"><div class="rg-k">🎁 Karma</div><div class="rg-d">${T("= was <strong>andere</strong> dir geben: Komplimente, bestätigter Nachschub &amp; Gossip-Punkte.", "= what <strong>others</strong> give you: compliments, confirmed supplies &amp; gossip points.")}</div></div>
    </div>
    <h4 class="rg-h karma">🎁 ${T("Karma bekommen", "Earning karma")}</h4>
    <table class="rg-table">
      ${row("💐", "Kompliment bekommen · Danke für dein Kompliment", "Got a compliment · thanks for your compliment", `+${COMPLIMENT_KARMA} · +${COMPLIMENT_THANKS_KARMA}`)}
      ${row("🛒", "Nachschub mitgebracht — pro Person, die es bestätigt", "Brought supplies — per person who confirms", `+${SUPPLY_KARMA_PER_CONFIRM}`)}
      ${row("🗣️", "Gossip-Story erzählt — pro Person am Corner, die bewertet", "Told a gossip story — per person at the corner who rates it", "+2…+20")}
      ${row("📅", "Cornerdate geplant — pro Zusage · pro Gast, der wirklich kommt", "Planned a cornerdate — per yes · per guest who really comes", `+${CORNERDATE_JOIN_KARMA} · +${CORNERDATE_ARRIVE_KARMA}`)}
    </table>
    <h4 class="rg-h aura">✨ ${T("Aura sammeln", "Collecting aura")}</h4>
    <table class="rg-table">
      ${row("📍", "Check-in (pro Corner 1× am Tag): Basis", "Check-in (once per corner per day): base", "+5")}
      ${row("👥", "… pro Person, die schon dort ist (max. +18)", "… per person already there (max +18)", "+6")}
      ${row("🔥", "… beliebter Spot", "… popular spot", T("bis +12", "up to +12"))}
      ${row("🆕", "Corner zum ersten Mal besucht", "First visit to a corner", "+10")}
      ${row("🤝", "Mit jemandem am Corner getroffen (pro Person)", "Met someone at a corner (per person)", "+8")}
      ${row("⚔️", "Corner eingenommen (3 aus deinem Team vor Ort)", "Corner captured (3 of your team there)", "+25")}
      ${row("🗣️", "Gossip erzählt / bewertet", "Told / rated gossip", "+5 / +2")}
      ${row("💐", `Kompliment gemacht (bis ${COMPLIMENT_AURA_PER_DAY}× am Tag) · Danke gesagt`, `Paid a compliment (up to ${COMPLIMENT_AURA_PER_DAY}× a day) · said thanks`, `+${COMPLIMENT_AURA} · +${COMPLIMENT_THANKS_AURA}`)}
      ${row("📅", "Cornerdate geplant (bis 3× am Tag) · zugesagt · wirklich gekommen", "Planned a cornerdate (up to 3× a day) · said yes · really came", `+${CORNERDATE_PLAN_AURA} · +${CORNERDATE_JOIN_AURA} · +${CORNERDATE_SHOWUP_AURA}`)}
      ${row("☂️", "Corner als überdacht / nass eingeschätzt", "Rated a corner as covered / wet", "+2")}
      ${row("➕", "Neuen Spot eingetragen", "Added a new spot", "+50")}
      ${row("📸", "Foto hochgeladen", "Uploaded a photo", "+10")}
      ${row("💬", "Kommentar / Antwort · Chat-Nachricht", "Comment / reply · chat message", "+5 · +2")}
      ${row("📊", "Barometer, Emojis, Status, Corner-Bewertung", "Barometer, emojis, status, corner vote", "+2…+4")}
      ${row("🆘", "Nachschub-Ruf · Nachschub bestätigen", "Supply call · confirm supplies", "+3 · +5")}
      ${row("📨", "Freunde einladen · per QR eingecheckt", "Invite friends · checked in via QR", "+5 · +10")}
      ${row("🔔", "Push aktivieren", "Enable push", "+10")}
      ${row("🏆", "Achievements", "Achievements", "+10…+1000")}
      ${row("👆", "Aktiv in der App (höchstens alle 10 Sek.)", "Active in the app (at most every 10 s)", "+1")}
    </table>
    <p class="rg-note">${T(`Fair Play: Check-in-Aura gibt es pro Corner nur einmal am Tag, zwischen zwei Corners liegen 15 Min. Gossip bringt Karma für ${GOSSIP_KARMA_ROUNDS_PER_DAY} Storys pro Tag, eigene Storys kann man nicht bewerten. Level: Aura bestimmt dein Level (Lv. 100 ist der große Meilenstein).`, `Fair play: check-in aura counts once per corner per day, and there are 15 min between two corners. Gossip earns karma for ${GOSSIP_KARMA_ROUNDS_PER_DAY} stories a day, and you can't rate your own. Aura drives your level (Lv. 100 is the big milestone).`)}</p>
  </div>`;
}

function openRewardGuide() {
  const overlay = $("#reward-guide-overlay");
  if (!overlay) return;
  $("#reward-guide-title").textContent = "📖 " + T("So sammelst du Punkte", "How to earn points");
  $("#reward-guide-close").textContent = T("Alles klar", "Got it");
  $("#reward-guide-body").innerHTML = `
    <h4 class="rg-h">🧬 ${T("Deine Matrix", "Your matrix")}</h4>
    ${buildMatrixGridHtml(getCurrentAura(), getCurrentKarma())}
    ${buildRewardGuideHtml()}`;
  overlay.classList.add("open");
  localStorage.setItem("cg.rewardGuideSeen", "1");
}
function closeRewardGuide() { $("#reward-guide-overlay")?.classList.remove("open"); }

// One-time nudge (new and existing users) so people find out how points work.
function maybeShowRewardTip(delayMs = 9000) {
  if (!STATE.nickname || localStorage.getItem("cg.rewardGuideSeen") === "1" || localStorage.getItem("cg.rewardTipShown") === "1") return;
  setTimeout(() => {
    if ($("#access-prompt")?.style.display === "flex" || localStorage.getItem("cg.rewardTipShown") === "1") return;
    localStorage.setItem("cg.rewardTipShown", "1");
    toastWhenFree(`📖 <strong>${T("So sammelst du Punkte", "How to earn points")}</strong><br><span style="font-size:11px;opacity:0.8;">${T("Aura, Karma, Gossip-Runden & deine Matrix — tippen zum Ansehen (oder später oben aufs Level tippen)", "Aura, karma, gossip rounds & your matrix — tap to see (or tap your level later)")}</span>`, null, openRewardGuide);
  }, delayMs);
}
document.addEventListener("DOMContentLoaded", () => maybeShowRewardTip());
/* ====================== KARMA FOR CHECK-INS ======================
   Two rules from the in-app feedback:
   - "Zähl die check-ins pro Person nur einmal pro Tag" — repeatedly checking in
     at the same corner must not farm karma.
   - A well-visited corner is worth more: karma scales with how many people are
     there right now and how popular the spot is overall.                    */
function checkedInTodayAt(cornerId) {
  try {
    const log = JSON.parse(localStorage.getItem("cg.checkinDays") || "{}");
    return log[cornerId] === new Date().toDateString();
  } catch (e) { return false; }
}
// "Ups falsch eingecheckt": the undo takes back the visit, its Aura and the
// cooldown, so you can check in where you really are right away.
function undoCheckin(cornerId) {
  const g = STATE.lastCheckinGrant;
  if (g && g.cornerId === cornerId && Date.now() - g.at < 15 * 60000) {
    if (g.aura) addXp(-g.aura, "Check-in zurückgenommen");
    if (g.firstVisit) { STATE.visitedCorners = STATE.visitedCorners.filter((id) => id !== cornerId); saveVisitedCorners(); }
    if (g.today) {
      try { const log = JSON.parse(localStorage.getItem("cg.checkinDays") || "{}"); delete log[cornerId]; localStorage.setItem("cg.checkinDays", JSON.stringify(log)); } catch (e) {}
    }
    if (g.visitKey && window.FB?.firebaseReady) { forgetMyVisit(g.visitKey); window.FB.remove(window.FB.ref(window.FB.db, `visits/${cornerId}/${g.visitKey}`)).catch(() => {}); }
  }
  STATE.lastCheckinGrant = null;
  STATE.lastVisitRef = null;
  STATE.lastCheckinCorner = null;
  STATE.lastCheckinTime = 0;
  localStorage.removeItem("cg.lastCheckinCorner");
  localStorage.removeItem("cg.lastCheckinTime");
  updateCheckinButtons();
}

function markCheckedInToday(cornerId) {
  let log = {};
  try { log = JSON.parse(localStorage.getItem("cg.checkinDays") || "{}"); } catch (e) {}
  log[cornerId] = new Date().toDateString();
  localStorage.setItem("cg.checkinDays", JSON.stringify(log));
}

// Karma for a check-in: base + who is here now + how popular the spot is.
function checkinKarma(cornerId) {
  const othersHere = Math.max(0, getPeopleAtCorner(cornerId).length - 1);
  const popularity = getVisitCount(cornerId);
  const social = Math.min(18, othersHere * 6);            // cornern is social
  const popular = Math.min(12, Math.floor(popularity / 4)); // busy spot bonus
  return { total: 5 + social + popular, social, popular };
}

function addXp(amount, reason) {
  const before = getLevel(getCurrentXp()).level;
  addPoints(currentUserKey(), amount, reason);
  const after = getLevel(getCurrentXp());
  if (after.level > before) {
    const tier = getLevelTier(after.level);
    toast(`${tier.emoji} <strong>Level ${after.level}</strong> erreicht — ${escapeHtml(tier.name)}!`, "at-corner");
  }
  checkLevelMilestones();
}
function getTeamInfo(teamId) { return TEAMS[teamId] || null; }
function getDisplayName(name, teamId) { const t = getTeamInfo(teamId); return `${t ? t.emoji + " " : ""}${name || "Anonym"}`; }

function addPoints(user, pts, reason, nameHint) {
  return addRewardPoints("aura", user, pts, reason, nameHint);
}

function addKarmaPoints(user, pts, reason, nameHint) {
  return addRewardPoints("karma", user, pts, reason, nameHint);
}

const REWARD_HISTORY_MAX = 200;
function rewardHistoryList(entry) {
  const h = entry && entry.history;
  return Array.isArray(h) ? h : (h && typeof h === "object" ? Object.values(h) : []);
}

function addRewardPoints(kind, user, pts, reason, nameHint) {
  if (!user || !pts) return;
  const key = user === STATE.nickname ? currentUserKey() : user;
  const mine = key === currentUserKey();
  const store = rewardStore(kind);
  const item = { pts, reason, time: Date.now() };
  const fallbackName = mine ? STATE.nickname : (nameHint || user);
  if (!store[key]) store[key] = { total: 0, history: [], nickname: fallbackName };
  store[key].total = Number(store[key].total || 0) + pts;
  store[key].history = [...rewardHistoryList(store[key]), item].slice(-REWARD_HISTORY_MAX);
  if (mine) store[key].nickname = STATE.nickname || store[key].nickname;
  saveRewardStore(kind);
  if (window.FB?.firebaseReady) {
    const { db, ref, set, runTransaction } = window.FB;
    const path = (kind === "karma" ? "karmaPoints" : "points") + "/" + key;
    if (typeof runTransaction === "function") {
      // Atomic add on the server copy: when several people reward the same
      // person at once (gossip ratings, supply confirmations) a plain set()
      // of each client's local copy made the last writer win and lost points.
      runTransaction(ref(db, path), (cur) => {
        const base = cur && typeof cur === "object" ? cur : { total: 0, history: [] };
        return {
          ...base,
          total: Number(base.total || 0) + pts,
          history: [...rewardHistoryList(base), item].slice(-REWARD_HISTORY_MAX),
          nickname: mine ? (STATE.nickname || base.nickname || "") : (base.nickname || fallbackName || "")
        };
      }).catch((err) => console.warn("reward transaction failed:", err));
    } else {
      set(ref(db, path), store[key]);
    }
  }
  updateNicknameBar();
  if (STATE.view === "leaderboard") renderLeaderboard();
  if (STATE.view === "profile") renderProfile();
}

function unlockAchievement(id, name, emoji, pts) {
  if (STATE.achievements.includes(id)) return;
  STATE.achievements.push(id);
  saveAchievements();
  addXp(pts, name);
  toast(`🏆 Achievement freigeschaltet: ${emoji} <strong>${name}</strong>`);
  if (window.FB?.firebaseReady) {
    const { db, ref, set } = window.FB;
    set(ref(db, "achievements/" + currentUserKey() + "/" + id), { name, emoji, time: Date.now(), nickname: STATE.nickname || "Anonym" });
  }
}

// "ÉT" typed again on a new phone: the old profile with that name is most
// likely the same person — offer to take it back instead of starting at zero.
function normalizeName(n) {
  return String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function findProfileTwin(name) {
  const want = normalizeName(name);
  if (!want || want === "anonym") return null;
  const myRoot = myRootKey();
  let best = null;
  const seen = new Set();
  Object.keys(STATE.points || {}).forEach((key) => {
    const root = profileRoot(key);
    if (seen.has(root) || root === myRoot || key === currentUserKey()) return;
    seen.add(root);
    const nickname = identityNickname(root);
    const total = identityRewardTotal("aura", root);
    if (normalizeName(nickname) !== want || total < 10) return;
    if (!best || total > best.total) best = { key: root, nickname, total };
  });
  return best;
}

async function offerProfileTwin(twin) {
  const ok = await showDialog({
    title: T(`„${twin.nickname}“ gibt es schon`, `“${twin.nickname}” already exists`),
    text: T(`Ein Profil mit diesem Namen hat ${twin.total} Aura. Bist du das (neues Handy, Browser gelöscht)? Dann mach einfach damit weiter, statt bei null anzufangen.`, `A profile with this name has ${twin.total} aura. Is that you (new phone, cleared browser)? Just carry on with it instead of starting from zero.`),
    okLabel: T("Ja, das bin ich", "Yes, that's me"),
    cancelLabel: T("Nein, ich bin neu", "No, I'm new")
  });
  if (ok !== true || !window.FB?.firebaseReady) return;
  await linkToProfile(twin.key, { welcome: true });
}

function saveNickname(nameArg) {
  const name = String(typeof nameArg === "string" ? nameArg : ($("#nickname-input").value || "")).trim().slice(0, 20);
  if (!name) { toast("Bitte gib einen Namen ein."); return; }
  const twin = window.FB?.firebaseReady ? findProfileTwin(name) : null;
  if (twin) setTimeout(() => offerProfileTwin(twin), 600);
  STATE.nickname = name;
  localStorage.setItem("cg.nickname", name);
  ensurePointIdentity();
  $("#nickname-prompt").style.display = "none";
  if ($("#claim-overlay")) $("#claim-overlay").style.display = "none";
  toast(`Willkommen, <strong>${escapeHtml(name)}</strong>! 🍻`);
  syncIdentity();
  updateNicknameBar();
  unlockAchievement("first-login", "Willkommen", "👋", 10);
  ensureOwnProfileLock();
  maybeShowRewardTip(6500);
  scheduleStartCircles();
  if (!twin) runPendingLinkActions();
}

function bindNicknameBar() {
  updateNicknameBar();
  // Tapping your level explains how points work.
  ["#nick-pts", "#nick-level-bar"].forEach((sel) => $(sel)?.addEventListener("click", openRewardGuide));
  $("#reward-guide-close")?.addEventListener("click", closeRewardGuide);
  $("#reward-guide-overlay")?.addEventListener("click", (e) => { if (e.target.id === "reward-guide-overlay") closeRewardGuide(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRewardGuide(); });
  $("#points-help-btn")?.addEventListener("click", openRewardGuide);
  $("#availability-btn")?.addEventListener("click", openAvailabilityPicker);
  updateAvailabilityButton();
  $("#supply-btn")?.addEventListener("click", broadcastSupplyRequest);
  $("#invite-btn").addEventListener("click", inviteFriends);
  $("#nick-change-btn").addEventListener("click", async () => {
    const newName = await appPrompt("Neuer Nickname", STATE.nickname, "Dein Name");
    if (!newName || !newName.trim()) return;
    STATE.nickname = newName.trim();
    localStorage.setItem("cg.nickname", STATE.nickname);
    ensurePointIdentity();
    propagateNickname(STATE.nickname);
    toast(`Nickname geändert: <strong>${escapeHtml(STATE.nickname)}</strong>`);
    syncIdentity();
    updateNicknameBar();
    renderFriendsBar();
    if (STATE.view === "profile") renderProfile();
  });
}

function syncIdentity() {
  syncTeam();
  broadcastPresence();
  broadcastLiveLocation();
  if (typeof scheduleProfileSync === "function") scheduleProfileSync();
}

function updateNicknameBar() {
  const bar = $("#nickname-bar");
  if (!STATE.nickname) { bar.style.display = "none"; return; }
  bar.style.display = "flex";
  $("#nick-display").textContent = getDisplayName(STATE.nickname, STATE.team);
  const info = getLevel(getCurrentXp());
  const tier = getLevelTier(info.level);
  $("#nick-pts").textContent = `${tier.emoji} Lv.${info.level}`;
  const badge = $("#nick-level-badge");
  const fill = $("#nick-level-fill");
  if (badge) badge.textContent = tier.name;
  if (fill) fill.style.width = `${Math.round(info.progress * 100)}%`;
  const bar2 = $("#nick-level-bar");
  if (bar2) bar2.title = `${info.xpIntoLevel}/${info.xpForNext} Aura · noch ${info.xpToNext} bis Level ${info.level + 1} — ${T("tippen: so sammelst du Punkte", "tap: how to earn points")}`;
}

function renderTeamPickerHtml() {
  return `
    <div class="team-select-section">
      <h4>Für welches Team checkst du ein?</h4>
      <div class="team-buttons">
        ${allTeamKeys().map((teamId) => `
          <button class="team-btn ${STATE.team === teamId ? "active" : ""}" data-team="${teamId}" title="${escapeHtml(TEAMS[teamId]?.name || teamId)}" style="border-color:${STATE.team === teamId ? (TEAMS[teamId]?.color || "var(--amber)") : "var(--line)"};">
            <span>${TEAMS[teamId]?.emoji || "🚩"}</span>
            <span class="team-label">${escapeHtml(TEAMS[teamId]?.name || teamId)}</span>
          </button>
        `).join("")}
        <button class="team-btn team-create-btn" data-team-create="1" title="Eigenes Team erstellen" style="border-style:dashed;">
          <span>➕</span>
          <span class="team-label">Team</span>
        </button>
      </div>
    </div>
  `;
}

function selectTeam(teamId) {
  if (!TEAMS[teamId]) return;
  const isFirstTeam = !STATE.team;
  STATE.team = teamId;
  // Picked in the dialog right after checking in: that check-in counts for this
  // team (circle colours on the profile map, team stats).
  const lv = STATE.lastVisitRef;
  if (lv && Date.now() - lv.at < 15 * 60000 && STATE.manualCheckinId === lv.cornerId && window.FB?.firebaseReady) {
    window.FB.set(window.FB.ref(window.FB.db, `visits/${lv.cornerId}/${lv.key}/team`), teamId).catch(() => {});
  }
  localStorage.setItem(TEAM_STORAGE_KEY, teamId);
  ensureTeamHistoryEntry(teamId);
  if (isFirstTeam) { addXp(5, "Team beigetreten"); }
  unlockAchievement("team-spirit", "Teamgeist", "🧬", 10);
  syncIdentity();
  updateNicknameBar();
  renderFriendsBar();
  renderCards();
  rebuildMainMarkers();
  if (STATE.view === "leaderboard") renderLeaderboard();
  if (STATE.view === "profile") renderProfile();
}

function syncTeam() {
  if (!STATE.team || !window.FB?.firebaseReady || !STATE.nickname) return;
  const { db, ref, set } = window.FB;
  set(ref(db, "teams/" + currentUserKey()), { nickname: STATE.nickname, team: STATE.team, updatedAt: Date.now() });
}

function listenTeams() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "teams"), (snapshot) => {
    STATE.teams = snapshot.val() || {};
    renderFriendsBar();
    if (STATE.view === "profile") renderProfile();
  });
  listenCustomTeams();
}

let _customTeamsBound = false;
function listenCustomTeams() {
  if (!window.FB?.firebaseReady || _customTeamsBound) return;
  _customTeamsBound = true;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "customTeams"), (snap) => {
    const data = snap.val() || {};
    CUSTOM_TEAM_KEYS = [];
    for (const [key, t] of Object.entries(data)) {
      if (!t || !t.name) continue;
      TEAMS[key] = { emoji: t.emoji || "🚩", color: t.color || "#e8a93e", name: t.name, custom: true };
      CUSTOM_TEAM_KEYS.push(key);
    }
    renderFriendsBar();
    if (STATE.view === "profile") renderProfile();
    if (STATE.view === "leaderboard") renderLeaderboard();
  });
}

function openTeamCreate(cornerId) {
  if (!STATE.nickname) { toast("Bitte zuerst einen Namen wählen."); return; }
  if (!window.FB?.firebaseReady) { toast("Teams erstellen nur online möglich."); return; }
  _teamCreateReturnCorner = cornerId || null;
  _teamCreateColor = CUSTOM_TEAM_COLORS[0];
  const overlay = $("#team-create-overlay");
  $("#team-create-name").value = "";
  $("#team-create-emoji").value = "";
  const colorWrap = $("#team-create-colors");
  colorWrap.innerHTML = CUSTOM_TEAM_COLORS.map((c, i) =>
    `<button type="button" class="team-color-swatch" data-color="${c}" style="width:34px;height:34px;border-radius:50%;background:${c};border:3px solid ${i === 0 ? "#fff" : "transparent"};cursor:pointer;padding:0;"></button>`
  ).join("");
  colorWrap.querySelectorAll("[data-color]").forEach((b) => {
    b.addEventListener("click", () => {
      _teamCreateColor = b.dataset.color;
      colorWrap.querySelectorAll("[data-color]").forEach((x) => { x.style.borderColor = "transparent"; });
      b.style.borderColor = "#fff";
    });
  });
  $("#team-create-cancel").onclick = () => { overlay.style.display = "none"; };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
  $("#team-create-save").onclick = saveTeamCreate;
  overlay.style.display = "flex";
  setTimeout(() => $("#team-create-name").focus(), 100);
}

async function saveTeamCreate() {
  const name = $("#team-create-name").value.trim();
  const emoji = ($("#team-create-emoji").value.trim() || "🚩").slice(0, 4);
  if (!name) { toast("Bitte einen Team-Namen eingeben."); return; }
  const key = "custom-" + name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) + "-" + Math.random().toString(36).slice(2, 6);
  const team = { name: name.slice(0, 24), emoji, color: _teamCreateColor, createdBy: STATE.nickname, createdAt: Date.now() };
  try {
    await window.FB.set(window.FB.ref(window.FB.db, "customTeams/" + key), team);
    TEAMS[key] = { emoji: team.emoji, color: team.color, name: team.name, custom: true };
    if (!CUSTOM_TEAM_KEYS.includes(key)) CUSTOM_TEAM_KEYS.push(key);
    $("#team-create-overlay").style.display = "none";
    selectTeam(key);
    addXp(15, `Team gegründet: ${team.name}`);
    unlockAchievement("team-founder", "Gründer", "🚩", 25);
    toast(`✅ Team „${escapeHtml(team.name)}" erstellt & ausgewählt`);
    // If this came out of a check-in, continue that chain instead of the detail view.
    const pending = STATE.pendingCheckinQuestions;
    if (pending) {
      STATE.pendingCheckinQuestions = null;
      setTimeout(() => showCheckinPrompt(pending), 250);
    } else if (_teamCreateReturnCorner) {
      setTimeout(() => openDetail(_teamCreateReturnCorner), 120);
    }
  } catch (err) {
    console.warn("saveTeamCreate failed:", err);
    toast("Team konnte nicht erstellt werden.");
  }
}

function listenCornerStatuses() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "cornerStatus"), (snapshot) => {
    STATE.cornerStatuses = snapshot.val() || {};
    refreshAllCornerStatusSections();
  });
}

function listenCaptured() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "captured"), (snapshot) => {
    STATE.captured = snapshot.val() || {};
    renderCards();
    rebuildMainMarkers();
    if (STATE.view === "leaderboard") renderLeaderboard();
    if (STATE.view === "profile") renderProfile();
  });
  onValue(ref(db, "captureHistory"), (snapshot) => {
    STATE.captureHistory = snapshot.val() || {};
    if (STATE.view === "leaderboard") renderLeaderboard();
    if (STATE.view === "profile") renderProfile();
  });
}

function listenEncounters() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "encounters"), (snapshot) => {
    STATE.encounters = snapshot.val() || {};
    if (STATE.view === "profile") renderProfile();
  });
}

function listenLiveLocations() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "liveLocations"), (snapshot) => {
    STATE.liveLocations = snapshot.val() || {};
    renderLiveLocationMarkers();
  });
}

function renderLiveLocationMarkers() {
  if (!STATE.mainMap) return;
  Object.values(STATE.liveMarkers).forEach((marker) => { try { STATE.mainMap.removeLayer(marker); } catch (e) {} });
  STATE.liveMarkers = {};
  Object.entries(STATE.liveLocations || {}).forEach(([userId, info]) => {
    if (!info || userId === currentUserKey()) return;
    const team = getTeamInfo(info.team);
    const color = team?.color || "#6cb6ff";
    const icon = L.divIcon({
      className: "",
      html: `<div class="live-user-marker" style="background:${color};"><span class="live-nick">${escapeHtml(info.nickname || userId)}</span>${team?.emoji || "👤"}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    const marker = L.marker([info.lat, info.lng], { icon, zIndexOffset: 1200 }).addTo(STATE.mainMap);
    marker.bindPopup(`<strong>${escapeHtml(info.nickname || userId)}</strong><br><button class="action-btn meetup-msg-btn" style="margin-top:6px;padding:6px 10px;font-size:11px;" data-user="${encodeURIComponent(userId)}">💬 Treffen?</button> <button class="action-btn" style="margin-top:6px;padding:6px 10px;font-size:11px;" data-user-profile="${escapeHtml(userId)}">👤 Profil</button>`);
    marker.on("popupopen", (event) => {
      const btn = event.popup?.getElement()?.querySelector(".meetup-msg-btn");
      if (!btn) return;
      btn.addEventListener("click", () => sendDirectMessagePrompt(decodeURIComponent(btn.dataset.user), info.nickname || userId), { once: true });
    });
    STATE.liveMarkers[userId] = marker;
  });
}

function _activateAuthDependentFeatures(uid, status) {
  // Remember the key we were using before auth replaced it, so the inbox and
  // chat threads addressed to it stay reachable.
  rememberMyKey(STATE.userId);
  rememberMyKey(uid);
  STATE.userId = uid;
  localStorage.setItem(USER_ID_STORAGE_KEY, uid);
  ensurePointIdentity();
  migrateInboxFromLegacyKeys();
  if (status) {
    status.className = "firebase-status online";
    status.textContent = "⚡ Live — Firebase aktiv & authentifiziert";
  }
  // Load VAPID key from database config (needed for push notifications)
  if (window.FB?.db && window.FB?.ref && window.FB?.onValue) {
    try {
      window.FB.onValue(window.FB.ref(window.FB.db, "config/vapidKey"), (snap) => {
        const key = snap.val();
        if (key && typeof key === "string" && key.trim()) {
          FCM_VAPID_PUBLIC_KEY = key.trim();
          console.log("VAPID key loaded from Firebase config.");
        } else {
          console.warn("VAPID key not found in Firebase /config/vapidKey. Push notifications will not work until it is set.");
        }
      }, { onlyOnce: true });
    } catch (err) {
      console.warn("Failed to load VAPID key from config:", err);
    }
    // Load notification settings from Firebase (cross-device sync)
    try {
      window.FB.onValue(window.FB.ref(window.FB.db, "userPrefs/" + uid + "/notifSettings"), (snap) => {
        const remote = snap.val();
        if (remote && typeof remote === "object") {
          if (remote.mode && ["all", "team", "off"].includes(remote.mode)) {
            STATE.notifPref = remote.mode;
            localStorage.setItem(NOTIF_STORAGE_KEY, STATE.notifPref);
            localStorage.setItem("cg.notifPref", STATE.notifPref);
          }
          if (Array.isArray(remote.blockedTeams)) STATE.notifSettings.blockedTeams = remote.blockedTeams;
          if (Array.isArray(remote.blockedUsers)) STATE.notifSettings.blockedUsers = remote.blockedUsers;
          saveNotifSettings();
        }
      }, { onlyOnce: true });
    } catch (err) {
      console.warn("Failed to load notif settings from Firebase:", err);
    }
  }
  listenEncounters();
  listenLiveLocations();
  listenDirectMessages();
  listenGossip();      // no-ops if already listening; cover auth arriving late
  listenGossipLog();
  listenSupplyRuns();
  listenCornerDates();
  listenCornerFacts();
  checkBackendFeatures();
  syncIdentity();
  startPresenceHeartbeat();
  loadProfileFromCloud(uid);
  ensureOwnProfileLock();
  // Admin flag (config/admins/{uid}) — unlocks the host maintenance panel.
  try {
    window.FB.onValue(window.FB.ref(window.FB.db, "config/admins/" + uid), (snap) => {
      STATE.isAdmin = snap.val() === true;
      if (STATE.pendingFeedbackFocus) {
        STATE.pendingFeedbackFocus = false;
        clearHandledQueryParam("feedback");
        if (STATE.isAdmin) openAdminSection("#admin-feedback");
      }
      if (STATE.isAdmin && STATE.view === "profile") renderProfile();
    }, { onlyOnce: true });
  } catch (err) { console.warn("admin flag check failed:", err); }
  // localStorage saying "access granted" is no proof for THIS login — check.
  verifyAccessGrant();
  setTimeout(backfillCornerFacts, 30000);   // corners nobody has checked yet
  setTimeout(startCircles, 2000);            // close friends, private corners, secret dates
  if (!_linkVisibilityBound) {
    _linkVisibilityBound = true;
    document.addEventListener("visibilitychange", () => { if (!document.hidden && _accessVerified[window.FB?.getAuthUid?.() || ""]) { linkMyEarlierLogins(); backfillCornerFacts(); } });
  }
}

