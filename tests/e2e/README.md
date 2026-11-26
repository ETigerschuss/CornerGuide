# Ende-zu-Ende-Tests

Die echte App (`index.html`) läuft in Chromium (Playwright) gegen die **Firebase-Emulatoren** — mehrere Personen
gleichzeitig, jede mit eigenem Browser-Kontext. Nichts davon berührt die echte Datenbank.

## Einmal einrichten

Voraussetzungen: Node 20+, Java 11+ (für die Emulatoren).

```bash
cd tests/e2e
npm install
npx playwright install chromium
```

`npm install` holt auch eine lokale Kopie des Firebase-SDKs und von Leaflet: Der Test-Server liefert sie statt der CDNs
aus und verbindet die App mit den Emulatoren (siehe `lib.js`).

## Laufen lassen

```bash
npm run emulators          # in einem eigenen Terminal, läuft weiter
npm test                   # alle Testreihen nacheinander (~15 Minuten)
node run-all.mjs circles   # nur eine Testreihe
```

`npm run emulators` kopiert vorher die aktuellen Regeln (`firebase.database.rules.json`, `storage.rules`) aus dem
Hauptordner hierher — die Firebase-CLI liest nur Dateien im eigenen Ordner. Nach einer Regeländerung die Emulatoren
neu starten.

Screenshots landen in `shots/`.

In GitHub laufen dieselben Tests unter **Actions → E2E-Tests → Run workflow** (Screenshots und Emulator-Log als
Artefakt). Bei jedem Pull Request laufen außerdem die schnellen Prüfungen (`tools/check.mjs`).

## Die Testreihen

| Datei | Prüft |
|---|---|
| `identity.js` | „Wer bist du?“, ein Profil auf mehreren Geräten, Neu-Öffnen ohne Fragen, Zugang reparieren |
| `links.js` | Links aus WhatsApp: Corner-Check-in, Cornerdate-Zusage, neue Geräte, Punkte |
| `spot.js` | Neuer Corner nur durch Tippen, Emojis aus OpenStreetMap, Regeln (KCanG, München, Ausland) |
| `facts.js` | Emojis, Filter und geteilte Fakten für bestehende Corners |
| `circles.js` | Enge Freunde, private Corners, geheime Cornerdates — serverseitig geschützt |
| `update.js` | Auto-Update installierter Apps, Service Worker |
| `districts.js` | Stadtbezirke, Pin setzen |
| `social.js`, `join.js`, `pmap.js`, `cimap.js`, `quickwins.js`, `e2e.js`, `features.js`, `regress.js`, `guide.js` | Präsenz, Folge-mir-Links, Profilkarte, Corner-Info-Karte, Gossip, Cornerdates, Punkte und vieles mehr |

Neue Funktionen bekommen eine eigene Testreihe oder erweitern eine bestehende.
