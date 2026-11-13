// Deploys the Realtime Database rules and the Storage rules with the Firebase
// Admin SDK. Unlike `firebase deploy`, this needs no Google Cloud IAM roles
// beyond what the Firebase Admin SDK service account already has (the CLI
// first checks enabled APIs via Service Usage, which that account may not read).
//
// Usage (CI): NODE_PATH=functions/node_modules node .github/scripts/deploy-rules.cjs
// Credentials come from GOOGLE_APPLICATION_CREDENTIALS.
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { getSecurityRules } = require("firebase-admin/security-rules");

const ROOT = path.resolve(__dirname, "..", "..");
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || "https://cornerguide-default-rtdb.europe-west1.firebasedatabase.app";
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "cornerguide.firebasestorage.app";
const only = (process.argv[2] || "database,storage").split(",").map((s) => s.trim()).filter(Boolean);

async function deployDatabase() {
  const source = fs.readFileSync(path.join(ROOT, "firebase.database.rules.json"), "utf8");
  const parsed = JSON.parse(source);               // fail early on broken JSON
  await admin.database().setRules(source);
  const live = await admin.database().getRulesJSON();
  const expected = Object.keys(parsed.rules || {}).sort();
  const missing = expected.filter((k) => !(live.rules && k in live.rules));
  if (missing.length) throw new Error(`Database rules read back without: ${missing.join(", ")}`);
  console.log(`✔ Realtime Database rules deployed (${expected.length} top-level nodes) to ${DATABASE_URL}`);
}

async function deployStorage() {
  const source = fs.readFileSync(path.join(ROOT, "storage.rules"), "utf8");
  const ruleset = await getSecurityRules().releaseStorageRulesetFromSource(source, STORAGE_BUCKET);
  const live = await getSecurityRules().getStorageRuleset(STORAGE_BUCKET);
  if (live.name !== ruleset.name) throw new Error(`Storage release points to ${live.name}, expected ${ruleset.name}`);
  console.log(`✔ Storage rules deployed to ${STORAGE_BUCKET} (${ruleset.name})`);
}

(async () => {
  // Local tests against the database emulator accept the "owner" token.
  const credential = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    ? { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) }
    : admin.credential.applicationDefault();
  admin.initializeApp({ credential, databaseURL: DATABASE_URL, storageBucket: STORAGE_BUCKET });
  let failed = false;
  for (const target of only) {
    try {
      if (target === "database") await deployDatabase();
      else if (target === "storage") await deployStorage();
      else throw new Error(`unknown target "${target}"`);
    } catch (err) {
      failed = true;
      console.error(`✖ ${target}: ${err && err.message ? err.message : err}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
