/* ====================== POINTS (Firebase) ====================== */
function renderPhotoGallery(cornerId, container) {
  // The grid is a horizontal scroller; replacing innerHTML resets scrollLeft to
  // 0, which made the gallery jump back to the first photo on every rating.
  const prevScroll = container.querySelector(".gallery-grid")?.scrollLeft || 0;
  let photos;
  if (window.FB?.firebaseReady) {
    const raw = STATE.photos?.[cornerId] || {};
    photos = Object.entries(raw).map(([key, p]) => ({ ...p, key })).filter((p) => !(p.authorId && isBlocked(p.authorId))).sort((a, b) => b.time - a.time);
  } else {
    photos = getPhotos(cornerId).map((p) => ({ ...p, key: p.id }));
  }

  if (photos.length === 0) {
    container.innerHTML = `
      <p class="gallery-header">📸 ${T("Foto-Galerie", "Photo gallery")}</p>
      <p style="font-size:12px;color:var(--fg-dim);margin:0 0 8px;">${T("Noch keine Fotos — lade das erste hoch!", "No photos yet — upload the first!")}</p>
      <button class="action-btn gallery-upload-btn" data-corner="${cornerId}">📷 ${T("Foto hochladen", "Upload photo")}</button>
      <input type="file" accept="image/*" class="gallery-file-input" data-corner="${cornerId}" style="display:none;" multiple>
    `;
  } else {
    const photosHtml = photos.slice(0, 8).map((p) => {
      const ratings = p.ratings || {};
      const ratingValues = Object.values(ratings);
      const avgRating = ratingValues.length > 0 ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1) : "—";
      // Prefer the sanitised key, fall back to the legacy raw-nickname key.
      const myRating = STATE.nickname ? (ratings[photoRatingKey()] || ratings[STATE.nickname] || 0) : 0;
      const starsHtml = [1, 2, 3, 4, 5].map((s) =>
        `<button class="photo-rate-btn ${s <= myRating ? "active" : ""}" data-corner="${cornerId}" data-photo="${p.key}" data-score="${s}">⭐</button>`
      ).join("");

      return `<div class="gallery-item">
        <img src="${escapeHtml(p.thumb || p.src || "")}" alt="Foto" class="gallery-img" data-author="${escapeHtml(p.author)}" data-corner="${escapeHtml(cornerId)}" data-photo="${escapeHtml(p.key)}" loading="lazy" style="cursor:pointer;" />
        <div class="gallery-meta">
          <span class="gallery-author">📸 ${escapeHtml(p.author)}</span>
          <span class="gallery-time">${timeAgo(p.time)}</span>
          ${p.caption ? `<span class="gallery-caption">${escapeHtml(p.caption)}</span>` : ""}
        </div>
        <div class="gallery-rating">
          ${starsHtml}
          <span class="gallery-avg">${avgRating} ${ratingValues.length > 0 ? `(${ratingValues.length})` : ""}</span>
          ${window.FB?.firebaseReady ? `<button class="photo-comment-btn" data-corner="${cornerId}" data-photo="${p.key}" title="${T("Kommentare", "Comments")}">💬 ${Object.keys(p.comments || {}).length || ""}</button>` : ""}
          ${window.FB?.firebaseReady && !(p.authorId && isMyKey(p.authorId)) ? `<button class="photo-report-btn" data-report-photo="${escapeHtml(cornerId + "/" + p.key)}" title="${T("Foto melden", "Report photo")}">🚩</button>` : ""}
        </div>
      </div>`;
    }).join("");

    container.innerHTML = `
      <p class="gallery-header">📸 ${T("Foto-Galerie", "Photo gallery")} <span class="comment-count">${photos.length}</span></p>
      <div class="gallery-grid">${photosHtml}</div>
      <button class="action-btn gallery-upload-btn" data-corner="${cornerId}">📷 ${T("Foto hochladen", "Upload photo")}</button>
      <input type="file" accept="image/*" class="gallery-file-input" data-corner="${cornerId}" style="display:none;" multiple>
    `;
    // Put the horizontal scroller back where the user had it.
    if (prevScroll) {
      const grid = container.querySelector(".gallery-grid");
      if (grid) {
        const prevSnap = grid.style.scrollSnapType;
        grid.style.scrollSnapType = "none"; // snapping would fight the restore
        grid.scrollLeft = prevScroll;
        requestAnimationFrame(() => { grid.style.scrollSnapType = prevSnap || ""; });
      }
    }
  }

  // Bind upload button
  const uploadBtn = container.querySelector(".gallery-upload-btn");
  const fileInput = container.querySelector(".gallery-file-input");
  uploadBtn?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    Array.from(files).forEach((f) => {
      if (!f.type.startsWith("image/")) return;
      compressImageFile(f, { maxDim: 800, quality: 0.7 }).then((dataUrl) => {
        savePhoto(cornerId, dataUrl, "");
        toast("Foto hochgeladen 📸");
      }).catch((err) => {
        console.warn("Gallery image compression failed:", err);
        toast(T("Bild konnte nicht verarbeitet werden.", "Couldn't process the image."));
      });
    });
    fileInput.value = "";
  });

  // Bind rating buttons
  container.querySelectorAll(".photo-rate-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ratePhoto(btn.dataset.corner, btn.dataset.photo, parseInt(btn.dataset.score));
      toast("Foto bewertet ⭐");
    });
  });

  container.querySelectorAll(".photo-comment-btn").forEach((btn) => {
    btn.addEventListener("click", () => openPhotoComments(btn.dataset.corner, btn.dataset.photo));
  });

  // Lightbox: the thumbnail right away, the full picture as soon as it is loaded.
  container.querySelectorAll(".gallery-img").forEach((img) => {
    img.addEventListener("click", () => {
      openLightbox(img.src, img.dataset.author || "");
      if (!window.FB?.firebaseReady || !img.dataset.photo) return;
      const shown = img.src;
      photoFullSrc(img.dataset.corner, img.dataset.photo).then((src) => {
        const box = $("#lightbox-img");
        if (src && box && box.src === shown && $("#lightbox")?.classList.contains("open")) box.src = src;
      });
    });
  });
}

/* ---- Photo comments ("Kommentare zu Fotos machen können") ---- */
var _photoCommentsOpen = null;   // { cornerId, photoKey }
function renderPhotoComments() {
  const o = _photoCommentsOpen;
  const body = $("#pc-body");
  if (!o || !body) return;
  const p = STATE.photos?.[o.cornerId]?.[o.photoKey];
  if (!p) { body.innerHTML = `<p class="up-empty">${T("Foto nicht mehr da.", "Photo is gone.")}</p>`; return; }
  const list = Object.entries(p.comments || {}).map(([id, c]) => ({ id, ...c })).sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
  body.innerHTML = `
    <img class="pc-img" src="${escapeHtml(p.thumb || p.src || "")}" alt="Foto" data-pc-full="${escapeHtml(o.cornerId + "/" + o.photoKey)}" />
    <div class="pc-meta">📸 ${p.authorId ? `<button class="people-chip" data-user-profile="${escapeHtml(p.authorId)}">${escapeHtml(p.author || "?")}</button>` : escapeHtml(p.author || "?")} · ${timeAgo(p.time)}${p.caption ? ` · ${escapeHtml(p.caption)}` : ""}</div>
    <div class="pc-list">${list.length ? list.map((c) => `<div class="pc-item">
        <span class="pc-name">${c.by ? `<button class="people-chip" data-user-profile="${escapeHtml(c.by)}">${escapeHtml(c.name || "?")}</button>` : escapeHtml(c.name || "?")}</span>
        <span class="pc-text">${escapeHtml(c.text || "")}</span>
        <span class="pc-time">${timeAgo(c.at)}</span>
        ${isMyKey(c.by) || STATE.isAdmin ? `<button class="pc-del" data-pc-del="${escapeHtml(c.id)}" title="${T("Löschen", "Delete")}">✕</button>` : ""}
      </div>`).join("") : `<p class="up-empty">${T("Noch keine Kommentare — schreib den ersten!", "No comments yet — write the first!")}</p>`}</div>`;
  const pcImg = body.querySelector(".pc-img");
  if (pcImg && !p.src) photoFullSrc(o.cornerId, o.photoKey).then((src) => { if (src && pcImg.isConnected) pcImg.src = src; });
  body.querySelectorAll("[data-pc-del]").forEach((b) => b.addEventListener("click", () => {
    window.FB.remove(window.FB.ref(window.FB.db, `photos/${o.cornerId}/${o.photoKey}/comments/${b.dataset.pcDel}`)).catch(() => toast(T("Löschen ging nicht.", "Could not delete.")));
  }));
  const list2 = body.querySelector(".pc-list");
  if (list2) list2.scrollTop = list2.scrollHeight;
}

function openPhotoComments(cornerId, photoKey) {
  const overlay = $("#photo-comments-overlay");
  if (!overlay) return;
  _photoCommentsOpen = { cornerId, photoKey };
  renderPhotoComments();
  overlay.style.display = "flex";
  const close = () => { overlay.style.display = "none"; _photoCommentsOpen = null; };
  $("#pc-close").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const input = $("#pc-input");
  input.value = "";
  const send = async () => {
    const text = input.value.trim().slice(0, 300);
    if (!text) return;
    if (!STATE.nickname || !window.FB?.firebaseReady) { toast(T("Bitte zuerst einen Namen wählen.", "Please pick a name first.")); return; }
    const { db, ref, push, set } = window.FB;
    try {
      await set(push(ref(db, `photos/${cornerId}/${photoKey}/comments`)), { by: currentUserKey(), name: String(STATE.nickname).slice(0, 40), text, at: Date.now() });
      input.value = "";
      const p = STATE.photos?.[cornerId]?.[photoKey];
      if (p && p.authorId && !isMyKey(p.authorId)) {
        const corner = getAllCorners().find((c) => c.id === cornerId);
        sendTargetedPush([p.authorId], { type: "photo-comment", title: "💬 Kommentar zu deinem Foto", body: `${STATE.nickname}: ${text.slice(0, 120)}`, query: `?corner=${encodeURIComponent(cornerId)}` });
      }
      const n = parseInt(localStorage.getItem("cg.photoCommentXpDay") === getTodayKey() ? (localStorage.getItem("cg.photoCommentXpN") || "0") : "0", 10);
      if (n < 5) { addXp(2, "Foto kommentiert"); localStorage.setItem("cg.photoCommentXpDay", getTodayKey()); localStorage.setItem("cg.photoCommentXpN", String(n + 1)); }
    } catch (err) {
      console.warn("photo comment failed:", err);
      toast(T("Kommentar konnte nicht gespeichert werden.", "Could not save the comment."));
    }
  };
  $("#pc-send").onclick = send;
  input.onkeydown = (e) => { if (e.key === "Enter") send(); };
}

function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) { /* audio not available */ }
}

