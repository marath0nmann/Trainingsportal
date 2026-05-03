# Changelog

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
