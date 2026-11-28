/* ====================== GLEICHER NAME, MEHRERE PROFILE ======================
   "Kann man mehrere Profile mergen? Ich sehe gerade, dass einige gleich heißen."
   One person ends up with two profiles: a new phone, cleared browser data,
   the name typed again instead of tapped in "Wer bist du?". The admin panel
   lists same-name PROFILES — not logins: every login of a profile carries
   its name — and merges one into the other the way people do it themselves
   (twin banner, "Wer bist du?"): the profile becomes part of the bigger one
   via points/<profile>/aliasOf. Nothing is moved or deleted: profile and
   ranking add the points up, every device stays signed in, and "Trennen"
   takes it apart again. The same name is not always the same person, so
   the admin decides per profile.                                          */

// One pass over the full points: the logins of every profile (root first).
function profileLoginsIn(data) {
  const src = data || {};
  const logins = {};
  Object.keys(src).forEach((k) => {
    const root = profileRoot(k, src);
    (logins[root] = logins[root] || new Set([root])).add(k);
  });
  return logins;
}

// Name, points, logins, team and last activity of one profile in `data`.
function profileSummaryIn(data, root, logins) {
  const src = data || {};
  const keys = [...((logins || profileLoginsIn(src))[root] || new Set([root]))];
  const good = (n) => !!n && !!String(n).trim() && String(n).trim().toLowerCase() !== "anonym";
  const ownName = good(src[root]?.nickname) ? String(src[root].nickname).trim() : "";
  let nickname = ownName, last = 0, nameAt = -1;
  keys.forEach((k) => {
    const p = src[k];
    if (!p) return;
    const t = lastRewardTime(p);
    last = Math.max(last, t);
    if (!ownName && good(p.nickname) && t > nameAt) { nickname = String(p.nickname).trim(); nameAt = t; }
  });
  // Added up like identityRewardTotal: a leftover copy of an old merge counts once.
  const entries = keys.map((k) => src[k]).filter((e) => e && Number(e.total || 0) > 0)
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  const counted = [];
  let total = 0;
  entries.forEach((e) => {
    if (counted.some((c) => rewardLooksCopied(e, c))) return;
    counted.push(e);
    total += Number(e.total || 0);
  });
  const team = keys.map((k) => STATE.teams?.[k]?.team).find((t) => t && TEAMS[t]) || "";
  return { key: root, keys, nickname, total, last, team };
}

// Same-name profiles, biggest first. "Anonym" and empty names are left out:
// those are different people who never picked a name.
function findDuplicateProfiles(pointsData) {
  const data = pointsData || {};
  const logins = profileLoginsIn(data);
  const groups = {};
  Object.keys(logins).forEach((root) => {
    const p = profileSummaryIn(data, root, logins);
    const name = normalizeName(p.nickname);
    if (!name || name === "anonym") return;
    (groups[name] = groups[name] || []).push(p);
  });
  return Object.values(groups).filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => b.total - a.total || b.last - a.last || (a.key < b.key ? -1 : 1)))
    .sort((a, b) => normalizeName(a[0].nickname).localeCompare(normalizeName(b[0].nickname)));
}

// Profiles the admin merged (marked mergedAt), each with what it brought in.
function adminMergedProfiles(data) {
  const src = data || {};
  return Object.entries(src)
    .filter(([k, p]) => p && Number(p.mergedAt) > 0 && typeof p.aliasOf === "string" && p.aliasOf && p.aliasOf !== k)
    .map(([key, p]) => {
      const alone = { ...src, [key]: { ...p, aliasOf: null } };
      return { key, at: Number(p.mergedAt), self: profileSummaryIn(alone, key), into: profileSummaryIn(src, profileRoot(key, src)) };
    })
    .sort((a, b) => b.at - a.at);
}

async function adminMergeProfile(from, into) {
  if (!STATE.isAdmin || !window.FB?.firebaseReady || !from || !into || from === into) return false;
  const { db, ref, update } = window.FB;
  try {
    await withTimeout(update(ref(db, "points/" + from), { aliasOf: into, mergedAt: Date.now() }), 15000, "merge");
  } catch (err) {
    console.warn("profile merge failed:", err);
    return false;
  }
  if (!STATE.points || typeof STATE.points !== "object") STATE.points = {};
  STATE.points[from] = { ...(STATE.points[from] || { total: 0 }), aliasOf: into };
  savePoints();
  return true;
}

async function adminSplitProfile(key) {
  if (!STATE.isAdmin || !window.FB?.firebaseReady || !key) return false;
  const { db, ref, update } = window.FB;
  try {
    await withTimeout(update(ref(db, "points/" + key), { aliasOf: null, mergedAt: null }), 15000, "split");
  } catch (err) {
    console.warn("profile split failed:", err);
    return false;
  }
  if (STATE.points?.[key]) { delete STATE.points[key].aliasOf; savePoints(); }
  return true;
}

function loginCountLabel(n) {
  return n === 1 ? T("1 Login", "1 login", "1 login") : T(`${n} Logins`, `${n} logins`, `${n} logins`);
}
function profileMetaLine(p) {
  const team = TEAMS[p.team];
  return [`Lv. ${getLevel(p.total).level}`, `${p.total} Aura`, team ? `${team.emoji} ${team.name}` : "", loginCountLabel(p.keys.length), p.last ? sinceLabel(p.last) : ""]
    .filter(Boolean).map(escapeHtml).join(" · ");
}
const isMyProfile = (root) => root === myRootKey() || isMyKey(root);

// "Verschiedene Personen": remembered on this device for exactly this group —
// a new profile with the same name brings the group back.
const DISTINCT_STORE = "cg.adminDistinct";
function distinctGroups() {
  try { return new Set(JSON.parse(localStorage.getItem(DISTINCT_STORE) || "[]")); } catch (e) { return new Set(); }
}
function saveDistinctGroups(set) {
  try { localStorage.setItem(DISTINCT_STORE, JSON.stringify([...set].slice(-200))); } catch (e) { /* private mode */ }
}
const groupSignature = (g) => g.map((p) => p.key).sort().join("|");

function renderAdminDuplicates(pointsData) {
  const el = $("#admin-dupes");
  if (!el) return;
  const data = pointsData || {};
  const distinct = distinctGroups();
  const all = findDuplicateProfiles(data);
  const groups = all.filter((g) => !distinct.has(groupSignature(g)));
  const hidden = all.length - groups.length;
  const merged = adminMergedProfiles(data);
  const you = (root) => (isMyProfile(root) ? ` ${T("(du)", "(you)", "(tú)")}` : "");
  el.innerHTML = `
    ${groups.length ? `<p class="dupe-hint">${T("Gleicher Name, getrennte Profile. Ist es dieselbe Person (neues Handy, anderer Browser)? Dann zusammenführen: Die Punkte werden addiert, alle Geräte bleiben angemeldet — und du kannst es wieder trennen.", "Same name, separate profiles. Same person (new phone, another browser)? Then merge: the points are added up, every device stays signed in — and you can split them again.", "Mismo nombre, perfiles separados. ¿Es la misma persona (móvil nuevo, otro navegador)? Entonces únelos: los puntos se suman, todos los dispositivos siguen con la sesión iniciada — y puedes volver a separarlos.")}</p>` : `<p class="dupe-none">${T("Keine doppelten Profile.", "No duplicate profiles.", "No hay perfiles duplicados.")} ✨</p>`}
    ${groups.map((g, gi) => `<div class="admin-fb dupe-group" data-dupe-group="${gi}">
      <div class="dupe-head">${escapeHtml(g[0].nickname)} — ${T(`${g.length} Profile`, `${g.length} profiles`, `${g.length} perfiles`)}</div>
      ${g.map((p, pi) => `<div class="dupe-row">
        <div class="dupe-info">
          <div class="dupe-name">${escapeHtml(p.nickname)}${you(p.key)}</div>
          <div class="dupe-meta">${profileMetaLine(p)}</div>
        </div>
        ${pi === 0 ? `<span class="dupe-main">${T("Hauptprofil", "Main profile", "Perfil principal")}</span>`
          : `<button class="action-btn admin-row-btn merge" data-dupe-merge="${gi}:${pi}">🔗 ${T("Zusammenführen", "Merge", "Unir")}</button>`}
      </div>`).join("")}
      <div class="dupe-actions"><button class="action-btn admin-row-btn neutral" data-dupe-distinct="${gi}">${T("Verschiedene Personen", "Different people", "Personas distintas")}</button></div>
    </div>`).join("")}
    ${hidden ? `<button class="dupe-link" data-dupe-unhide>${T(`${hidden} als verschiedene Personen ausgeblendet — wieder zeigen`, `${hidden} hidden as different people — show again`, `${hidden} ocultos como personas distintas — mostrar de nuevo`)}</button>` : ""}
    ${merged.length ? `<div class="dupe-sub">${T("Zusammengeführt", "Merged", "Unidos")}</div>
      ${merged.map((m) => `<div class="admin-fb dupe-merged">
        <div class="dupe-info">
          <div class="dupe-name">${escapeHtml(m.self.nickname || "?")} → ${escapeHtml(m.into.nickname || "?")}${you(m.into.key)}</div>
          <div class="dupe-meta">${escapeHtml(`${m.self.total} Aura · ${loginCountLabel(m.self.keys.length)} · ${new Date(m.at).toLocaleDateString(appLocale())}`)}</div>
        </div>
        <button class="action-btn admin-row-btn neutral" data-dupe-split="${escapeHtml(m.key)}">${T("Trennen", "Split", "Separar")}</button>
      </div>`).join("")}` : ""}`;

  el.querySelectorAll("[data-dupe-merge]").forEach((btn) => btn.addEventListener("click", async () => {
    const [gi, pi] = btn.dataset.dupeMerge.split(":").map(Number);
    const g = groups[gi];
    const from = g && g[pi], into = g && g[0];
    if (!from || !into) return;
    const together = { ...data, [from.key]: { ...(data[from.key] || { total: 0 }), aliasOf: into.key } };
    const sum = profileSummaryIn(together, into.key);
    const lv = getLevel(sum.total).level;
    const ok = await showDialog({
      title: T(`„${into.nickname}“ zusammenführen?`, `Merge “${into.nickname}”?`, `¿Unir «${into.nickname}»?`),
      text: T(`Das kleinere Profil (${from.total} Aura, ${loginCountLabel(from.keys.length)}) kommt zum Hauptprofil (${into.total} Aura). Zusammen: Lv. ${lv}, ${sum.total} Aura — alle Geräte bleiben angemeldet. Nur, wenn es wirklich dieselbe Person ist; „Trennen“ macht es rückgängig.`,
        `The smaller profile (${from.total} aura, ${loginCountLabel(from.keys.length)}) joins the main profile (${into.total} aura). Together: Lv. ${lv}, ${sum.total} aura — every device stays signed in. Only if it really is the same person; “Split” undoes it.`,
        `El perfil pequeño (${from.total} de aura, ${loginCountLabel(from.keys.length)}) se une al principal (${into.total} de aura). Juntos: Lv. ${lv}, ${sum.total} de aura — todos los dispositivos siguen con la sesión iniciada. Solo si de verdad es la misma persona; «Separar» lo deshace.`),
      okLabel: T("Zusammenführen", "Merge", "Unir")
    });
    if (ok !== true) return;
    btn.disabled = true;
    if (!(await adminMergeProfile(from.key, into.key))) {
      btn.disabled = false;
      toast(T("Zusammenführen hat nicht geklappt — Verbindung prüfen.", "Merging didn't work — check your connection.", "No se pudo unir — revisa la conexión."));
      return;
    }
    toast(`🔗 ${T("Zusammengeführt", "Merged", "Unidos")}: <strong>${escapeHtml(into.nickname)}</strong> — Lv. ${lv}, ${sum.total} Aura<br><span style="font-size:11px;opacity:0.75;">${T("Tippen zum Rückgängigmachen", "Tap to undo", "Toca para deshacer")}</span>`,
      "at-corner", async () => { if (await adminSplitProfile(from.key)) renderAdminPanel(); });
    renderAdminPanel();
  }));
  el.querySelectorAll("[data-dupe-distinct]").forEach((btn) => btn.addEventListener("click", () => {
    const g = groups[Number(btn.dataset.dupeDistinct)];
    if (!g) return;
    distinct.add(groupSignature(g));
    saveDistinctGroups(distinct);
    renderAdminDuplicates(data);
  }));
  el.querySelector("[data-dupe-unhide]")?.addEventListener("click", () => {
    saveDistinctGroups(new Set());
    renderAdminDuplicates(data);
  });
  el.querySelectorAll("[data-dupe-split]").forEach((btn) => btn.addEventListener("click", async () => {
    const m = merged.find((x) => x.key === btn.dataset.dupeSplit);
    if (!m) return;
    const ok = await showDialog({
      title: T(`„${m.self.nickname || "?"}“ wieder trennen?`, `Split “${m.self.nickname || "?"}” off again?`, `¿Separar «${m.self.nickname || "?"}» otra vez?`),
      text: T(`Dann sind es wieder zwei Profile: ${m.self.total} Aura hier, der Rest bei „${m.into.nickname || "?"}“. Die Geräte bleiben angemeldet.`, `Then they are two profiles again: ${m.self.total} aura here, the rest with “${m.into.nickname || "?"}”. The devices stay signed in.`, `Entonces vuelven a ser dos perfiles: ${m.self.total} de aura aquí, el resto con «${m.into.nickname || "?"}». Los dispositivos siguen con la sesión iniciada.`),
      okLabel: T("Trennen", "Split", "Separar")
    });
    if (ok !== true) return;
    btn.disabled = true;
    if (await adminSplitProfile(m.key)) {
      toast(`✂️ ${T("Getrennt", "Split", "Separados")}: <strong>${escapeHtml(m.self.nickname || "?")}</strong>`);
      renderAdminPanel();
    } else {
      btn.disabled = false;
      toast(T("Trennen hat nicht geklappt — Verbindung prüfen.", "Splitting didn't work — check your connection.", "No se pudo separar — revisa la conexión."));
    }
  }));
}

// 👥 Profile: one row per person (with all their logins), not per login —
// otherwise a person with phone + laptop looks like a duplicate.
function renderAdminProfiles(pointsData) {
  const el = $("#admin-profiles");
  if (!el) return;
  const data = pointsData || {};
  const logins = profileLoginsIn(data);
  const rows = Object.keys(logins).map((root) => profileSummaryIn(data, root, logins))
    .sort((a, b) => b.total - a.total || b.last - a.last);
  el.innerHTML = rows.map((r) => `
    <div class="admin-profile-row">
      <span class="apr-name">${escapeHtml(r.nickname || r.key)}${isMyProfile(r.key) ? ` ${T("(du)", "(you)", "(tú)")}` : ""}${r.keys.length > 1 ? ` <span class="apr-logins">· ${loginCountLabel(r.keys.length)}</span>` : ""}</span>
      <span class="apr-total">${r.total} Aura</span>
      ${isMyProfile(r.key) ? "" : `<button class="action-btn admin-row-btn" data-admin-del-user="${escapeHtml(r.key)}">${T("Löschen", "Delete", "Eliminar")}</button>`}
    </div>`).join("") || `<p style="color:var(--fg-dim);font-size:12px;">${T("Keine Profile.", "No profiles.", "No hay perfiles.")}</p>`;
  el.querySelectorAll("[data-admin-del-user]").forEach((b) => b.addEventListener("click", () => {
    const r = rows.find((x) => x.key === b.dataset.adminDelUser);
    if (r) adminDeleteProfile(r.key, r.nickname, r.keys);
  }));
}
