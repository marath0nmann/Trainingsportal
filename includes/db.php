<?php
// Stub: lädt zentrale db-Klasse aus dem Statistikportal-Schwesterordner.
// Standard-Pfad: ../../statistik.tus-oedt.de/includes/db.php (all-inkl-Subdomain-Layout).
// Override via STATISTIKPORTAL_INCLUDES_PATH in config.php möglich.
if (!defined('DB_NAME')) require_once __DIR__ . '/config.php';
$_inc = defined('STATISTIKPORTAL_INCLUDES_PATH')
    ? rtrim(STATISTIKPORTAL_INCLUDES_PATH, '/')
    : __DIR__ . '/../../statistik.tus-oedt.de/includes';
require_once $_inc . '/db.php';
