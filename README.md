# Minga Corner Guide 🍻

Applikation um sich mit Freunden im realen Leben zu treffen.

**Gegründet vom Gossips Stammtisch: F · G · A · ÉT**

## 🌐 Live Website

Die Seite wird automatisch über **GitHub Pages** deployed. Nach dem Merge geht sie unter:

```
https://ETigerschuss.github.io/CornerGuide/
```

## ⚡ Features

- 📍 **Corner Guide** — Liste aller Spots in München mit Karte
- 💬 **Kommentare** — Jeder kann pro Spot kommentieren
- 👥 **Freunde-Präsenz** — Sieh in Echtzeit, wer an welchem Corner ist
- 🚨 **Alarm** — Werde benachrichtigt wenn ein Freund an einem Corner ankommt
- 📷 **Fotos** — Lade Bilder zu jedem Spot hoch
- ➕ **Eigene Spots** — Füge neue Corners hinzu
- 🔗 **Share Links** — Teile direkte Corner-Links (`?corner=...`) und Einladungen (`?invite=...`)
- 🧾 **QR-Links** — Erzeuge QR-Codes für Corner-Spots
  - Hinweis: QR-Bilder werden aktuell über `api.qrserver.com` generiert (externer Dienst)
- 🗣️ **Gossip-Runden** — Ab zwei Leuten am selben Corner erzählt eine Person eine Story (aufschreiben und/oder per Mikro einsprechen), die anderen vergeben Punkte → Karma für die Person, die erzählt
- 💤 **Bleibt eingecheckt bei gesperrtem Handy** — wer eingecheckt ist, bleibt für die anderen am Corner sichtbar (mit 💤), auch wenn das Display aus ist
- 📖 **„So sammelst du Punkte"** — vollständige Punkte-Übersicht + 3×3-Reward-Matrix (Level oben antippen oder im Ranking-Tab)
- 📅 **Cornerdate** — Treffen an einem Corner planen: alle bekommen eine Push, können zusagen und es mit Uhrzeit, Ort und Karten-Pin in den Kalender übernehmen (`.ics` für iPhone/Android/Outlook, Link für Google Kalender) oder per WhatsApp teilen
- 🌤️ **Corner-Check** — pro Corner: Sonne heute von–bis (Wettervorhersage + Sonnenstand, Sonnenuntergang, Golden Hour), nächster Kiosk/Späti/Tankstelle mit „offen/zu" und Fußweg-Route, Regen-Plan (überdacht? Unterstände in der Nähe, regenfeste Corners zum Ausweichen) — plus Wetter-Zeile oben auf Karte und Liste
- 📲 **WhatsApp** — nach dem Check-in mit einem Tipp die Gruppe informieren (fertige Nachricht), optional automatisch nach jedem Check-in öffnen
- 🗺️ **Karte als Startseite** — die App öffnet auf der Karte; ein Tipp auf einen Corner (Karte oder Liste) öffnet direkt die Detailansicht, „Einchecken" und „Route" stehen dort ganz oben
- 🧲 **Folge mir** — persönlicher Link/QR (`?join=<id>`), der immer zu dem Corner führt, an dem man gerade eingecheckt ist. Neben einem gescannt: direkt eingecheckt, im selben Team, QR-Bonus. Als Link (WhatsApp): öffnet den Corner mit Route. „📨 Einladen" teilt automatisch diesen Link, solange man eingecheckt ist
- 👤 **Profile der anderen** — Namen überall antippen (Freunde-Leiste, Ranking, „gerade hier", Besucher-Trail, Fotos): Status („gerade am …" mit Route), Level, Lieblings-Corner, wie oft man sich getroffen hat, gemeinsame Gossips, Corner-Karte, Achievements, Nachricht
- 🔔 **Antippbare Hinweise** — „X ist am Corner Y" öffnet den Corner, Push-Nachrichten öffnen Corner, Chat oder Profil (`?corner=`, `?chat=`, `?profile=`)
- 🗣️ **Gossip-Chronik** — im Profil: welche Gossip-Runden man hatte, wo, mit wem und wie viele Punkte; optional mit einer Schlagzeile, die die erzählende Person selbst wählt. Die Story selbst wird nie gespeichert
- 🗺️ **Historie abspielen** — Flug durch die eigenen Check-ins: nah an jeden Münchner Corner, bei Ausflügen raus- und wieder reinzoomen, Kreise in der Teamfarbe des Check-ins, Tempo 1×/2×/4×
- 🚻 **Karte in der Corner-Info** — ganz unten: Kiosk & Co., Toiletten (kostenlos/♿), Trinkbrunnen, Unterstände, zuschaltbar Mülleimer/Glascontainer und Bänke — jeweils mit Fußweg-Route
- 👋 **„Wer bist du?"** — ein Bildschirm, zwei gleich einfache Wege: „✨ Neu hier?" (Namen eingeben) oder „👋 Schon dabei?" (eigenen Namen antippen). Ein Profil kann auf mehreren Geräten gleichzeitig angemeldet sein — beim nächsten Öffnen geht's direkt weiter (siehe unten)
- 🔗 **Links führen direkt hin** — WhatsApp-Corner-Link (`?corner=…&come=1`): Corner mit „📍 Ich bin da — einchecken" und Route ganz oben; wer schon dort ist (≤ 150 m), ist sofort eingecheckt. Cornerdate-Link (`?corner=…&cd=<id>`): Einladung mit einem Tipp „✋ Bin dabei". Auf einem neuen Gerät warten die Links, bis man gesagt hat, wer man ist
- ✨ **Updates kommen von selbst** — die App prüft beim Zurückkehren, ob es eine neue Version gibt, und lädt sie, wenn gerade nichts offen ist (sonst: „🔄 Neue Version da — tippen")
- 🏙️ **Stadtbezirke** — die 25 Münchner Stadtbezirke mit Nummer (01 Altstadt-Lehel … 25 Laim): Grenzen auf der Karte (Namen ab Zoomstufe 13, ein-/ausblendbar), Bezirksnummer an jedem Corner, Filter in der Liste, Bezirk in der Detailansicht mit „Grenzen zeigen"
- 📍 **Neuer Spot nur durch Tippen** — der Pin steht gleich da, wo man ist (oder: auf die Karte tippen/Pin ziehen); Bezirk, Stadtteil und ein Name („Ecke A/B", Platz, Park) kommen automatisch. Emojis 🚻 Toilette, 💧 Wasser, ☂️ Dach, ⚽ Sport, 🏪 Kiosk und 🟢 „grünes Licht“ sind aus OpenStreetMap vorausgefüllt und mit einem Tipp umschaltbar; Beschreibung ist optional. Warnung, wenn der Pin zu nah an einem bestehenden Corner liegt
- 🟢 **Regeln am Spot („grünes Licht“)** — bei jedem Corner (Detail → Corner-Check) und beim Eintragen: Schule/Kita/Spielplatz/Sportplatz im 100-m-Umkreis, Fußgängerzone, Parköffnungszeiten, Verbotszonen der Stadt (siehe unten)
- 👯 **Enge Freunde & private Corners** — jede Person wählt ihre engen Freunde (nur sie sieht die Liste). Ein Corner ist für 🌍 Alle, 👯 Enge Freunde oder 🔒 Nur dich; ein Cornerdate kann 🤫 geheim sein. Private Sachen gibt der Server nur an dich und deine engen Freunde heraus; dafür gibt's halbe Punkte. Übersicht im Profil unter „Teilen & enge Freunde“
- 🔎 **Emojis & Filter für alle Corners** — auch die bisherigen Corners zeigen 🚻 💧 ☂️ ⚽ 🏪 🟢 direkt auf der Karte in der Liste; Filter-Chips über der Liste zeigen z. B. nur Corners mit Toilette und grünem Licht (🟢 zählt auch „erst ab 20 Uhr“)
- 💐 **Komplimente** — auf jedem Profil (und bei den Leuten, die gerade am Corner sind) „💐 Kompliment machen": eins der fertigen antippen oder eigene Worte. Die Person bekommt **+20 Karma** und eine Push-Nachricht, du **+5 Aura** (bis 5× am Tag); ein „💛 Danke" schickt ihr +5 Karma zurück. Ein Kompliment pro Person und Tag (vom Server geprüft). Im eigenen Profil stehen alle Komplimente — und wem man als Nächstes eine Freude machen könnte
- ⚡ **Startet schlank** — die App startet auf der Karte mit unter 0,1 MB (Punkte, Besuchszahlen, wer gerade da ist) statt 9 MB wie vorher, als alle Fotos in der Datenbank lagen. Titelbilder kommen mit der Liste, Fotos und Check-ins eines Corners beim Öffnen, volle Bilder beim Antippen, Profile anderer beim Ansehen (siehe [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md))
- 💡 **Feedback an die Macher** — Profil → „Idee oder Problem?"; Admins sehen es im Admin-Panel

## 🌤️ Corner-Check: woher kommen die Daten?

- **Wetter** von [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel): Sonnenstunden, Regenwahrscheinlichkeit, Temperatur — 30 Minuten zwischengespeichert.
- **Sonnenstand** wird lokal berechnet: Sonnenauf-/-untergang, Golden Hour und wann die Sonne hoch genug steht — zwischen Häusern über 15°, auf **offenen Plätzen** (Isar, Parks, Plätze) schon ab 4°. Ob ein Corner offen liegt, stimmt die Crew ab (🏞️ Offener Platz / 🏘️ Zwischen Häusern).
- **Kiosk, Späti, Tankstelle, Unterstände, Toiletten, Trinkbrunnen, Mülleimer, Glascontainer, Bänke** aus [OpenStreetMap](https://www.openstreetmap.org) über die Overpass-API — 3 Tage pro Corner zwischengespeichert. Fehlt etwas, kann man es direkt in OpenStreetMap eintragen.
- **Regenfest?** schätzt die Community ein (☂️ überdacht / 💧 wird nass); markierte Corners schlägt die App bei Regen als Ausweichspot vor.
- Beide Dienste sehen nur die öffentlichen Koordinaten des Corners, keine Nutzerdaten.

## 📲 WhatsApp automatisch?

Ganz automatisch (ohne Tippen) geht es nicht: WhatsApp bietet für private Konten und Gruppen keine Schnittstelle. Die WhatsApp-Business-API erreicht nur
einzelne Nummern mit Einwilligung, kostet pro Unterhaltung und braucht einen Server — für eine Freundesgruppe unpassend. Die App öffnet deshalb WhatsApp mit fertig
geschriebener Nachricht; man wählt Chat oder Gruppe und tippt auf Senden. Für Benachrichtigungen ohne Zutun gibt es die Push-Nachrichten der App.

## 🗣️ Gossip-Runden

1. Mindestens **zwei Personen** sind am selben Corner eingecheckt (Corner-Detail → Abschnitt „Gossip-Runde").
2. Eine Person tippt **„Gossip-Runde starten"**, schreibt die Story auf und/oder spricht sie ein (max. 90 Sek.) und haut sie raus.
   Alle anderen am Corner bekommen einen Hinweis bzw. eine Push-Nachricht.
3. Jede andere Person am Corner vergibt Punkte: 🥱 +2 · 🙂 +5 · 😮 +10 · 🤯 +15 · 💣 +20.
   Die Punkte bleiben geheim, bis **alle bewertet haben** oder die **10 Minuten** um sind (oder die erzählende Person auflöst) — dann wird auf allen Handys gleichzeitig aufgelöst.
4. Die vergebenen Punkte landen als **Karma** bei der Person, die erzählt hat (bis zu 5 Storys pro Tag zählen); wer bewertet, bekommt +2 Aura.

**Privatsphäre:** Story-Text und Aufnahme liegen unter `gossipContent/` und sind laut Datenbank-Regeln nur für die
erzählende Person und Leute lesbar, die **an diesem Corner eingecheckt** sind. Bewerten geht nur von dort, nicht für die
eigene Story und nur, solange die Runde läuft. Runden, Storys, Bewertungen und Aufnahmen werden nach **24 Stunden** gelöscht.

**Deployen** (einmalig — bis dahin blendet die App den Gossip-Bereich einfach aus; er erscheint
automatisch, sobald die Regeln live sind):
```bash
firebase deploy --only database,storage,functions
```
- `database` — Regeln für `gossipRounds`, `gossipContent`, `gossipVotes`, `notifyTargeted`, `cornerDates`, `gossipLog` (Gossip-Chronik, nur für einen selbst lesbar), `feedback` (nur Admins lesen)
- `storage` — Regel für Sprachaufnahmen unter `gossipAudio/`
- `functions` — `pushOnTargetedNotify` schickt die Gossip-Pushes nur an die Leute am Corner

Ohne Kommandozeile geht der wichtigste Teil auch in der [Firebase Console](https://console.firebase.google.com):
**Realtime Database → Regeln** → Inhalt von `firebase.database.rules.json` einfügen → *Veröffentlichen*, und
**Storage → Rules** → Inhalt von `storage.rules` einfügen → *Publish*. Ohne die Function läuft alles, nur die
Gossip-Pushes an gesperrte Handys fehlen.

## 🤖 Automatisches Firebase-Deployment

Der Workflow `.github/workflows/firebase-deploy.yml` deployt Datenbank-Regeln, Storage-Regeln und Cloud Functions,
sobald sie sich auf `main` ändern — oder per Hand unter **Actions → „Deploy Firebase (Regeln & Functions)" → Run workflow**.
Dafür braucht GitHub **einmalig** einen Zugang zu Firebase (ohne ihn überspringt sich der Workflow nur mit einem Hinweis):

**Variante A — nur im Browser (Service-Account-Schlüssel):**
1. [Firebase Console](https://console.firebase.google.com) → Projekt `cornerguide` → ⚙️ **Projekteinstellungen** → **Dienstkonten** →
   **„Neuen privaten Schlüssel generieren"** → eine JSON-Datei wird heruntergeladen.
2. GitHub → dieses Repository → **Settings → Secrets and variables → Actions → New repository secret**:
   Name `FIREBASE_SERVICE_ACCOUNT`, Wert = kompletter Inhalt der JSON-Datei.
3. Die JSON-Datei danach löschen — sie gibt vollen Admin-Zugriff auf das Projekt.

Datenbank- und Storage-Regeln gehen mit diesem Schlüssel direkt über das Firebase Admin SDK raus (`.github/scripts/deploy-rules.cjs`).
Für die **Cloud Functions** braucht das Konto zusätzlich Google-Cloud-Rechte: [Google Cloud Console → IAM](https://console.cloud.google.com/iam-admin/iam?project=cornerguide)
→ beim Konto `firebase-adminsdk-…@cornerguide.iam.gserviceaccount.com` auf ✏️ → Rollen **Bearbeiter** (Editor) und **Dienstkontonutzer**
(Service Account User) hinzufügen. Fehlen sie, schlägt nur der Functions-Schritt fehl — die Regeln sind trotzdem live.

**Variante B — mit deinem eigenen Login (alle Rechte, inkl. Functions):** auf deinem Rechner `npx firebase-tools login:ci`
ausführen und den angezeigten Token als Secret `FIREBASE_TOKEN` speichern.

## 💤 Handy gesperrt — bin ich noch online?

Eine Web-App kann bei gesperrtem Display nicht weiterlaufen (iOS friert sie komplett ein). Deshalb:
- Wer **eingecheckt** ist, bleibt bis zu **3 Stunden** nach dem letzten Lebenszeichen am Corner sichtbar — mit 💤, solange das Display aus ist.
  (Vorher wurde der Eintrag beim Verbindungsabbruch gelöscht, man verschwand also sofort.)
- Der Check-in übersteht auch einen App-Neustart (iOS beendet gesperrte PWAs oft); ab dem nächsten Tag bzw. nach 10 h wird automatisch ausgecheckt.
- **Push-Nachrichten** (Nachschub, Gossip-Runden) kommen trotzdem an — Push im Profil verbinden, auf dem iPhone als App zum Home-Bildschirm hinzufügen.
- Optional im Profil: **„Display wach halten, solange ich eingecheckt bin"**. Während Gossip-Runden bleibt das Display automatisch an.
- Live-GPS (Auto-Check-in) pausiert bei gesperrtem Handy — dafür bräuchte es eine native App (z. B. Capacitor + Background-Geolocation).

## 🏆 Punkte: Aura, Karma & Reward-Matrix

- ✨ **Aura** = was du tust (einchecken, Leute treffen, Fotos, Kommentare, Gossip erzählen …) — bestimmt dein Level.
- 🎁 **Karma** = was andere dir geben (💐 Kompliment: +20, 💛 Danke dafür: +5, bestätigter Nachschub: +40 pro Bestätigung, Gossip-Punkte: +2 … +20 pro Bewertung).
- Die **Reward-Matrix** ist ein 3×3-Raster aus Aura-Stufe (Lv. <5 · 5–14 · 15+) und Karma-Stufe (Lv. <2 · 2–5 · 6+),
  von 🌱 Rookie bis 🪩 Matrix Legend. Die App zeigt, wo du stehst und wie viel Aura/Karma bis zum nächsten Feld fehlt.
- Die komplette Liste aller Punkte-Quellen steht in der App unter **„📖 So sammelst du Punkte"**.

## 🔧 Firebase Setup (für Echtzeit-Features)

Damit Kommentare und Freunde-Standorte zwischen allen Nutzern synchronisiert werden, brauchst du ein Firebase-Projekt:

1. Geh zu [Firebase Console](https://console.firebase.google.com)
2. Öffne das Projekt `cornerguide` (oder erstelle ein neues)
3. Prüfe **Realtime Database** (Region: `europe-west1`) und aktiviere sie
4. Aktiviere unter **Authentication → Sign-in method** mindestens **Anonymous**
5. Veröffentliche die Regeln aus `firebase.database.rules.json`. **Wichtig:** Diese Regeln
   sperren den früher offenen `".read": true`-Zugriff. Jetzt können nur Nutzer mit gültigem
   Access-Code die geteilten Daten lesen; Direktnachrichten, Push-Tokens und Profile sind
   pro Owner privat. Deployen mit:
   ```bash
   firebase deploy --only database
   ```
6. Geh zu Projekteinstellungen → Web-App und übernimm die Config in `index.html`

### Firebase reaktivieren (wenn „down“)

1. Firebase Console öffnen → `cornerguide` → **Realtime Database**
2. Prüfen, ob die DB pausiert/deaktiviert ist, dann wieder aktivieren
3. Rules veröffentlichen (`auth != null` für Writes)
4. Danach alle bitten, ihre während des Ausfalls erstellten Corner erneut einzutragen (lokal gespeicherte Einträge werden nicht automatisch synchronisiert)

### Ohne Firebase

Die App funktioniert auch ohne Firebase — dann werden Kommentare und Spots lokal im Browser gespeichert (nur du siehst sie). Die Freunde-Funktion ist dann deaktiviert.

## 📱 GitHub Pages aktivieren

1. Geh zu **Settings** → **Pages** in deinem Repository
2. Unter "Build and deployment" wähle **GitHub Actions**
3. Der Workflow deployed automatisch bei jedem Push auf `main`

## 🛠 Entwicklung

Ausgeliefert wird weiterhin **eine** `index.html` (GitHub Pages, ein Request, offline-fähig). Bearbeitet wird aber der
Quellcode in `src/`, nach Bereichen aufgeteilt — `index.html` wird daraus gebaut:

| Pfad | Inhalt |
|---|---|
| `src/head.html` | `<head>` bis zu den Bibliotheken |
| `src/firebase.js` | Firebase-Modul (`window.FB`) |
| `src/css/NN-*.css` | Styles, in dieser Reihenfolge |
| `src/body.html` | das komplette Markup |
| `src/js/NN-*.js` | App-Code nach Bereichen (z. B. `21-identity.js`, `26-circles.js`, `27-cornerdate.js`), ein gemeinsamer Script-Scope wie bisher |

```bash
node tools/build.mjs        # index.html aus src/ bauen (ohne Abhängigkeiten)
node tools/check.mjs        # passt index.html zu src/? Syntax ok? Regeln gültiges JSON?
npx serve .                 # lokal ansehen
```

Die Prüfung läuft auch in GitHub (Workflow „Checks“) und vor jedem Deploy — eine `index.html`, die nicht aus `src/`
gebaut ist, wird nicht ausgeliefert. Die Aufteilung hat am Verhalten nichts geändert: Beim Umbau war die gebaute Datei
Byte für Byte identisch mit der vorherigen. Wie es Richtung tausende Nutzer weitergeht: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

Ende-zu-Ende-Tests — die echte App in Chromium gegen die Firebase-Emulatoren (inkl. Cloud Functions), mehrere Personen
gleichzeitig: siehe [tests/e2e](tests/e2e/README.md). In GitHub unter **Actions → E2E-Tests → Run workflow**.

Cloud Functions (`functions/`): Push-Verteilung und die schlanken Kopien, die die App beim Start liest
(`functions/lite.js`). **Admin-Werkzeuge** (Actions → „Admin-Werkzeuge" → Run workflow) hat dafür zwei Aktionen, die im
öffentlichen Log nur Zahlen zeigen: `data-sizes` (wie groß ist welcher Knoten?) und `phase1-backfill` (Kopien für alte
Daten einmalig füllen, wiederholbar).

## 🔔 Push-Nachrichten (komplett aktivieren)

Push braucht **zwei** Dinge, die beide vorhanden sein müssen — sonst passiert nichts:

1. **VAPID Web-Push-Key** (damit der Browser ein Token bekommt)
   - Firebase Console → Project Settings → **Cloud Messaging → Web Push certificates → „Generate key pair"**
   - Den *öffentlichen* Key in der Datenbank unter `config/vapidKey` als String eintragen.
     Die App lädt ihn beim Start automatisch von dort.

2. **Ein Sender** (ein Browser darf aus Sicherheitsgründen keine Pushes verschicken).
   Die Cloud Function in `functions/index.js` übernimmt das: sie lauscht auf neue
   Direktnachrichten unter `messages/{uid}` und schickt eine Push an das gespeicherte
   Token des Empfängers.
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
   > Cloud Functions brauchen den **Blaze-Plan** (kostenlos bis zu großzügigen Limits,
   > aber eine Kreditkarte muss hinterlegt sein).

Ohne (2) landen Nachrichten nur in der DB und werden erst sichtbar, wenn die App offen ist.

## 🔐 Konto & Profil-Portabilität

Nutzer starten weiterhin **anonym**. Im Profil-Tab (und direkt im Zugangs-Screen) können sie ihr
Profil jetzt sichern und auf jedem Browser/Gerät übernehmen — ohne Neu-Registrierung:

- **Recovery-Code** — einen Code erzeugen, auf dem neuen Gerät eingeben. Der Code stellt Profil
  *und* Zugang in einem Schritt wieder her (anonym, kein Konto nötig).
- **Mit Google / E-Mail sichern** — verknüpft den anonymen Account mit einem festen Login
  (Firebase `linkWithPopup` / E-Mail-Link). Die UID und damit das Profil bleiben erhalten;
  auf neuen Geräten reicht der gleiche Login.

Voraussetzung: unter **Authentication → Sign-in method** zusätzlich **Google** und
**E-Mail-Link (passwortlos)** aktivieren, und die Domain (`ETigerschuss.github.io`) unter den
autorisierten Domains eintragen. Profile werden in der DB unter `userProfiles/{uid}` gespiegelt.

### 👋 Neues Handy? Profil wählen

**Warum ein Profil „verschwindet":** Wer anonym spielt, ist nur über einen Login in *diesem* Browser bekannt. Der ist
weg, wenn Browserdaten gelöscht werden, Safari eine Seite nach 7 Tagen ohne Besuch leert, die App zum
**iPhone-Home-Bildschirm** hinzugefügt wird (eigener Speicher!) oder man das Handy wechselt. Das Profil selbst bleibt in
der Datenbank.

**So einfach geht's zurück:** Einladungscode eingeben → „👋 Wer bist du?" → **den eigenen Namen antippen** — fertig, ohne
weitere Frage. Neu dabei? Im selben Fenster oben den Namen eingeben → „Los geht's". Falsch getippt? Die Willkommens-Meldung
antippen („Nicht du?") macht es rückgängig. Tippt man seinen alten Namen neu ein, bietet die App das Profil auch von selbst an.

**Ein Profil, mehrere Geräte:** Auf dem iPhone öffnet ein WhatsApp-Link nie die installierte App, sondern Safari — mit
eigenem Login. Früher *zog* „Wer bist du?" das Profil dorthin um und warf die installierte App raus, die beim nächsten
Öffnen wieder fragte. Jetzt *schließt sich* der neue Login dem Profil nur an (`points/<login>.aliasOf`): nichts wird
verschoben, alle Geräte bleiben angemeldet, Profil und Ranking zählen die Punkte aller Logins einer Person zusammen und
zeigen dasselbe Level, Freunde sehen die Person nur einmal. Frühere Logins desselben Geräts verknüpft die App von selbst,
sobald der Zugang bestätigt ist. Auch der **Recovery-Code** (Profil → „Konto & Profil sichern") verknüpft so, statt umzuziehen.

Es gibt bewusst keine Freigabe — es spielen nur Freunde mit.

**Dauerhaft sichern:** „Mit Google sichern" — dann ist es auf jedem Gerät mit demselben Login automatisch dasselbe Profil.

### 🔑 „Permission denied" beim Speichern?

Früher merkte sich die App „Zugang gewährt" nur im Browser. Fehlte der Zugang in der Datenbank für den *aktuellen*
Login (z. B. nach einem Login-Wechsel oder aus einer älteren App-Version), scheiterte jedes Speichern — etwa beim
Eintragen eines neuen Corners. Jetzt prüft die App das bei jedem Start: Ist der Einladungscode bekannt, wird der Zugang
still repariert, sonst fragt sie einmal nach dem Code. Profil und Punkte bleiben dabei erhalten.

**Admin werden** (z. B. nach eigenem Login-Verlust): Die eigene **Nutzer-ID** steht im Profil unter „Konto & Profil
sichern". Im Repo unter *Actions → Admin-Werkzeuge → Run workflow* die Aktion `add-admin` mit dieser ID starten.

## 🟢 Regeln am Spot: was prüft die App?

In der App steht dafür nur ein Codewort: **„grünes Licht“** — 🟢 ok · 🌙 erst ab 20 Uhr · 🔴 kein grünes Licht · ❔ unklar.
Unauffällig, aber beim Cornern weiß man Bescheid. Auf den Karten in der Liste erscheint nur das 🟢; ein „nein“ steht
erst in der Detailansicht. Dahinter stecken diese Regeln:

Beim Eintragen eines Corners und in jeder Detailansicht (Corner-Check → „Regeln & Ausstattung") fragt die App
OpenStreetMap (Overpass) nach der Umgebung — 3 Tage zwischengespeichert. **Automatische Einschätzung, ohne Gewähr.**
Stand der Regeln: November 2026.

- **Kiffen (§ 5 KCanG, [Gesetzestext](https://www.gesetze-im-internet.de/kcang/__5.html))** — verboten in Sichtweite von
  Schulen, Kinder- und Jugendeinrichtungen, Spielplätzen und öffentlich zugänglichen Sportstätten; Sichtweite endet
  100 m vom Eingangsbereich. Die App misst bis zum Gelände (strenger als bis zum Eingang). In **Fußgängerzonen** von
  7 bis 20 Uhr verboten, nie in Anwesenheit von Minderjährigen.
- **Bayern (Cannabisfolgenbegrenzungsgesetz, 2024)** — kein Rauchen/Dampfen auf Volksfesten, in Biergärten und
  Außenbereichen von Gaststätten (Hinweis, wenn ein Biergarten direkt nebenan ist).
- **München, Alter Botanischer Garten / Karl-Stützel-Platz** — Alkohol *und* Cannabis rund um die Uhr verboten
  ([ACVV](https://stadt.muenchen.de/rathaus/stadtrecht/vorschrift/331.html), gilt bis 14.01.2027).
- **München, Hauptbahnhof** — Alkohol rund um die Uhr verboten im Umfeld (Bahnhofplatz, Arnulf-, Bayer-, Schützen-,
  Prielmayer-, Luitpoldstraße u. a.; [Verordnung](https://stadt.muenchen.de/rathaus/stadtrecht/vorschrift/330.html), gilt
  bis 30.04.2028). Die App erkennt die Zone nur ungefähr und verweist auf die genauen Straßen.
- **Ausland** — in **Österreich** ist Kiffen verboten (Suchtmittelgesetz), in **Italien** nicht legal (auch Eigenkonsum
  wird bestraft); in anderen Ländern zeigt die App „dort gelten andere Regeln“ statt einer deutschen Einschätzung.
- **Englischer Garten, Hofgarten, Finanzgarten** — das Kiffverbot der Schlösserverwaltung von 2024 hat der BayVGH am
  24.11.2025 für unwirksam erklärt; es gelten die Bundesregeln.
- **Parks** — liegt der Corner in einem Park mit Öffnungszeiten (OpenStreetMap `opening_hours`), zeigt die App sie mit
  „jetzt offen/zu".

Fehlt eine Schule oder ein Spielplatz, kann man ihn direkt in OpenStreetMap eintragen — die App sieht ihn dann auch.

**Bisherige Corners:** Jeder Corner wird einmal geprüft — beim ersten Öffnen der Detailansicht oder nach und nach im
Hintergrund (ein Corner alle paar Sekunden, höchstens ein Dutzend pro Sitzung). Das Ergebnis liegt für alle unter
`cornerFacts/<corner-id>` und wird nach 30 Tagen erneuert, damit nicht jedes Handy OpenStreetMap neu fragen muss. Die
handverlesenen Emojis der ursprünglichen Liste (Kiosk, Toilette) bleiben dabei; bei neuen Spots zählt, was beim
Eintragen ausgewählt wurde.

## ✨ Updates & Links

- **Neue Version:** Beim Deploy schreibt der Workflow die Build-Nummer (Commit + Lauf) in die Seite. Kommt man in die
  App zurück, vergleicht sie diese mit dem Server und lädt neu, wenn gerade nichts offen ist — sonst erscheint
  „🔄 Neue Version da — tippen". Der Service Worker holt die Seite immer am Browser-Cache vorbei und enthält auch den
  Push-Teil (`firebase-messaging-sw.js`), damit sich beide nicht mehr gegenseitig ersetzen.
- **Links:** `?corner=<id>&come=1` (WhatsApp „Kommt vorbei"), `?corner=<id>&cd=<cornerdate-id>` (Cornerdate-Zusage),
  `?corner=<id>&checkin=1` (QR-Sticker: sofort einchecken). Auf neuen Geräten laufen sie nach „Wer bist du?" weiter.
- **Cornerdate-Punkte:** Zusagen +5 Aura (einmal pro Date), wirklich kommen (Check-in während des Dates) +10 Aura,
  Planen +5 Aura; wer plant, bekommt +3 Karma pro Zusage und +5 pro Gast, der kommt.

## 🏙️ Stadtbezirke: woher kommen die Grenzen?

Die 25 Stadtbezirke stammen aus [OpenStreetMap](https://www.openstreetmap.org/copyright) (© OpenStreetMap-Mitwirkende,
ODbL; Grenzen `admin_level=9` innerhalb von München). Der Workflow **„Stadtbezirke-Daten"**
(`.github/workflows/district-data.yml`, Skript `.github/scripts/build-districts.cjs`) lädt sie, ordnet ihnen die
offiziellen Nummern zu, vereinfacht die Linien mit [mapshaper](https://mapshaper.org) so, dass Nachbarbezirke lückenlos
aneinander grenzen, und schreibt `data/stadtbezirke.json` (~50 KB). Die App lädt die Datei einmal und berechnet den
Bezirk jedes Corners aus seinen Koordinaten. Neu erzeugen: *Actions → Stadtbezirke-Daten → Run workflow*; danach in
`index.html` die Version in `DISTRICTS_URL` erhöhen, damit Handys die neue Datei statt der zwischengespeicherten laden.

## 📷 Corner-Fotos

**Firebase Storage ist im Projekt noch nicht aktiviert** (geprüft mit Admin-Werkzeuge → `data-sizes`). Darum liegen die
Fotos in der Datenbank — seit Phase 1 aber getrennt:

| Knoten | Inhalt | Wann geladen |
|---|---|---|
| `photoCovers/<corner>` | ein kleines Titelbild (360 px) + Anzahl, von einer Cloud Function gepflegt | beim ersten Öffnen der Liste oder eines Corners |
| `photos/<corner>/<id>` | Autor, Zeit, Bewertungen, Kommentare, Vorschaubild | beim Öffnen des Corners |
| `photoData/<corner>/<id>` | das volle Bild | beim Antippen |

**Storage aktivieren lohnt sich trotzdem:** Firebase Console → **Storage** → „Get started" (Region `europe-west1`).
Danach lädt die App neue Fotos automatisch dorthin (nur die URL landet in der Datenbank; Googles CDN liefert sie aus, der
Browser speichert sie zwischen), und Gossip-Sprachaufnahmen laufen auch darüber. Die Regeln (`storage.rules`) deployt der
Firebase-Workflow schon: jeder darf Fotos ansehen, nur eingeloggte Nutzer dürfen Bilder < 5 MB hochladen.

## 📲 PWA / App Stores

- **PWA** ist integriert über `manifest.webmanifest` + `service-worker.js`
- **App Store / Play Store**: Das Webprojekt kann mit Capacitor als Native Shell verpackt werden

Beispiel-Start:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init "Minga Corner Guide" "com.cornerguide.app"
```

Danach Web-Assets einbinden und iOS/Android Projekte per `npx cap add ios` / `npx cap add android` erzeugen.
