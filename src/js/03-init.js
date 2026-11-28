/* ====================== INIT ====================== */
document.addEventListener("DOMContentLoaded", () => {
  checkAccessGranted();
  checkNickname();
  renderCards();
  bindTabs();
  loadDistricts();
  $("#district-filter")?.addEventListener("change", (e) => setDistrictFilter(e.target.value));
  $("#district-toggle")?.addEventListener("click", () => {
    localStorage.setItem("cg.districtsOn", districtsVisible() ? "0" : "1");
    drawDistrictLayer();
  });
  updateDistrictToggle();
  // "Map muss landing page werden": start on the map.
  STATE.view = "map";
  document.body.classList.add("map-first", "home-view");
  setTimeout(() => { if (!STATE.mainMap) initMainMap(); setTimeout(() => STATE.mainMap?.invalidateSize(), 80); }, 0);
  bindGeo();
  bindModal();
  bindDetailOverlay();
  bindLightbox();
  bindCheckinPrompt();
  bindNicknameBar();
  bindChatUI();
  updateCounts();
  initFirebase();
  bindGlobalXp();
  setupServiceWorker();
  openPendingSharedCorner();
  openPendingProfile();
  handlePendingJoin();
  if (STATE.pendingInviteName) {
    toast(`🍻 ${T("Einladung von", "Invitation from", "Invitación de")} <strong>${escapeHtml(STATE.pendingInviteName)}</strong>`);
    clearHandledQueryParam(INVITE_PARAM);
  }
  // Start cooldown display if active
  if (STATE.lastCheckinTime && (Date.now() - STATE.lastCheckinTime) < COOLDOWN_MS) {
    startCooldownDisplay();
  }
  // A check-in restored from the last session may be from yesterday.
  autoCheckoutIfStale();
});

function checkNickname() {
  if (!STATE.nickname) {
    if (STATE.pendingInviteName) $("#nickname-input").placeholder = `z.B. ${STATE.pendingInviteName}s Crew`;
    $("#nickname-save").addEventListener("click", saveNickname);
    $("#nickname-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveNickname();
    });
    maybeShowNicknamePrompt();
  }
}

// Onboarding chain: the nickname prompt only appears once the access gate is
// passed and the welcome-claim overlay is closed — never stacked on top.
function maybeShowNicknamePrompt() {
  if (STATE.nickname) return;
  if (window.FB?.firebaseReady && localStorage.getItem("cg.accessGranted") !== "1") return;
  if ($("#claim-overlay")?.style.display === "flex") return;
  if ($("#access-prompt")?.style.display === "flex") return;
  // Online: one screen for both — tap your name, or type a new one.
  if (window.FB?.firebaseReady) { openClaimOverlay({ welcome: true }); return; }
  $("#nickname-prompt").style.display = "flex";
  setTimeout(() => $("#nickname-input")?.focus(), 100);
}

