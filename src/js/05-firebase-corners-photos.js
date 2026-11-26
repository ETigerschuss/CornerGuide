/* ====================== FIREBASE REALTIME ====================== */
/* ====================== SHARED CORNERS (Firebase) ====================== */
function listenSharedCorners() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  const cornersRef = ref(db, "corners");
  onValue(cornersRef, (snapshot) => {
    const data = snapshot.val() || {};
    STATE.customSpots = Object.values(data);
    renderCards();
    updateCounts();
    rebuildMainMarkers();
    openPendingSharedCorner();
  });
}

/* ====================== PHOTOS (Firebase) ====================== */
// Only the covers at startup (photoCovers); a corner's photos load with its
// detail and the full pictures when opened (35-slim-data.js).
function listenPhotos(attempt = 0) {
  if (!window.FB?.firebaseReady) return;
  listenPhotoCovers(() => retryListenerAfterAuth(listenPhotos, attempt));
}

function getPhotos(cornerId) {
  if (window.FB?.firebaseReady) {
    return Object.values(STATE.photos?.[cornerId] || {}).sort((a, b) => b.time - a.time);
  }
  try {
    const raw = localStorage.getItem("cg.photos." + cornerId);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

var _storageUnavailable = false;
function savePhoto(cornerId, dataUrl, caption) {
  const photo = {
    src: dataUrl,
    author: STATE.nickname || "Anonym",
    authorId: (typeof currentUserKey === "function" ? currentUserKey() : "") || (STATE.nickname || "Anonym"),
    authorTeam: STATE.team || "",
    time: Date.now(),
    caption: caption || "",
    ratings: {}
  };

  if (window.FB?.firebaseReady) {
    const { db, ref, push, set } = window.FB;
    const newRef = push(ref(db, "photos/" + cornerId));
    const key = newRef.key || ("p" + Date.now());
    // The picture goes to Storage if the project has it, otherwise into its own
    // node (photoData) — never into the photo list, which every detail loads.
    // A small thumbnail rides along for the cards and the gallery.
    return (async () => {
      const inline = typeof dataUrl === "string" && dataUrl.startsWith("data:");
      if (inline) {
        const thumb = await makeThumbDataUrl(dataUrl);
        if (thumb) photo.thumb = thumb;
        try {
          if (!window.FB.uploadImage || _storageUnavailable) throw new Error("storage unavailable");
          photo.src = await withTimeout(window.FB.uploadImage(`cornerPhotos/${cornerId}/${key}.jpg`, dataUrl), 20000, "photo upload");
          photo.storage = true;
        } catch (err) {
          _storageUnavailable = true;   // no bucket (Storage not activated) — don't wait for it again this session
          await set(ref(db, `photoData/${cornerId}/${key}`), { src: dataUrl });
          delete photo.src;
        }
      }
      await set(newRef, photo);
      return key;
    })().catch((err) => { console.warn("savePhoto failed:", err); toast(T("Foto konnte nicht gespeichert werden.", "Could not save the photo.")); });
  } else {
    const photos = getPhotos(cornerId);
    photo.id = "photo-" + Date.now();
    photos.push(photo);
    // Keep only last 10 photos per spot in localStorage
    const trimmed = photos.slice(-10);
    localStorage.setItem("cg.photos." + cornerId, JSON.stringify(trimmed));
    refreshAllPhotoGalleries();
  }
}

function compressImageFile(file, options = {}) {
  const parsedMaxDim = parseInt(options.maxDim, 10);
  const parsedQuality = parseFloat(options.quality);
  const maxDim = Number.isFinite(parsedMaxDim) && parsedMaxDim > 0 ? parsedMaxDim : 800;
  const quality = Number.isFinite(parsedQuality) && parsedQuality > 0 && parsedQuality <= 1 ? parsedQuality : 0.7;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const longest = Math.max(img.width, img.height);
        if (!Number.isFinite(longest) || longest <= 0) {
          reject(new Error("Bilddimensionen konnten nicht bestimmt werden."));
          return;
        }
        const scale = Math.min(1, maxDim / longest);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Bildformat wird nicht unterstützt oder Datei ist beschädigt."));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error("Bilddatei konnte nicht gelesen werden (ggf. beschädigt oder nicht zugreifbar)."));
    reader.readAsDataURL(file);
  });
}

// Firebase paths reject . # $ [ ] / — an unsanitised nickname made the rating
// write fail silently, so the star never lit up ("it goes back").
function photoRatingKey() {
  return String(STATE.nickname || "").replace(/[.#$\[\]/]/g, "_");
}

function ratePhoto(cornerId, photoKey, score) {
  if (!STATE.nickname) { toast("Bitte gib zuerst einen Namen ein."); return; }

  if (window.FB?.firebaseReady) {
    const { db, ref, set } = window.FB;
    // Optimistic local update so the star reacts instantly, even before the
    // listener round-trip (and it survives a slow connection).
    if (STATE.photos?.[cornerId]?.[photoKey]) {
      const p = STATE.photos[cornerId][photoKey];
      if (!p.ratings) p.ratings = {};
      p.ratings[photoRatingKey()] = score;
    }
    refreshAllPhotoGalleries();
    Promise.resolve(set(ref(db, "photos/" + cornerId + "/" + photoKey + "/ratings/" + photoRatingKey()), score))
      .catch((err) => { console.warn("ratePhoto write failed:", err); toast("⚠️ Bewertung konnte nicht gespeichert werden."); });
  } else {
    try {
      const photos = getPhotos(cornerId);
      const photo = photos.find((p) => p.id === photoKey);
      if (photo) {
        if (!photo.ratings) photo.ratings = {};
        photo.ratings[photoRatingKey()] = score;
        localStorage.setItem("cg.photos." + cornerId, JSON.stringify(photos));
        refreshAllPhotoGalleries();
      }
    } catch (e) {}
  }
}

function refreshAllPhotoGalleries() {
  $$(".photo-gallery").forEach((section) => {
    const cornerId = section.dataset.cornerId;
    renderPhotoGallery(cornerId, section);
  });
}

