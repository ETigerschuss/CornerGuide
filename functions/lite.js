/**
 * Slim data for the app start — shared by the Cloud Functions (index.js) and
 * the one-time backfill (.github/scripts/admin-tools.cjs), so both compute
 * exactly the same thing.
 *
 * The app no longer downloads whole nodes when it starts; it reads these small
 * copies instead and loads the details only where they are shown:
 *   points/{key}, karmaPoints/{key}   → pointsLite/{key}, karmaLite/{key}
 *                                       (total, name, profile link, last activity — no history)
 *   visits/{corner}/{id}              → visitStats/{corner} { n, last }
 *                                       visitsByUser/{login}/{id} or visitsByName/{name}/{id} { c, t, tm }
 *   photos/{corner}/{id}              → photoCovers/{corner} { id, n, t, thumb | src }
 *                                       inline images move to photoData/{corner}/{id} { src }
 */
const jpeg = require("jpeg-js");

const THUMB_MAX = 360;        // long side of the small picture on cards and in the gallery
const THUMB_QUALITY = 60;

function historyList(entry) {
  const h = entry && entry.history;
  return Array.isArray(h) ? h.filter(Boolean) : (h && typeof h === "object" ? Object.values(h).filter(Boolean) : []);
}

// points / karmaPoints entry → what everyone needs to see of it.
function rewardLite(entry, withAlias) {
  if (!entry || typeof entry !== "object") return null;
  const last = historyList(entry).reduce((m, h) => Math.max(m, Number(h.time) || 0), Number(entry.last) || 0);
  const lite = { total: Number(entry.total) || 0 };
  if (typeof entry.nickname === "string" && entry.nickname) lite.nickname = entry.nickname.slice(0, 40);
  if (withAlias && typeof entry.aliasOf === "string" && entry.aliasOf) lite.aliasOf = entry.aliasOf;
  if (last) lite.last = last;
  return lite;
}

// Database keys may not contain . # $ [ ] / or control characters.
function nameKey(name) {
  return String(name || "").trim().slice(0, 60).replace(/[.#$[\]/\u0000-\u001f\u007f]/g, "_") || "_";
}
function safeKey(key) {
  return typeof key === "string" && key && key.length <= 128 && !/[.#$[\]/\u0000-\u001f\u007f]/.test(key);
}

// Where a check-in is listed for its person: by login, or by name for very
// old check-ins that were stored without one.
function visitIndexPath(visitId, v) {
  if (!v || typeof v !== "object") return null;
  if (safeKey(v.userId)) return `visitsByUser/${v.userId}/${visitId}`;
  if (typeof v.user === "string" && v.user) return `visitsByName/${nameKey(v.user)}/${visitId}`;
  return null;
}
function visitIndexEntry(cornerId, v) {
  const e = { c: cornerId, t: Number(v.time) || 0 };
  if (typeof v.team === "string" && v.team) e.tm = v.team.slice(0, 40);
  return e;
}
function visitStatsOf(list) {
  const visits = Object.values(list || {}).filter((v) => v && typeof v === "object");
  if (!visits.length) return null;
  return { n: visits.length, last: visits.reduce((m, v) => Math.max(m, Number(v.time) || 0), 0) };
}

const isInline = (src) => typeof src === "string" && src.startsWith("data:");

// Same order as the app: best average rating, then most ratings, then newest.
function coverOf(photos) {
  const list = Object.entries(photos || {}).filter(([, p]) => p && typeof p === "object" && (p.thumb || p.src));
  if (!list.length) return null;
  const ranked = list.map(([id, p]) => {
    const r = Object.values(p.ratings || {}).map(Number).filter((x) => x > 0);
    return { id, p, avg: r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0, votes: r.length };
  }).sort((a, b) => b.avg - a.avg || b.votes - a.votes || (Number(b.p.time) || 0) - (Number(a.p.time) || 0));
  const { id, p } = ranked[0];
  const cover = { id, n: list.length, t: Number(p.time) || 0 };
  if (typeof p.thumb === "string" && p.thumb) cover.thumb = p.thumb;
  if (typeof p.src === "string" && p.src && !isInline(p.src)) cover.src = p.src;   // a Storage URL
  return cover;
}

// A small JPEG from an inline JPEG data URL (box filter), or "" if that is not
// possible (other formats, broken data).
function makeThumb(dataUrl, maxSide = THUMB_MAX, quality = THUMB_QUALITY) {
  try {
    const m = /^data:image\/jpe?g;base64,(.+)$/i.exec(String(dataUrl || ""));
    if (!m) return "";
    const img = jpeg.decode(Buffer.from(m[1], "base64"), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const out = Buffer.alloc(w * h * 4);
    const xr = img.width / w, yr = img.height / h;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y * yr), y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * yr)));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * xr), x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * xr)));
        let r = 0, g = 0, b = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const i = (yy * img.width + xx) * 4;
            r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
          }
        }
        const o = (y * w + x) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
      }
    }
    const enc = jpeg.encode({ data: out, width: w, height: h }, quality);
    return "data:image/jpeg;base64," + Buffer.from(enc.data).toString("base64");
  } catch (err) {
    return "";
  }
}

module.exports = { historyList, rewardLite, nameKey, safeKey, visitIndexPath, visitIndexEntry, visitStatsOf, isInline, coverOf, makeThumb, THUMB_MAX };
