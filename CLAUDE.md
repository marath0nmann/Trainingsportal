# Trainingsportal Leichtathletik

## Aktuelle Version: v1

Live (geplant): https://training.tus-oedt.de  
Hosting: all-inkl.com Shared Hosting → `/training.tus-oedt.de/htdocs/`

## Projektstruktur

```
htdocs/                 → Web-Root (Document-Root von training.tus-oedt.de)
  index.html            → Einstiegspunkt (SPA), Cache-Buster ?v=NNN
  app.css               → Optik wie Statistikportal (1:1 übernommen)
  js/
    01_api.js           → apiGet/apiPost/apiPut/apiDel + 401-Redirect zum Login-Portal
    02_app.js           → Bootstrap, Header, Routing-Stub (renderPage)
  api/index.php         → REST-API (auth/me, auth/logout, ping; weitere Endpunkte folgen)
  opcache-clear.php     → Nach jedem Deploy aufgerufen
includes/               → PHP-Bibliotheken (außerhalb Web-Root)
  auth.php              → Session/Auth/TOTP/Passkey  (1:1 wie Statistik-/Login-Portal)
  db.php                → DB-Zugriff
  settings.php          → Vereinseinstellungen
  totp.php / passkey.php
  config.sample.php     → Vorlage; config.php steht in .gitignore
sql/                    → Trainingsportal-spezifische Tabellen (training_*)
build.sh / commit.sh    → Build & Commit-Helper (analog Statistikportal)
.github/workflows/      → Auto-Deploy per FTP nach training.tus-oedt.de
CHANGELOG.md            → Versionshistorie
```

## Deployment

**Nach jeder Änderung sofort committen und pushen – ohne auf Bestätigung zu warten.**  
GitHub Actions deployed automatisch per FTP nach all-inkl.com.

**Claude-Workflow nach jeder Änderung (IMMER):**
1. `CHANGELOG.md`: neue Bullet-Zeile oben in `## vCUR` einfügen
2. Versionsnummer um 1 erhöhen:
   - `index.html`: alle `?v=NNN` Cache-Buster + `header-version`-Span
   - `CHANGELOG.md`: `## vCUR` → `## vNNN+1`
3. `git add <geänderte Dateien>`, `git commit`, `git push`
4. Pull Request erstellen (falls noch nicht vorhanden), sofort auf „Ready" setzen und mit **squash-merge** mergen – kein Warten auf Bestätigung.

`bash build.sh` erledigt 1.+2. automatisch.

**Wichtig:** PHP OPcache wird per Deploy-Workflow automatisch geleert (`opcache-clear.php`).

## Technisches

- **Frontend**: Vanilla JS, keine Build-Toolchain, SPA mit Hash-Routing (geplant)
- **Backend**: PHP 8.x, MariaDB (all-inkl.com Shared Hosting)
- **Auth**: Cross-Domain-SSO via Login-Portal (Shared Session über `.tus-oedt.de`).
  Standalone-Login bleibt über die geerbten `Auth`-Klassen ebenfalls möglich.
- **JS validieren**: `node -e "new Function(require('fs').readFileSync('htdocs/js/DATEI.js','utf8'))"`

## Login-Portal (Cross-Domain SSO)

**Architektur:** Shared-Session via `COOKIE_DOMAIN='.tus-oedt.de'`  
Identisches Setup wie das Statistikportal.

**Voraussetzungen:**
- Gleiche DB, gleicher `TABLE_PREFIX`, gleicher `SESSION_NAME` wie Login-/Statistikportal
- `COOKIE_DOMAIN='.tus-oedt.de'` in `includes/config.php`

**Flow (im Frontend implementiert in `js/01_api.js`):**
1. `apiGet('auth/me')` → 401 + `login_portal_aktiv=1` → Redirect zu `login_portal_url?redirect=…`
2. Login-Portal: Login → Session-Cookie mit `domain=.tus-oedt.de`
3. Redirect zurück → `auth/me` erkennt Session → `showApp()`

**Standalone-Modus:** `login_portal_aktiv=0` → eigener Login-Screen (noch zu ergänzen).

## Datenmodell

Trainingsportal-eigene Tabellen erhalten den Präfix `training_*`, z. B.
`training_einheiten`, `training_plaene`, `training_teilnahmen` (folgt mit dem
fachlichen Inhalt unter `sql/schema.sql`).

Gemeinsam mit Statistik-/Login-Portal genutzt:
| Tabelle | Zweck |
|---------|-------|
| `benutzer` | Login, Rollen, Passkey, TOTP |
| `rollen` | Rollen mit JSON-Rechte-Array |
| `einstellungen` | u. a. `login_portal_aktiv`, `login_portal_url`, `login_portal_apps` |

## Auth-Klasse (PHP)

- `Auth::startSession()` → Session starten (mit `COOKIE_DOMAIN`)
- `Auth::check()` → aktuellen User zurückgeben oder `null`
- `Auth::requireLogin()` → User oder 401
- `Auth::requireRecht('recht_name')` → User oder 403
- `Auth::logout()` → Session beenden
