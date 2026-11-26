/* ====================== PROFILE RESCUE ======================
   Who you are is an anonymous Firebase login stored in this browser. It is
   gone when the browser data is cleared, when Safari wipes a site after a week
   without a visit, when the app is added to the iPhone home screen (separate
   storage!) or on a new phone. The profile itself stays in the database.
   Among friends the simplest fix is the right one: on a new device you pick
   yourself from the list — one tap, no codes, no approval. The device that
   had the profile before is told and asks "who are you?" again.            */

// Last time a profile earned anything — helps to recognise "that was me".
function lastRewardTime(entry) {
  return rewardHistoryList(entry).reduce((max, h) => Math.max(max, Number(h && h.time) || 0), 0);
}
function sinceLabel(ms) {
  if (!ms) return "";
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days < 1) return T("heute aktiv", "active today");
  if (days < 2) return T("gestern aktiv", "active yesterday");
  if (days < 60) return T(`vor ${days} Tagen aktiv`, `active ${days} days ago`);
  return T(`vor ${Math.round(days / 30)} Monaten aktiv`, `active ${Math.round(days / 30)} months ago`);
}

async function adminUids() {
  try {
    const snap = await window.FB.get(window.FB.ref(window.FB.db, "config/admins"));
    return Object.entries(snap.val() || {}).filter(([, v]) => v === true).map(([k]) => k);
  } catch (err) { return []; }
}

/* ---- "Wer bist du?": tap your name, or type a new one — both one step ----
   "Es muss so einfach wie möglich sein, sein altes Profil aufzurufen,
   genauso wie neu anzufangen." Welcome mode shows both side by side. A tap
   on a name links this login to that profile (see linkToProfile): nothing
   moves, the other devices stay signed in, the next start goes straight in. */
async function openClaimOverlay(opts = {}) {
  const overlay = $("#claim-overlay");
  const list = $("#claim-list");
  if (!overlay || !list) return;
  const welcome = !!opts.welcome;
  overlay.classList.toggle("welcome", welcome);
  $("#claim-title").textContent = welcome ? T("👋 Wer bist du?", "👋 Who are you?") : T("👥 Profil wählen", "👥 Pick your profile");
  $("#claim-intro").textContent = welcome
    ? T("Einmal auswählen — beim nächsten Öffnen geht's direkt weiter. Auf deinen anderen Geräten bleibst du angemeldet.", "Pick once — next time the app opens straight away. You stay signed in on your other devices.")
    : T("Tipp auf deinen Namen — dieses Gerät gehört dann zu deinem Profil. Was du hier gesammelt hast, wird dazugezählt.", "Tap your name — this device then belongs to your profile. What you collected here is added.");
  const newBox = $("#claim-new");
  if (newBox) newBox.hidden = !welcome;
  const oldTitle = $("#claim-old-title");
  if (oldTitle) oldTitle.hidden = !welcome;
  const closeBtn = $("#claim-close");
  closeBtn.hidden = welcome;
  closeBtn.textContent = T("Schließen", "Close");
  overlay.style.display = "flex";
  const close = () => { overlay.style.display = "none"; };
  closeBtn.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay && !welcome) close(); };
  if (welcome) {
    const input = $("#claim-new-name");
    const go = () => {
      const name = String(input?.value || "").trim();
      if (!name) { input?.focus(); toast(T("Bitte gib einen Namen ein.", "Please enter a name.")); return; }
      saveNickname(name);
    };
    $("#claim-new-go").onclick = go;
    if (input) input.onkeydown = (e) => { if (e.key === "Enter") go(); };
  }
  if (!window.FB?.firebaseReady) { list.innerHTML = `<p class="claim-empty" style="color:var(--fg-dim);font-size:13px;">${T("Nur online verfügbar.", "Only available online.")}</p>`; return; }
  list.innerHTML = `<p class="claim-empty" style="color:var(--fg-dim);font-size:13px;">${T("Lade Profile…", "Loading profiles…")}</p>`;
  try {
    const data = (await readOnce("points", 10000)) || {};
    STATE.points = { ...(STATE.points || {}), ...data };
    const myRoot = myRootKey();
    const roots = new Set(Object.keys(data).map((k) => profileRoot(k)));
    const rows = [...roots]
      .filter((root) => root && root !== myRoot && !isMyKey(root))
      .map((root) => {
        const keys = [...identityKeysOf(root)];
        return {
          key: root,
          nickname: identityNickname(root) || "",
          total: identityRewardTotal("aura", root),
          last: Math.max(0, ...keys.map((k) => lastRewardTime(STATE.points?.[k])))
        };
      })
      .filter((r) => r.nickname && r.nickname.toLowerCase() !== "anonym" && r.total > 0)
      .sort((a, b) => a.nickname.localeCompare(b.nickname, "de", { sensitivity: "base" }));
    if (!rows.length) {
      list.innerHTML = `<p class="claim-empty" style="color:var(--fg-dim);font-size:13px;">${welcome ? T("Noch keine Profile — du bist die/der Erste! Einfach oben deinen Namen eingeben.", "No profiles yet — you're the first! Just type your name above.") : T("Keine anderen Profile gefunden.", "No other profiles found.")}</p>`;
      return;
    }
    list.innerHTML = `
      ${rows.length > 8 ? `<input type="search" id="claim-search" class="claim-search" placeholder="${T("Namen suchen…", "Search name…")}" autocomplete="off" />` : ""}
      ${rows.map((r) => {
        const { level } = getLevel(r.total);
        const tier = getLevelTier(level);
        return `<button class="claim-row" data-claim-key="${escapeHtml(r.key)}" data-claim-name="${escapeHtml(r.nickname.toLowerCase())}">
          <span class="claim-row-main">
            <span class="claim-row-name">${escapeHtml(r.nickname)}</span>
            <span class="claim-row-meta">${tier.emoji} Lv.${level}${welcome ? "" : ` · ${r.total} Aura${r.last ? " · " + sinceLabel(r.last) : ""}`}</span>
          </span>
          <span class="claim-row-cta">${T("Das bin ich", "That's me")} →</span>
        </button>`;
      }).join("")}`;
    $("#claim-search")?.addEventListener("input", (e) => {
      const q = String(e.target.value || "").trim().toLowerCase();
      list.querySelectorAll(".claim-row").forEach((row) => { row.style.display = !q || row.dataset.claimName.includes(q) ? "" : "none"; });
    });
    list.querySelectorAll("[data-claim-key]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = rows.find((x) => x.key === btn.dataset.claimKey);
        if (!row) return;
        if (!welcome) {
          // This device is already someone: say plainly what happens.
          const here = getCurrentAura();
          const ok = await showDialog({
            title: T(`Du bist „${row.nickname}“?`, `You are “${row.nickname}”?`),
            text: here > 50
              ? T(`„${STATE.nickname || "Anonym"}“ (${here} Aura) und „${row.nickname}“ werden zu einem Profil — nur wenn beides du bist.`, `“${STATE.nickname || "Anonym"}” (${here} aura) and “${row.nickname}” become one profile — only if both are you.`)
              : T("Dieses Gerät gehört dann zu deinem Profil. Deine anderen Geräte bleiben angemeldet.", "This device then belongs to your profile. Your other devices stay signed in."),
            okLabel: T("Ja, das bin ich", "Yes, that's me")
          });
          if (ok !== true) return;
        }
        btn.disabled = true;
        const ok = await linkToProfile(row.key, { welcome });
        if (!ok) btn.disabled = false;
      });
    });
  } catch (err) {
    console.warn("openClaimOverlay failed:", err);
    list.innerHTML = `<p class="claim-empty" style="color:var(--fg-dim);font-size:13px;">${T("Konnte Profile nicht laden.", "Could not load profiles.")}</p>`;
  }
}

// The device that had a profile notices when someone picks it on another
// device, and asks "who are you?" again instead of carrying on as a ghost.
var _ownLockUnsub = null;
function watchOwnProfileLock() {
  const uid = window.FB?.getAuthUid?.() || "";
  if (!uid || !window.FB?.firebaseReady || _ownLockUnsub) return;
  const { db, ref, onValue } = window.FB;
  _ownLockUnsub = onValue(ref(db, "profileLocks/" + uid), async (snap) => {
    const lock = snap.val();
    if (!lock || !lock.by || lock.by === uid || !STATE.nickname) return;
    // An older app version moved my profile to another login. If that login
    // carries my name now, it is me on another device: join it, no question.
    let other = null;
    try { other = await readOnce("points/" + lock.by, 6000); } catch (e) { /* offline */ }
    if (other && normalizeName(other.nickname) === normalizeName(STATE.nickname)) {
      if (await setProfileAlias(uid, other.aliasOf || lock.by)) {
        localStorage.setItem("cg.profileRoot", other.aliasOf || lock.by);
        rememberMyKey(lock.by);
        updateNicknameBar();
        if (STATE.view === "profile") renderProfile();
        return;
      }
    }
    const name = STATE.nickname;
    try { _ownLockUnsub(); } catch (e) {}
    _ownLockUnsub = null;
    STATE.nickname = "";
    localStorage.removeItem("cg.nickname");
    localStorage.removeItem("cg.profileLocked");
    if (STATE.points) delete STATE.points[uid];
    if (STATE.karmaPoints) delete STATE.karmaPoints[uid];
    savePoints();
    saveKarmaPoints();
    if (window.FB?.firebaseReady) window.FB.remove(window.FB.ref(window.FB.db, "presence/" + uid)).catch(() => {});
    updateNicknameBar();
    if (STATE.view === "profile") renderProfile();
    toast(T(`📲 „${escapeHtml(name)}“ ist jetzt auf einem anderen Gerät. Wer bist du hier?`, `📲 “${escapeHtml(name)}” is on another device now. Who are you here?`));
    setTimeout(() => openClaimOverlay({ welcome: true }), 800);
  }, () => { _ownLockUnsub = null; });
}

/* One-shot read that cannot hang forever. A plain get() was seen to stall
   right after listeners had been refused (no access yet) and re-attached;
   a one-shot listener is raced against it, with a time limit on top.   */
function readOnce(path, ms = 7000) {
  const { db, ref, get, onValue } = window.FB;
  return new Promise((resolve, reject) => {
    let done = false, fails = 0;
    const ok = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const bad = (err) => { if (!done && ++fails >= 2) { done = true; clearTimeout(timer); reject(err); } };
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error("read timeout: " + path)); } }, ms);
    get(ref(db, path)).then((snap) => ok(snap.val()), bad);
    try { onValue(ref(db, path), (snap) => ok(snap.val()), bad, { onlyOnce: true }); } catch (err) { bad(err); }
  });
}
// Same for writes: never wait forever on a stalled acknowledgement.
function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout: " + label)), ms))]);
}

