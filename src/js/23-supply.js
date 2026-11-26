/* ====================== NACHSCHUB (supply runs) ======================
   Someone walks to the kiosk and brings drinks back. They announce it, the
   people at the corner confirm it, and every confirmation pays out a lot of
   karma — this is the single most valuable thing you can do for your crew. */
const SUPPLY_KARMA_PER_CONFIRM = 40;

function announceSupplyRun(cornerId) {
  if (!STATE.nickname) { toast("Bitte zuerst einen Namen wählen."); return; }
  if (!window.FB?.firebaseReady) { toast("Nachschub braucht eine Verbindung."); return; }
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner) return;
  const { db, ref, push, set } = window.FB;
  const runRef = push(ref(db, "supplyRuns/" + cornerId));
  set(runRef, {
    byId: currentUserKey(),
    byName: STATE.nickname,
    byTeam: STATE.team || "",
    at: Date.now(),
    confirms: {}
  }).then(() => {
    toast("🛒 <strong>Nachschub angekündigt!</strong><br><span style=\"font-size:11px;opacity:0.8;\">Lass es dir von den anderen bestätigen.</span>");
    // tell everyone at the corner
    try {
      set(push(ref(db, "notify")), {
        type: "supply-run",
        title: "🛒 Nachschub unterwegs!",
        body: `${STATE.nickname} bringt Nachschub zum ${corner.name}!`,
        fromId: currentUserKey(),
        fromTeam: STATE.team || "",
        createdAt: Date.now()
      });
    } catch (e) {}
  }).catch((err) => { console.warn("announceSupplyRun failed:", err); toast("Konnte nicht angekündigt werden."); });
}

function confirmSupplyRun(cornerId, runId, run) {
  if (!STATE.nickname || !window.FB?.firebaseReady) return;
  const me = currentUserKey();
  if (run.byId === me) { toast("Du kannst dich nicht selbst bestätigen 😉"); return; }
  if (run.confirms && run.confirms[me]) { toast("Schon bestätigt ✓"); return; }
  const { db, ref, set } = window.FB;
  set(ref(db, `supplyRuns/${cornerId}/${runId}/confirms/${me}`), { name: STATE.nickname, at: Date.now() })
    .then(() => {
      // the bringer gets the karma, not the confirmer
      addKarmaPoints(run.byId, SUPPLY_KARMA_PER_CONFIRM, `Nachschub gebracht (bestätigt von ${STATE.nickname})`, run.byName);
      addXp(5, "Nachschub bestätigt");
      toast(`✅ Bestätigt — <strong>${escapeHtml(run.byName)}</strong> bekommt ${SUPPLY_KARMA_PER_CONFIRM} Karma!`);
      try {
        set(window.FB.push(ref(db, "notify")), {
          type: "supply-confirmed",
          title: "🎉 Nachschub bestätigt!",
          body: `${STATE.nickname} hat bestätigt: ${run.byName} hat Nachschub gebracht (+${SUPPLY_KARMA_PER_CONFIRM} Karma)`,
          fromId: currentUserKey(),
          fromTeam: STATE.team || "",
          createdAt: Date.now()
        });
      } catch (e) {}
    })
    .catch((err) => { console.warn("confirmSupplyRun failed:", err); toast("Bestätigen fehlgeschlagen."); });
}

// A listener attached before sign-in finished gets cancelled by the rules and
// used to stay dead until the next app start. Re-attach once auth is there.
function retryListenerAfterAuth(fn, attempt) {
  if (attempt >= 3) return;
  setTimeout(() => { if (window.FB?.getAuthUid?.()) fn(attempt + 1); }, 1500 * (attempt + 1));
}

var _supplyListening = false;
function listenSupplyRuns(attempt = 0) {
  if (!window.FB?.firebaseReady || _supplyListening) return;
  _supplyListening = true;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "supplyRuns"), (snap) => {
    STATE.supplyRuns = snap.val() || {};
    const open = $("#detail-overlay")?.classList.contains("open");
    if (open && STATE.detailCornerId) refreshSupplySection(STATE.detailCornerId);
    // My own run got a new confirmation? Celebrate.
    celebrateOwnSupplyConfirms();
  }, () => { _supplyListening = false; retryListenerAfterAuth(listenSupplyRuns, attempt); });
}

var _seenSupplyConfirms = null;
function celebrateOwnSupplyConfirms() {
  const me = currentUserKey();
  if (!me) return;
  let count = 0;
  Object.values(STATE.supplyRuns || {}).forEach((runs) => {
    Object.values(runs || {}).forEach((run) => {
      if (run && run.byId === me) count += Object.keys(run.confirms || {}).length;
    });
  });
  if (_seenSupplyConfirms === null) { _seenSupplyConfirms = count; return; }  // first load: no replay
  if (count > _seenSupplyConfirms) {
    const gained = (count - _seenSupplyConfirms) * SUPPLY_KARMA_PER_CONFIRM;
    _seenSupplyConfirms = count;
    showRewardCelebration(gained, "karma");
  } else {
    _seenSupplyConfirms = count;
  }
}

// Recent, still-relevant supply runs at a corner (last 2 hours).
function activeSupplyRuns(cornerId) {
  const runs = STATE.supplyRuns?.[cornerId] || {};
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  return Object.entries(runs)
    .map(([id, run]) => ({ id, ...run }))
    .filter((r) => (r.at || 0) > cutoff)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

function refreshSupplySection(cornerId) {
  const box = document.querySelector(`.supply-section[data-corner-id="${cornerId}"]`);
  if (!box) return;
  const me = currentUserKey();
  const iAmHere = STATE.manualCheckinId === cornerId || STATE.atCornerId === cornerId;
  const runs = activeSupplyRuns(cornerId);
  const runsHtml = runs.map((r) => {
    const confirms = Object.values(r.confirms || {});
    const mine = r.byId === me;
    const alreadyConfirmed = !!(r.confirms || {})[me];
    return `<div class="supply-run ${mine ? "mine" : ""}">
      <div class="sr-head">🛒 <strong>${escapeHtml(r.byName || "Jemand")}</strong> hat Nachschub gebracht${mine ? " (du)" : ""}</div>
      <div class="sr-meta">${confirms.length} Bestätigung${confirms.length === 1 ? "" : "en"}${confirms.length ? " · " + confirms.map((c) => escapeHtml(c.name || "?")).join(", ") : ""} · ${confirms.length * SUPPLY_KARMA_PER_CONFIRM} Karma</div>
      ${!mine && iAmHere ? `<button class="action-btn primary sr-confirm" data-run="${escapeHtml(r.id)}" ${alreadyConfirmed ? "disabled" : ""}>${alreadyConfirmed ? "✓ Bestätigt" : `👍 Ja, hat mitgebracht! (+${SUPPLY_KARMA_PER_CONFIRM} für ${escapeHtml(r.byName || "")})`}</button>` : ""}
    </div>`;
  }).join("");
  box.innerHTML = `
    <h3 class="supply-title">🛒 Nachschub</h3>
    ${iAmHere ? `<button class="action-btn sr-announce">🛒 Ich hab Nachschub mitgebracht!</button>` : `<p class="sr-hint">Check hier ein, um Nachschub anzukündigen oder zu bestätigen.</p>`}
    ${runsHtml || `<p class="sr-hint">Noch keiner war am Kiosk. Sei der Held. 🦸</p>`}`;
  box.querySelector(".sr-announce")?.addEventListener("click", () => announceSupplyRun(cornerId));
  box.querySelectorAll(".sr-confirm").forEach((btn) => btn.addEventListener("click", () => {
    const run = runs.find((r) => r.id === btn.dataset.run);
    if (run) confirmSupplyRun(cornerId, run.id, run);
  }));
}

// A checked-in user can broadcast a "I need resupply" ping to everyone.
function broadcastSupplyRequest() {
  if (!STATE.nickname) { toast("Bitte zuerst einen Namen wählen."); return; }
  if (!window.FB?.firebaseReady) { toast("Nachschub-Ruf braucht eine Verbindung."); return; }
  const cid = STATE.manualCheckinId || STATE.atCornerId;
  const corner = cid ? getAllCorners().find((c) => c.id === cid) : null;
  const where = corner ? ` am ${corner.name}` : "";
  try {
    const { db, ref, push, set } = window.FB;
    set(push(ref(db, "notify")), {
      type: "supply",
      title: "🆘 Nachschub gesucht!",
      body: `${STATE.nickname} braucht Nachschub${where}! 🍺🛒`,
      query: corner ? `?corner=${encodeURIComponent(corner.id)}` : `?profile=${encodeURIComponent(currentUserKey())}`,
      fromId: currentUserKey(),
      fromTeam: STATE.team || "",
      createdAt: Date.now()
    });
    toast("🆘 Nachschub-Ruf an alle gesendet!");
    addXp(3, "Nachschub-Ruf");
    unlockAchievement("first-supply", "Retter in der Not", "🆘", 15);
  } catch (err) { console.warn("broadcastSupplyRequest failed:", err); toast("Konnte nicht senden."); }
}

