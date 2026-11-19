// Small admin jobs that need the Firebase Admin SDK, run from GitHub Actions
// ("Admin-Werkzeuge" workflow). The repository is public, so this script never
// prints user data in clear text: exports are encrypted for the requester.
//
//   ACTION=add-admin       UID_INPUT=<firebase uid>   → config/admins/<uid> = true
//   ACTION=export-feedback PUBKEY_B64=<base64 PEM>    → comments + check-in feedback,
//        gzipped, encrypted (AES-256-GCM, key wrapped with RSA-OAEP-SHA256), base64
//        into EXPORT_FILE (the workflow pushes it to the "admin-export" branch)
const crypto = require("crypto");
const admin = require("firebase-admin");

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || "https://cornerguide-default-rtdb.europe-west1.firebasedatabase.app";

async function addAdmin(uid) {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(uid || "")) throw new Error("Ungültige Nutzer-ID.");
  await admin.database().ref(`config/admins/${uid}`).set(true);
  const granted = (await admin.database().ref(`accessGranted/${uid}`).get()).exists();
  console.log(`✔ Admin-Rechte gesetzt für ${uid}${granted ? "" : " (Hinweis: diese ID hat noch keinen Zugangscode eingelöst)"}`);
}

async function exportFeedback(pubB64) {
  const pem = Buffer.from(String(pubB64 || ""), "base64").toString("utf8");
  if (!pem.includes("PUBLIC KEY")) throw new Error("Kein gültiger öffentlicher Schlüssel übergeben.");
  const db = admin.database();
  const [comments, feedback, corners] = await Promise.all([
    db.ref("comments").get(), db.ref("checkinFeedback").get(), db.ref("corners").get()
  ]);
  const names = {};
  Object.entries(corners.val() || {}).forEach(([id, c]) => { names[id] = (c && c.name) || id; });
  const payload = require("zlib").gzipSync(Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), comments: comments.val() || {}, checkinFeedback: feedback.val() || {}, customCornerNames: names })));
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
  const wrapped = crypto.publicEncrypt({ key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  const blob = Buffer.concat([Buffer.from([wrapped.length >> 8, wrapped.length & 255]), wrapped, iv, cipher.getAuthTag(), enc]).toString("base64");
  // Written to a file that the workflow pushes to the "admin-export" branch, so
  // the requester can fetch the exact bytes with git (the log only shows sizes).
  require("fs").writeFileSync(process.env.EXPORT_FILE || "export.b64", blob + "\n");
  console.log(`✔ Export verschlüsselt (${payload.length} Bytes komprimiert, ${blob.length} Zeichen Base64).`);
}

(async () => {
  // Local tests against the database emulator accept the "owner" token.
  const credential = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    ? { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) }
    : admin.credential.applicationDefault();
  admin.initializeApp({ credential, databaseURL: DATABASE_URL });
  const action = process.env.ACTION;
  if (action === "add-admin") await addAdmin(String(process.env.UID_INPUT || "").trim());
  else if (action === "export-feedback") await exportFeedback(process.env.PUBKEY_B64);
  else throw new Error(`Unbekannte Aktion: ${action}`);
  process.exit(0);
})().catch((err) => { console.error(`✖ ${err && err.message ? err.message : err}`); process.exit(1); });
