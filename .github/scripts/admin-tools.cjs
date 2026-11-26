// Small admin jobs that need the Firebase Admin SDK, run from GitHub Actions
// ("Admin-Werkzeuge" workflow). The repository is public, so this script never
// prints user data in clear text: exports are encrypted for the requester.
//
//   ACTION=add-admin       UID_INPUT=<firebase uid>   → config/admins/<uid> = true
//   ACTION=export-feedback PUBKEY_B64=<base64 PEM>    → comments, check-in feedback and
//        the in-app "Idee oder Problem?" feedback,
//        gzipped, encrypted (AES-256-GCM, key wrapped with RSA-OAEP-SHA256), base64
//        into EXPORT_FILE (the workflow pushes it to the "admin-export" branch)
const crypto = require("crypto");
const admin = require("firebase-admin");

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || "https://cornerguide-default-rtdb.europe-west1.firebasedatabase.app";
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "cornerguide.firebasestorage.app";

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
  const [comments, feedback, corners, appFeedback] = await Promise.all([
    db.ref("comments").get(), db.ref("checkinFeedback").get(), db.ref("corners").get(), db.ref("feedback").get()
  ]);
  const names = {};
  Object.entries(corners.val() || {}).forEach(([id, c]) => { names[id] = (c && c.name) || id; });
  const payload = require("zlib").gzipSync(Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), comments: comments.val() || {}, checkinFeedback: feedback.val() || {}, appFeedback: appFeedback.val() || {}, customCornerNames: names })));
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

// How much does each part of the database weigh? Prints only sizes and counts
// (never content), so it is safe for the public log. Helps decide what the app
// should stop loading at startup.
async function dataSizes() {
  const root = (await admin.database().ref().get()).val() || {};
  const bytes = (v) => Buffer.byteLength(JSON.stringify(v === undefined ? null : v));
  const kb = (n) => (n / 1024).toFixed(1).padStart(9) + " KB";
  const rows = Object.entries(root).map(([key, val]) => ({
    key, size: bytes(val), children: val && typeof val === "object" ? Object.keys(val).length : 0
  })).sort((a, b) => b.size - a.size);
  const total = rows.reduce((s, r) => s + r.size, 0);
  console.log(`Gesamt: ${kb(total)} in ${rows.length} Knoten\n`);
  console.log("Knoten                    Größe        Einträge");
  rows.forEach((r) => console.log(`${r.key.padEnd(22)} ${kb(r.size)}   ${String(r.children).padStart(7)}`));
  // A few details that decide the design (counts only).
  const deep = (node) => Object.values(node || {}).reduce((n, v) => n + (v && typeof v === "object" ? Object.keys(v).length : 0), 0);
  const historyItems = (store) => Object.values(store || {}).reduce((n, e) => n + (e && e.history ? Object.keys(e.history).length : 0), 0);
  const historyBytes = (store) => Object.values(store || {}).reduce((n, e) => n + (e && e.history ? bytes(e.history) : 0), 0);
  let inlinePhotos = 0, inlineBytes = 0, photoCount = 0;
  Object.values(root.photos || {}).forEach((list) => Object.values(list || {}).forEach((p) => {
    photoCount++;
    if (p && typeof p.src === "string" && p.src.startsWith("data:")) { inlinePhotos++; inlineBytes += p.src.length; }
  }));
  console.log("\nDetails");
  console.log(`points: ${historyItems(root.points)} Verlaufseinträge, davon ${kb(historyBytes(root.points)).trim()} Verlauf`);
  console.log(`karmaPoints: ${historyItems(root.karmaPoints)} Verlaufseinträge, davon ${kb(historyBytes(root.karmaPoints)).trim()} Verlauf`);
  console.log(`visits: ${deep(root.visits)} Check-ins an ${Object.keys(root.visits || {}).length} Corners`);
  console.log(`photos: ${photoCount} Fotos, davon ${inlinePhotos} direkt in der Datenbank (${kb(inlineBytes).trim()})`);
  console.log(`comments: ${deep(root.comments)} Kommentare an ${Object.keys(root.comments || {}).length} Corners`);
  console.log(`presence: ${Object.keys(root.presence || {}).length} Einträge, davon ${Object.values(root.presence || {}).filter((p) => p && Date.now() - Number(p.lastSeen || 0) < 86400000).length} in den letzten 24 h aktiv`);
  // Photos only end up in the database when the Storage upload fails — is
  // there a bucket at all? (yes/no and file counts only)
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    console.log("\nStorage");
    for (const name of [STORAGE_BUCKET, "cornerguide.appspot.com"]) {
      try {
        const bucket = admin.storage().bucket(name);
        const [exists] = await bucket.exists();
        let files = "";
        if (exists) {
          const [photos] = await bucket.getFiles({ prefix: "cornerPhotos/", maxResults: 500 });
          const [audio] = await bucket.getFiles({ prefix: "gossipAudio/", maxResults: 500 });
          files = ` — ${photos.length} Fotos, ${audio.length} Sprachaufnahmen`;
        }
        console.log(`${name}: ${exists ? "vorhanden" : "nicht vorhanden"}${files}`);
      } catch (err) {
        console.log(`${name}: Prüfung nicht möglich (${String(err && (err.code || err.message) || err).slice(0, 120)})`);
      }
    }
  }
}

(async () => {
  // Local tests against the database emulator accept the "owner" token.
  const credential = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    ? { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) }
    : admin.credential.applicationDefault();
  admin.initializeApp({ credential, databaseURL: DATABASE_URL, storageBucket: STORAGE_BUCKET });
  const action = process.env.ACTION;
  if (action === "add-admin") await addAdmin(String(process.env.UID_INPUT || "").trim());
  else if (action === "export-feedback") await exportFeedback(process.env.PUBKEY_B64);
  else if (action === "data-sizes") await dataSizes();
  else throw new Error(`Unbekannte Aktion: ${action}`);
  process.exit(0);
})().catch((err) => { console.error(`✖ ${err && err.message ? err.message : err}`); process.exit(1); });
