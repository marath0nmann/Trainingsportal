# Changelog

## v83
- Kalender-Detail-Modal: „Bearbeiten"-Button öffnet ebenfalls das schlanke Modal „Kalendereintrag bearbeiten" (Datum, Uhrzeit, Treffpunkt, Sichtbarkeit) – gilt jetzt im gesamten Kalenderbereich, nicht nur in der Heute-Sektion
- Admin/Trainings: Typ-Filter-Dropdown, Uhrzeit auf HH:MM gekürzt

## v82
- Heute-Sektion: „Bearbeiten"-Button öffnet schlankes Modal „Kalendereintrag bearbeiten" mit nur Datum, Uhrzeit, Treffpunkt und Sichtbarkeit (kein Trainingsblock-Editor)

## v80
- Kalender: heutiger Tag ohne farbige Zellhinterlegung – nur der Kreis um die Tageszahl bleibt farbig

## v75
- Pace-Warnung und Heute-Sektion innerhalb von `.kal-wrap` / `.liste-wrap` verschoben – gleiche Breite wie Kalender/Liste

## v74
- Pace-Warnung „Persönliche Pace noch nicht konfiguriert" wird über der Heute-Sektion angezeigt, unabhängig vom heutigen Training; per-Einheit-Warnung entfernt
- Fix: Link-Farbe in Warnhinweisen nutzt jetzt `color: inherit` – immer lesbar unabhängig von der Theme-Farbe

## v80
- Versionsnummer korrigiert: Sprung auf v73 nach Versions-Regression durch fehlerhafte Squash-Merges (main war zwischenzeitlich bei v71, dann auf v60 zurückgefallen)

## v57
- Heute-Sektion wird oberhalb der gesamten Kalender-/Listenansicht angezeigt (über Toolbar und Date-Picker)

## v56
- „Planung"-Button aus Kalender-Toolbar entfernt (Planung ist über die Navigation erreichbar)

## v55
- Heute-Sektion: zweispaltiges Layout – Trainingsinfos links, Komoot-Strecken-iFrame rechts (nur wenn Strecke hinterlegt); Komoot-Embed-URL auf `de-de`-Locale korrigiert; auf Mobile einspaltig gestapelt

## v54
- Heute-Sektion erscheint in Kalender- und Listenansicht gleichermaßen, unabhängig vom angezeigten Monat/Quartal (eigener API-Call für heute)

## v53
- Quartalsplan (Listenansicht): neue Ansicht `#liste/YYYY-QN` zeigt alle Einheiten eines Quartals nach Kalenderwochen gruppiert; Typ-Farbakzente, Heute-Markierung, Kein-Training-Styling; View-Toggle-Buttons in Kalender- und Listenansicht; auf Mobilgeräten ist Listenansicht Standard-Ansicht beim ersten Aufruf

## v52
- Fix: Pace-Warnhinweis erscheint jetzt korrekt, wenn Segmente Pace-Referenzen enthalten, die nicht konfiguriert sind (prüft `paceSekProKm` statt `!paceData`)

## v51
- Fix: Pausenblock nach der letzten Wiederholung eines Segments wird jetzt ebenfalls angezeigt

## v50
- Segmente als grafische Blöcke (TrainingPeaks-Stil): Wiederholungen einzeln dargestellt, proportionale Breite nach Distanz, Pausenblöcke zwischen Wdh, Farbe nach Trainingstyp; „Persönliche Pace"-Header aus Detail-Modal entfernt

## v49
- Heute-Sektion: Warnhinweis „Persönliche Pace noch nicht konfiguriert" mit Link zum Athletenprofil, wenn Segmente Pace-Referenzen enthalten aber keine Pace eingestellt ist

## v48
- Fix: Komoot-Link – `p[0]` als leerer Platzhalter nötig, damit `p[1][loc]` als Ziel (nicht Start) interpretiert wird
- Heute-Sektion: Segmente und persönliche Pace direkt inline angezeigt (kein „Details anzeigen"-Link mehr); FIT- und Bearbeiten-Button am unteren Rand der Karte
- Komoot-Link: Treffpunkt wird als Ziel gesetzt (`p[1][loc]`), kein Startpunkt vorbelegt
- Fix: Komoot-Link setzt jetzt Startpunkt via `p[0][loc]` und nutzt korrektes URL-Format (`/de-de/plan/@lat,lng,16z`)
- Fix: Kartenausschnitt in Treffpunkt-Karte korrekt zentriert (left/top via CSS calc statt fixer Pixelrechnung)
- Treffpunkte-Übersicht: statisches Kartenbild statt interaktivem OSM-Iframe (OSM-Tiles, SVG-Pin, nicht verschiebbar, kein Attribution-Overlay)

## v45
- Fix: Verschieben/Löschen im Planung-Kalender sofort sichtbar (optimistisches DOM-Update statt re-fetch)
- Fix: Nach Einplanen eines Blocks von der Planung-Seite bleibt man auf Planung (kein ungewollter Wechsel zum Kalender)
- Trainingsblöcke Typ „Runde / Strecke": Segmente-Sektion durch Komoot-Streckenfeld ersetzt; URL wird beim Einplanen auf die Kalendereinheit übertragen und im Kalender-Detail-Modal als Link angezeigt; DB-Migration: komoot_url in training_bloecke und training_einheiten

## v43
- Fix: Kalender in Planung aktualisiert nach Verschieben/Löschen sofort (cache:no-store verhindert gecachte GET-Antwort)
- Fix: Heute-Sektion zeigte „[object Object]" statt Treffpunktname – `e.treffpunkt` ist jetzt Objekt, Zugriff via `.name`
- Komoot-Link zu Treffpunkten; Kartenvorschau (OpenStreetMap-Embed) in jeder Treffpunkt-Karte auf der Übersichtsseite
- Planung: Kalendereinheiten per Drag & Drop auf einen anderen Tag verschieben (nur Trainer/Admin); Kalendereinträge per ×-Button (erscheint beim Hover) löschen – der zugehörige Trainingsblock bleibt erhalten

## v39
- Treffpunkte als eigene Entität: neuer Menüpunkt „Treffpunkte" (Trainer/Admin), CRUD mit Name, GPS-Koordinaten (Leaflet-Kartenpicker, OpenStreetMap) und automatisch generierten Links zu Google Maps und Apple Maps; Treffpunkt-Freitext aus Trainingsblöcken entfernt; beim Einplanen eines Blocks (Apply) und im Einheits-Editor wird Treffpunkt aus der gepflegten Liste gewählt (treffpunkt_id FK); Kalendermodal zeigt Treffpunktname mit Maps-Links; DB-Migration: neue Tabelle training_treffpunkte, treffpunkt_id in training_einheiten

## v37
- Planung-Sidebar: Segmentanzahl aus Block-Karten entfernt; Typ-Überschriften kleiner und linksbündig
- Heute-Sektion über dem Kalender: erscheint automatisch, wenn heute ein Training eingetragen ist; zeigt Typ, Uhrzeit, Titel, Treffpunkt, Bemerkung sowie Status-Badges; Klick öffnet Detail-Modal

## v36
- Seite „Trainingsblöcke" entfernt; Block-Verwaltung vollständig in Planung-Sidebar integriert: „+ Neu"-Button (Trainer/Admin), Bearbeiten-Button (✎) erscheint beim Hover über jede Karte, Sidebar lädt nach Speichern/Löschen automatisch neu
- `#bloecke` leitet auf `#planung` um; Kalender-Button „Trainingsblöcke" heißt jetzt „Planung"

## v34
- Trainingstypen in Einstellungen konfigurierbar: Neue Tabelle `training_typen` (Slug, Bezeichnung, Farbe, Reihenfolge, Aktiv); SQL-Migration `migration_v30_typen.sql`
- Admin-Panel „Trainingstypen": Typen anlegen, umbenennen, Farbe/Reihenfolge/Aktiv-Status ändern, löschen (nur wenn keine Blöcke zugeordnet); Spalte „Blöcke" zeigt Anzahl pro Typ
- Neue API-Endpunkte: `GET /typen` (öffentlich), `GET|POST|PUT|DELETE admin/typen/{slug}`
- `GET /config` liefert jetzt `typen`-Array → Editor und Blöcke-Seite verwenden dynamische Typen ohne Extra-Request
- Trainingsblöcke-Seite gruppiert Blöcke nach Trainingstyp (statt Global/Privat als Primärgruppe); Anzahl-Badge pro Typ-Abschnitt
- Typ-Auswahl in Block-Editor und Trainingseinheits-Editor liest Typen aus `appConfig.typen`; Fallback auf hardcodierte Werte
- `typ`-Spalten in `training_bloecke` und `training_einheiten` von ENUM auf VARCHAR(40) migriert

## v33
- Fix: `.settings-row-label` bekommt `flex-shrink:0; min-width:180px` – verhindert Schrumpfen der Label-Spalte auf Wortbreite

## v22
- Profileinstellungen: Klick auf Avatar öffnet Modal mit Pace-Referenz-Konfiguration pro Distanz (5 km, 10 km, HM, Marathon) – Quelle wählbar: Bestzeit gesamt, Bestzeit letzte 12 Monate (je nur wenn im Statistikportal vorhanden) oder manuelle Eingabe; gespeichert in `benutzer.prefs`
- Neuer API-Endpunkt `GET/PUT pace/prefs` – löst Pace-Referenzen per Distanz auf
- Pace-Engine (`05_pace.js`) nutzt jetzt `pace/prefs` statt globalem Modus; `PACE.invalidate()` ergänzt
- Detail-Modal: Modus-Dropdown durch „⚙ Profil"-Button ersetzt
- Fix: Notification-Stil `notif-err` ergänzt

## v21
- Fix: settings-row-label Spalte zu schmal – `min-width:0` auf `.settings-row-input`

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
- Einstellungen-Seite verwendet jetzt 1:1 die Statistikportal-Optik
- Feiertage-Loader: cURL-Fallback, erweiterte Fehlermeldungen
- Neuer Diagnose-Endpoint `GET admin/feiertage_test`

## v13
- Fix: Header-Logo/Badge-Links korrigiert; Fallback für unbekannte Routes auf `#kalender`
- Fix: Vereinslogo und Avatar über `shared.php` ausgeliefert

## v12
- 1:1-Optik mit Statistikportal via `shared.php?file=app.css`
- `applyConfig()` übernommen; Backend `GET config` ergänzt

## v9
- Einstellungen-Seite für Admins: Feiertage-/Ferien-Feeds und Standard-Dauer

## v8
- Optik aus Statistikportal (Farben, Logo, Theme-Color)
- Feiertage/Ferien als konfigurierbare ICS-Feeds

## v7
- Bugfix: Query-String-Handling in API-Aufrufen

## v6
- FIT-Workout-Export für Garmin Connect

## v5
- ICS-Export (öffentlich + persönlich mit Token)

## v4
- Pace-Anreicherung für eingeloggte Athleten

## v3
- Einheit-Detail-Modal mit Segmenten

## v2
- Kalender: öffentliche + interne Einheiten, Login-Portal-Integration

## v1
- Projekt-Grundgerüst, Monatskalender (öffentlich), DB-Schema, Auth-Integration
