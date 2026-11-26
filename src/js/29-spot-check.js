/* ====================== SPOT-CHECK: what's there, what's allowed ======================
   "Das Hinzufügen eines neuen Corners sollte nur durch Tippen funktionieren:
   automatische Erkennung des Standorts, welcher Stadtteil und ein paar Emojis
   für Toilette, Wasser, Dach, Sport, Kiosk, Marijuana erlaubt — am besten
   automatisch: Schulen in der Nähe, Regeln der Stadt (Parköffnungszeiten,
   Fußgängerzone …)."
   One OpenStreetMap (Overpass) query around the pin. Rules as of November
   2026 (official texts; the app says "ohne Gewähr" and links them):
   • § 5 KCanG: no consumption within sight of schools, children's and youth
     facilities, playgrounds and publicly accessible sports facilities —
     "within sight" ends 100 m from the entrance; in pedestrian zones not
     from 7 to 20 h; never in front of minors. We measure to the grounds,
     which is stricter than to the entrance.
   • Bavaria (Cannabisfolgenbegrenzungsgesetz 2024): no smoking/vaping at
     Volksfeste, in beer gardens and outdoor areas of restaurants.
   • Munich: alcohol AND cannabis banned around the clock at the Alter
     Botanischer Garten / Karl-Stützel-Platz (ACVV, until 14.01.2027);
     alcohol banned around the clock around the Hauptbahnhof (until
     01.05.2028).
   • The 2024 cannabis ban in Englischer Garten, Hofgarten and Finanzgarten
     was declared void by the BayVGH on 24.11.2025: federal rules apply.  */
const KCANG_DISTANCE_M = 100;
const SPOT_RADII = { toilette: 250, wasser: 250, dach: 50, sport: 150, kiosk: 400 };
const SPOT_AMENITIES = [
  { key: "toilette", emoji: "🚻", de: "Toilette", en: "Toilet" },
  { key: "wasser", emoji: "💧", de: "Wasser", en: "Water" },
  { key: "dach", emoji: "☂️", de: "Dach", en: "Roof" },
  { key: "sport", emoji: "⚽", de: "Sport", en: "Sports" },
  { key: "kiosk", emoji: "🏪", de: "Kiosk", en: "Kiosk" },
  { key: "kiffen", emoji: "🟢", de: "Grünes Licht", en: "Green light" }
];
const ACVV_UNTIL = new Date(2027, 0, 15).getTime();
const HBF_ALCOHOL_UNTIL = new Date(2028, 4, 1).getTime();   // "tritt am 01.05.2028 außer Kraft"
const HBF_CENTER = { lat: 48.1402, lng: 11.5600 };
const HBF_ZONE_STREETS = ["Bahnhofplatz", "Arnulfstraße", "Bayerstraße", "Schützenstraße", "Prielmayerstraße", "Luitpoldstraße", "Dachauer Straße", "Hirtenstraße", "Elisenstraße", "Pfefferstraße", "Paul-Heyse-Unterführung"];
// Outside Germany (as of November 2026): Austria keeps cannabis under the
// Suchtmittelgesetz; in Italy personal use is not legal either (fines).
const COUNTRY_WEED_RULES = {
  AT: { de: "in Österreich (Gesetz)", en: "in Austria (law)" },
  IT: { de: "in Italien (auch privat gibt es Strafen)", en: "in Italy (fines even in private)" }
};
const RULE_SOURCES = {
  kcang: "https://www.gesetze-im-internet.de/kcang/__5.html",
  acvv: "https://stadt.muenchen.de/rathaus/stadtrecht/vorschrift/331.html",
  hbf: "https://stadt.muenchen.de/rathaus/stadtrecht/vorschrift/330.html"
};

function spotCheckQuery(lat, lng) {
  const a = (r) => `(around:${r},${lat},${lng})`;
  return `[out:json][timeout:25];(` +
    `nwr["amenity"~"^(school|kindergarten|childcare)$"]${a(150)};` +
    `nwr["leisure"="playground"]${a(150)};` +
    `nwr["community_centre"="youth_centre"]${a(150)};` +
    `nwr["leisure"~"^(pitch|sports_centre|stadium|track|sports_hall|fitness_station)$"]${a(160)};` +
    `nwr["highway"="pedestrian"]${a(40)};` +
    `nwr["amenity"="biergarten"]${a(40)};` +
    `nwr["name"~"^(Alter Botanischer Garten|Karl-Stützel-Platz)$"]${a(80)};` +
    `nwr["place"="square"]["name"]${a(60)};` +
    `nwr["amenity"="toilets"]${a(SPOT_RADII.toilette)};` +
    `nwr["amenity"="drinking_water"]${a(SPOT_RADII.wasser)};` +
    `nwr["amenity"="shelter"]${a(SPOT_RADII.dach)};` +
    `nwr["building"="roof"]${a(SPOT_RADII.dach)};` +
    `way["highway"]["covered"~"^(yes|arcade)$"]${a(30)};` +
    `nwr["shop"~"^(kiosk|convenience|beverages|alcohol)$"]${a(SPOT_RADII.kiosk)};` +
    `nwr["amenity"="fuel"]${a(SPOT_RADII.kiosk)};` +
    `way["highway"]["name"]${a(70)};` +
    `);out tags geom;` +
    `is_in(${lat},${lng})->.a;(area.a["leisure"~"^(park|garden)$"]["name"];area.a["place"="square"]["name"];area.a["landuse"="recreation_ground"]["name"];area.a["admin_level"="2"]["ISO3166-1"];);out tags;`;
}

// Distance from the point to a node, a way or a relation (0 when inside an area).
function osmSegmentDistanceM(lat, lng, p, q) {
  const kx = Math.cos(lat * Math.PI / 180) * 111320, ky = 110540;
  const ax = (p.lon - lng) * kx, ay = (p.lat - lat) * ky;
  const bx = (q.lon - lng) * kx, by = (q.lat - lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function osmPointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (((a.lat > lat) !== (b.lat > lat)) && (lng < (b.lon - a.lon) * (lat - a.lat) / (b.lat - a.lat) + a.lon)) inside = !inside;
  }
  return inside;
}
function osmElementDistanceM(el, lat, lng) {
  if (typeof el.lat === "number" && typeof el.lon === "number") return haversine(lat, lng, el.lat, el.lon);
  const lines = [];
  if (Array.isArray(el.geometry)) lines.push(el.geometry.filter(Boolean));
  (el.members || []).forEach((m) => {
    if (Array.isArray(m.geometry)) lines.push(m.geometry.filter(Boolean));
    else if (typeof m.lat === "number") lines.push([{ lat: m.lat, lon: m.lon }]);
  });
  let best = Infinity;
  lines.forEach((g) => {
    if (!g.length) return;
    if (g.length === 1) { best = Math.min(best, haversine(lat, lng, g[0].lat, g[0].lon)); return; }
    const closed = g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
    if (closed && osmPointInRing(lat, lng, g)) best = 0;
    for (let i = 0; i < g.length - 1; i++) best = Math.min(best, osmSegmentDistanceM(lat, lng, g[i], g[i + 1]));
  });
  return best;
}

function kcangPlace(t) {
  if (t.amenity === "school") return T("Schule", "School");
  if (t.amenity === "kindergarten" || t.amenity === "childcare") return T("Kita", "Daycare");
  if (t.leisure === "playground") return T("Spielplatz", "Playground");
  if (t.community_centre === "youth_centre") return T("Jugendtreff", "Youth centre");
  if (/^(pitch|sports_centre|stadium|track|sports_hall)$/.test(t.leisure || "") && !/^(private|no)$/.test(t.access || "")) return T("Sportplatz", "Sports ground");
  return "";
}

// Condense the Overpass answer into what the app needs (cached per spot).
function analyzeSpot(json, lat, lng) {
  const res = { lat, lng, country: "", has: {}, nearest: {}, kcang: [], pedestrian: false, biergarten: "", acvv: false, hbf: false, parks: [], streets: [], squares: [] };
  const streetD = {};
  ((json && json.elements) || []).forEach((el) => {
    const t = el.tags || {};
    if (el.type === "area") {
      if (t["ISO3166-1"]) { res.country = String(t["ISO3166-1"]).toUpperCase(); return; }
      if (t.name && (t.leisure || t.place === "square" || t.landuse)) res.parks.push({ name: String(t.name).slice(0, 60), hours: String(t.opening_hours || "").slice(0, 120), square: t.place === "square" });
      if (t.name === "Alter Botanischer Garten") res.acvv = true;
      return;
    }
    const d = Math.round(osmElementDistanceM(el, lat, lng));
    if (!Number.isFinite(d)) return;
    const near = (key, r) => { if (d <= r) { res.has[key] = true; if (!(res.nearest[key] <= d)) res.nearest[key] = d; } };
    const place = kcangPlace(t);
    if (place && d <= KCANG_DISTANCE_M) res.kcang.push({ place, name: String(t.name || "").slice(0, 60), d });
    if (t.highway === "pedestrian" && d <= 20) res.pedestrian = true;
    if (t.amenity === "biergarten" && d <= 30) res.biergarten = String(t.name || T("Biergarten", "Beer garden")).slice(0, 60);
    if (/^(Alter Botanischer Garten|Karl-Stützel-Platz)$/.test(t.name || "") && d <= 40) res.acvv = true;
    if (t.place === "square" && t.name && d <= 40) res.squares.push(String(t.name).slice(0, 60));
    if (t.amenity === "toilets") near("toilette", SPOT_RADII.toilette);
    if (t.amenity === "drinking_water") near("wasser", SPOT_RADII.wasser);
    if (t.amenity === "shelter" || t.building === "roof") near("dach", SPOT_RADII.dach);
    if (t.covered && t.highway) near("dach", 30);
    if (/^(pitch|sports_centre|stadium|track|sports_hall|fitness_station)$/.test(t.leisure || "") && !/^(private|no)$/.test(t.access || "")) near("sport", SPOT_RADII.sport);
    if (/^(kiosk|convenience|beverages|alcohol)$/.test(t.shop || "") || t.amenity === "fuel") near("kiosk", SPOT_RADII.kiosk);
    if (t.highway && t.name && !/^(footway|path|cycleway|steps|service|track|corridor|platform)$/.test(t.highway)) {
      const n = String(t.name).slice(0, 60);
      if (!(streetD[n] <= d)) streetD[n] = d;
    }
  });
  res.kcang.sort((a, b) => a.d - b.d);
  res.kcang = res.kcang.slice(0, 3);
  res.streets = Object.entries(streetD).sort((a, b) => a[1] - b[1]).map(([n, d]) => ({ name: n, d })).slice(0, 4);
  const hbfStreet = res.streets.some((s) => s.d <= 30 && HBF_ZONE_STREETS.includes(s.name));
  res.hbf = hbfStreet && haversine(lat, lng, HBF_CENTER.lat, HBF_CENTER.lng) <= 420;
  return res;
}

function fetchSpotCheck(lat, lng) {
  const q = spotCheckQuery(lat, lng);
  const tryMirror = (i) => fetchJson(`${OVERPASS_URLS[i]}?data=${encodeURIComponent(q)}`, 25000)
    .catch((err) => { if (i + 1 < OVERPASS_URLS.length) return tryMirror(i + 1); throw err; });
  return cachedFetch(`cg.spot2.${lat.toFixed(4)},${lng.toFixed(4)}`, PLACES_TTL_MS, () => tryMirror(0).then((json) => analyzeSpot(json, lat, lng)));
}

// 🌿 verdict: "no", "night" (pedestrian zone: only 20–7 h) or "ok".
function weedVerdict(res, now = Date.now()) {
  if (!res) return { v: "?", why: [] };
  // German law only applies in Germany. Corners in Austria and at Lake Garda
  // get what is known there; anywhere else the app does not guess.
  if (res.country && res.country !== "DE") {
    const known = COUNTRY_WEED_RULES[res.country];
    return known ? { v: "no", why: [T(known.de, known.en)], abroad: true } : { v: "?", why: [T("außerhalb Deutschlands — dort gelten andere Regeln", "outside Germany — other rules apply there")], abroad: true };
  }
  if (res.acvv && now < ACVV_UNTIL) return { v: "no", why: [T("Verbotszone der Stadt am Alten Botanischen Garten", "City ban zone at the Alter Botanischer Garten")] };
  if (res.kcang.length) return { v: "no", why: res.kcang.map((k) => `${k.place}${k.name ? ` „${k.name}“` : ""} ${T("in", "at")} ${formatDistance(k.d)}`) };
  if (res.pedestrian) return { v: "night", why: [T("Fußgängerzone (tagsüber 7–20 Uhr nicht)", "pedestrian zone (not 7 am–8 pm)")] };
  return { v: "ok", why: [T("keine Schule, Kita, Spielplatz oder Sportplatz im Umkreis von 100 m", "no school, daycare, playground or sports ground within 100 m")] };
}
function weedVerdictEmoji(v) {
  return v === "ok" ? "🟢" : v === "night" ? "🌙" : v === "?" ? "❔" : "🔴";
}
function weedAllowedNow(verdict, d = new Date()) {
  if (verdict.v === "ok") return true;
  if (verdict.v === "night") return d.getHours() >= 20 || d.getHours() < 7;
  return false;
}

// Lines for "Regeln hier" (all marked "ohne Gewähr" where shown).
function spotRuleLines(res) {
  if (!res) return [];
  const out = [];
  const w = weedVerdict(res);
  // Said with a code word ("grünes Licht"): it matters at the corner, it
  // doesn't need to shout.
  const weedText = w.v === "ok" ? T("Grünes Licht", "Green light") : w.v === "night" ? T("Grünes Licht erst ab 20 Uhr", "Green light only from 8 pm") : w.v === "?" ? T("Grünes Licht: unklar", "Green light: unclear") : T("Kein grünes Licht", "No green light");
  out.push({ emoji: weedVerdictEmoji(w.v), text: `${weedText} — ${w.why.join(", ")}`, src: w.abroad ? "" : (res.acvv ? RULE_SOURCES.acvv : RULE_SOURCES.kcang) });
  if (res.acvv && Date.now() < ACVV_UNTIL) out.push({ emoji: "🍺", text: T("Alkohol ganztägig verboten (Verordnung der Stadt, Alter Botanischer Garten / Karl-Stützel-Platz, bis 14.01.2027)", "Alcohol banned all day (city ordinance, Alter Botanischer Garten / Karl-Stützel-Platz, until 14 Jan 2027)"), src: RULE_SOURCES.acvv });
  if (res.hbf && Date.now() < HBF_ALCOHOL_UNTIL) out.push({ emoji: "🍺", text: T("Vermutlich in der Alkoholverbotszone am Hauptbahnhof (ganztägig) — genaue Straßen in der Verordnung", "Probably inside the alcohol ban zone at the Hauptbahnhof (all day) — exact streets in the ordinance"), src: RULE_SOURCES.hbf });
  if (res.biergarten) out.push({ emoji: "🍺", text: T(`Neben „${res.biergarten}“: im Biergarten selbst kein grünes Licht (Bayern)`, `Next to “${res.biergarten}”: no green light inside the beer garden (Bavaria)`) });
  res.parks.filter((p) => !p.square).forEach((p) => {
    if (!p.hours) return;
    const open = osmOpenNow(p.hours);
    out.push({ emoji: "🌳", text: `${p.name}: ${T("geöffnet", "open")} ${p.hours}${open === true ? ` · ${T("jetzt offen", "open now")}` : open === false ? ` · ${T("jetzt zu", "closed now")}` : ""}` });
  });
  return out;
}

// Name ideas: "Ecke A/B", the square, the park, the street.
function spotNameSuggestions(res) {
  if (!res) return [];
  const short = (n) => n.replace(/straße\b/g, "str.").replace(/Straße\b/g, "Str.");
  const out = [];
  const st = res.streets.map((s) => s.name);
  if (st.length >= 2) out.push(`Ecke ${short(st[0])}/${short(st[1])}`);
  res.squares.forEach((n) => out.push(n));
  res.parks.forEach((p) => out.push(p.name));
  if (st.length) out.push(st[0]);
  return Array.from(new Set(out.filter(Boolean))).slice(0, 4);
}

function amenityFromCheck(key, res) {
  if (!res) return false;
  if (key === "kiffen") return weedVerdict(res).v === "ok";
  return !!res.has[key];
}

