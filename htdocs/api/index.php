<?php
// ============================================================
// Trainingsportal – REST-API (Skeleton)
// ============================================================
// Endpunkte (initial):
//   GET  auth/me        → Session prüfen (gibt Login-Portal-URL bei 401 zurück)
//   POST auth/logout    → Session beenden
//   GET  ping           → Healthcheck
//
// Weitere Endpunkte folgen mit dem fachlichen Inhalt des Portals.
// ============================================================

declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/db.php';
require_once __DIR__ . '/../../includes/settings.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

Auth::startSession();

// ── Routing ────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path   = trim((string)($_GET['p'] ?? ''), '/');
if ($path === '') {
    // Fallback: PATH_INFO (für Server ohne Rewrite-Param)
    $pi = $_SERVER['PATH_INFO'] ?? '';
    $path = trim($pi, '/');
}

try {
    [$head, $tail] = array_pad(explode('/', $path, 2), 2, '');

    if ($head === 'ping') {
        echo json_encode(['ok' => true, 'service' => 'trainingsportal', 'time' => date('c')]);
        exit;
    }

    if ($head === 'auth') {
        handleAuth($method, $tail);
        exit;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Endpoint nicht gefunden', 'path' => $path]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok'     => false,
        'fehler' => 'Serverfehler',
        'detail' => $e->getMessage(),
    ]);
}

// ============================================================
function handleAuth(string $method, string $sub): void
{
    if ($sub === 'me' && $method === 'GET') {
        $user = Auth::check();
        if ($user) {
            echo json_encode([
                'ok'   => true,
                'user' => [
                    'id'           => (int)$user['id'],
                    'benutzername' => $user['benutzername'] ?? null,
                    'name'         => $user['name'] ?? null,
                    'email'        => $user['email'] ?? null,
                    'rolle'        => $user['rolle'] ?? null,
                    'avatar_pfad'  => $user['avatar_pfad'] ?? null,
                ],
            ]);
            return;
        }

        // 401 + Login-Portal-Hinweis (für Frontend-Redirect)
        $aktiv = (int)Settings::get('login_portal_aktiv', '0');
        $url   = Settings::get('login_portal_url', '');
        http_response_code(401);
        echo json_encode([
            'ok'                 => false,
            'fehler'             => 'Nicht angemeldet',
            'login_portal_aktiv' => $aktiv,
            'login_portal_url'   => $url,
        ]);
        return;
    }

    if ($sub === 'logout' && $method === 'POST') {
        Auth::logout();
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Auth-Endpoint nicht gefunden']);
}
