/* ====================== CORNERDATE ======================
   Plan a meetup at a corner: date + time → everyone in the app gets a push
   and can say "bin dabei"; anyone can put it in their calendar (.ics for
   iPhone/Outlook/Android, link for Google Calendar) or share it on WhatsApp. */
const CORNERDATE_KEEP_MS = 24 * 60 * 60 * 1000;   // ended dates are deleted after this
const CORNERDATE_PLAN_AURA = 5;
// "Bekommt man schon Punkte für Cornerdate-Zusagen?" — yes, and now it shows:
// a yes is worth 5 Aura, actually showing up during the date another 10.
const CORNERDATE_JOIN_AURA = 5;
const CORNERDATE_SHOWUP_AURA = 10;
// "Wieso bekomme ich keine Aura wenn ich ein Corner Date geplant habe?! Ich
// bringe auch das Bier mit!" — planning paid out silently. Now it shows, and
// whoever plans gets karma from the people who say yes and who really come.
const CORNERDATE_JOIN_KARMA = 3;      // for the planner, per person who says "bin dabei"
const CORNERDATE_ARRIVE_KARMA = 5;    // for the planner, per guest who checks in during the date
STATE.cornerDates = {};
var _cornerDates = { listening: false, primed: false, lastCleanup: 0 };
var CD_DRAFT = { cornerId: null, saving: false, saved: null };

function listenCornerDates(attempt = 0) {
  if (!window.FB?.firebaseReady || _cornerDates.listening) return;
  _cornerDates.listening = true;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "cornerDates"), (snap) => {
    const before = STATE.cornerDates || {};
    STATE.cornerDates = snap.val() || {};
    if (_cornerDates.primed) announceNewCornerDates(before);
    _cornerDates.primed = true;
    renderCornerDatesStrip();
    refreshCornerDateSection();
    cleanupOldCornerDates();
  }, () => { _cornerDates.listening = false; retryListenerAfterAuth(listenCornerDates, attempt); });
}

function upcomingCornerDates(cornerId) {
  const now = Date.now();
  return Object.entries(allCornerDates())
    .map(([id, d]) => ({ ...d, id }))
    .filter((d) => d && d.cornerId && Number(d.end) > now && (!cornerId || d.cornerId === cornerId))
    .sort((a, b) => Number(a.start) - Number(b.start));
}
function cornerDateGoing(d) { return Object.entries(d.going || {}).map(([id, g]) => ({ id, name: (g && g.name) || "?" })); }

function formatDateRange(start, end) {
  const s = new Date(Number(start));
  const e = new Date(Number(end));
  const locale = appLocale();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const day = same(s, new Date()) ? T("Heute", "Today")
    : same(s, new Date(Date.now() + 86400000)) ? T("Morgen", "Tomorrow")
    : s.toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" });
  const time = (d) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time(s)}–${time(e)}`;
}

function cornerDateParts(d) {
  const corner = getAllCorners().find((c) => c.id === d.cornerId);
  const name = (corner && corner.name) || d.cornerName || "Corner";
  const where = [name, corner && corner.area, "München"].filter(Boolean).join(", ");
  const link = buildShareUrl(d.cornerId, "", false, d.id ? { [DATE_PARAM]: d.id } : {});
  const route = corner ? walkingRouteUrl(corner.lat, corner.lng) : "";
  const details = [d.note || "", `Geplant von ${d.byName || "?"}`, route ? `Route: ${route}` : "", `Im Corner Guide: ${link}`].filter(Boolean).join("\n");
  return { corner, name, where, link, details };
}

// RFC 5545 helpers
function icsEscape(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1"); }
function icsParam(s) { return String(s || "").replace(/["\r\n]/g, ""); }
function icsDate(ms) { return new Date(Number(ms)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 74) { out.push(cur); cur = " " + ch; bytes = 1 + b; }
    else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join("\r\n");
}
function cornerDateIcs(d) {
  const { corner, name, where, link, details } = cornerDateParts(d);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Minga Corner Guide//Cornerdate//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${d.id}@cornerguide`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(d.start)}`,
    `DTEND:${icsDate(d.end)}`,
    `SUMMARY:${icsEscape(`🍻 Cornerdate: ${name}`)}`,
    `LOCATION:${icsEscape(where)}`,
    ...(corner ? [
      `GEO:${corner.lat};${corner.lng}`,
      `X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="${icsParam(where)}";X-APPLE-RADIUS=70;X-TITLE="${icsParam(name)}":geo:${corner.lat},${corner.lng}`
    ] : []),
    `DESCRIPTION:${icsEscape(details)}`,
    `URL:${link}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT30M", `DESCRIPTION:${icsEscape(`Cornerdate am ${name} in 30 Minuten`)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
function downloadCornerDateIcs(d) {
  const blob = new Blob([cornerDateIcs(d)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cornerdate-${String(d.cornerName || d.cornerId || "corner").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "corner"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
function googleCalendarUrl(d) {
  const { name, where, details } = cornerDateParts(d);
  const p = new URLSearchParams({ action: "TEMPLATE", text: `🍻 Cornerdate: ${name}`, dates: `${icsDate(d.start)}/${icsDate(d.end)}`, details, location: where });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
function cornerDateWhatsAppText(d) {
  const { name, link } = cornerDateParts(d);
  return `📅 Cornerdate: ${formatDateRange(d.start, d.end)} am ${name}!${d.note ? ` ${d.note}` : ""} Bist du dabei? 👉 ${link}`;
}

function cornerDateItemHtml(d) {
  const going = cornerDateGoing(d);
  const iGo = Object.keys(d.going || {}).some((id) => isMyKey(id));
  const mine = isMyKey(d.byId);
  const canCancel = d.secret ? isMyKey(d.ownerKey) : d.byId === (window.FB?.getAuthUid?.() || currentUserKey());
  return `<div class="cd-item" data-cd-id="${escapeHtml(d.id)}">
    <div class="cd-when">📅 ${escapeHtml(formatDateRange(d.start, d.end))}${d.secret ? `<span class="cd-secret-badge">🤫 ${T("geheim", "secret")}</span>` : ""}</div>
    <div class="cd-meta">${T("von", "by")} ${escapeHtml(mine ? T("dir", "you") : (d.byName || "?"))} · ${going.length} ${T("dabei", "going")}${going.length ? ": " + going.map((g) => escapeHtml(g.name)).join(", ") : ""}</div>
    ${d.note ? `<div class="cd-note">„${escapeHtml(d.note)}“</div>` : ""}
    <div class="cd-btns">
      ${mine ? "" : `<button class="action-btn ${iGo ? "going" : ""}" data-cd-going>${iGo ? "✓ " + T("Bin dabei", "I'm in") : "✋ " + T("Bin dabei", "I'm in")}</button>`}
      <button class="action-btn" data-cd-ics>📅 ${T("Kalender", "Calendar")}</button>
      <a class="action-btn" href="${escapeHtml(googleCalendarUrl(d))}" target="_blank" rel="noopener">Google</a>
      <button class="action-btn wa" data-cd-wa>📲 WhatsApp</button>
      ${mine && canCancel ? `<button class="action-btn danger" data-cd-cancel>✕ ${T("Absagen", "Cancel")}</button>` : ""}
    </div>
  </div>`;
}
function bindCornerDateItems(root) {
  root.querySelectorAll(".cd-item").forEach((item) => {
    const id = item.dataset.cdId;
    const d = () => { const raw = allCornerDates()[id]; return raw ? { ...raw, id } : null; };
    item.querySelector("[data-cd-going]")?.addEventListener("click", () => toggleCornerDateGoing(id));
    item.querySelector("[data-cd-ics]")?.addEventListener("click", () => { const x = d(); if (x) downloadCornerDateIcs(x); });
    item.querySelector("[data-cd-wa]")?.addEventListener("click", () => { const x = d(); if (x) openWhatsApp(cornerDateWhatsAppText(x)); });
    item.querySelector("[data-cd-cancel]")?.addEventListener("click", () => cancelCornerDate(id));
  });
}

function renderCornerDateSection(cornerId, container) {
  if (!container) return;
  // Like gossip: hidden until the cornerDates rules are deployed and data is in.
  container.hidden = !(_backendFeatures.ok && _cornerDates.primed);
  if (container.hidden) return;
  const dates = upcomingCornerDates(cornerId);
  container.innerHTML = `<h3>📅 Cornerdates</h3>
    ${dates.length ? dates.map(cornerDateItemHtml).join("") : `<p class="gs-hint">${T("Noch nichts geplant. Plan ein Treffen: alle bekommen Bescheid, und es landet mit Uhrzeit und Ort in eurem Kalender.", "Nothing planned yet. Plan a meetup: everyone gets notified and it lands in your calendars with time and place.")}</p>`}
    <button class="action-btn primary cd-plan-btn" data-cd-plan>📅 ${T("Cornerdate planen", "Plan a cornerdate")}</button>`;
  bindCornerDateItems(container);
  container.querySelector("[data-cd-plan]")?.addEventListener("click", () => openCornerDatePlanner(cornerId));
}
function refreshCornerDateSection() {
  if (!$("#detail-overlay")?.classList.contains("open") || !STATE.detailCornerId) return;
  renderCornerDateSection(STATE.detailCornerId, document.querySelector(`.cornerdate-section[data-corner-id="${CSS.escape(STATE.detailCornerId)}"]`));
}

function renderCornerDatesStrip() {
  const box = $("#cornerdates-strip");
  if (!box) return;
  const me = currentUserKey();
  const dates = upcomingCornerDates().filter((d) => Number(d.start) < Date.now() + 7 * 86400000).slice(0, 4);
  if (!dates.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="cd-strip"><div class="cd-strip-title">📅 ${T("Geplante Cornerdates", "Planned cornerdates")}</div>${dates.map((d) => {
    const corner = getAllCorners().find((c) => c.id === d.cornerId);
    const going = cornerDateGoing(d).length;
    return `<button class="cd-strip-item" data-cd-open="${escapeHtml(d.cornerId)}"><span class="cd-s-when">${d.secret ? "🤫 " : ""}${escapeHtml(formatDateRange(d.start, d.end))}</span><span class="cd-s-what">${escapeHtml((corner && corner.name) || d.cornerName || "?")} · ${going} ${T("dabei", "going")}${d.going && d.going[me] ? " · ✓ " + T("du", "you") : ""}</span><span>→</span></button>`;
  }).join("")}</div>`;
  box.querySelectorAll("[data-cd-open]").forEach((b) => b.addEventListener("click", () => focusDetailSection(b.dataset.cdOpen, ".cornerdate-section")));
}

function focusDetailSection(cornerId, selector) {
  const alreadyOpen = $("#detail-overlay")?.classList.contains("open") && STATE.detailCornerId === cornerId;
  if (!alreadyOpen) openDetail(cornerId);
  setTimeout(() => document.querySelector(`${selector}[data-corner-id="${CSS.escape(cornerId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), alreadyOpen ? 0 : 250);
}

function announceNewCornerDates(before) {
  Object.entries(STATE.cornerDates || {}).forEach(([id, d]) => {
    if (before[id] || !d || isMyKey(d.byId) || Number(d.end) < Date.now()) return;
    const corner = getAllCorners().find((c) => c.id === d.cornerId);
    toast(`📅 <strong>${escapeHtml(d.byName || "?")}</strong> ${T("plant ein Cornerdate", "plans a cornerdate")}: ${escapeHtml(formatDateRange(d.start, d.end))}${corner ? ` ${T("am", "at")} ${escapeHtml(corner.name)}` : ""}<br><span style="font-size:11px;opacity:0.8;">${T("Tippen zum Ansehen →", "Tap to see →")}</span>`, null, () => focusDetailSection(d.cornerId, ".cornerdate-section"));
  });
}

function toDateInputValue(dt) { return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; }
function toTimeInputValue(dt) { return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`; }

function openCornerDatePlanner(cornerId) {
  if (!STATE.nickname) { toast(T("Bitte zuerst einen Namen wählen.", "Please pick a name first.")); return; }
  if (!window.FB?.firebaseReady) { toast(T("Cornerdates brauchen eine Verbindung.", "Cornerdates need a connection.")); return; }
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner) return;
  CD_DRAFT.cornerId = cornerId;
  CD_DRAFT.saving = false;
  CD_DRAFT.saved = null;
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  $("#cd-title").textContent = "📅 Cornerdate";
  $("#cd-sub").innerHTML = `${T("am", "at")} <strong>${escapeHtml(corner.name)}</strong>${corner.area ? ` · ${escapeHtml(corner.area)}` : ""}`;
  $("#cd-date").value = toDateInputValue(start);
  $("#cd-date").min = toDateInputValue(new Date());
  $("#cd-time").value = toTimeInputValue(start);
  $("#cd-duration").value = "120";
  $("#cd-note").value = "";
  $("#cd-note").placeholder = T("z. B. Bring 'ne Decke mit", "e.g. bring a blanket");
  $("#cd-date-label").textContent = T("Tag", "Day");
  $("#cd-time-label").textContent = T("Uhrzeit", "Time");
  $("#cd-dur-label").textContent = T("Dauer", "Duration");
  $("#cd-note-label").textContent = T("Notiz (optional)", "Note (optional)");
  const privateSpot = isPrivateCorner(corner);
  const secretBox = $("#cd-secret");
  secretBox.checked = privateSpot;
  secretBox.disabled = privateSpot;
  $("#cd-secret-label").textContent = privateSpot
    ? T("🤫 Geheim — der Corner ist privat, also sehen es nur deine engen Freunde (halbe Punkte)", "🤫 Secret — the corner is private, so only your close friends see it (half the points)")
    : T("🤫 Geheim — nur deine engen Freunde sehen es (halbe Punkte)", "🤫 Secret — only your close friends see it (half the points)");
  const notifyLabel = () => { $("#cd-notify-label").textContent = secretBox.checked ? T("Deine engen Freunde benachrichtigen", "Notify your close friends") : T("Alle in der App benachrichtigen", "Notify everyone in the app"); };
  secretBox.onchange = notifyLabel;
  notifyLabel();
  $("#cd-cancel").textContent = T("Abbrechen", "Cancel");
  $("#cd-save").textContent = "📅 " + T("Planen", "Plan it");
  $("#cd-hint").textContent = "";
  $("#cd-form").hidden = false;
  $("#cd-done").hidden = true;
  $("#cornerdate-overlay").classList.add("open");
}
function closeCornerDatePlanner() { $("#cornerdate-overlay")?.classList.remove("open"); }

async function saveCornerDate() {
  const cornerId = CD_DRAFT.cornerId;
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner || CD_DRAFT.saving) return;
  const [Y, M, D] = String($("#cd-date").value || "").split("-").map(Number);
  const [h, m] = String($("#cd-time").value || "").split(":").map(Number);
  if (!Y || !M || !D || !Number.isFinite(h) || !Number.isFinite(m)) { $("#cd-hint").textContent = T("Bitte Tag und Uhrzeit wählen.", "Please pick a day and time."); return; }
  const start = new Date(Y, M - 1, D, h, m).getTime();
  const end = start + (parseInt($("#cd-duration").value, 10) || 120) * 60000;
  if (start < Date.now() - 15 * 60000) { $("#cd-hint").textContent = T("Das liegt in der Vergangenheit 😉", "That's in the past 😉"); return; }
  if (start > Date.now() + 60 * 86400000) { $("#cd-hint").textContent = T("Bitte höchstens 60 Tage im Voraus.", "At most 60 days ahead, please."); return; }
  const secret = $("#cd-secret").checked || isPrivateCorner(corner);
  if (secret && !closeFriendKeys().length) { $("#cd-hint").textContent = T("Für ein geheimes Date brauchst du enge Freunde — im Profil unter „Teilen & enge Freunde“ hinzufügen.", "A secret date needs close friends — add them in your profile."); return; }
  CD_DRAFT.saving = true;
  $("#cd-save").disabled = true;
  const me = currentUserKey();
  const note = String($("#cd-note").value || "").trim().slice(0, 140);
  const { db, ref, push, set } = window.FB;
  const owner = myRootKey();
  const dateRef = push(ref(db, secret ? `secretDates/${owner}` : "cornerDates"));
  const d = {
    cornerId, cornerName: corner.name, start, end,
    byId: me, byName: String(STATE.nickname).slice(0, 40), byTeam: STATE.team || "",
    createdAt: Date.now(),
    going: { [me]: { name: String(STATE.nickname).slice(0, 40), at: Date.now() } }
  };
  // Invited close friends may not see a private corner: the date brings the spot along.
  if (secret) { d.lat = corner.lat; d.lng = corner.lng; }
  if (note) d.note = note;
  try {
    await set(dateRef, d);
  } catch (err) {
    console.warn("saveCornerDate failed:", err);
    CD_DRAFT.saving = false;
    $("#cd-save").disabled = false;
    $("#cd-hint").textContent = /permission/i.test(String(err?.code || "") + String(err?.message || ""))
      ? T("Der Server lässt das noch nicht zu (Datenbank-Regeln deployen).", "The server doesn't allow this yet (deploy the database rules).")
      : T("Konnte nicht gespeichert werden — Verbindung prüfen.", "Couldn't save — check your connection.");
    return;
  }
  const saved = { ...d, id: dateRef.key, ...(secret ? { secret: true, ownerKey: owner } : {}) };
  if (secret) STATE.secretDates = { ...(STATE.secretDates || {}), [dateRef.key]: saved };
  CD_DRAFT.saved = saved;
  CD_DRAFT.saving = false;
  $("#cd-save").disabled = false;
  const notifyAll = $("#cd-notify").checked;
  if (notifyAll && secret) {
    sendTargetedPush(closeFriendKeys(), { type: "cornerdate", title: "🤫 Geheimes Cornerdate!", body: `${STATE.nickname} lädt dich ein: ${formatDateRange(start, end)} am ${corner.name}`, query: `?corner=${encodeURIComponent(cornerId)}&date=1&${DATE_PARAM}=${encodeURIComponent(dateRef.key)}` });
  } else if (notifyAll) {
    try {
      set(push(ref(db, "notify")), {
        type: "cornerdate",
        title: "📅 Cornerdate!",
        body: `${STATE.nickname} plant ein Cornerdate: ${formatDateRange(start, end)} am ${corner.name} — bist du dabei?`,
        fromId: me, fromTeam: STATE.team || "",
        query: `?corner=${encodeURIComponent(cornerId)}&date=1&${DATE_PARAM}=${encodeURIComponent(dateRef.key)}`,
        createdAt: Date.now()
      }).catch(() => {});
    } catch (e) { /* push is a bonus */ }
  }
  const planAura = bumpDailyCount("cg.cdPlanned") <= 3;   // max 3 per day
  const planPts = secret ? PRIVATE_POINTS(CORNERDATE_PLAN_AURA) : CORNERDATE_PLAN_AURA;
  if (planAura) addXp(planPts, "Cornerdate geplant");
  unlockAchievement("first-cornerdate", "Date-Planer", "📅", 15);
  $("#cd-form").hidden = true;
  const done = $("#cd-done");
  done.innerHTML = `<div class="cd-done-title">✅ ${T("Geplant!", "Planned!")}</div>
    <p class="gossip-sub">${escapeHtml(formatDateRange(start, end))} ${T("am", "at")} <strong>${escapeHtml(corner.name)}</strong>${notifyAll ? ` · ${T("alle wurden benachrichtigt", "everyone was notified")}` : ""}</p>
    <p class="cd-reward">${secret ? `🤫 ${T("Geheim: nur deine engen Freunde sehen es", "Secret: only your close friends see it")} · ` : ""}${planAura ? `✨ <strong>+${planPts} Aura</strong> ${T("fürs Planen", "for planning")} · ` : ""}🎁 ${T(`+${CORNERDATE_JOIN_KARMA} Karma pro Zusage, +${CORNERDATE_ARRIVE_KARMA} pro Gast, der wirklich kommt`, `+${CORNERDATE_JOIN_KARMA} karma per yes, +${CORNERDATE_ARRIVE_KARMA} per guest who really shows up`, `+${CORNERDATE_JOIN_KARMA} de karma por cada sí, +${CORNERDATE_ARRIVE_KARMA} por cada invitado que de verdad aparece`)}</p>
    <div class="cd-actions">
      <button class="action-btn primary" data-cd-ics>📅 ${T("In meinen Kalender (iPhone, Android, Outlook)", "Add to my calendar (iPhone, Android, Outlook)")}</button>
      <a class="action-btn" href="${escapeHtml(googleCalendarUrl(saved))}" target="_blank" rel="noopener">🗓️ Google ${T("Kalender", "Calendar")}</a>
      <button class="whatsapp-btn" data-cd-wa>📲 ${T("In WhatsApp teilen", "Share on WhatsApp")}</button>
      <button class="action-btn" data-cd-close>${T("Fertig", "Done")}</button>
    </div>`;
  done.hidden = false;
  done.querySelector("[data-cd-ics]").addEventListener("click", () => downloadCornerDateIcs(saved));
  done.querySelector("[data-cd-wa]").addEventListener("click", () => openWhatsApp(cornerDateWhatsAppText(saved)));
  done.querySelector("[data-cd-close]").addEventListener("click", closeCornerDatePlanner);
}

// Checked in at a corner while a cornerdate runs there: the planner gets karma,
// and whoever said yes and really came gets Aura ("Wort gehalten").
function rewardCornerDateArrival(cornerId) {
  const now = Date.now();
  Object.entries(allCornerDates()).forEach(([id, d]) => {
    if (!d || d.cornerId !== cornerId || isMyKey(d.byId)) return;
    if (now < Number(d.start) - 30 * 60000 || now > Number(d.end)) return;
    if (!Object.keys(d.going || {}).some((k) => isMyKey(k))) return;
    const paid = gossipLocalLog("cg.cdShowedUp");
    if (paid[id]) return;
    gossipLocalMark("cg.cdShowedUp", id);
    const showAura = d.secret ? PRIVATE_POINTS(CORNERDATE_SHOWUP_AURA) : CORNERDATE_SHOWUP_AURA;
    addXp(showAura, "Cornerdate: Wort gehalten");
    setTimeout(() => toast(`🤝 ${T("Wort gehalten — du bist zum Cornerdate gekommen", "Kept your word — you came to the cornerdate")}: <strong>+${showAura} Aura</strong>`, "at-corner"), 1800);
  });
  Object.entries(allCornerDates()).forEach(([id, d]) => {
    if (!d || d.cornerId !== cornerId || !d.byId || isMyKey(d.byId)) return;
    if (now < Number(d.start) - 30 * 60000 || now > Number(d.end)) return;
    const seen = gossipLocalLog("cg.cdArrived");
    if (seen[id]) return;
    gossipLocalMark("cg.cdArrived", id);
    addKarmaPoints(d.byId, d.secret ? PRIVATE_POINTS(CORNERDATE_ARRIVE_KARMA) : CORNERDATE_ARRIVE_KARMA, `${STATE.nickname} ist zu deinem Cornerdate gekommen`, d.byName);
    sendTargetedPush([d.byId], { type: "cornerdate-here", title: "📅 Dein Cornerdate läuft!", body: `${STATE.nickname} ist da (+${CORNERDATE_ARRIVE_KARMA} Karma)`, query: `?corner=${encodeURIComponent(cornerId)}&date=1` });
    toast(`📅 ${T("Pünktlich zum Cornerdate von", "Right on time for")} <strong>${escapeHtml(d.byName || "?")}</strong> — ${T(`+${CORNERDATE_ARRIVE_KARMA} Karma für die Planung`, `+${CORNERDATE_ARRIVE_KARMA} karma for planning it`, `+${CORNERDATE_ARRIVE_KARMA} de karma por planearlo`)} 🎁`);
  });
}

function bumpDailyCount(key) {
  const today = getTodayKey();
  let log = {};
  try { log = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { log = {}; }
  const n = Number(log[today] || 0) + 1;
  localStorage.setItem(key, JSON.stringify({ [today]: n }));
  return n;
}

var _cdJoinPaid = false;
async function toggleCornerDateGoing(dateId) {
  const d = allCornerDates()[dateId];
  if (!d || !window.FB?.firebaseReady || !STATE.nickname) return;
  const me = currentUserKey();
  const going = !!(d.going && d.going[me]);
  // Said yes on my other device already: nothing to toggle here.
  if (!going && Object.keys(d.going || {}).some((id) => isMyKey(id))) { toast(T("✓ Du bist schon dabei (auf deinem anderen Gerät).", "✓ You're already in (on your other device).")); return; }
  _cdJoinPaid = false;
  const { db, ref, set, remove } = window.FB;
  try {
    if (going) {
      await remove(ref(db, `${cornerDatePath(dateId)}/going/${me}`));
      toast(T("Abgesagt 👋", "You're out 👋"));
    } else {
      await set(ref(db, `${cornerDatePath(dateId)}/going/${me}`), { name: String(STATE.nickname).slice(0, 40), at: Date.now() });
      const joined = gossipLocalLog("cg.cdJoined");
      if (!joined[dateId]) {
        gossipLocalMark("cg.cdJoined", dateId);
        addXp(d.secret ? PRIVATE_POINTS(CORNERDATE_JOIN_AURA) : CORNERDATE_JOIN_AURA, "Cornerdate zugesagt");
        _cdJoinPaid = true;
        if (d.byId && !isMyKey(d.byId)) {
          addKarmaPoints(d.byId, d.secret ? PRIVATE_POINTS(CORNERDATE_JOIN_KARMA) : CORNERDATE_JOIN_KARMA, `${STATE.nickname} kommt zu deinem Cornerdate`, d.byName);
          sendTargetedPush([d.byId], { type: "cornerdate-yes", title: "📅 Zusage!", body: `${STATE.nickname} ist bei deinem Cornerdate dabei (+${CORNERDATE_JOIN_KARMA} Karma)`, query: `?corner=${encodeURIComponent(d.cornerId)}&date=1` });
        }
      }
      const joinAura = d.secret ? PRIVATE_POINTS(CORNERDATE_JOIN_AURA) : CORNERDATE_JOIN_AURA;
      const showAura = d.secret ? PRIVATE_POINTS(CORNERDATE_SHOWUP_AURA) : CORNERDATE_SHOWUP_AURA;
      toast(`✋ ${T("Du bist dabei!", "You're in!")}${_cdJoinPaid ? ` <strong>+${joinAura} Aura</strong>` : ""}<br><span style="font-size:11px;opacity:0.8;">${T(`Kommst du wirklich, gibt's nochmal +${showAura}. „📅 Kalender“ trägt's dir ein.`, `Show up and get another +${showAura}. “📅 Calendar” adds it for you.`, `Aparece y gana otros +${showAura}. «📅 Calendario» te lo apunta.`)}</span>`);
    }
  } catch (err) {
    console.warn("toggleCornerDateGoing failed:", err);
    toast(T("Ging nicht — Verbindung prüfen.", "Didn't work — check your connection."));
  }
}

async function cancelCornerDate(dateId) {
  const d = allCornerDates()[dateId];
  if (!d || !isMyKey(d.byId)) return;
  if (!(await appConfirm(T("Cornerdate absagen?", "Cancel this cornerdate?"), T("Es verschwindet für alle.", "It disappears for everyone."), T("Absagen", "Cancel it")))) return;
  try {
    await window.FB.remove(window.FB.ref(window.FB.db, cornerDatePath(dateId)));
    toast(T("Cornerdate abgesagt.", "Cornerdate cancelled."));
  } catch (err) { toast(T("Absagen hat nicht geklappt.", "Couldn't cancel.")); }
}

function cleanupOldCornerDates() {
  if (!window.FB?.firebaseReady || Date.now() - _cornerDates.lastCleanup < 30 * 60 * 1000) return;
  _cornerDates.lastCleanup = Date.now();
  const { db, ref, remove } = window.FB;
  Object.entries(STATE.cornerDates || {}).forEach(([id, d]) => {
    if (d && Number(d.end) < Date.now() - CORNERDATE_KEEP_MS) remove(ref(db, "cornerDates/" + id)).catch(() => {});
  });
  cleanupOwnSecretDates();
}

function bindCornerDatePlanner() {
  const overlay = $("#cornerdate-overlay");
  if (!overlay || overlay._bound) return;
  overlay._bound = true;
  $("#cd-cancel").addEventListener("click", closeCornerDatePlanner);
  $("#cd-save").addEventListener("click", saveCornerDate);
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !CD_DRAFT.saving) closeCornerDatePlanner(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) closeCornerDatePlanner(); });
}
document.addEventListener("DOMContentLoaded", bindCornerDatePlanner);

