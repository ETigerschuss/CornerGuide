/* ====================== MODAL / ADD-SPOT ====================== */
function bindModal() {
  $("#fab").addEventListener("click", openModal);
  $("#modal-cancel").addEventListener("click", closeModal);
  $("#modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
  $("#modal-save").addEventListener("click", saveNewSpot);
  $("#use-location").addEventListener("click", fillCurrentLocation);
  // Typed coordinates move the pin; a typed Stadtteil is never overwritten.
  ["#f-lat", "#f-lng"].forEach((sel) => $(sel).addEventListener("change", () => {
    const lat = parseFloat($("#f-lat").value), lng = parseFloat($("#f-lng").value);
    if (!isNaN(lat) && !isNaN(lng) && _pinMap) { setSpotPin(lat, lng, { keepFields: true }); _pinMap.setView([lat, lng], Math.max(_pinMap.getZoom(), 16)); }
  }));
  $("#f-area").addEventListener("input", () => { $("#f-area").dataset.auto = "0"; });
  // A typed name is yours: a new pin no longer replaces it with an idea.
  $("#f-name").addEventListener("input", () => { SPOT_DRAFT.nameAuto = false; $$("#spot-name-chips .spot-chip").forEach((x) => x.classList.remove("on")); });
}

function openModal() {
  ["f-name", "f-area", "f-desc", "f-tags", "f-lat", "f-lng"].forEach((id) => { $("#" + id).value = ""; });
  $("#f-area").dataset.auto = "";
  resetSpotDraft();
  const vbox = $("#spot-visibility");
  if (vbox) {
    vbox.innerHTML = visibilityPickerHtml("all");
    $("#spot-visibility-hint").textContent = visibilityHint("all");
    bindVisibilityPicker(vbox, (v) => { SPOT_DRAFT.visibility = v; $("#spot-visibility-hint").textContent = visibilityHint(v); });
  }
  $("#modal-backdrop").classList.add("open");
  mountPinPicker();
}
function closeModal() { $("#modal-backdrop").classList.remove("open"); }

function fillCurrentLocation() {
  if (!navigator.geolocation) { toast("Geolocation nicht unterstützt."); return; }
  $("#use-location").textContent = "📍 Suche…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $("#f-lat").value = pos.coords.latitude.toFixed(6);
      $("#f-lng").value = pos.coords.longitude.toFixed(6);
      if (_pinMap) { setSpotPin(pos.coords.latitude, pos.coords.longitude); _pinMap.setView([pos.coords.latitude, pos.coords.longitude], 17); }
      $("#use-location").textContent = "📍 Übernommen";
      setTimeout(() => $("#use-location").textContent = "📍 Aktuellen Standort verwenden", 2000);
    },
    () => { $("#use-location").textContent = "📍 Aktuellen Standort verwenden"; toast("Standort nicht verfügbar."); },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

// saveNewSpot defined below in enhanced section

function deleteCustomSpot(id) {
  if (window.FB?.firebaseReady) {
    const { db, ref, remove } = window.FB;
    remove(ref(db, "corners/" + id));
  } else {
    STATE.customSpots = STATE.customSpots.filter((s) => s.id !== id);
    saveCustomSpots();
  }
  localStorage.removeItem("cg.photo." + id);
  renderCards();
  updateCounts();
  rebuildMainMarkers();
  toast("Spot gelöscht.");
}

