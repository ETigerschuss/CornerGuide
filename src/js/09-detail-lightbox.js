/* ====================== DETAIL OVERLAY ====================== */
function bindDetailOverlay() {
  $("#detail-back").addEventListener("click", closeDetail);
}

function getVisitCount(cornerId) {
  if (window.FB?.firebaseReady) {
    return Object.keys(STATE.visits?.[cornerId] || {}).length;
  }
  return (loadLocalVisits()[cornerId] || []).length;
}

function renderFeedbackSummary(cornerId) {
  const feedback = STATE.checkinFeedback[cornerId];
  if (!feedback || !Object.keys(feedback).length) return "";

  const entries = Object.values(feedback);
  const kioskYes = entries.filter(f => f.kiosk === "ja").length;
  const toiletYes = entries.filter(f => f.toilet === "direkt" || f.toilet === "nah" || f.toilet === "ja").length;
  const greenVery = entries.filter(f => f.green === "sehr").length;
  const busyHigh = entries.filter(f => f.busy === "viel").length;
  const highlights = entries.filter(f => f.highlights).map(f => f.highlights);

  let html = `<div class="feedback-box">
    <p class="feedback-title">📋 Community-Feedback (${entries.length} Bewertungen)</p>
    <div class="feedback-tags">
      ${kioskYes > 0 ? `<span class="spot-icon"><span class="icon-emoji">🏪</span><span class="icon-label">Kiosk: ${kioskYes}x ja</span></span>` : ""}
      ${toiletYes > 0 ? `<span class="spot-icon"><span class="icon-emoji">🚻</span><span class="icon-label">Toilette: ${toiletYes}x in der Nähe</span></span>` : ""}
      ${greenVery > 0 ? `<span class="spot-icon"><span class="icon-emoji">🌿</span><span class="icon-label">Grün: ${greenVery}x sehr</span></span>` : ""}
      ${busyHigh > 0 ? `<span class="spot-icon"><span class="icon-emoji">🚶</span><span class="icon-label">Belebt: ${busyHigh}x</span></span>` : ""}
    </div>
    ${highlights.length > 0 ? `<div class="feedback-highlights"><p class="feedback-highlights-title">💬 Highlights:</p>${highlights.slice(0, 3).map(h => `<p class="feedback-quote">"${escapeHtml(h)}"</p>`).join("")}</div>` : ""}
  </div>`;
  return html;
}

function feedbackCount(cornerId) {
  return Object.keys(STATE.checkinFeedback?.[cornerId] || {}).length;
}

function refreshAllFeedbackSections() {
  $$(".detail-feedback").forEach((section) => {
    const cornerId = section.dataset.cornerId;
    section.innerHTML = renderFeedbackSummary(cornerId);
  });
  if (STATE.view === "list") renderCards();
}

function listenCheckinFeedback() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  onValue(ref(db, "checkinFeedback"), (snapshot) => {
    STATE.checkinFeedback = snapshot.val() || {};
    refreshAllFeedbackSections();
  });
}

/* ====================== LIGHTBOX ====================== */
function bindLightbox() {
  $("#lightbox-close").addEventListener("click", closeLightbox);
  $("#lightbox-close-btn").addEventListener("click", closeLightbox);
  $("#lightbox-download").addEventListener("click", downloadLightboxPhoto);
  $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });
}

function closeLightbox() {
  $("#lightbox").classList.remove("open");
}

function downloadLightboxPhoto() {
  const src = $("#lightbox-img").src;
  if (!src) return;
  const a = document.createElement("a");
  a.href = src;
  a.download = "corner-photo-" + Date.now() + ".jpg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast("Foto wird heruntergeladen ⬇️");
}

/* ====================== FIRST CHECK-IN PROMPT ====================== */
let pendingCheckinCorner = null;

function bindCheckinPrompt() {
  $("#checkin-skip").addEventListener("click", () => {
    $("#checkin-prompt").classList.remove("open");
    pendingCheckinCorner = null;
  });
  $("#checkin-submit").addEventListener("click", submitCheckinFeedback);
}

function getScaleValue(field) {
  const el = document.querySelector(`#checkin-prompt .scale-group[data-field="${field}"] .scale-btn.selected`);
  return el ? el.dataset.value : "";
}
function clearCheckinScales() {
  document.querySelectorAll("#checkin-prompt .scale-btn.selected").forEach((b) => b.classList.remove("selected"));
}
let _checkinScalesBound = false;
function bindCheckinScales() {
  if (_checkinScalesBound) return;
  const container = $("#checkin-prompt");
  if (!container) return;
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".scale-btn");
    if (!btn) return;
    const group = btn.closest(".scale-group");
    group.querySelectorAll(".scale-btn").forEach((b) => b.classList.toggle("selected", b === btn));
  });
  _checkinScalesBound = true;
}

function showCheckinPrompt(cornerId) {
  pendingCheckinCorner = cornerId;
  bindCheckinScales();
  clearCheckinScales();
  $("#checkin-highlights").value = "";
  $("#checkin-prompt").classList.add("open");
}

function submitCheckinFeedback() {
  if (!pendingCheckinCorner) return;
  const feedback = {
    kiosk: getScaleValue("kiosk"),
    toilet: getScaleValue("toilet"),
    green: getScaleValue("green"),
    busy: getScaleValue("busy"),
    highlights: $("#checkin-highlights").value.trim(),
    user: STATE.nickname || "Anonym",
    time: Date.now()
  };

  if (!STATE.checkinFeedback[pendingCheckinCorner]) STATE.checkinFeedback[pendingCheckinCorner] = {};
  const key = STATE.nickname + "-" + Date.now();
  STATE.checkinFeedback[pendingCheckinCorner][key] = feedback;
  saveCheckinFeedback();

  if (window.FB?.firebaseReady) {
    const { db, ref, set } = window.FB;
    set(ref(db, "checkinFeedback/" + pendingCheckinCorner + "/" + key), feedback);
  }

  $("#checkin-prompt").classList.remove("open");
  toast("Danke für dein Feedback! 🙌 (+5 Punkte)");
  addPoints(STATE.nickname, 5, "Check-in Feedback");
  refreshAllFeedbackSections();
  pendingCheckinCorner = null;
}

