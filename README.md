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

## 🔧 Firebase Setup (für Echtzeit-Features)

Damit Kommentare und Freunde-Standorte zwischen allen Nutzern synchronisiert werden, brauchst du ein Firebase-Projekt:

1. Geh zu [Firebase Console](https://console.firebase.google.com)
2. Öffne das Projekt `cornerguide` (oder erstelle ein neues)
3. Prüfe **Realtime Database** (Region: `europe-west1`) und aktiviere sie
4. Aktiviere unter **Authentication → Sign-in method** mindestens **Anonymous**
5. Verwende sichere Realtime-Regeln (Datei: `firebase.database.rules.json`):
   ```json
   {
     "rules": {
       ".read": true,
       ".write": "auth != null"
     }
   }
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

Das Projekt ist eine einzelne `index.html` — kein Build-Tool nötig. Einfach öffnen oder mit einem lokalen Server starten:

```bash
npx serve .
```

## 📲 PWA / Push / App Stores

- **PWA** ist integriert über `manifest.webmanifest` + `service-worker.js`
- **Push-Grundlage** ist vorbereitet (Firebase Messaging + `firebase-messaging-sw.js`), für produktive Pushes fehlt noch ein gültiger Web Push VAPID Key
- **App Store / Play Store**: Das Webprojekt kann mit Capacitor als Native Shell verpackt werden

Beispiel-Start:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init "Minga Corner Guide" "com.cornerguide.app"
```

Danach Web-Assets einbinden und iOS/Android Projekte per `npx cap add ios` / `npx cap add android` erzeugen.
