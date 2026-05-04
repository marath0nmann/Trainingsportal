<?php
// ============================================================
// Trainingsportal – Shared-Asset-Proxy
// ============================================================
// Liefert ausgewählte Assets aus dem Statistikportal-Verzeichnis
// aus, damit das Trainingsportal die identische Optik bekommt,
// ohne Dateien zu duplizieren.
//
// Beispiel: shared.php?file=app.css
// Erlaubte Dateien: app.css, favicon.svg, apple-touch-icon.png,
// uploads/<assetname>
// ============================================================

declare(strict_types=1);
require_once __DIR__ . '/../includes/config.php';

if (!defined('STATISTIKPORTAL_PATH') || !is_dir(STATISTIKPORTAL_PATH)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Statistikportal-Pfad nicht konfiguriert oder nicht erreichbar.";
    exit;
}

$file = (string)($_GET['file'] ?? '');

// Whitelist: nur die statischen Assets, die wir wirklich teilen wollen.
$erlaubt = [
    '#^app\.css$#',
    '#^favicon\.(?:svg|ico)$#',
    '#^apple-touch-icon\.png$#',
    '#^uploads/[a-zA-Z0-9_./-]+\.(?:png|jpg|jpeg|svg|webp|gif)$#',
];
$ok = false;
foreach ($erlaubt as $re) {
    if (preg_match($re, $file)) { $ok = true; break; }
}
if (!$ok) { http_response_code(404); exit; }

$path = rtrim(STATISTIKPORTAL_PATH, '/') . '/' . $file;
$real = realpath($path);
$base = realpath(STATISTIKPORTAL_PATH);
if (!$real || !$base || strpos($real, $base) !== 0 || !is_file($real)) {
    http_response_code(404); exit;
}

$mimeMap = [
    'css'  => 'text/css; charset=utf-8',
    'svg'  => 'image/svg+xml',
    'ico'  => 'image/x-icon',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'gif'  => 'image/gif',
];
$ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
$mime = $mimeMap[$ext] ?? 'application/octet-stream';

$mtime = filemtime($real);
$etag  = '"' . sha1($real . '|' . $mtime) . '"';

header('Content-Type: ' . $mime);
header('Cache-Control: public, max-age=300');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');

if ((($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag)
    || (!empty($_SERVER['HTTP_IF_MODIFIED_SINCE']) && strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) >= $mtime)) {
    http_response_code(304);
    exit;
}

readfile($real);
