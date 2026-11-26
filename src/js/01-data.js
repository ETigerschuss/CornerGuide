/* ====================== DATA ====================== */
const CORNERS_OG = [
  {
    id: "implerstrasse",
    name: "Sendlinger Kiosk",
    area: "Sendling-Westend",
    lat: 48.118139, lng: 11.551083,
    description: "Preislich starker Kiosk mit der unschlagbaren 1,70 Augustiner Halbe\nBequeme Sitzmöglichkeiten, Austreten machbar aber nicht ideal.",
    tags: ["Kiosk", "Augustiner", "günstig"],
    amenities: ["kiosk", "billig", "sonne"]
  },
  {
    id: "la-dolce-vita",
    name: "La Dolce Vita",
    area: "Gardasee, IT",
    lat: 45.922528, lng: 10.883167,
    description: "La dolce vita - irre Aussicht, gönnt euch Mal ne Auszeit",
    tags: ["Italien", "View", "Ausflug"],
    amenities: ["sonne", "ruhig"]
  },
  {
    id: "the-cage",
    name: "The Cage Neuhausen",
    area: "Neuhausen",
    lat: 48.153937, lng: 11.543313,
    description: "Mit kostenloser Basketballaction kann dieser Corner angeben, aber die Kids können die Gelassenheit stören",
    tags: ["Basketball", "Action"],
    amenities: ["sonne", "nachbarn"]
  },
  {
    id: "ohm-grab",
    name: "Grab v. Georg Simon Ohm",
    area: "Alter Südfriedhof",
    lat: 48.127063, lng: 11.566063,
    description: "Ein spezieller Corner: falls Mal wichtige Gespräche geführt werden müssen und die größte Berühmtheit Münchens um Rat gefragt werden muss, komm hier her!",
    tags: ["Friedhof", "Special", "Ruhig"],
    amenities: ["ruhig", "schatten"]
  },
  {
    id: "bavaria-blick",
    name: "Bavaria-Blick",
    area: "Schwanthalerhöhe",
    lat: 48.128972, lng: 11.552083,
    description: "Schöne Sonnenuntergänge mit Sicht auf die Göttin des bayrischen Nektars. Kiosk Babylon ums Eck fülligem Angebot und für schwache Blasen ein freundlicher Rückzugsort.",
    tags: ["Sunset", "Kiosk Babylon", "Bavaria"],
    amenities: ["kiosk", "toilette", "sonne"]
  },
  {
    id: "windbeutel-geheimtipp",
    name: "Tiefkühl-Geheimtipp",
    area: "Isarvorstadt",
    lat: 48.129528, lng: 11.563778,
    description: "Unbekannter Cornergeheimtipp, hab hier gerade noch ne Tiefkühlwindbeutelpackung gesehen, was mich mental direkt nach Rio in die Weihnachtszeit gebracht hat",
    tags: ["Geheimtipp", "Skurril", "Rio-Vibes"],
    amenities: ["ruhig"]
  },
  {
    id: "kapuzinerdreieck",
    name: "Kapuzinerdreieck",
    area: "Isarvorstadt",
    lat: 48.128063, lng: 11.556188,
    description: "Perfekter Spot, wenn du nah an nem Kiosk sein willst für  schnellen Nachschub 😄 Toiletten sind auch easy erreichbar. Ist bisschen laut, aber wenn du das Stadtleben live mitkriegen willst, Minute für Minute, dann ist es echt ein top Spot. Eigentlich die Mutter aller Corner.",
    tags: ["Mutter aller Corner", "Kiosk", "Toilette"],
    amenities: ["kiosk", "toilette", "billig", "nachbarn"]
  },
  {
    id: "schnecke",
    name: "Große Schnecke",
    area: "Sweet Brown Snail",
    lat: 48.132188, lng: 11.543313,
    description: "Klassiker... Schneckenplatz\nKiosk weit weg, Sitzmöglichkeiten vorhanden",
    tags: ["Klassiker", "Schnecke", "Sitzplatz"],
    amenities: ["sonne", "ruhig"]
  },
  {
    id: "kaiser-ludwig",
    name: "Denkmal Kaiser-Ludwig",
    area: "Ludwigsvorstadt",
    lat: 48.132063, lng: 11.555813,
    description: "Kein Kiosk und keine Toiletten in der Nähe.\nHistorisch wertvoll.\nBeim letzten Mal wars etwas kalt. (1/5 Sterne)",
    tags: ["Historisch", "Kalt", "1/5"],
    amenities: ["schatten"]
  },
  {
    id: "piazza-zenetti",
    name: "Piazza Zenetti",
    area: "Isarvorstadt",
    lat: 48.124563, lng: 11.555813,
    description: "nettes Flair, Bierchen von der Pizzeria und Horden an Poschies beim Theatergang beobachten.",
    tags: ["Pizzeria", "Flair", "People-Watching"],
    amenities: ["kiosk", "sonne", "nachbarn"]
  },
  {
    id: "harras",
    name: "Harras-Bänke",
    area: "Sendling",
    lat: 48.120083, lng: 11.540528,
    description: "Toller Platz Nähe Harras mit mehreren Bänken und Kiosk.\nMehrere Kneipen in der Nähe (Billardkneipe)",
    tags: ["Bänke", "Kiosk", "Billard"],
    amenities: ["kiosk", "billig", "sonne"]
  },
  {
    id: "isar-spot",
    name: "Spot ohne Namen",
    area: "Isarvorstadt",
    lat: 48.129778, lng: 11.565056,
    description: "",
    tags: ["Neu"],
    amenities: []
  }
];

/* Amenity icon definitions */
const AMENITY_ICONS = {
  kiosk: { emoji: "🏪", label: "Kiosk" },
  toilette: { emoji: "🚻", label: "Toilette" },
  billig: { emoji: "💰", label: "Billig" },
  schatten: { emoji: "🌳", label: "Schatten" },
  sonne: { emoji: "☀️", label: "Sonne" },
  ruhig: { emoji: "🤫", label: "Ruhig" },
  nachbarn: { emoji: "👀", label: "Nachbarn" },
  wasser: { emoji: "💧", label: "Wasser" },
  dach: { emoji: "☂️", label: "Dach" },
  sport: { emoji: "⚽", label: "Sport" },
  kiffen: { emoji: "🟢", label: "Grünes Licht" }
};

/* ====================== TEAMS & LEVELS ====================== */
const TEAMS = {
  plant: { emoji: "🌱", name: "Pflanze", color: "#7dde7d" },
  insect: { emoji: "🐛", name: "Insekt", color: "#e8a93e" },
  alien: { emoji: "👽", name: "Alien", color: "#b388ff" },
  wolf: { emoji: "🐺", name: "Wolf", color: "#6b8cff" },
  bird: { emoji: "🐦", name: "Vogel", color: "#ff6b9d" },
  octopus: { emoji: "🐙", name: "Oktopus", color: "#00bcd4" }
};

const CORNER_STATUSES = {
  kiosk: { emoji: "🏪", label: "Kiosk offen" },
  toilet: { emoji: "🚻", label: "Klo in der Nähe" },
  water: { emoji: "🌊", label: "Wasser" },
  smoke: { emoji: "🟢", label: "Grünes Licht" },
  police: { emoji: "🚨", label: "Polizei" }
};

const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

// getLevel and getLevelTier defined in enhanced section below

function loadTeamHistory() {
  try { return JSON.parse(localStorage.getItem("cg.teamHistory") || "{}"); }
  catch (e) { return {}; }
}

function saveTeamHistory(hist) {
  localStorage.setItem("cg.teamHistory", JSON.stringify(hist));
}

function loadNotifPref() {
  return localStorage.getItem("cg.notifPref") || "all";
}

