<?php
// ============================================================
// Trainingsportal – Dynamisches Favicon / Apple-Touch-Icon
// ============================================================
// Liest logo_datei aus den Einstellungen und erzeugt daraus
// ein quadratisches PNG in beliebiger Größe.
//
// Nutzung (via <link rel="..."> in index.html):
//   favicon.php?size=32   → 32×32 für Browser-Tab
//   favicon.php?size=180  → 180×180 für Apple-Touch-Icon
//
// Fallback: roter Hintergrund mit weißem „T", falls kein Logo
// konfiguriert ist oder das Bild nicht geladen werden kann.
// ============================================================

declare(strict_types=1);
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/settings.php';

$size = max(16, min(512, (int)($_GET['size'] ?? 180)));

// ── Fallback-Buchstabe aus login_portal_apps ermitteln ──────
$fallbackLetter = mb_strtoupper(mb_substr(Settings::get('verein_kuerzel', 'T'), 0, 1, 'UTF-8'));
try {
    $apps = json_decode(Settings::get('login_portal_apps', '[]'), true) ?: [];
    $host = $_SERVER['HTTP_HOST'] ?? '';
    foreach ($apps as $app) {
        $appHost = parse_url($app['url'] ?? '', PHP_URL_HOST) ?: '';
        if ($appHost !== '' && $appHost === $host) {
            $name = trim($app['name'] ?? '');
            if ($name !== '') {
                $fallbackLetter = mb_strtoupper(mb_substr($name, 0, 1, 'UTF-8'));
            }
            break;
        }
    }
} catch (\Throwable) {}

// ── Logo aus Statistikportal-Pfad auflösen ─────────────────
$logoFile = Settings::get('logo_datei', '');
$logoPath = null;

if ($logoFile !== '' && defined('STATISTIKPORTAL_PATH') && is_dir(STATISTIKPORTAL_PATH)) {
    $base      = realpath(STATISTIKPORTAL_PATH);
    $candidate = realpath($base . '/' . ltrim($logoFile, '/'));
    if ($candidate && str_starts_with($candidate, $base) && is_file($candidate)) {
        $logoPath = $candidate;
    }
}

// ── Ausgabebild vorbereiten ─────────────────────────────────
$out   = imagecreatetruecolor($size, $size);
$white = imagecolorallocate($out, 255, 255, 255);
imagefill($out, 0, 0, $white);

if ($logoPath !== null) {
    $ext = strtolower(pathinfo($logoPath, PATHINFO_EXTENSION));
    $src = match ($ext) {
        'png'        => @imagecreatefrompng($logoPath),
        'jpg','jpeg' => @imagecreatefromjpeg($logoPath),
        'gif'        => @imagecreatefromgif($logoPath),
        'webp'       => @imagecreatefromwebp($logoPath),
        default      => null,
    };

    if ($src) {
        // Padding: 8 % auf jeder Seite → sauberer Abstand ohne Beschnitt
        $pad = (int)round($size * 0.08);
        $dst = $size - 2 * $pad;
        $sw  = imagesx($src);
        $sh  = imagesy($src);

        // Seitenverhältnis bewahren – in die Zielfläche einpassen
        if ($sw >= $sh) {
            $dw = $dst;
            $dh = (int)round($dst * $sh / $sw);
        } else {
            $dh = $dst;
            $dw = (int)round($dst * $sw / $sh);
        }
        $dx = (int)(($size - $dw) / 2);
        $dy = (int)(($size - $dh) / 2);

        imagecopyresampled($out, $src, $dx, $dy, 0, 0, $dw, $dh, $sw, $sh);
        imagedestroy($src);
    } else {
        _fallback($out, $size, $fallbackLetter);
    }
} else {
    _fallback($out, $size, $fallbackLetter);
}

function _fallback(GdImage $img, int $size, string $letter): void
{
    $red   = imagecolorallocate($img, 204, 0, 0);
    $white = imagecolorallocate($img, 255, 255, 255);
    imagefilledrectangle($img, 0, 0, $size - 1, $size - 1, $red);
    // Eingebauter GD-Font, zentriert
    $font = 5;
    $fw   = imagefontwidth($font);
    $fh   = imagefontheight($font);
    imagestring($img, $font, (int)(($size - $fw) / 2), (int)(($size - $fh) / 2), $letter, $white);
}

// ── Ausgabe ─────────────────────────────────────────────────
header('Content-Type: image/png');
header('Cache-Control: public, max-age=3600');
imagepng($out);
imagedestroy($out);
