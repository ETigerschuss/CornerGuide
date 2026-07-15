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
const { onValueCreated } = require("firebase-functions/v2/database");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const REGION = "europe-west1"; // must match the RTDB region
const APP_URL = "https://etigerschuss.github.io/CornerGuide/";
const ICON_URL = APP_URL + "icons/icon-192.png";

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

    const message = {
      notification: { title: ev.title || "Minga Corner Guide", body: String(ev.body).slice(0, 140) },
      webpush: {
        fcmOptions: { link: APP_URL },
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
