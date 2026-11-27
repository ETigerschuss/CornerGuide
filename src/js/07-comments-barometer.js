/* ====================== COMMENTS (Firebase or localStorage) ====================== */
function listenComments() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  const commRef = ref(db, "comments");
  onValue(commRef, (snapshot) => {
    STATE.comments = snapshot.val() || {};
    refreshAllCommentSections();
  });
}

function loadLocalComments() {
  try {
    const raw = localStorage.getItem("cg.comments");
    STATE.comments = raw ? JSON.parse(raw) : {};
  } catch (e) { STATE.comments = {}; }
  refreshAllCommentSections();
}

function saveLocalComments() {
  localStorage.setItem("cg.comments", JSON.stringify(STATE.comments));
}

function editComment(cornerId, commentKey, newText) {
  if (!newText.trim()) return;
  if (window.FB?.firebaseReady) {
    const { db, ref, set } = window.FB;
    const commentRef = ref(db, "comments/" + cornerId + "/" + commentKey + "/text");
    set(commentRef, newText.trim());
  } else {
    if (STATE.comments[cornerId]?.[commentKey]) {
      STATE.comments[cornerId][commentKey].text = newText.trim();
      saveLocalComments();
      refreshAllCommentSections();
    }
  }
}

function deleteComment(cornerId, commentKey) {
  if (window.FB?.firebaseReady) {
    const { db, ref, remove } = window.FB;
    remove(ref(db, "comments/" + cornerId + "/" + commentKey));
  } else {
    if (STATE.comments[cornerId]?.[commentKey]) {
      delete STATE.comments[cornerId][commentKey];
      saveLocalComments();
      refreshAllCommentSections();
    }
  }
}

function getCommentLikeCount(comment) {
  return Object.values(comment?.likes || {}).filter(Boolean).length;
}

function toggleCommentLike(cornerId, commentKey) {
  if (!STATE.nickname) { toast("Bitte gib zuerst einen Namen ein."); return; }
  const voteKey = currentUserKey();
  const hasLiked = !!STATE.comments?.[cornerId]?.[commentKey]?.likes?.[voteKey];
  const shouldLike = !hasLiked;
  if (window.FB?.firebaseReady) {
    const { db, ref, set, remove } = window.FB;
    const likeRef = ref(db, `comments/${cornerId}/${commentKey}/likes/${voteKey}`);
    if (shouldLike) set(likeRef, true);
    else remove(likeRef);
    return;
  }
  if (!STATE.comments?.[cornerId]?.[commentKey]) return;
  const comment = STATE.comments[cornerId][commentKey];
  if (!comment.likes) comment.likes = {};
  if (shouldLike) comment.likes[voteKey] = true;
  else delete comment.likes[voteKey];
  saveLocalComments();
  refreshAllCommentSections();
}

function refreshAllCommentSections() {
  $$(".comments-section").forEach((section) => {
    const cornerId = section.dataset.cornerId;
    renderCommentSection(cornerId, section);
  });
}

function renderCommentSection(cornerId, container) {
  const comments = STATE.comments[cornerId] || {};
  const myLikeKey = currentUserKey();
  // From people I blocked (38-moderation.js): hidden.
  const fromBlocked = (c) => !!c && ((c.authorId && isBlocked(c.authorId)) || isBlockedName(c.author));
  const allEntries = Object.entries(comments).filter(([, c]) => c);
  const hiddenCount = allEntries.filter(([, c]) => fromBlocked(c)).length;
  const commentEntries = allEntries.filter(([, c]) => !fromBlocked(c)).map(([key, comment]) => ({
    key,
    comment,
    likeCount: getCommentLikeCount(comment)
  })).sort((a, b) => {
    const likesDiff = b.likeCount - a.likeCount;
    if (likesDiff !== 0) return likesDiff;
    return (a.comment.time || 0) - (b.comment.time || 0);
  });
  const isCollapsed = commentEntries.length > 3;

  const listHtml = commentEntries.map(({ key, comment: c, likeCount }) => {
    const isMine = c.authorId ? isMyKey(c.authorId) : c.author === STATE.nickname;
    const likedByMe = !!c?.likes?.[myLikeKey];
    const replies = c.replies ? Object.entries(c.replies).filter(([, r]) => r && !fromBlocked(r)).sort((a, b) => a[1].time - b[1].time) : [];
    const repliesHtml = replies.length > 0 ? `
      <div class="comment-replies">
        ${replies.map(([rKey, r]) => `
          <div class="comment-item ${r.author === STATE.nickname ? "mine" : ""}">
            <span class="comment-author">${escapeHtml(r.author)}</span>
            <span class="comment-time">${timeAgo(r.time)}</span>
            <p class="comment-text">${escapeHtml(r.text)}</p>
          </div>
        `).join("")}
      </div>
    ` : "";

    return `
    <li class="comment-item ${isMine ? "mine" : ""}">
      <span class="comment-author">${escapeHtml(c.author)}</span>
      <span class="comment-time">${timeAgo(c.time)}</span>
      <p class="comment-text" id="comment-text-${key}">${escapeHtml(c.text)}</p>
      <div class="comment-actions">
        <button class="comment-like-btn ${likedByMe ? "active" : ""}" data-corner="${cornerId}" data-key="${key}" aria-label="${likedByMe ? "Like entfernen" : "Kommentar liken"}" aria-pressed="${likedByMe ? "true" : "false"}">👍 ${likeCount} Likes</button>
        <button class="reply-btn" data-corner="${cornerId}" data-key="${key}">💬 Antworten</button>
        ${!isMine && window.FB?.firebaseReady ? `<button class="report-btn" data-report-comment="${escapeHtml(cornerId + "/" + key)}" title="${T("Melden", "Report")}" aria-label="${T("Kommentar melden", "Report comment")}">🚩</button>` : ""}
        ${isMine ? `<button class="edit-btn" data-corner="${cornerId}" data-key="${key}">✏️ Edit</button>
        <button class="delete-btn" data-corner="${cornerId}" data-key="${key}">🗑 Löschen</button>` : ""}
      </div>
      ${repliesHtml}
    </li>
  `;
  }).join("");

  container.innerHTML = `
    <div class="comments-header">
      <h3>💬 Kommentare</h3>
      ${commentEntries.length > 0 ? `<span class="comment-count">${commentEntries.length}</span>` : ""}
    </div>
    <div class="${isCollapsed ? "comments-collapsed" : ""}">
      <ul class="comment-list">${listHtml || (hiddenCount ? "" : '<li style="color:var(--fg-dim);font-size:13px;padding:8px 0;">Noch keine Kommentare — sei der Erste!</li>')}</ul>
      ${hiddenCount ? `<p class="comment-hidden">🚫 ${hiddenCount} ${T(hiddenCount === 1 ? "Kommentar von jemandem, den du blockiert hast, ausgeblendet" : "Kommentare von Leuten, die du blockiert hast, ausgeblendet", hiddenCount === 1 ? "comment from someone you blocked hidden" : "comments from people you blocked hidden")}</p>` : ""}
      ${isCollapsed ? `<button class="comments-toggle" data-corner="${cornerId}">▼ Alle ${commentEntries.length} anzeigen</button>` : ""}
    </div>
    <div class="comment-form">
      <input type="text" class="comment-name-input" placeholder="Name" value="${escapeHtml(STATE.nickname)}" maxlength="20" aria-label="Dein Name" />
      <textarea class="comment-text-input" placeholder="Dein Kommentar..." maxlength="300" aria-label="Kommentar schreiben"></textarea>
      <button class="comment-submit" data-corner="${cornerId}">Senden</button>
    </div>
  `;

  // Bind collapse toggle
  const toggleBtn = container.querySelector(".comments-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const collapsedDiv = toggleBtn.previousElementSibling ? toggleBtn.closest(".comments-collapsed") || toggleBtn.parentElement : toggleBtn.parentElement;
      const wrapper = toggleBtn.parentElement;
      if (wrapper.classList.contains("comments-collapsed")) {
        wrapper.classList.remove("comments-collapsed");
        toggleBtn.textContent = "▲ Weniger anzeigen";
      } else {
        wrapper.classList.add("comments-collapsed");
        toggleBtn.textContent = `▼ Alle ${commentEntries.length} anzeigen`;
      }
    });
  }

  // Bind submit
  container.querySelector(".comment-submit").addEventListener("click", () => {
    const nameInput = container.querySelector(".comment-name-input");
    const textInput = container.querySelector(".comment-text-input");
    addComment(cornerId, nameInput.value, textInput.value);
    textInput.value = "";
    toast("Kommentar gesendet 💬");
    addPoints(STATE.nickname, 5, "Kommentar geschrieben");
    // Achievement
    if (!STATE.achievements.includes("first-comment")) {
      unlockAchievement("first-comment", "Kommentator", "💬", 10);
    }
  });

  const textInput = container.querySelector(".comment-text-input");
  textInput.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      container.querySelector(".comment-submit").click();
    }
  });

  // Bind reply buttons
  container.querySelectorAll(".reply-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const cId = btn.dataset.corner;
      const li = btn.closest(".comment-item");

      // Remove existing reply forms
      li.querySelectorAll(".reply-form").forEach((f) => f.remove());

      const replyForm = document.createElement("div");
      replyForm.className = "reply-form";
      replyForm.innerHTML = `
        <textarea placeholder="Antwort schreiben..." maxlength="200"></textarea>
        <button>↩️</button>
      `;
      li.appendChild(replyForm);

      const replyInput = replyForm.querySelector("textarea");
      replyInput.focus();

      replyForm.querySelector("button").addEventListener("click", () => {
        const replyText = replyInput.value.trim();
        if (!replyText) return;
        addReply(cId, key, STATE.nickname || "Anonym", replyText);
        replyForm.remove();
        toast("Antwort gesendet 💬");
      });

      replyInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          replyForm.querySelector("button").click();
        }
        if (e.key === "Escape") replyForm.remove();
      });
    });
  });

  // Bind like buttons
  container.querySelectorAll(".comment-like-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleCommentLike(btn.dataset.corner, btn.dataset.key);
    });
  });

  // Bind edit buttons
  container.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const cId = btn.dataset.corner;
      const textEl = container.querySelector(`#comment-text-${key}`);
      const currentText = STATE.comments[cId]?.[key]?.text || "";
      const li = btn.closest(".comment-item");
      const actionsDiv = li.querySelector(".comment-actions");
      actionsDiv.innerHTML = "";
      textEl.innerHTML = `<textarea class="comment-edit-input" maxlength="300">${escapeHtml(currentText)}</textarea>
        <div class="comment-actions" style="margin-top:6px;">
          <button class="save-edit-btn" data-corner="${cId}" data-key="${key}">✓ Speichern</button>
          <button class="cancel-edit-btn">Abbrechen</button>
        </div>`;
      const editInput = textEl.querySelector(".comment-edit-input");
      editInput.focus();
      textEl.querySelector(".save-edit-btn").addEventListener("click", () => {
        editComment(cId, key, editInput.value);
        toast("Kommentar bearbeitet ✓");
      });
      textEl.querySelector(".cancel-edit-btn").addEventListener("click", () => {
        renderCommentSection(cornerId, container);
      });
      editInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          editComment(cId, key, editInput.value);
          toast("Kommentar bearbeitet ✓");
        }
        if (e.key === "Escape") renderCommentSection(cornerId, container);
      });
    });
  });

  // Bind delete buttons
  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (await appConfirm("Kommentar löschen?", "", "Löschen")) {
        deleteComment(btn.dataset.corner, btn.dataset.key);
        toast("Kommentar gelöscht 🗑");
      }
    });
  });
}

/* ====================== COMMENT REPLIES ====================== */
/* ====================== BAROMETER (Daily Spot Rating) ====================== */
function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function listenBarometer() {
  if (!window.FB?.firebaseReady) return;
  const { db, ref, onValue } = window.FB;
  const today = getTodayKey();
  const baroRef = ref(db, "barometer/" + today);
  onValue(baroRef, (snapshot) => {
    STATE.barometer = snapshot.val() || {};
    refreshAllBarometers();
  });
}

function loadLocalBarometer() {
  try {
    const raw = localStorage.getItem("cg.barometer");
    STATE.barometer = raw ? JSON.parse(raw) : {};
  } catch (e) { STATE.barometer = {}; }
}

function saveLocalBarometer() {
  localStorage.setItem("cg.barometer", JSON.stringify(STATE.barometer));
}

function refreshAllBarometers() {
  $$(".barometer-section").forEach((section) => {
    const cornerId = section.dataset.cornerId;
    renderBarometer(cornerId, section);
  });
}

function renderBarometer(cornerId, container) {
  const { avg, count, myVote } = getBarometerData(cornerId);
  const emojis = ["😴", "😐", "🙂", "😎", "🔥"];

  const starsHtml = emojis.map((emoji, i) => {
    const score = i + 1;
    const isActive = score <= (myVote || 0);
    const voted = myVote > 0;
    return `<button class="baro-star ${isActive ? "active" : ""} ${voted ? "voted" : ""}" data-corner="${cornerId}" data-score="${score}">${emoji}</button>`;
  }).join("");

  const resultHtml = count > 0
    ? `<span class="barometer-result"><span class="avg-score">${avg.toFixed(1)}</span><span class="vote-count">(${count} ${count === 1 ? "Stimme" : "Stimmen"})</span></span>`
    : `<span class="barometer-result"><span class="vote-count">Noch keine Bewertung heute</span></span>`;

  container.innerHTML = `
    <p class="barometer-header">📊 Tages-Barometer</p>
    <div class="barometer-stars">${starsHtml}${resultHtml}</div>
  `;

  container.querySelectorAll(".baro-star").forEach((btn) => {
    btn.addEventListener("click", () => {
      const score = parseInt(btn.dataset.score);
      voteBarometer(cornerId, score);
      toast(`Bewertung: ${emojis[score-1]} (${score}/5)`);
      addPoints(STATE.nickname, 2, "Barometer bewertet");
    });
  });
}

