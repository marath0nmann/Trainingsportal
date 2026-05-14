# Changelog

## v19
- Fix: Formatierung ICS-Feeds Label-Spalte in Einstellungen (`width:100%` entfernt)
- Trainingsblöcke: Titel wird beim Öffnen des Editors automatisch in Segmente geparst, wenn noch keine vorhanden sind
- Block-Karten: zeigen Segmentanzahl-Badge (orange bei 0 Segmenten)
- `GET bloecke` liefert jetzt `seg_count` pro Block
- Einstellungen: neuer Button „Segmente parsen" – analysiert alle Blöcke ohne Segmente via Kurzschrift-Parser und speichert die Ergebnisse automatisch

## v18
- Migration: `POST admin/migrate_einheiten_zu_bloecken` liest alle Kalendereinträge und legt pro eindeutigem Titel einen globalen Trainingsblock an (mit Segmenten, idempotent)
- Migrationsbutton auf der Einstellungen-Seite (Admin)
- `POST einheiten` deaktiviert (405) – neue Kalendereinträge nur noch via `POST bloecke/{id}/apply`
- Kalender: „+ Neue Einheit"-Button ersetzt durch Link zur Trainingsblöcke-Seite; Tages-„+"-Button entfernt

## v17
- Fix: `INSERT IGNORE INTO rollen` ohne `beschreibung`-Spalte (Spalte existiert nicht in der geteilten DB)

## v16
- Fix: `training_bloecke`/`training_block_segmente` werden beim ersten API-Aufruf automatisch angelegt (`CREATE TABLE IF NOT EXISTS`); Trainer-/Editor-Rolle ebenfalls per `INSERT IGNORE` – kein manuelles SQL-Deployment mehr nötig

## v15
- Neue Rolle **Trainer**: eigener Eintrag in der `rollen`-Tabelle mit Rechten `training_bloecke_verwalten` + `training_bearbeiten`; `Auth::isTrainer()` / `requireTrainer()` in `auth.php`
- **Trainingsblöcke** (`#bloecke`): datumsunabhängige Vorlagen für Trainingseinheiten
  - DB: neue Tabellen `training_bloecke` und `training_block_segmente`
  - API: `GET/POST/PUT/DELETE bloecke`, `POST bloecke/{id}/apply` (Block auf Kalender-Datum legen)
  - Globale Blöcke erstellen/bearbeiten/löschen: nur Trainer und Admins
  - Private Blöcke: jeder eingeloggte User
  - Alle eingeloggten User können Blöcke per „Im Kalender planen" als konkrete Einheit eintragen
- Navigation: Tab „Trainingsblöcke" für alle eingeloggten User; Einstellungen-Tab weiterhin nur für Admins
- `POST/PUT/DELETE einheiten` prüft jetzt Recht `training_bearbeiten` (statt TODO-Kommentar)
- Migration: `sql/migration_v15_trainer.sql` (idempotent, `INSERT IGNORE`)

## v14
- Einstellungen-Seite verwendet jetzt 1:1 die Statistikportal-Optik (`.panel`, `.panel-header`, `.panel-title`, `.settings-row`, `.settings-input`); eigene CSS-Regeln in `addons.css` entfernt
- Feiertage-Loader: cURL-Fallback (für Hostings mit `allow_url_fopen=Off`), erweiterte Fehlermeldungen
- Neuer Diagnose-Endpoint `GET admin/feiertage_test` + „🔍 Feeds testen"-Button auf der Settings-Seite: prüft pro Feed Erreichbarkeit, Größe und Anzahl Events im Zeitfenster
- Hinweis-Panel auf der Settings-Seite, dass Vereinsname/Logo/Farben im Statistikportal liegen

## v13
- Fix: Header-Logo führte zu nicht existierendem `#dashboard` → jetzt `#kalender`
- Fix: User-Badge führte zu nicht existierendem `#konto` → onclick entfernt
- Fallback: unbekannte Routes (Alt-Links wie `#dashboard`/`#konto`) leiten still auf `#kalender` um, statt 404 zu zeigen
- Fix: Vereinslogo wird über `shared.php?file=uploads/...` aus dem Statistikportal-htdocs ausgeliefert (vorher 404, weil Trainingsportal eigene `/uploads/` nicht hat)
- Fix: Avatar im Header rendert jetzt das Bild aus `benutzer.avatar_pfad` (auch über `shared.php`); Fallback auf Initiale, wenn Bild fehlt

## v12
- 1:1-Optik mit Statistikportal: dessen `app.css` wird per neuem `shared.php?file=app.css` direkt aus dem Schwester-htdocs ausgeliefert (kein doppeltes Pflegen)
- Trainingsportal-spezifische Styles in eigener `addons.css` (Kalender, Editor, Pace, ICS, Feiertage, Settings) – überlagert die Statistikportal-Basis
- `applyConfig()` 1:1 aus dem Statistikportal übernommen: berechnet `--primary2/3`, `--primary-dark`, `--primary-light`, `--accent2`, `--accent-light`, `--accent-rgb`, `--on-*`, setzt Logo, Vereinsname und Adressleisten-Farbe wie drüben
- Backend `GET config` liefert jetzt das vollständige Settings-Dictionary (sensible Tokens entfernt) – kompatibel mit der gemeinsamen `applyConfig`
- Neue Konstante `STATISTIKPORTAL_PATH` in `config.sample.php` (Standard: `../../statistik.tus-oedt.de/htdocs/`)

## v11
- Fix: `Undefined constant TRAINING_SETTINGS_KEYS` (PHP `const` im Datei-Scope wird nicht hochgezogen wie Funktionen). Konstante in Funktion `trainingSettingsKeys()` umgewandelt
- Fehler-Detail aus Backend wird jetzt im Frontend angezeigt

## v9
- Einstellungen-Seite (`#einstellungen`) für Admins: Feiertage-/Ferien-Feeds (URL, Label, Farbe) komfortabel pflegen, plus Standard-Dauer pro Einheit
- Backend: `GET/PUT admin/settings` (auth+admin-only), Whitelist erlaubter Keys, Cache-Invalidierung der ICS-Feeds nach Speichern
- Header zeigt für Admins eine Hauptnavigation mit „Kalender" / „Einstellungen"
- „Beispiel"-Links setzen die NRW-Feiertage-/Schulferien-URLs als Vorschlag

## v8
- Optik aus Statistikportal: Frontend lädt `farbe_primary/-2/-3`, `farbe_accent/-2`, `logo_datei`, `verein_kuerzel` etc. aus der gemeinsamen `einstellungen`-Tabelle (`GET config`) und mappt sie auf CSS-Variablen, Logo und Theme-Color
- Header bekommt einen Verlauf von Akzent → Primär plus farbige Stripe (`--primary-dark` aus Primary abgeleitet); im OS-Dark-Mode wird der Header nicht mehr schwarz
- Cell-Overflow gefixt: lange Titel sprengen die Zelle nicht mehr (`min-width:0` + `overflow:hidden` auf der Grid-Zelle)
- Feiertage/Ferien als Abo-Liste konfigurierbar: neuer `einstellungen`-Schlüssel `training_feiertage_ics_urls` (JSON-Array von URLs oder `{url,label,farbe}`-Objekten); `GET feiertage?von=&bis=` lädt + parst + cached (6 h) und das Frontend rendert sie als kleine Marker je Tag

## v7
- Bugfix: API-Aufrufe mit Query-String (`einheiten?von=…&bis=…`, `pace/me?modus=…`) wurden in PHP als Teil von `$_GET['p']` mitkonsumiert → 404 „Endpoint nicht gefunden". Frontend trennt Pfad und Query jetzt sauber.

## v6
- FIT-Workout-Export (Garmin Connect): `GET fit/einheit/{id}.fit` liefert eine binäre FIT-Workout-Datei für strukturierte Einheiten
- Eigener FIT-Encoder in `includes/fit_workout.php` (Profile 21.40, Sport=Running, Distanz-basierte Schritte mit Repeat-Blöcken, RFC-konforme CRC)
- „⌚ FIT für Garmin"-Download-Button im Detail-Modal (sichtbar wenn Segmente vorhanden)
- Bewusste Beschränkung: keine Pace-Targets im FIT (Pace folgt aus dem Workout-Namen / Beschreibung), Warmup/Cooldown nicht enthalten

## v5
- ICS-Export: `GET ics/public.ics` (öffentlicher Trainingsplan) und `GET ics/me.ics?token=…` (persönlich, mit Pace-Vorgaben pro Segment)
- Persönlicher Token in `benutzer.prefs` JSON gespeichert; Endpoints `GET/POST/DELETE ics/me/token` zum Erzeugen/Rotieren/Widerrufen
- „📅 Abonnieren"-Button in der Kalender-Toolbar mit Public + Persönlich-Link, Kopieren und webcal://-Direktöffnung
- VTIMEZONE Europe/Berlin, RFC-5545-konformes Line-Folding, Cancelled-Status für abgesagte Einheiten

## v4
- Pace-Anreicherung für eingeloggte Athleten: Bestzeit aus dem Statistikportal (`ergebnisse` × `disziplin_mapping`) → Pace + Splitzeit pro Segment
- Backend-Endpunkt `GET pace/me?modus=pb|12m` (Bestzeiten je Referenzdistanz: 5 km, 10 km, HM, M)
- Modus-Umschalter im Detail-Modal: Persönliche Bestzeit / Letzte 12 Monate (Auswahl pro Browser persistiert)
- Aufgabe entfällt: keine eigene `training_bestzeiten`-Tabelle nötig (geteilte DB mit Statistikportal)

## v3
- Betreuer-Editor (Modal): Datum/Uhrzeit/Typ/Titel/Treffpunkt/Bemerkung/Sichtbarkeit/Status, Segment-Tabelle mit Wdh/Distanz/Pause/Pause-Typ/Pace-Referenz, Speichern/Löschen
- Kurzschrift-Parser (JS): erkennt Lang- (`8 x 600 m (100TP)`) und Kurzform (`6 * 4(1)`), Slash-Listen für Pyramiden/Treppen, BP/TP/GP-Pause-Typen
- Detail-Modal zeigt Segmente strukturiert mit Pace-Referenz-Badge
- „+ Neue Einheit"-Button in der Toolbar und pro Tag (eingeloggt)
- Backend: `POST/PUT einheiten` nimmt `segmente[]` entgegen und ersetzt sie atomar (Transaktion)
- Fix in `build.sh`: BSD-sed-kompatible Versions-Bump-Regex für CHANGELOG

## v1
- Monatskalender (öffentlich, read-only) als Default-Ansicht – 1 Woche je Zeile, Heute-/Vor-/Zurück-Navigation, Detail-Modal je Einheit
- DB-Schema `training_einheiten` und `training_segmente` (strukturierte Intervalle/Pyramiden)
- API-Endpunkte `GET/POST/PUT/DELETE einheiten` (Lesen anonym, Schreiben auth-gesichert)
- Seed-Datei `sql/seed_q2_2026.sql` mit Trainingsplan Q2/2026 aus dem aktuellen PDF
- Initiales Projekt-Skelett (Struktur parallel zum Statistikportal)
- Cross-Domain-Login-Anbindung an das Login-Portal vorbereitet
- API-Skeleton mit `auth/me`, `auth/logout`, `ping`
- Frontend-Hülle mit Header/Login-Optik des Statistikportals
- GitHub-Actions-Deploy nach `training.tus-oedt.de`
