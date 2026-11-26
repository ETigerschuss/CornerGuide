/* ====================== ACCESS CODE GATE ====================== */
// Listeners attached before the access grant may have been killed by
// permission_denied (depending on rules). Re-attach once after a successful
// grant so a brand-new user sees all shared data without restarting the app.
var _sharedListenersReattached = false;
function reattachSharedListenersAfterGrant() {
  if (_sharedListenersReattached || !window.FB?.firebaseReady) return;
  _sharedListenersReattached = true;
  [listenSharedCorners, listenComments, listenBarometer, listenVisits, listenEmojiVotes,
   listenPhotos, listenPoints, listenKarmaPoints, listenTeams, listenCornerStatuses, listenCaptured,
   listenCornerVotes, listenFriendPresence, listenDirectMessages, listenCustomTeams, listenSupplyRuns, listenGossip, listenCornerDates, listenCornerFacts]
    .forEach((fn) => { try { if (typeof fn === "function") fn(); } catch (err) { console.warn("reattach failed:", err); } });
  checkBackendFeatures(true);
}
// A failed feature check (e.g. offline at start) is retried when the app comes back.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && typeof checkBackendFeatures === "function" && !_backendFeatures.ok) checkBackendFeatures(true);
});

// The access gate's buttons, bound once (also when the prompt only shows up
// later because the grant turned out to be missing).
var _accessPromptBound = false;
function bindAccessPrompt() {
  if (_accessPromptBound) return;
  _accessPromptBound = true;
  const input = $("#access-code-input");
  const btn = $("#access-code-save");
  const errEl = $("#access-error");
  btn.addEventListener("click", () => submitAccessCode());
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submitAccessCode(); });
  // Install hint: on iOS, home-screen install is required for push notifications.
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const inStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const hint = $("#access-install-hint");
  if (hint && !inStandalone) {
    hint.innerHTML = isIOS
      ? "📲 <strong>iPhone-Tipp:</strong> Safari öffnen → Teilen-Symbol <span style=\"font-size:14px;\">&#x1F5D2;</span> → &bdquo;Zum Home-Bildschirm&ldquo;. Nur als installierte App gibt&#39;s Push-Nachrichten!"
      : "📲 <strong>Tipp:</strong> Füg die App über das Browser-Menü zum Startbildschirm hinzu — für Push-Nachrichten und schnellen Zugriff.";
  }
  // Recovery paths so a new browser/device doesn't need a fresh invite code.
  $("#access-recover-code")?.addEventListener("click", async () => {
    const code = await appPrompt("Recovery-Code", "", "CODE", { codeStyle: true, text: "Übernimmt dein Profil und deinen Zugang in einem Schritt.", okLabel: "Übernehmen" });
    if (code) await claimRecoveryCode(code);
  });
  $("#access-recover-google")?.addEventListener("click", async () => {
    try {
      await window.FB.linkGoogle();
      await refreshAccessForCurrentUser();
      const uid = window.FB.getAuthUid?.();
      if (uid) loadProfileFromCloud(uid);
      if (localStorage.getItem("cg.accessGranted") === "1") toast("✅ Willkommen zurück!");
      else toast("Angemeldet — aber dieses Google-Konto hat noch keinen Zugang. Bitte Code eingeben.");
    } catch (err) {
      if (err?.code === "auth/popup-closed-by-user") return;
      toast(`Google-Login fehlgeschlagen (${escapeHtml(err?.code || "?")}): ${escapeHtml(err?.message || "")}`);
    }
  });
}

function checkAccessGranted() {
  bindAccessPrompt();
  if (!window.FB?.firebaseReady) return;   // offline/dev mode: no gate
  // localStorage only remembers that SOME login had access here. Verify the
  // current one against the database once auth is ready (see verifyAccessGrant).
  if (localStorage.getItem("cg.accessGranted") === "1") return;

  // Async: wait for auth UID, then verify Firebase flag
  window.FB.authReady.then((uid) => {
    if (!uid) {
      showAccessPrompt();
      return;
    }
    const { db, ref, get } = window.FB;
    get(ref(db, "accessGranted/" + uid)).then((snap) => {
      if (snap.val() !== null) {
        localStorage.setItem("cg.accessGranted", "1");
        localStorage.setItem("cg.accessCode", String(snap.val()));
        // Already granted – make sure the prompt stays hidden, continue onboarding
        maybeShowNicknamePrompt();
        return;
      }
      showAccessPrompt();
    }).catch((err) => {
      console.warn("checkAccessGranted: failed to read accessGranted flag:", err);
      // Network error – show prompt to be safe
      showAccessPrompt();
    });
  });
}

function showAccessPrompt(reason = "") {
  bindAccessPrompt();
  const text = $("#access-text");
  if (text) text.textContent = reason === "missing"
    ? "Für dieses Gerät ist dein Zugang nicht mehr hinterlegt (z. B. nach einem Login-Wechsel) — darum ging Speichern nicht. Gib den Einladungscode aus der Gruppe einmal neu ein, dein Profil bleibt erhalten."
    : "Gib den Einladungscode ein, um Zugang zu erhalten.";
  $("#access-prompt").style.display = "flex";
  setTimeout(() => $("#access-code-input").focus(), 100);
}

/* "Ich konnte keinen neuen Corner hinzufügen wegen irgendeiner Firebase-
   Autorisierung": the app trusted a remembered "access granted" although the
   database had no grant for the CURRENT login (new login after a Google link,
   a reset browser, grants from an older version). Every write then failed.
   Now the grant is checked once per login; a known code repairs it silently,
   otherwise the code is asked for again — once.                          */
var _accessVerified = {};
async function verifyAccessGrant(opts = {}) {
  const uid = window.FB?.getAuthUid?.() || "";
  if (!uid || !window.FB?.firebaseReady) return false;
  if (_accessVerified[uid] === true && !opts.interactive) return true;
  const { db, ref, get, set } = window.FB;
  let val;
  try { val = (await get(ref(db, "accessGranted/" + uid))).val(); }
  catch (err) { return false; }   // offline: decide later
  if (val) {
    _accessVerified[uid] = true;
    localStorage.setItem("cg.accessGranted", "1");
    localStorage.setItem("cg.accessCode", String(val));
    setTimeout(linkMyEarlierLogins, 1500);
    return true;
  }
  const known = localStorage.getItem("cg.accessCode");
  if (known) {
    try {
      await set(ref(db, "accessGranted/" + uid), known);
      _accessVerified[uid] = true;
      localStorage.setItem("cg.accessGranted", "1");
      reattachSharedListenersAfterGrant();
      console.log("Zugang für diesen Login automatisch wiederhergestellt.");
      setTimeout(linkMyEarlierLogins, 1500);
      return true;
    } catch (err) { console.warn("stored access code no longer valid:", err); }
  }
  // No grant and nothing to repair it with. Someone who had access here before
  // is asked once (profile and data stay); brand-new people get the normal
  // invitation prompt from checkAccessGranted() instead of this explanation.
  if (localStorage.getItem("cg.accessGranted") === "1") {
    localStorage.removeItem("cg.accessGranted");
    showAccessPrompt("missing");
  }
  return false;
}

async function submitAccessCode() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, set } = window.FB;
  const input = $("#access-code-input");
  const btn = $("#access-code-save");
  const errEl = $("#access-error");
  // Sanitize: strip characters illegal in Firebase paths and normalise to uppercase
  const code = input.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!code) { errEl.textContent = "Bitte einen Code eingeben."; return; }

  btn.disabled = true;
  errEl.textContent = "";

  const uid = window.FB.getAuthUid();
  if (!uid) {
    errEl.textContent = "Kein Anmelde-Status. Bitte Seite neu laden.";
    btn.disabled = false;
    return;
  }

  try {
    // Write the code as the value; the Firebase .validate rule confirms it exists
    // under accessCodes/{code} before allowing the write.
    await set(ref(db, "accessGranted/" + uid), code);
    localStorage.setItem("cg.accessGranted", "1");
    localStorage.setItem("cg.accessCode", code);
    _accessVerified[uid] = true;
    $("#access-prompt").style.display = "none";
    reattachSharedListenersAfterGrant();
    setTimeout(linkMyEarlierLogins, 1500);
    if (STATE.nickname) {
      // Someone who already has a profile here only re-confirmed access.
      toast(`✅ Zugang bestätigt — weiter geht's, ${escapeHtml(STATE.nickname)}!`);
      broadcastPresence();
      runPendingLinkActions();
    } else {
      toast("✅ Zugang gewährt – willkommen!");
      // Returning friends pick themselves right away instead of starting fresh.
      setTimeout(() => openClaimOverlay({ welcome: true }), 500);
    }
  } catch (err) {
    console.warn("Access code validation failed:", err);
    errEl.textContent = "Ungültiger Code. Bitte erneut versuchen.";
    btn.disabled = false;
    input.focus();
  }
}

