# Changelog

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
