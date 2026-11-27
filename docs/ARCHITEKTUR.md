# Architektur & Weg zu tausenden Nutzern

Stand: November 2026. Kurz: Für eine Freundesgruppe ist die App gut aufgestellt. Für **tausende** Leute braucht es vor
allem einen anderen Umgang mit den **Daten** und der **Identität**; die Aufteilung des Codes war nur der erste Schritt.

## Wie die App heute gebaut ist

| Teil | Heute |
|---|---|
| Frontend | Eine ausgelieferte `index.html` (~720 KB, gzip ein Bruchteil davon), Quellcode nach Bereichen in `src/` (14 CSS-, 34 JS-Dateien), Vanilla JS + Leaflet, PWA mit einem Service Worker (Cache + Push), Auto-Update beim Zurückkehren in die App |
| Backend | Firebase: Realtime Database, anonyme Anmeldung, Cloud Functions (Push-Verteilung und die schlanken Kopien fürs Starten, `functions/lite.js`). Storage für Fotos und Gossip-Sprachaufnahmen (seit 27.11.2026 aktiviert) |
| Deploy | GitHub Actions: Pages (Build-Prüfung → Build-Nummer → Upload → Deploy), Firebase-Regeln & Functions bei Änderung |
| Zugang | Ein gemeinsamer Einladungscode |
| Identität | Anonymer Login pro Browser; „Wer bist du?“ verknüpft Logins mit einem Profil (`points/<login>.aliasOf`) — ohne Nachweis |
| Sichtbarkeit | Alle sehen alles (Standort, Check-ins, Corners); neu: enge Freunde, private Corners und geheime Dates, serverseitig geschützt |
| Externe Daten | OpenStreetMap/Overpass (Spot-Check, Kiosk & Co.), Open-Meteo (Wetter) — Ergebnisse werden zwischengespeichert bzw. geteilt (`cornerFacts`) |
| Tests | Playwright gegen Firebase-Emulatoren inkl. Cloud Functions, 18 Testreihen in `tests/e2e/` |

## Gemessen (November 2026)

Admin-Werkzeuge → `data-sizes` zeigt Größe und Anzahl pro Knoten, nie Inhalte. Vor Phase 1 waren es **9,0 MB**, die
jedes Handy bei jedem Start komplett lud:

| Knoten | Größe | Befund |
|---|---|---|
| `photos` | 8.612 KB | alle 32 Fotos als Bild direkt in der Datenbank — Storage war nie aktiviert, der Upload fiel jedes Mal auf „inline“ zurück |
| `points` | 85 KB | 97 % davon Punkteverlauf (1.628 Einträge), den keine Ansicht zeigt |
| `visits` | 10,5 KB | 120 Check-ins, 74 davon nur mit Namen (sehr alte App-Version) |
| alles andere | je < 20 KB | |

35 Profile, keines mit mehreren Logins, keine alten Kopien.

**Nach Phase 1** (gemessen nach `phase1-backfill`): Die App startet auf der Karte mit **unter 0,1 MB** (schlanke Punkte,
Besuchszahlen, wer gerade da ist, Corners, Kommentare & Co.). Die Titelbilder (448 KB für 21 Corners) kommen erst beim
ersten Öffnen der Liste oder eines Corners; die Fotos eines Corners (Vorschaubilder, im Schnitt ~20 KB pro Foto) beim
Öffnen des Corners; ein volles Bild (im Schnitt ~270 KB) erst beim Antippen.

## Was bei tausenden Nutzern bricht

1. **Jedes Handy lädt ganze Datenbank-Knoten.** *(Phase 1: für Fotos, Punkte, Check-ins und Presence gelöst, siehe unten.)* `points` (mit bis zu 200 Verlaufseinträgen pro Person), `presence`,
   `visits` (alle Check-ins aller Zeiten), `comments`, `photos`, `emojiVotes`, `captured`, `encounters` … werden beim Start
   komplett geladen. Bei 5.000 Leuten wären das allein für `points` grob 5.000 × 200 × 80 Byte ≈ 80 MB pro App-Start.
   Das ist langsam, frisst Akku und kostet Geld (die Realtime Database rechnet Downloads pro GB ab).
2. **Ranking und Level rechnet das Handy** aus allen Punkten aller Leute.
3. **Punkte schreibt jedes Handy selbst.** Die Regeln erlauben Mitgliedern, Punkte zu schreiben — unter Freunden okay, bei
   Fremden ist Schummeln trivial.
4. **Push an alle:** Pro Ereignis liest die Cloud Function alle Push-Tokens und Einstellungen. Bei tausenden Tokens ist
   das teuer und langsam, und „alle“ ist bei Fremden auch inhaltlich falsch.
5. **Ein Code für alle:** Wer den Code hat, ist drin — weitergeben lässt sich nicht kontrollieren, sperren auch nicht.
6. **Identität ohne Nachweis:** Wer bei „Wer bist du?“ einen Namen antippt, *ist* diese Person — inklusive deren privater
   Corners. Unter Freunden bewusst so gewählt („vorerst so lassen“), mit Fremden nicht haltbar.
7. **Alle sehen alle Standorte:** Bei Fremden ein Datenschutzproblem (DSGVO): Einwilligung, Speicherdauer, Export,
   Löschen, Datenschutzerklärung.
8. **Moderation fehlt:** Fotos, Kommentare, Gossip und Spots von Fremden brauchen Melden, Sperren, Admin-Werkzeuge.
9. **Öffentliche Overpass-Server** haben Nutzungsgrenzen. Geteilte Ergebnisse (`cornerFacts`) helfen; bei vielen Nutzern
   braucht es einen eigenen Cache/Proxy oder vorberechnete Daten.

## Fahrplan

### Phase 0 — erledigt
- Quellcode nach Bereichen in `src/`, Build ohne Abhängigkeiten (`tools/build.mjs`), Prüfung in CI und vor jedem Deploy
- Auto-Update installierter Apps, ein gemeinsamer Service Worker für Cache und Push
- Geteilte Corner-Fakten, enge Freunde, private Corners, geheime Dates (serverseitig geschützt)
- Ende-zu-Ende-Tests im Repo (`tests/e2e/`), in GitHub per Knopfdruck (Workflow „E2E-Tests“)

### Phase 1 — Daten schlank machen — erledigt
Grundsatz: **nichts wird gelöscht oder umgebaut, was ältere App-Versionen noch lesen.** Cloud Functions halten kleine
Kopien aktuell (`functions/lite.js`, für jeden Schreibvorgang, auch von alten App-Versionen); die App liest nur noch diese
und lädt Details dort, wo sie angezeigt werden. Fehlt eine Kopie oder ist sie (direkt nach einem Update) noch gesperrt,
liest die App den alten Knoten — es fehlt nie etwas.

| Beim Start | Statt | Details erst … |
|---|---|---|
| — (die Karte zeigt keine Fotos) | `photos` (8,6 MB) | `photoCovers/<corner>` (kleines Titelbild + Anzahl) beim ersten Öffnen der Liste oder eines Corners, `photos/<corner>` (Vorschaubilder) beim Öffnen des Corners, `photoData/<corner>/<id>` (volles Bild) beim Antippen |
| `pointsLite`, `karmaLite` — Summe, Name, Profil-Verknüpfung, „zuletzt aktiv“ | `points`, `karmaPoints` mit Verlauf | eigene Logins vollständig; Verlauf anderer nur, wenn ein Profil mehrere Logins hat (Kopie-Prüfung) |
| `visitStats/<corner>` — Anzahl + letzter Check-in | `visits` (alle Check-ins aller Zeiten) | `visits/<corner>` (die letzten 30) im Corner; `visitsByUser/<login>` / `visitsByName/<name>` für Profilkarte und öffentliches Profil |
| `presence` per Abfrage: nur, wer in den letzten 3½ h da war | alle Logins, die je die App geöffnet haben | — |

- Neue Fotos: Storage, sobald aktiviert — sonst das Bild in `photoData`, ein Vorschaubild in der Liste. Ältere
  App-Versionen, die noch „inline“ speichern, werden von der Cloud Function automatisch umsortiert.
- Einmalige Übernahme der alten Daten: Admin-Werkzeuge → `phase1-backfill` (wiederholbar, protokolliert nur Zahlen).
- Ranking und Level werden weiter im Handy gerechnet — jetzt aus wenigen KB statt aus dem ganzen Verlauf.
- **Firebase Storage ist seit 27.11.2026 aktiv:** neue Fotos kommen als Datei von Googles CDN (der Browser speichert sie
  zwischen), Gossip-Sprachaufnahmen laufen auch darüber. Die Karten zeigen trotzdem das kleine Vorschaubild; die URL wird
  nur groß geladen (Detail, Vollbild). Die 32 älteren Fotos liegen weiter in `photoData` (Umzug nach Storage optional).

### Noch offen aus Phase 1 (klein, aber wächst)
- `comments`, `checkinFeedback`, `encounters`, `captureHistory`, `gossipRounds` werden noch komplett geladen (heute je
  < 20 KB). Nach demselben Muster: pro Corner bzw. pro Person ablegen und erst in der Ansicht laden.
- Ranking als eigener Knoten (Top 100 + eigener Rang), wenn `pointsLite` selbst groß wird (ab einigen tausend Profilen).
- Punkte werden bei jeder Aktion einzeln geschrieben (auch „+1 aktiv“ alle ≥ 10 s), jedes Mal als Transaktion über den
  ganzen Eintrag samt Verlauf (bis ~16 KB hin und zurück). Mit tausenden aktiven Leuten zu teuer → Phase 2: Punkte
  serverseitig bzw. gebündelt, Verlauf als eigene Liste.
- Das Titelbild wird bei jeder Foto-Änderung (auch Bewertungen) aus der Fotoliste des Corners samt Vorschaubildern neu
  bestimmt. Bei sehr vielen Fotos pro Corner die Vorschaubilder getrennt ablegen.

### Phase 2 — Vertrauen & Sicherheit (bevor Fremde dazukommen)
- Echte Anmeldung (Google/Apple/E-Mail-Link) oder Bestätigung neuer Geräte auf einem eigenen Gerät
- Persönliche Einladungslinks statt eines Codes (mit Limit, nachvollziehbar, sperrbar)
- Punkte nur noch serverseitig (Cloud Functions prüfen Check-in-Abstand, Cooldown, Tageslimits)
- Kontakte (gegenseitig) und Sichtbarkeit des Standorts: alle / Kontakte / enge Freunde / niemand
- Blockieren & Melden, Moderations-Ansicht für Admins
- DSGVO: Datenschutzerklärung, Konto exportieren und löschen, Standortverlauf mit Ablaufdatum

### Phase 3 — Wachstum
- Daten nach Stadt/Region aufteilen (`corners/<stadt>/…`), Karte lädt nur den sichtbaren Ausschnitt (Geohash-Abfragen)
- Push über FCM-Themen bzw. an Kontakte statt an alle
- Code: ES-Module + Bundler (z. B. Vite), Chat/Gossip/Karten erst bei Bedarf laden, schrittweise TypeScript
- E2E-Tests automatisch in CI, Fehler-Logging, Firebase-Budgetalarm, Nutzungsstatistik
- Wo komplexe Abfragen nötig werden, Firestore ergänzen; die Realtime Database bleibt für Live-Präsenz

## Leitlinien für neue Features schon jetzt
- Nichts Neues, das jedes Handy komplett lädt: Daten pro Corner, pro Person oder pro Stadt ablegen.
- Was andere nicht sehen sollen, gehört in einen eigenen Knoten mit Leserechten — nie nur in der App ausblenden.
- Punkte, die anderen gutgeschrieben werden, perspektivisch über Cloud Functions.
- Neue Funktionen mit einer Testreihe in `tests/e2e/` absichern.
