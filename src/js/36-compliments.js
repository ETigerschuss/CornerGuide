/* ====================== COMPLIMENTS ======================
   "Positive vibes": tell someone something nice. They get Karma (what others
   give you), you get Aura (what you do) — and their 💛 thank-you sends a
   little Karma back. One compliment per person and day.
   Stored per receiving profile — compliments/<profile>/<fromProfile>_<day> —
   and loaded only for your own profile and the one you open (Phase 1).   */
const COMPLIMENT_KARMA = 20;            // for the person who gets it
const COMPLIMENT_AURA = 5;              // for you, the first few per day
const COMPLIMENT_AURA_PER_DAY = 5;
const COMPLIMENT_THANKS_KARMA = 5;      // back to the sender when thanked
const COMPLIMENT_THANKS_AURA = 2;
const COMPLIMENT_MAX_LEN = 140;
const COMPLIMENT_PRESETS = [
  { id: "vibes", emoji: "☀️", de: "Du bringst immer gute Laune mit", en: "You always bring good vibes" },
  { id: "better", emoji: "🙌", de: "Mit dir wird jeder Corner besser", en: "Every corner gets better with you" },
  { id: "laugh", emoji: "😂", de: "Mit dir lache ich am meisten", en: "Nobody makes me laugh like you" },
  { id: "listen", emoji: "👂", de: "Du hörst richtig gut zu", en: "You are a great listener" },
  { id: "energy", emoji: "✨", de: "Deine Energie ist ansteckend", en: "Your energy is contagious" },
  { id: "music", emoji: "🎶", de: "Bester Musikgeschmack am Corner", en: "Best taste in music at the corner" },
  { id: "trust", emoji: "🤝", de: "Auf dich ist immer Verlass", en: "You are always there for people" },
  { id: "spots", emoji: "🗺️", de: "Du kennst die besten Spots", en: "You know the best spots" },
  { id: "evening", emoji: "🍻", de: "Danke für den schönen Abend", en: "Thanks for the great evening" },
  { id: "glad", emoji: "💛", de: "Schön, dass es dich gibt", en: "Glad you exist" }
];

var _cmp = { mine: {}, mineRoot: "", mineUnsub: null, person: {}, toasted: {}, compose: null };

function complimentDay(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function complimentPreset(id) { return COMPLIMENT_PRESETS.find((p) => p.id === id) || null; }
function complimentText(c) {
  const p = c && c.preset ? complimentPreset(c.preset) : null;
  // A preset is shown in the reader's language; own words as written.
  return p && (!c.text || c.text === p.de || c.text === p.en) ? `${p.emoji} ${T(p.de, p.en)}` : String((c && c.text) || "");
}
function complimentList(map) {
  return Object.entries(map || {}).map(([id, c]) => ({ id, ...c })).filter((c) => c && c.text && !isBlocked(c.from)).sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
}

// Sent today (this device) — the database rules stop a second one per day anyway.
function complimentedToday(toRoot) {
  try { return (JSON.parse(localStorage.getItem("cg.complimentsSent") || "{}"))[toRoot] === complimentDay(); } catch (e) { return false; }
}
function markComplimented(toRoot) {
  try {
    const m = JSON.parse(localStorage.getItem("cg.complimentsSent") || "{}");
    const today = complimentDay();
    Object.keys(m).forEach((k) => { if (m[k] !== today) delete m[k]; });
    m[toRoot] = today;
    localStorage.setItem("cg.complimentsSent", JSON.stringify(m));
  } catch (e) { /* storage full or blocked */ }
}
function complimentAuraToday() {
  return localStorage.getItem("cg.complimentAuraDay") === complimentDay() ? Number(localStorage.getItem("cg.complimentAuraN") || 0) : 0;
}

/* ---- My compliments: listen, toast the new ones ---- */
function watchMyCompliments() {
  if (!window.FB?.firebaseReady || !STATE.nickname) return;
  const root = myRootKey();
  if (!root || /[.#$[\]/]/.test(root) || root === _cmp.mineRoot) return;
  if (_cmp.mineUnsub) { try { _cmp.mineUnsub(); } catch (e) {} }
  _cmp.mineRoot = root;
  _cmp.mineUnsub = window.FB.onValue(window.FB.ref(window.FB.db, "compliments/" + root), (snap) => {
    _cmp.mine = snap.val() || {};
    announceNewCompliments();
    if (STATE.view === "profile") renderProfile();
  }, () => { _cmp.mineRoot = ""; _cmp.mineUnsub = null; });
}

function announceNewCompliments() {
  // A new device announces only the last few days, not everything ever.
  if (!localStorage.getItem("cg.complimentsSeenAt")) localStorage.setItem("cg.complimentsSeenAt", String(Date.now() - 3 * 86400000));
  const seenAt = Number(localStorage.getItem("cg.complimentsSeenAt") || 0);
  const fresh = complimentList(_cmp.mine).filter((c) => Number(c.at || 0) > seenAt && !_cmp.toasted[c.id]);
  if (!fresh.length) return;
  fresh.forEach((c) => { _cmp.toasted[c.id] = true; });
  const open = () => openMyCompliments();
  if (fresh.length === 1) {
    const c = fresh[0];
    toastWhenFree(`💐 <strong>${escapeHtml(c.fromName || T("Jemand", "Someone"))}</strong>: ${escapeHtml(complimentText(c))}<br><span style="font-size:11px;opacity:0.8;">+${COMPLIMENT_KARMA} Karma · ${T("Tippen zum Ansehen", "Tap to view")}</span>`, "at-corner", open);
  } else {
    toastWhenFree(`💐 <strong>${fresh.length} ${T("neue Komplimente", "new compliments")}</strong> — ${T("Tippen zum Ansehen", "tap to view")}`, "at-corner", open);
  }
}

function openMyCompliments() {
  $(`.tab[data-view="profile"]`)?.click();
  setTimeout(() => $("#my-compliments")?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
}

// Seen once the section is on screen.
function markComplimentsSeen() {
  const newest = complimentList(_cmp.mine)[0];
  if (newest) localStorage.setItem("cg.complimentsSeenAt", String(Math.max(Number(newest.at || 0), Number(localStorage.getItem("cg.complimentsSeenAt") || 0))));
}

/* ---- Someone else's compliments: loaded with their profile ---- */
function personCompliments(root) {
  const c = _cmp.person[root];
  return c && c.data ? c.data : null;
}
async function loadPersonCompliments(root) {
  if (!window.FB?.firebaseReady || !root || /[.#$[\]/]/.test(root)) return;
  try { _cmp.person[root] = { data: (await slimGet("compliments/" + root)).val() || {} }; }
  catch (e) { /* stays "…" */ }
}
function forgetPersonCompliments(root) { delete _cmp.person[root]; }

/* ---- Sending ---- */
function openComplimentComposer(toKey, toName) {
  if (!toKey) return;
  if (!STATE.nickname) { toast(T("Bitte gib zuerst einen Namen ein.", "Please pick a name first.")); return; }
  if (!window.FB?.firebaseReady) { toast(T("Komplimente gehen nur online.", "Compliments need a connection.")); return; }
  const toRoot = profileRoot(toKey);
  if (!toRoot || toRoot === myRootKey() || isMyKey(toRoot)) { toast(T("Dir selbst? 😄 Such dir jemand anderen aus.", "Yourself? 😄 Pick someone else.")); return; }
  const name = toName || identityNickname(toRoot) || T("diese Person", "this person");
  if (complimentedToday(toRoot)) { toast(`💐 ${T(`${escapeHtml(name)} hat heute schon ein Kompliment von dir — morgen wieder!`, `You already complimented ${escapeHtml(name)} today — again tomorrow!`)}`); return; }
  const overlay = $("#compliment-overlay");
  if (!overlay) return;
  _cmp.compose = { toRoot, name, preset: "" };
  $("#cmp-title").textContent = `💐 ${T("Kompliment an", "Compliment for")} ${name}`;
  $("#cmp-sub").textContent = T("Tipp eins an oder schreib was Eigenes.", "Tap one or write your own.");
  $("#cmp-presets").innerHTML = COMPLIMENT_PRESETS.map((p) => `<button type="button" class="cmp-preset" data-cmp-preset="${p.id}">${p.emoji} ${escapeHtml(T(p.de, p.en))}</button>`).join("");
  const text = $("#cmp-text");
  text.value = "";
  text.placeholder = T("…oder in deinen Worten", "…or in your own words");
  text.maxLength = COMPLIMENT_MAX_LEN;
  const auraLeft = complimentAuraToday() < COMPLIMENT_AURA_PER_DAY;
  $("#cmp-points").textContent = `+${COMPLIMENT_KARMA} Karma ${T("für", "for")} ${name}${auraLeft ? ` · +${COMPLIMENT_AURA} Aura ${T("für dich", "for you")}` : ""}`;
  const send = $("#cmp-send");
  send.textContent = `💐 ${T("Senden", "Send")}`;
  send.disabled = true;
  const update = () => { send.disabled = !(text.value.trim() || _cmp.compose?.preset); };
  $("#cmp-presets").querySelectorAll("[data-cmp-preset]").forEach((b) => b.addEventListener("click", () => {
    const p = complimentPreset(b.dataset.cmpPreset);
    if (!p || !_cmp.compose) return;
    _cmp.compose.preset = p.id;
    text.value = T(p.de, p.en);
    $("#cmp-presets").querySelectorAll(".cmp-preset").forEach((x) => x.classList.toggle("active", x === b));
    update();
  }));
  text.oninput = () => {
    const p = complimentPreset(_cmp.compose?.preset);
    if (p && text.value.trim() !== T(p.de, p.en)) {   // edited: own words now
      _cmp.compose.preset = "";
      $("#cmp-presets").querySelectorAll(".cmp-preset").forEach((x) => x.classList.remove("active"));
    }
    update();
  };
  send.onclick = () => sendCompliment();
  const close = () => { overlay.style.display = "none"; _cmp.compose = null; };
  $("#cmp-close").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.style.display = "flex";
}

async function sendCompliment() {
  const c = _cmp.compose;
  if (!c) return;
  const text = String($("#cmp-text")?.value || "").trim().slice(0, COMPLIMENT_MAX_LEN);
  if (!text) return;
  const fromRoot = myRootKey();
  const id = `${fromRoot}_${complimentDay()}`;
  const entry = { from: fromRoot, fromName: String(STATE.nickname || "").slice(0, 40), text, at: Date.now() };
  if (c.preset) entry.preset = c.preset;
  const send = $("#cmp-send");
  if (send) send.disabled = true;
  const { db, ref, set } = window.FB;
  try {
    await withTimeout(set(ref(db, `compliments/${c.toRoot}/${id}`), entry), 15000, "compliment");
  } catch (err) {
    console.warn("compliment failed:", err);
    if (send) send.disabled = false;
    // The rules allow one per person and day.
    toast(T(`💐 ${escapeHtml(c.name)} hat heute schon ein Kompliment von dir — oder die Verbindung hakt.`, `💐 You already complimented ${escapeHtml(c.name)} today — or the connection is shaky.`));
    return;
  }
  markComplimented(c.toRoot);
  addKarmaPoints(c.toRoot, COMPLIMENT_KARMA, `💐 Kompliment von ${STATE.nickname}`, c.name);
  const auraN = complimentAuraToday();
  if (auraN < COMPLIMENT_AURA_PER_DAY) {
    addXp(COMPLIMENT_AURA, `💐 Kompliment an ${c.name}`);
    localStorage.setItem("cg.complimentAuraDay", complimentDay());
    localStorage.setItem("cg.complimentAuraN", String(auraN + 1));
  }
  sendTargetedPush([...identityKeysOf(c.toRoot)], {
    type: "compliment",
    title: `💐 ${String(STATE.nickname).slice(0, 40)} ${T("hat dir ein Kompliment gemacht", "paid you a compliment")}`,
    body: text,
    query: `?profile=${encodeURIComponent(c.toRoot)}&focus=compliments`
  });
  unlockAchievement("first-compliment", "Charmeur", "💐", 15);
  const sentCount = Number(localStorage.getItem("cg.complimentsSentTotal") || 0) + 1;
  localStorage.setItem("cg.complimentsSentTotal", String(sentCount));
  if (sentCount >= 10) unlockAchievement("compliment-10", "Good Vibes", "🌈", 40);
  if (_cmp.person[c.toRoot]?.data) _cmp.person[c.toRoot].data[id] = entry;
  $("#compliment-overlay").style.display = "none";
  _cmp.compose = null;
  toast(`💐 ${T("Kompliment an", "Compliment sent to")} <strong>${escapeHtml(c.name)}</strong>${T(" geschickt", "")} — +${COMPLIMENT_KARMA} Karma ${T("für", "for")} ${escapeHtml(c.name)}`, "at-corner");
  refreshOpenPublicProfile();
  if (STATE.view === "profile") renderProfile();
}

/* ---- Thank you ---- */
async function thankCompliment(id) {
  const c = _cmp.mine[id];
  const root = _cmp.mineRoot;
  if (!c || c.thanked || !root || !window.FB?.firebaseReady) return;
  try {
    await withTimeout(window.FB.set(window.FB.ref(window.FB.db, `compliments/${root}/${id}/thanked`), true), 15000, "thanks");
  } catch (err) {
    console.warn("thanks failed:", err);
    toast(T("Danke ging gerade nicht — Verbindung prüfen.", "Could not say thanks — check the connection."));
    return;
  }
  c.thanked = true;
  if (c.from && !isMyKey(c.from)) {
    addKarmaPoints(c.from, COMPLIMENT_THANKS_KARMA, `💛 ${STATE.nickname} sagt Danke für dein Kompliment`, c.fromName);
    sendTargetedPush([...identityKeysOf(profileRoot(c.from))], {
      type: "compliment-thanks",
      title: `💛 ${String(STATE.nickname).slice(0, 40)} ${T("sagt Danke", "says thanks")}`,
      body: `${T("für dein Kompliment", "for your compliment")}: „${String(c.text || "").slice(0, 100)}“`,
      query: `?profile=${encodeURIComponent(root)}`
    });
  }
  addXp(COMPLIMENT_THANKS_AURA, "💛 Danke gesagt");
  toast(`💛 ${T("Danke an", "Thanks sent to")} <strong>${escapeHtml(c.fromName || "")}</strong> — +${COMPLIMENT_THANKS_KARMA} Karma ${T("zurück", "back")}`);
  if (STATE.view === "profile") renderProfile();
}

/* ---- Sections ---- */
// People worth a compliment right now: who is around, then who you meet most.
function complimentSuggestions(limit = 4) {
  const myRoot = myRootKey();
  const out = [];
  const add = (key, name) => {
    const root = profileRoot(key);
    if (!root || root === myRoot || isMyKey(root) || out.some((x) => x.root === root) || complimentedToday(root)) return;
    const n = identityNickname(root) || name;
    if (!n || String(n).toLowerCase() === "anonym") return;
    out.push({ root, name: n });
  };
  freshFriends().forEach((f) => add(f.id, f.nickname || f.name));
  Object.values(STATE.encounters || {})
    .filter((e) => e && e.users && Object.keys(e.users).some((k) => isMyKey(k) || k === currentUserKey()))
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .forEach((e) => Object.entries(e.users).forEach(([k, v]) => { if (!isMyKey(k) && k !== currentUserKey()) add(k, typeof v === "string" ? v : ""); }));
  return out.slice(0, limit);
}

function complimentItemHtml(c, opts = {}) {
  const from = c.from ? `<button class="people-chip" data-user-profile="${escapeHtml(c.from)}">${escapeHtml(c.fromName || "?")}</button>` : escapeHtml(c.fromName || "?");
  const thanks = opts.mine
    ? (c.thanked ? `<span class="cmp-thanked">💛 ${T("bedankt", "thanked")}</span>` : `<button class="cmp-thanks" data-compliment-thanks="${escapeHtml(c.id)}">💛 ${T("Danke", "Thanks")}</button>`)
    : (c.thanked ? `<span class="cmp-thanked" title="${T("hat sich bedankt", "said thanks")}">💛</span>` : "");
  return `<li class="cmp-item"><span class="cmp-text">${escapeHtml(complimentText(c))}</span><span class="cmp-meta">${T("von", "from")} ${from} · ${timeAgo(Number(c.at || 0))}</span>${thanks}</li>`;
}

// My profile: what others said, a thank-you each, and whom to make happy next.
function complimentsSectionHtml() {
  deferSlim("myCompliments", watchMyCompliments);
  const list = complimentList(_cmp.mine);
  const suggestions = complimentSuggestions();
  setTimeout(markComplimentsSeen, 1500);
  return `<div class="team-battle-section cmp-section" id="my-compliments">
    <h3>💐 ${T("Komplimente", "Compliments")}${list.length ? ` <span class="comment-count">${list.length}</span>` : ""}</h3>
    ${list.length
      ? `<ul class="cmp-list">${list.slice(0, 10).map((c) => complimentItemHtml(c, { mine: true })).join("")}</ul>`
      : `<p class="cmp-empty">${T("Noch keine — die ersten kommen bestimmt. Fang doch selbst an:", "None yet — they will come. Why not start yourself:")}</p>`}
    ${suggestions.length ? `<div class="cmp-suggest"><span>${T("Mach jemandem eine Freude", "Make someone's day")}:</span>${suggestions.map((s) => `<button class="action-btn cmp-quick" data-compliment-to="${escapeHtml(s.root)}" data-compliment-name="${escapeHtml(s.name)}">💐 ${escapeHtml(s.name)}</button>`).join("")}</div>` : ""}
    <p class="cmp-hint">+${COMPLIMENT_KARMA} Karma ${T("für die Person", "for them")} · +${COMPLIMENT_AURA} Aura ${T("für dich", "for you")} · ${T("ein Kompliment pro Person und Tag", "one compliment per person and day")}</p>
  </div>`;
}

// Someone's public profile: what others said about them, and the button.
function publicComplimentsHtml(key) {
  const root = profileRoot(key);
  const data = personCompliments(root);
  const list = data ? complimentList(data) : [];
  const done = complimentedToday(root);
  const name = identityNickname(root) || "";
  return `<div class="up-section cmp-section">
    <h3>💐 ${T("Komplimente", "Compliments")}${data ? ` <span class="comment-count">${list.length}</span>` : ""}</h3>
    ${data === null ? `<p class="cmp-empty">…</p>` : list.length ? `<ul class="cmp-list">${list.slice(0, 3).map((c) => complimentItemHtml(c)).join("")}</ul>` : `<p class="cmp-empty">${T("Noch keine — mach das erste!", "None yet — be the first!")}</p>`}
    ${done
      ? `<p class="cmp-done">✓ ${T("Heute schon ein Kompliment von dir", "You complimented them today")}</p>`
      : `<button class="action-btn primary cmp-open" data-compliment-to="${escapeHtml(root)}" data-compliment-name="${escapeHtml(name)}">💐 ${T("Kompliment machen", "Pay a compliment")}</button>`}
  </div>`;
}

document.addEventListener("click", (e) => {
  const to = e.target.closest?.("[data-compliment-to]");
  if (to) { e.preventDefault(); e.stopPropagation(); openComplimentComposer(to.dataset.complimentTo, to.dataset.complimentName || ""); return; }
  const thanks = e.target.closest?.("[data-compliment-thanks]");
  if (thanks) { e.preventDefault(); thankCompliment(thanks.dataset.complimentThanks); }
});
