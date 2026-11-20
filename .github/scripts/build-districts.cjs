// Fetches Munich's 25 city districts (Stadtbezirke, OSM admin_level 9) from the
// Overpass API and writes them as GeoJSON with their official numbers.
//
//   node build-districts.cjs raw <out.geojson>       Overpass -> full-detail GeoJSON
//   node build-districts.cjs finish <in> <out.json>  simplified GeoJSON -> app file
//                                                   (label points, checks, rounding)
// The workflow "Stadtbezirke-Daten" runs both with mapshaper in between, which
// simplifies the outlines without opening gaps between neighbouring districts.
// Data: © OpenStreetMap contributors, ODbL.
const fs = require("fs");

const DISTRICTS = [
  ["01", "Altstadt-Lehel"],
  ["02", "Ludwigsvorstadt-Isarvorstadt"],
  ["03", "Maxvorstadt"],
  ["04", "Schwabing-West"],
  ["05", "Au-Haidhausen"],
  ["06", "Sendling"],
  ["07", "Sendling-Westpark"],
  ["08", "Schwanthalerhöhe"],
  ["09", "Neuhausen-Nymphenburg"],
  ["10", "Moosach"],
  ["11", "Milbertshofen-Am Hart"],
  ["12", "Schwabing-Freimann"],
  ["13", "Bogenhausen"],
  ["14", "Berg am Laim"],
  ["15", "Trudering-Riem"],
  ["16", "Ramersdorf-Perlach"],
  ["17", "Obergiesing-Fasangarten"],
  ["18", "Untergiesing-Harlaching"],
  ["19", "Thalkirchen-Obersendling-Forstenried-Fürstenried-Solln"],
  ["20", "Hadern"],
  ["21", "Pasing-Obermenzing"],
  ["22", "Aubing-Lochhausen-Langwied"],
  ["23", "Allach-Untermenzing"],
  ["24", "Feldmoching-Hasenbergl"],
  ["25", "Laim"]
];

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const QUERY = `[out:json][timeout:180];
area["boundary"="administrative"]["de:amtlicher_gemeindeschluessel"="09162000"]->.muc;
relation(area.muc)["boundary"="administrative"]["admin_level"="9"];
out geom;`;

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/^stadtbezirk\s*\d*\s*/, "").replace(/[^a-z]/g, "");

function matchDistrict(tags) {
  const name = norm(tags.name);
  let hit = DISTRICTS.find(([, n]) => norm(n) === name);
  if (!hit) {
    const ref = String(tags.ref || tags["ref:stadtbezirk"] || "").replace(/\D/g, "");
    if (ref) hit = DISTRICTS.find(([nr]) => Number(nr) === Number(ref));
  }
  // OSM names sometimes differ slightly ("Thalkirchen - Obersendling …").
  if (!hit) hit = DISTRICTS.find(([, n]) => name && (norm(n).startsWith(name) || name.startsWith(norm(n))));
  return hit || null;
}

async function overpass() {
  let lastErr;
  for (const url of OVERPASS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "CornerGuide district builder" }, body: "data=" + encodeURIComponent(QUERY) });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        console.warn(`Overpass attempt ${attempt} failed: ${err.message}`);
        await new Promise((r) => setTimeout(r, 5000 * attempt));
      }
    }
  }
  throw lastErr;
}

const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
const closed = (r) => r.length > 3 && same(r[0], r[r.length - 1]);

// Join the member ways of a multipolygon relation into closed rings.
function buildRings(ways) {
  const pool = ways.filter((w) => w.length > 1).map((w) => w.slice());
  const rings = [];
  while (pool.length) {
    let ring = pool.shift();
    for (let guard = 0; !closed(ring) && guard < 100000; guard++) {
      const end = ring[ring.length - 1];
      const i = pool.findIndex((w) => same(w[0], end) || same(w[w.length - 1], end));
      if (i < 0) break;
      let w = pool.splice(i, 1)[0];
      if (!same(w[0], end)) w = w.slice().reverse();
      ring = ring.concat(w.slice(1));
    }
    if (closed(ring)) rings.push(ring);
    else console.warn(`dropping an unclosed ring with ${ring.length} points`);
  }
  return rings;
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}
function inRing(pt, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

async function raw(out) {
  const json = await overpass();
  const features = [];
  for (const el of json.elements || []) {
    if (el.type !== "relation") continue;
    const hit = matchDistrict(el.tags || {});
    if (!hit) { console.log(`skip: ${el.tags && el.tags.name}`); continue; }
    const geom = (role) => (el.members || []).filter((m) => m.type === "way" && (m.role || "outer") === role && Array.isArray(m.geometry))
      .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
    const outers = buildRings(geom("outer"));
    const inners = buildRings(geom("inner"));
    if (!outers.length) { console.warn(`no closed outer ring for ${hit[1]}`); continue; }
    // GeoJSON: outer rings counter-clockwise (positive area here), holes clockwise.
    const polys = outers.map((o) => [ringArea(o) > 0 ? o : o.slice().reverse()]);
    inners.forEach((h) => {
      const host = polys.find((p) => inRing(h[0], p[0]));
      if (host) host.push(ringArea(h) < 0 ? h : h.slice().reverse());
    });
    features.push({ type: "Feature", properties: { nr: hit[0], name: hit[1], osm: el.id }, geometry: polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys } });
  }
  const found = new Set(features.map((f) => f.properties.nr));
  const missing = DISTRICTS.filter(([nr]) => !found.has(nr)).map(([nr, n]) => `${nr} ${n}`);
  if (missing.length) throw new Error(`missing districts: ${missing.join(", ")}`);
  fs.writeFileSync(out, JSON.stringify({ type: "FeatureCollection", features }));
  console.log(`raw: ${features.length} districts, ${fs.statSync(out).size} bytes`);
}

// A point well inside the polygon for the number label: the middle of the
// widest horizontal run through the polygon, tried at several heights.
function labelPoint(polys) {
  let best = null;
  polys.forEach((rings) => {
    const outer = rings[0];
    const ys = outer.map((p) => p[1]);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    for (let k = 1; k < 12; k++) {
      const y = minY + ((maxY - minY) * k) / 12;
      const xs = [];
      rings.forEach((r) => {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i], [xj, yj] = r[j];
          if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
        }
      });
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const w = (xs[i + 1] - xs[i]) * (1 - Math.abs(k - 6) / 12);   // prefer the middle rows
        if (!best || w > best.w) best = { w, x: (xs[i] + xs[i + 1]) / 2, y };
      }
    }
  });
  return best ? [Number(best.y.toFixed(5)), Number(best.x.toFixed(5))] : null;
}

function finish(input, out) {
  const gj = JSON.parse(fs.readFileSync(input, "utf8"));
  const round = (c) => (typeof c[0] === "number" ? [Number(c[0].toFixed(5)), Number(c[1].toFixed(5))] : c.map(round));
  const features = gj.features.map((f) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    return {
      type: "Feature",
      properties: { nr: f.properties.nr, name: f.properties.name, label: labelPoint(polys) },
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) }
    };
  }).sort((a, b) => a.properties.nr.localeCompare(b.properties.nr));
  if (features.length !== 25) throw new Error(`expected 25 districts, got ${features.length}`);
  const doc = {
    type: "FeatureCollection",
    source: "© OpenStreetMap-Mitwirkende (ODbL), Stadtbezirke der Landeshauptstadt München (admin_level 9)",
    generated: new Date().toISOString().slice(0, 10),
    features
  };
  fs.writeFileSync(out, JSON.stringify(doc));
  console.log(`final: ${features.length} districts, ${fs.statSync(out).size} bytes`);
}

const [mode, a, b] = process.argv.slice(2);
(mode === "raw" ? raw(a) : mode === "finish" ? Promise.resolve(finish(a, b)) : Promise.reject(new Error("usage: raw <out> | finish <in> <out>")))
  .catch((err) => { console.error(`✖ ${err.message}`); process.exit(1); });
