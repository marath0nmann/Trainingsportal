<?php
// ============================================================
// Trainingsportal – Web-App-Manifest (PWA)
// ============================================================
// Dynamisch wie favicon.php: Name und Farben stammen aus den
// Vereinseinstellungen, die Icons aus favicon.php.
//
// Eingebunden über <link rel="manifest" href="manifest.php?v=NNN">
// ============================================================

declare(strict_types=1);
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/settings.php';

$verein  = trim((string)Settings::get('verein_name', ''));
$primary = (string)Settings::get('farbe_primary', '#cc0000');
if (!preg_match('/^#[0-9a-fA-F]{3,8}$/', $primary)) $primary = '#cc0000';

$name  = $verein !== '' ? 'Trainingsportal ' . $verein : 'Trainingsportal';
$short = 'Training';

$manifest = [
    'name'             => $name,
    'short_name'       => $short,
    'description'      => 'Trainingsplan, Wettkämpfe und persönlicher Plan der Leichtathletik-Abteilung',
    'lang'             => 'de',
    'start_url'        => './',
    'scope'            => './',
    'display'          => 'standalone',
    'orientation'      => 'portrait-primary',
    'background_color' => '#ffffff',
    'theme_color'      => $primary,
    'icons'            => [
        ['src' => 'favicon.php?size=192', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => 'favicon.php?size=512', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => 'favicon.php?size=192', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'maskable'],
    ],
];

header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: public, max-age=3600');
echo json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
