/**
 * CornerGuide Cloud Functions — the trusted sender for Web Push.
 *
 * Web/FCM tokens can only be *received* in the browser; the actual push must be
 * sent from a trusted server. This function watches for new direct messages in
 * the Realtime Database and delivers a push to the recipient's stored token.
 *
 * Deploy:  firebase deploy --only functions
 * Requires the Blaze (pay-as-you-go) plan — outbound requests to FCM need it.
 */
const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const lite = require("./lite");

admin.initializeApp();

const REGION = "europe-west1"; // must match the RTDB region
const APP_URL = "https://etigerschuss.github.io/CornerGuide/";
const ICON_URL = APP_URL + "icons/icon-192.png";

// Only a plain query string may be appended to APP_URL, so a push can never
// link anywhere outside the app.
function safeQuery(q) {
  return typeof q === "string" && /^\?[A-Za-z0-9_\-=&%.]{0,300}$/.test(q) ? q : "";
}

/**
 * Fan-out push: a client writes a lightweight event under /notify/{id}
 * (e.g. on check-in) and this function delivers it to every stored push token,
 * respecting each recipient's mute settings. The event is deleted afterwards.
 */
exports.pushOnNotifyEvent = onValueCreated(
  { ref: "/notify/{eventId}", region: REGION },
  async (event) => {
    const ev = event.data.val();
    if (!ev || !ev.body) {
      await event.data.ref.remove();
      return;
    }
    const fromId = ev.fromId || "";
    const fromTeam = ev.fromTeam || "";

    const db = admin.database();
    const [tokensSnap, prefsSnap] = await Promise.all([
      db.ref("pushTokens").get(),
      db.ref("userPrefs").get()
    ]);
    const tokensByUid = tokensSnap.val() || {};
    const prefs = prefsSnap.val() || {};

    const tokens = [];
    for (const [uid, entry] of Object.entries(tokensByUid)) {
      if (uid === fromId) continue;              // don't notify the sender
      const token = entry && entry.token;
      if (!token) continue;
      const ns = (prefs[uid] && prefs[uid].notifSettings) || {};
      if (ns.mode === "off") continue;
      if (Array.isArray(ns.blockedUsers) && ns.blockedUsers.includes(fromId)) continue;
      if (fromTeam && Array.isArray(ns.blockedTeams) && ns.blockedTeams.includes(fromTeam)) continue;
      tokens.push(token);
    }

    if (!tokens.length) {
      await event.data.ref.remove();
      return;
    }

    // Optional in-app deep link (e.g. "?corner=…&date=1" for a cornerdate).
    const link = APP_URL + safeQuery(ev.query);
    const message = {
      notification: { title: ev.title || "Minga Corner Guide", body: String(ev.body).slice(0, 140) },
      data: { url: link, type: String(ev.type || "cornerguide").slice(0, 40) },
      webpush: {
        fcmOptions: { link },
        notification: { icon: ICON_URL, tag: ev.type || "cornerguide" }
      }
    };

    try {
      const res = await admin.messaging().sendEachForMulticast({ tokens, ...message });
      logger.info(`Fan-out '${ev.type}': ${res.successCount}/${tokens.length} delivered.`);
      // Remove tokens that are no longer valid.
      const stale = [];
      res.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error && r.error.code;
          if (code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token") {
            stale.push(tokens[i]);
          }
        }
      });
      if (stale.length) {
        await Promise.all(Object.entries(tokensByUid).map(([uid, entry]) => {
          if (entry && stale.includes(entry.token)) return db.ref(`pushTokens/${uid}`).remove();
          return null;
        }));
      }
    } catch (err) {
      logger.error("Fan-out push failed:", err);
    } finally {
      await event.data.ref.remove();
    }
  }
);

/**
 * Targeted push: like /notify, but only to the uids listed in `toIds` (e.g. the
 * people checked in at a corner when a gossip round starts, or the storyteller
 * when the result is in). An optional `query` ("?corner=…&gossip=1") deep-links
 * into the app; anything else is ignored so the link can never leave the app.
 * A separate node keeps old deployments from fanning these out to everyone.
 */
// Push to a few chosen people (by login key), respecting their mute settings.
// Used for client events under /notifyTargeted and by the functions below.
async function deliverTargeted(ev) {
  if (!ev || !ev.body || !ev.toIds || typeof ev.toIds !== "object") return;
  const fromId = String(ev.fromId || "");
  const fromTeam = String(ev.fromTeam || "");
  const toIds = (Array.isArray(ev.toIds) ? ev.toIds : Object.keys(ev.toIds))
    .filter((id) => typeof id === "string" && id && id !== fromId && !/[.#$[\]/]/.test(id))
    .slice(0, 50);
  if (!toIds.length) return;

  const link = APP_URL + safeQuery(ev.query);
  const db = admin.database();
  const entries = await Promise.all(toIds.map(async (uid) => {
    const [tokenSnap, prefSnap] = await Promise.all([
      db.ref(`pushTokens/${uid}/token`).get(),
      db.ref(`userPrefs/${uid}/notifSettings`).get()
    ]);
    return { uid, token: tokenSnap.val(), ns: prefSnap.val() || {} };
  }));
  const targets = entries.filter(({ token, ns }) => {
    if (!token || ns.mode === "off") return false;
    if (Array.isArray(ns.blockedUsers) && ns.blockedUsers.includes(fromId)) return false;
    if (fromTeam && Array.isArray(ns.blockedTeams) && ns.blockedTeams.includes(fromTeam)) return false;
    return true;
  });
  if (!targets.length) return;

  const type = String(ev.type || "cornerguide").slice(0, 40);
  const res = await admin.messaging().sendEachForMulticast({
    tokens: targets.map((t) => t.token),
    notification: { title: String(ev.title || "Minga Corner Guide").slice(0, 80), body: String(ev.body).slice(0, 160) },
    data: { url: link, type },
    webpush: {
      fcmOptions: { link },
      notification: { icon: ICON_URL, tag: type }
    }
  });
  logger.info(`Targeted '${type}': ${res.successCount}/${targets.length} delivered.`);
  await Promise.all(res.responses.map((r, i) => {
    const code = !r.success && r.error && r.error.code;
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      return db.ref(`pushTokens/${targets[i].uid}`).remove();
    }
    return null;
  }));
}

exports.pushOnTargetedNotify = onValueCreated(
  { ref: "/notifyTargeted/{eventId}", region: REGION },
  async (event) => {
    try {
      await deliverTargeted(event.data.val());
    } catch (err) {
      logger.error("Targeted push failed:", err);
    } finally {
      await event.data.ref.remove();
    }
  }
);

exports.pushOnDirectMessage = onValueCreated(
  { ref: "/messages/{toId}/{msgId}", region: REGION },
  async (event) => {
    const msg = event.data.val();
    const toId = event.params.toId;
    if (!msg || !toId) return;

    const tokenSnap = await admin.database().ref(`pushTokens/${toId}/token`).get();
    const token = tokenSnap.val();
    if (!token) {
      logger.info(`No push token for ${toId}; recipient will see the message in-app only.`);
      return;
    }

    const fromName = (msg.fromName || "Ein Corner-Friend").toString().slice(0, 40);
    const body = (msg.text || "Neue Nachricht").toString().slice(0, 140);
    // Deep link: tapping the notification opens the chat thread with the sender.
    const chatLink = `${APP_URL}?chat=${encodeURIComponent(msg.fromId || "")}&chatName=${encodeURIComponent(fromName)}`;

    try {
      await admin.messaging().send({
        token,
        notification: { title: `💬 ${fromName}`, body },
        data: { url: chatLink },
        webpush: {
          fcmOptions: { link: chatLink },
          notification: { icon: ICON_URL, tag: `dm-${toId}` }
        }
      });
      logger.info(`Push delivered to ${toId}.`);
    } catch (err) {
      // A registration-not-registered error means the token is stale — clean it up.
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        await admin.database().ref(`pushTokens/${toId}`).remove();
        logger.info(`Removed stale push token for ${toId}.`);
      } else {
        logger.error(`Push to ${toId} failed:`, err);
      }
    }
  }
);

/* ====================== Slim data for the app start ======================
 * The app no longer downloads whole nodes when it starts (photos alone were
 * 8.6 MB). These functions keep small derived copies up to date for every
 * write — from the current and from older app versions alike. See lite.js.
 * Points are written very often (every action), so the copy is built from
 * the event itself (no extra read of the entry with its history); a small
 * transaction keeps an older event that arrives late from overwriting it.  */

async function mirrorReward(event, path, withAlias) {
  const next = lite.rewardLite(event.data.after.val(), withAlias);
  const ref = admin.database().ref(`${path}/${event.params.key}`);
  if (!next) { await ref.remove(); return; }
  await ref.transaction((cur) => (cur && Number(cur.last || 0) > Number(next.last || 0) ? undefined : next));
}

exports.rewardLiteAura = onValueWritten(
  { ref: "/points/{key}", region: REGION },
  (event) => mirrorReward(event, "pointsLite", true)
);

exports.rewardLiteKarma = onValueWritten(
  { ref: "/karmaPoints/{key}", region: REGION },
  (event) => mirrorReward(event, "karmaLite", false)
);

// Check-in → count per corner + the person's own list (by login, or by name
// for check-ins without one). Undo and re-attribution move/remove the entry.
exports.visitIndex = onValueWritten(
  { ref: "/visits/{cornerId}/{visitId}", region: REGION },
  async (event) => {
    const { cornerId, visitId } = event.params;
    const db = admin.database();
    const before = event.data.before.val();
    const cur = (await db.ref(`visits/${cornerId}/${visitId}`).get()).val();
    const updates = {};
    const oldPath = lite.visitIndexPath(visitId, before);
    const newPath = lite.visitIndexPath(visitId, cur);
    if (oldPath && oldPath !== newPath) updates[oldPath] = null;
    if (newPath) updates[newPath] = lite.visitIndexEntry(cornerId, cur);
    if (Object.keys(updates).length) await db.ref().update(updates);
    // Count up or down instead of re-reading the corner's whole list.
    const delta = (event.data.after.exists() ? 1 : 0) - (before ? 1 : 0);
    if (!delta) return;
    const t = cur ? Number(cur.time) || 0 : 0;
    await db.ref(`visitStats/${cornerId}`).transaction((s) => {
      const n = Math.max(0, Number((s && s.n) || 0) + delta);
      return n ? { n, last: Math.max(Number((s && s.last) || 0), t) } : null;
    });
  }
);

const STORAGE_BUCKET = "cornerguide.firebasestorage.app";
async function deletePhotoFile(cornerId, photoId) {
  try {
    await admin.storage().bucket(STORAGE_BUCKET).file(`cornerPhotos/${cornerId}/${photoId}.jpg`).delete({ ignoreNotFound: true });
  } catch (err) {
    logger.warn(`photo file not deleted (${cornerId}/${photoId}):`, err && err.message);
  }
}

// Photos: the cover for the cards (+ count), and inline images out of the
// metadata into photoData, with a small thumbnail for cards and gallery.
exports.photoIndex = onValueWritten(
  { ref: "/photos/{cornerId}/{photoId}", region: REGION },
  async (event) => {
    const { cornerId, photoId } = event.params;
    const db = admin.database();
    const metaRef = db.ref(`photos/${cornerId}/${photoId}`);
    const cur = (await metaRef.get()).val();
    if (!cur) {
      await db.ref(`photoData/${cornerId}/${photoId}`).remove();
      // Deleted (by its author or an admin): the file in Storage goes too —
      // apps may only upload there.
      const before = event.data.before.val();
      if (before && (before.storage === true || /^https?:/.test(String(before.src || "")))) await deletePhotoFile(cornerId, photoId);
    } else if (lite.isInline(cur.src)) {
      // Uploaded by an older app version: same layout as the current one.
      await db.ref(`photoData/${cornerId}/${photoId}`).set({ src: cur.src });
      const fix = { src: null };
      if (!cur.thumb) {
        const thumb = lite.makeThumb(cur.src);
        if (thumb) fix.thumb = thumb;
      }
      await metaRef.update(fix);   // triggers this function once more, which then only updates the cover
      return;
    }
    const photos = (await db.ref(`photos/${cornerId}`).get()).val();
    await db.ref(`photoCovers/${cornerId}`).set(lite.coverOf(photos));
  }
);

/* ---------- Invite links (Phase 2) ----------
 * Every member's shared links carry a personal invite (invites/<token>);
 * whoever opens one is in without a code. Once that person has picked a name,
 * their app notes it under inviteJoins/<token>/<uid> (the rules only allow
 * that for the invite the login really came in with). Here: count it, thank
 * the inviter with Karma (a few times a day, so nobody farms it with fake
 * logins) and tell them who it is — the push opens the newcomer's profile,
 * one tap from a welcome compliment. */
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,40}$/;
const INVITE_KARMA = 30;
const INVITE_REWARDS_PER_DAY = 3;

function munichDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(ms)).replace(/-/g, "");
}

// All logins of a profile: the root and every login linked to it.
async function profileLogins(db, root) {
  const snap = await db.ref("pointsLite").orderByChild("aliasOf").equalTo(root).get();
  return [root, ...Object.keys(snap.val() || {})].filter((k) => k && !/[.#$[\]/]/.test(k));
}

exports.inviteJoined = onValueCreated(
  { ref: "/inviteJoins/{token}/{uid}", region: REGION },
  async (event) => {
    const { token, uid } = event.params;
    if (!INVITE_TOKEN_RE.test(token)) return;
    const db = admin.database();
    try {
      const inv = (await db.ref(`invites/${token}`).get()).val();
      const by = inv && typeof inv.by === "string" ? inv.by : "";
      if (!by || by === uid || /[.#$[\]/]/.test(by)) return;
      // Once per newcomer, also when the function runs twice for one event.
      const once = await db.ref(`inviteJoins/${token}/${uid}/done`).transaction((cur) => (cur ? undefined : true));
      if (!once.committed) return;
      await db.ref(`invites/${token}/uses`).transaction((n) => (Number(n) || 0) + 1);
      if (inv.revoked) return;
      const now = Date.now();
      const quota = await db.ref(`inviteRewards/${by}/${munichDay(now)}`)
        .transaction((n) => ((Number(n) || 0) >= INVITE_REWARDS_PER_DAY ? undefined : (Number(n) || 0) + 1));
      const name = String((event.data.val() || {}).name || "").trim().slice(0, 40) || "Jemand";
      if (quota.committed) {
        // karmaLite follows through rewardLiteKarma.
        await db.ref(`karmaPoints/${by}`).transaction((cur) => {
          const base = cur && typeof cur === "object" ? cur : { total: 0, nickname: String(inv.byName || "").slice(0, 40) };
          const history = [...lite.historyList(base), { pts: INVITE_KARMA, reason: `🍻 ${name} ist über deinen Link dabei`, time: now }];
          return { ...base, total: (Number(base.total) || 0) + INVITE_KARMA, history: history.slice(-200) };
        });
      }
      await deliverTargeted({
        toIds: await profileLogins(db, by),
        fromId: uid,
        type: "invite",
        title: "🍻 Neu dabei",
        body: `${name} ist über deinen Link dabei${quota.committed ? ` — +${INVITE_KARMA} Karma für dich` : ""}. Sag Hallo mit einem Kompliment 💐`,
        query: `?profile=${encodeURIComponent(uid)}&focus=compliment`
      });
    } catch (err) {
      logger.error("inviteJoined failed:", err);
    }
  }
);
