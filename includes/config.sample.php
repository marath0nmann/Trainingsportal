<?php
// ── Datenbankverbindung ──────────────────────────────────────
// Gleiche DB wie Statistik-/Login-Portal verwenden, damit der
// Cross-Domain-Login (Shared Session) funktioniert.
define('DB_HOST',    'localhost');
define('DB_PORT',    3306);
define('DB_NAME',    'DATENBANKNAME');
define('DB_USER',    'DATENBANKBENUTZER');
define('DB_PASS',    'DATENBANKPASSWORT');
define('DB_CHARSET', 'utf8mb4');

// ── Tabellen-Prefix ──────────────────────────────────────────
// MUSS identisch sein mit Statistik- und Login-Portal,
// sonst wird ein abweichender benutzer-Bestand referenziert.
define('TABLE_PREFIX', '');

// ── Session ──────────────────────────────────────────────────
// SESSION_NAME MUSS identisch sein mit Statistik- und Login-Portal.
define('SESSION_NAME',     'stat_session');
define('SESSION_LIFETIME', 86400 * 30); // 30 Tage

// ── Cross-Domain Login ───────────────────────────────────────
// '.tus-oedt.de' = Session-Cookie gilt für alle Subdomains
//   → login.tus-oedt.de, statistik.tus-oedt.de, training.tus-oedt.de
// Leer = Standalone-Betrieb (Cookie nur für training.tus-oedt.de)
define('COOKIE_DOMAIN', '.tus-oedt.de');

// ── Statistikportal-Verzeichnis (auf dem Server) ─────────────
// Pfad zum htdocs-Verzeichnis des Statistikportals.
// Wird genutzt, um app.css und applyConfig 1:1 zu übernehmen.
// Standard: ../../statistik.tus-oedt.de/htdocs/  (Schwester-Subdomain).
define('STATISTIKPORTAL_PATH', __DIR__ . '/../../statistik.tus-oedt.de/htdocs/');
