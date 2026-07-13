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

    try {
      await admin.messaging().send({
        token,
        notification: { title: `💬 ${fromName}`, body },
        webpush: {
          fcmOptions: { link: APP_URL },
          notification: { icon: "/icons/icon.svg", tag: `dm-${toId}` }
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
