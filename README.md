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

## 🔧 Firebase Setup (für Echtzeit-Features)

Damit Kommentare und Freunde-Standorte zwischen allen Nutzern synchronisiert werden, brauchst du ein kostenloses Firebase-Projekt:

1. Geh zu [Firebase Console](https://console.firebase.google.com)
2. Erstell ein neues Projekt (kostenlos)
3. Aktiviere **Realtime Database** (Standort: europe-west1)
4. Setze die Database-Regeln auf:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
5. Geh zu Projekteinstellungen → Web-App hinzufügen
6. Kopiere die Config-Werte in die `index.html` (ersetze die `YOUR_...` Platzhalter)

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
