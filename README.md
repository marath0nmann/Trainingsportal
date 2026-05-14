# Trainingsportal – Leichtathletik
## Version v21 | Stand: May 2026 

Webbasiertes Trainingsportal für den Leichtathletik-Bereich.  
PHP/MariaDB · Shared Hosting (all-inkl.com) · Vanilla JS/CSS · keine externen Frameworks

Live (geplant): https://training.tus-oedt.de  
Hosting: all-inkl.com Shared Hosting → `/training.tus-oedt.de/htdocs/`

---

## ✨ Status

Initiales Projekt-Skelett. Inhalte folgen.

Anbindung an das Login-Portal (Single-Sign-On über `.tus-oedt.de`-Cookie) ist
vorbereitet: Beim Aufruf prüft das Frontend `auth/me`; bei `401` und aktivem
`login_portal_aktiv` wird zum Login-Portal weitergeleitet.

---

## 📁 Dateistruktur

```
training.tus-oedt.de/
├── htdocs/                 ← Web-Root
│   ├── index.html          ← Haupt-App (SPA)
│   ├── app.css             ← Gesamt-CSS (identisch zur Statistikportal-Optik)
│   ├── js/
│   │   ├── 01_api.js       ← API-Helper (apiGet/apiPost/…)
│   │   └── 02_app.js       ← App-Bootstrap, Routing, Header
│   ├── api/
│   │   └── index.php       ← REST-API
│   └── opcache-clear.php   ← OPcache leeren (Deploy-Hook)
├── includes/               ← PHP-Bibliotheken (außerhalb Web-Root)
│   ├── config.sample.php   ← Vorlage → config.php (NICHT in Git)
│   ├── auth.php            ← Session/Auth/TOTP/Passkey
│   ├── db.php              ← Datenbankverbindung
│   ├── settings.php        ← Vereinseinstellungen
│   ├── totp.php            ← TOTP (RFC 6238)
│   └── passkey.php         ← WebAuthn/Passkey
├── sql/
│   └── schema.sql          ← Trainingsportal-spezifische Tabellen (training_*)
├── build.sh                ← Versionszähler + ZIP-Build
├── commit.sh               ← Schnell-Commit
└── .github/workflows/
    └── deploy.yml          ← Auto-Deploy via FTP
```

---

## 🔧 Setup (Neuinstallation)

1. **Datenbank**: gleiche DB wie Statistik-/Login-Portal verwenden (gleicher
   `TABLE_PREFIX`, gleicher `SESSION_NAME`), damit Cross-Domain-SSO greift.
2. **`includes/config.php`** aus `config.sample.php` ableiten und ausfüllen.
   `COOKIE_DOMAIN='.tus-oedt.de'` setzen.
3. **Trainingsportal-Tabellen** importieren (folgt unter `sql/schema.sql`).
4. **GitHub-Actions-Secrets** setzen: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`.
5. Push auf `main` → Deploy nach `training.tus-oedt.de`.

---

## 🛠️ Build

```bash
bash build.sh
```

Erhöht die Version automatisch, aktualisiert Cache-Buster, README, CHANGELOG,
COMMIT_EDITMSG und legt ein `paket_vNNN.zip` ab.
