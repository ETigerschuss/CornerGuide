/* ====================== CORNER-INFO ======================
   ☀️ when the sun is out (forecast + sun position), 🏪 nearest kiosk / Späti /
   petrol station with a walking route, ☔ what to do when it rains.
   Data: Open-Meteo (weather, no key) and OpenStreetMap via Overpass (shops,
   shelters). Both are free, allow browser requests and only ever see the
   corner's public coordinates. Results are cached to keep requests rare.   */
const WEATHER_TTL_MS = 30 * 60 * 1000;
const PLACES_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const PLACE_KINDS = {
  kiosk:   { emoji: "🏪", de: "Kiosk", en: "Kiosk", supply: true },
  spaeti:  { emoji: "🏪", de: "Späti / Laden", en: "Corner shop", supply: true },
  drinks:  { emoji: "🍺", de: "Getränkemarkt", en: "Drinks shop", supply: true },
  super:   { emoji: "🛒", de: "Supermarkt", en: "Supermarket", supply: true },
  fuel:    { emoji: "⛽", de: "Tankstelle", en: "Petrol station", supply: true },
  shelter: { emoji: "🛖", de: "Unterstand", en: "Shelter", rain: true },
  stop:    { emoji: "🚏", de: "Haltestelle mit Dach", en: "Covered stop", rain: true },
  arcade:  { emoji: "🏛️", de: "Arkade / Durchgang", en: "Arcade / passage", rain: true },
  roof:    { emoji: "⛱️", de: "Überdachung", en: "Canopy", rain: true },
  toilet:  { emoji: "🚻", de: "Toilette", en: "Toilet", amenity: true },
  water:   { emoji: "🚰", de: "Trinkwasser", en: "Drinking water", amenity: true },
  bin:     { emoji: "🗑️", de: "Mülleimer", en: "Bin", amenity: true },
  glass:   { emoji: "🍾", de: "Glascontainer", en: "Bottle bank", amenity: true },
  bench:   { emoji: "🪑", de: "Bank", en: "Bench", amenity: true }
};
// Map layers in the corner info (legend chips toggle them).
const CI_MAP_GROUPS = [
  { id: "supply", emoji: "🏪", de: "Kiosk & Co.", en: "Shops", kinds: ["kiosk", "spaeti", "drinks", "super", "fuel"], on: true },
  { id: "toilet", emoji: "🚻", de: "Toiletten", en: "Toilets", kinds: ["toilet"], on: true },
  { id: "water", emoji: "🚰", de: "Trinkwasser", en: "Water", kinds: ["water"], on: true },
  { id: "rain", emoji: "☂️", de: "Unterstand", en: "Shelter", kinds: ["shelter", "stop", "arcade", "roof"], on: true },
  { id: "bin", emoji: "🗑️", de: "Mülleimer", en: "Bins", kinds: ["bin", "glass"], on: false },
  { id: "bench", emoji: "🪑", de: "Bänke", en: "Benches", kinds: ["bench"], on: false }
];
// How many of each kind are kept (nearest first) so benches can't push the kiosks out.
const PLACE_CAPS = { kiosk: 8, spaeti: 8, drinks: 4, super: 4, fuel: 3, shelter: 4, stop: 4, arcade: 4, roof: 4, toilet: 6, water: 6, bin: 8, glass: 4, bench: 12 };
const RAINY_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
var _infoInflight = {};

function infoCacheGet(key, ttl) {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); if (v && Date.now() - v.at < ttl) return v.data; }
  catch (e) { /* ignore */ }
  return null;
}
function infoCacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); }
  catch (e) { /* storage full: just don't cache */ }
}
async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally { if (timer) clearTimeout(timer); }
}
function cachedFetch(key, ttl, load) {
  const hit = infoCacheGet(key, ttl);
  if (hit) return Promise.resolve(hit);
  if (!_infoInflight[key]) {
    _infoInflight[key] = load()
      .then((data) => { infoCacheSet(key, data); return data; })
      .finally(() => { delete _infoInflight[key]; });
  }
  return _infoInflight[key];
}

function walkingRouteUrl(lat, lng) {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
function formatDistance(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }
function clockOf(ms) { return new Date(ms).toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" }); }

// Solar elevation in degrees (compact NOAA-style approximation, ±0.5°).
function sunElevationDeg(ms, lat, lng) {
  const rad = Math.PI / 180;
  const d = ms / 86400000 - 10957.5;                         // days since J2000.0
  const g = rad * ((357.529 + 0.98560028 * d) % 360);
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = rad * (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
  const e = rad * (23.439 - 0.00000036 * d);
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = rad * (gmst * 15 + lng) - ra;
  const phi = rad * lat;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha)) / rad;
}
// Sunrise/sunset, golden hour and when the sun is high enough (>15°) to reach
// streets between houses — scanned in 2-minute steps over the local day.
function sunDay(ms, lat, lng) {
  const start = new Date(ms);
  start.setHours(0, 0, 0, 0);
  const out = { rise: null, set: null, highFrom: null, highTo: null, golden: null, maxEl: -90 };
  let prev = sunElevationDeg(start.getTime(), lat, lng);
  for (let min = 2; min <= 1440; min += 2) {
    const t = start.getTime() + min * 60000;
    const el = sunElevationDeg(t, lat, lng);
    if (prev < -0.833 && el >= -0.833) out.rise = t;
    if (prev >= -0.833 && el < -0.833) out.set = t;
    if (prev < 15 && el >= 15) out.highFrom = t;
    if (prev >= 15 && el < 15) out.highTo = t;
    if (prev < 4 && el >= 4) out.openFrom = t;     // open squares, parks, the Isar
    if (prev >= 4 && el < 4) out.openTo = t;
    if (prev >= 6 && el < 6) out.golden = t;
    out.maxEl = Math.max(out.maxEl, el);
    prev = el;
  }
  return out;
}

function getWeather(lat, lng) {
  const key = `cg.wx.${lat.toFixed(2)}_${lng.toFixed(2)}`;
  return cachedFetch(key, WEATHER_TTL_MS, () => fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,sunshine_duration,is_day" +
    "&timezone=Europe%2FBerlin&forecast_days=2"));
}

function analyzeWeather(wx, now = Date.now()) {
  const h = wx && wx.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const off = Number(wx.utc_offset_seconds || 0) * 1000;
  const toMs = (s) => {
    const [date, time] = String(s).split("T");
    const [Y, M, D] = date.split("-").map(Number);
    const [hh, mm] = (time || "00:00").split(":").map(Number);
    return Date.UTC(Y, M - 1, D, hh, mm || 0) - off;
  };
  const hours = h.time.map((s, i) => ({
    t: toMs(s), temp: h.temperature_2m?.[i], pop: h.precipitation_probability?.[i], mm: h.precipitation?.[i],
    code: h.weather_code?.[i], sun: h.sunshine_duration?.[i], day: h.is_day?.[i]
  }));
  const localDay = (ms) => new Date(ms + off).toISOString().slice(0, 10);
  const today = localDay(now);
  const cur = hours.find((x) => x.t <= now && now < x.t + 3600000) || null;
  const next = hours.filter((x) => x.t + 3600000 > now).slice(0, 10);
  const sunny = hours.filter((x) => localDay(x.t) === today && Number(x.sun) >= 1800).map((x) => x.t);
  const ranges = [];
  sunny.forEach((t) => {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === t) last[1] = t + 3600000; else ranges.push([t, t + 3600000]);
  });
  const isRain = (x) => Number(x.pop) >= 50 || Number(x.mm) >= 0.3;
  const rainingNow = !!cur && (Number(cur.mm) >= 0.2 || RAINY_CODES.includes(Number(cur.code)));
  const rainSoon = next.slice(0, 12).find(isRain) || null;
  const dryAgain = rainingNow || rainSoon ? next.slice(next.indexOf(rainSoon || cur) + 1, 12).find((x) => !isRain(x)) || null : null;
  return { cur, next, ranges, rainingNow, rainSoon, dryAgain };
}

function weatherEmoji(code, isDay = 1) {
  const c = Number(code);
  if (c === 0) return isDay ? "☀️" : "🌙";
  if (c === 1) return isDay ? "🌤️" : "🌙";
  if (c === 2) return "⛅";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if ([51, 53, 55, 80, 81, 82].includes(c)) return "🌦️";
  if ([56, 57, 61, 63, 65, 66, 67].includes(c)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(c)) return "🌨️";
  if ([95, 96, 99].includes(c)) return "⛈️";
  return "🌡️";
}
function hourLabel(ms) { return `${new Date(ms).getHours()}`; }
function sunRangesText(ranges) {
  return ranges.map(([a, b]) => `${hourLabel(a)}–${hourLabel(b)}`).join(" & ") + " " + T("Uhr", "h");
}

// One-line verdict on the sun for today ("von wann bis wann ist Sonne").
function sunVerdictHtml(an, now = Date.now()) {
  if (!an) return "";
  const { ranges } = an;
  if (!ranges.length) return `☁️ ${T("Heute kaum Sonne laut Vorhersage.", "Hardly any sun today according to the forecast.")}`;
  const nowRange = ranges.find(([a, b]) => a <= now && now < b);
  if (nowRange) return `☀️ <strong>${T("Gerade Sonne", "Sunny now")}</strong> — ${T("noch bis ca.", "until about")} ${hourLabel(nowRange[1])} ${T("Uhr", "h")}${ranges.length > 1 ? ` · ${T("heute", "today")}: ${sunRangesText(ranges)}` : ""}`;
  if (ranges.some(([a]) => a > now)) return `☀️ <strong>${T("Sonne heute", "Sun today")}: ${sunRangesText(ranges.filter(([, b]) => b > now))}</strong>`;
  return `🌥️ ${T("Die Sonne ist für heute durch", "The sun is done for today")} (${T("war", "was")} ${sunRangesText(ranges)})`;
}

function rainVerdictHtml(an) {
  if (!an) return "";
  if (an.rainingNow) return `<span class="ci-rain">☔ ${T("Gerade Regen", "Raining now")}</span>${an.dryAgain ? ` — ${T("trocken ab ca.", "dry from about")} ${hourLabel(an.dryAgain.t)} ${T("Uhr", "h")}` : ""}`;
  if (an.rainSoon) return `<span class="ci-rain">☔ ${T("Regen ab ca.", "Rain from about")} ${hourLabel(an.rainSoon.t)} ${T("Uhr", "h")} (${Math.round(Number(an.rainSoon.pop) || 0)} %)</span>`;
  return `🌂 ${T("Die nächsten Stunden trocken.", "Dry for the next hours.")}`;
}

function weatherBlockHtml(an) {
  if (!an || !an.next.length) return `<div class="ci-small">${T("Wetter gerade nicht verfügbar.", "Weather unavailable right now.")}</div>`;
  const now = an.cur || an.next[0];
  const strip = an.next.slice(0, 9).map((x, i) => `<div class="ci-hour ${i === 0 ? "now" : ""}"><div>${i === 0 ? T("jetzt", "now") : hourLabel(x.t) + "h"}</div><span class="ci-hi">${weatherEmoji(x.code, x.day)}</span><div>${Math.round(Number(x.temp))}°</div>${Number(x.pop) >= 20 ? `<div class="ci-hp">${Math.round(Number(x.pop))}%</div>` : ""}</div>`).join("");
  return `<div class="ci-line">${sunVerdictHtml(an)}</div>
    <div class="ci-line">${weatherEmoji(now.code, now.day)} ${Math.round(Number(now.temp))}° · ${rainVerdictHtml(an)}</div>
    <div class="ci-hours">${strip}</div>`;
}

// "Weils so ein offener Platz ist sollte die Sonne schon länger da sein":
// the 15° rule is for streets between houses. The crew says what kind of
// place a corner is; open places get the sun from ~4° above the horizon.
function cornerIsOpenPlace(cornerId) {
  const open = getEmojiVoteData(cornerId, "offen").count;
  const houses = getEmojiVoteData(cornerId, "haeuser").count;
  if (open !== houses) return open > houses;
  const c = getAllCorners().find((x) => x.id === cornerId);
  const text = `${c?.name || ""} ${c?.area || ""} ${(c?.tags || []).join(" ")} ${c?.description || ""}`.toLowerCase();
  return /isar|park|wiese|flaucher|ufer|see|platz|garten|blick|hügel|huegel/.test(text);
}
function bindPlaceVotes(container, corner) {
  container.querySelectorAll("[data-place-vote]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.dataset.placeVote;
    const other = key === "offen" ? "haeuser" : "offen";
    if (getEmojiVoteData(corner.id, other).myVote) voteEmoji(corner.id, other);   // one opinion per person
    voteEmoji(corner.id, key);
    setTimeout(() => {
      const box = container.querySelector(".ci-sun");
      if (!box) return;
      box.innerHTML = sunBlockHtml(corner);
      bindPlaceVotes(container, corner);
    }, 150);
  }));
}
function sunBlockHtml(corner) {
  const s = sunDay(Date.now(), corner.lat, corner.lng);
  const parts = [];
  if (s.set) parts.push(`🌇 ${T("Sonnenuntergang", "Sunset")} <strong>${clockOf(s.set)}</strong>`);
  if (s.golden) parts.push(`${T("Golden Hour ab", "golden hour from")} ${clockOf(s.golden)}`);
  const open = cornerIsOpenPlace(corner.id);
  const line = open
    ? (s.openFrom && s.openTo
      ? `🏞️ ${T("Offener Platz: Sonne von ca.", "Open place: sun from about")} <strong>${clockOf(s.openFrom)}</strong> ${T("bis", "to")} <strong>${clockOf(s.openTo)}</strong> ${T("(ab 4° über dem Horizont).", "(from 4° above the horizon).")}`
      : T("Heute kaum Sonne über dem Horizont.", "Hardly any sun above the horizon today."))
    : (s.highFrom && s.highTo
      ? `🏘️ ${T("Zwischen Häusern kommt die Sonne nur hoch genug (über 15°) von ca.", "Between buildings the sun is only high enough (above 15°) from about")} ${clockOf(s.highFrom)} ${T("bis", "to")} ${clockOf(s.highTo)}.`
      : T("Die Sonne steht heute zu tief für Straßen zwischen Häusern — offene Spots (Isar, Parks) bevorzugen.", "The sun stays too low today for streets between buildings — prefer open spots (Isar, parks)."));
  const o = getEmojiVoteData(corner.id, "offen");
  const h = getEmojiVoteData(corner.id, "haeuser");
  return `<div class="ci-line">${parts.join(" · ")}</div><div class="ci-small">${line}</div>
    <div class="ci-votes ci-place-vote" data-corner-id="${escapeHtml(corner.id)}"><span class="ci-small">${T("Wie liegt der Corner?", "What kind of place?")}</span>
      <button class="action-btn ${o.myVote ? "voted" : ""}" data-place-vote="offen">🏞️ ${T("Offener Platz", "Open place")} ${o.count || ""}</button>
      <button class="action-btn ${h.myVote ? "voted" : ""}" data-place-vote="haeuser">🏘️ ${T("Zwischen Häusern", "Between houses")} ${h.count || ""}</button>
    </div>`;
}

// Opening hours in the common OSM syntax ("Mo-Sa 07:00-22:00; Su off", "24/7",
// ranges past midnight). Anything fancier returns null = unknown.
function osmOpenNow(spec, now = new Date()) {
  const s = String(spec || "").trim();
  if (!s) return null;
  if (s === "24/7") return true;
  const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const order = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const rules = [];
  for (const raw of s.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = raw.match(/^((?:[A-Z][a-z](?:-[A-Z][a-z])?|PH|SH)(?:,(?:[A-Z][a-z](?:-[A-Z][a-z])?|PH|SH))*)?\s*(off|closed|\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/);
    if (!m) return null;
    const days = new Set();
    let onlyHoliday = !!m[1];
    if (m[1]) {
      for (const part of m[1].split(",")) {
        if (part === "PH" || part === "SH") continue;
        onlyHoliday = false;
        const [a, b] = part.split("-");
        const ia = order.indexOf(a);
        const ib = b ? order.indexOf(b) : ia;
        if (ia < 0 || ib < 0) return null;
        for (let i = ia; ; i = (i + 1) % 7) { days.add(DAYS.indexOf(order[i])); if (i === ib) break; }
      }
    } else {
      for (let i = 0; i < 7; i++) days.add(i);
    }
    if (onlyHoliday) continue;   // "PH off" etc.: holidays are unknown here
    const toMin = (x) => { const [hh, mm] = x.split(":").map(Number); return hh * 60 + mm; };
    const ranges = /^(off|closed)$/.test(m[2]) ? [] : m[2].split(",").map((r) => r.trim().split("-").map(toMin));
    rules.push({ days, ranges });
  }
  const rangesFor = (day) => { let r = null; rules.forEach((rule) => { if (rule.days.has(day)) r = rule.ranges; }); return r; };
  const today = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const [a, b] of rangesFor(today) || []) {
    if (b > a ? (mins >= a && mins < b) : mins >= a) return true;
  }
  for (const [a, b] of rangesFor((today + 6) % 7) || []) {
    if (b <= a && mins < b) return true;   // yesterday's range past midnight
  }
  return false;
}

