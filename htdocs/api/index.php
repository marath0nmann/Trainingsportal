<?php
// ============================================================
// Trainingsportal – REST-API
// ============================================================
// Endpunkte:
//   GET  ping                    → Healthcheck
//   GET  auth/me                 → Session prüfen (gibt Login-Portal-URL bei 401 zurück)
//   POST auth/logout             → Session beenden
//   GET  einheiten?von=&bis=     → Liste (öffentlich = nur sichtbarkeit=oeffentlich)
//   GET  einheiten/{id}          → Einzelne Einheit inkl. Segmente
//   POST einheiten               → Neu (auth + Recht: training_bearbeiten)
//   PUT  einheiten/{id}          → Update (auth + Recht)
//   DEL  einheiten/{id}          → Löschen (auth + Recht)
// ============================================================

declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/db.php';
require_once __DIR__ . '/../../includes/settings.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

Auth::startSession();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path   = trim((string)($_GET['p'] ?? ''), '/');
if ($path === '') {
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
    if ($head === 'einheiten') {
        handleEinheiten($method, $tail);
        exit;
    }
    if ($head === 'pace') {
        handlePace($method, $tail);
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

// ============================================================
function handleEinheiten(string $method, string $sub): void
{
    $user = Auth::check();

    // ── GET Liste ──
    if ($sub === '' && $method === 'GET') {
        $von = $_GET['von'] ?? null;
        $bis = $_GET['bis'] ?? null;
        if (!$von || !$bis || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $von) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $bis)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Parameter von/bis (YYYY-MM-DD) erforderlich']);
            return;
        }

        $where = 'datum BETWEEN ? AND ?';
        $params = [$von, $bis];
        if (!$user) {
            $where .= " AND sichtbarkeit = 'oeffentlich'";
        }

        $rows = DB::fetchAll(
            'SELECT id, datum, uhrzeit, typ, titel, treffpunkt, bemerkung, sichtbarkeit, status
               FROM ' . DB::tbl('training_einheiten') . "
              WHERE $where
           ORDER BY datum, uhrzeit",
            $params
        );

        echo json_encode(['ok' => true, 'einheiten' => array_map('mapEinheit', $rows)]);
        return;
    }

    // ── GET einzeln ──
    if ($sub !== '' && $method === 'GET' && ctype_digit($sub)) {
        $id = (int)$sub;
        $row = DB::fetchOne(
            'SELECT * FROM ' . DB::tbl('training_einheiten') . ' WHERE id = ?',
            [$id]
        );
        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Einheit nicht gefunden']);
            return;
        }
        if (!$user && $row['sichtbarkeit'] !== 'oeffentlich') {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Einheit nicht gefunden']);
            return;
        }
        $segmente = DB::fetchAll(
            'SELECT id, reihenfolge, block_id, wiederholungen, distanz_m, pause_m, pause_typ, pace_referenz, notiz
               FROM ' . DB::tbl('training_segmente') . '
              WHERE einheit_id = ?
           ORDER BY reihenfolge, id',
            [$id]
        );
        echo json_encode([
            'ok' => true,
            'einheit' => mapEinheit($row),
            'segmente' => array_map('mapSegment', $segmente),
        ]);
        return;
    }

    // Ab hier: Schreibzugriff → auth Pflicht
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    // TODO: Recht 'training_bearbeiten' prüfen, sobald Rolle existiert

    if ($sub === '' && $method === 'POST') {
        $in = readJsonBody();
        $errs = validateEinheit($in);
        if ($errs) { http_response_code(400); echo json_encode(['ok'=>false,'fehler'=>$errs[0]]); return; }
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            DB::query(
                'INSERT INTO ' . DB::tbl('training_einheiten') . '
                 (datum, uhrzeit, typ, titel, treffpunkt, bemerkung, sichtbarkeit, status, erstellt_von)
                 VALUES (?,?,?,?,?,?,?,?,?)',
                [
                    $in['datum'],
                    $in['uhrzeit'] ?? null,
                    $in['typ'] ?? 'frei',
                    $in['titel'],
                    $in['treffpunkt'] ?? null,
                    $in['bemerkung'] ?? null,
                    $in['sichtbarkeit'] ?? 'oeffentlich',
                    $in['status'] ?? 'geplant',
                    (int)$user['id'],
                ]
            );
            $id = (int)DB::lastInsertId();
            replaceSegmente($id, $in['segmente'] ?? []);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        echo json_encode(['ok' => true, 'id' => $id]);
        return;
    }

    if ($sub !== '' && $method === 'PUT' && ctype_digit($sub)) {
        $id = (int)$sub;
        $in = readJsonBody();
        $errs = validateEinheit($in);
        if ($errs) { http_response_code(400); echo json_encode(['ok'=>false,'fehler'=>$errs[0]]); return; }
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            DB::query(
                'UPDATE ' . DB::tbl('training_einheiten') . '
                    SET datum=?, uhrzeit=?, typ=?, titel=?, treffpunkt=?, bemerkung=?, sichtbarkeit=?, status=?
                  WHERE id=?',
                [
                    $in['datum'],
                    $in['uhrzeit'] ?? null,
                    $in['typ'] ?? 'frei',
                    $in['titel'],
                    $in['treffpunkt'] ?? null,
                    $in['bemerkung'] ?? null,
                    $in['sichtbarkeit'] ?? 'oeffentlich',
                    $in['status'] ?? 'geplant',
                    $id,
                ]
            );
            if (array_key_exists('segmente', $in)) {
                replaceSegmente($id, $in['segmente'] ?? []);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        echo json_encode(['ok' => true]);
        return;
    }

    if ($sub !== '' && $method === 'DELETE' && ctype_digit($sub)) {
        $id = (int)$sub;
        DB::query('DELETE FROM ' . DB::tbl('training_einheiten') . ' WHERE id = ?', [$id]);
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Einheiten-Endpoint nicht gefunden']);
}

// ============================================================
// GET pace/me?modus=pb|12m  →  Bestzeiten je Referenzdistanz
// Quelle: ergebnisse + veranstaltungen + disziplin_mapping
//   - resultat_num gilt als Zeit in Sekunden
//   - dm.distanz ist die Strecke in Metern
// ============================================================
function handlePace(string $method, string $sub): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }

    if ($sub !== 'me' || $method !== 'GET') {
        http_response_code(404);
        echo json_encode(['ok' => false, 'fehler' => 'Pace-Endpoint nicht gefunden']);
        return;
    }

    $athletId = isset($user['athlet_id']) ? (int)$user['athlet_id'] : 0;
    if ($athletId <= 0) {
        echo json_encode(['ok' => true, 'modus' => 'pb', 'distanzen' => new stdClass(), 'hinweis' => 'Kein Athletenprofil verknüpft']);
        return;
    }

    $modus = $_GET['modus'] ?? 'pb';
    if (!in_array($modus, ['pb', '12m'], true)) $modus = 'pb';

    // Referenzdistanzen: Pace-Referenz im Segment → Distanz in Metern (Toleranz ±25m)
    $refs = [
        '5km'  => 5000.0,
        '10km' => 10000.0,
        'HM'   => 21097.5,
        'M'    => 42195.0,
    ];

    $datumFilter = '';
    $params = [];
    if ($modus === '12m') {
        $datumFilter = ' AND v.datum >= (CURDATE() - INTERVAL 12 MONTH)';
    }

    $out = [];
    foreach ($refs as $key => $dist) {
        $tol = 25.0;
        $row = DB::fetchOne(
            "SELECT e.resultat, e.resultat_num, e.disziplin, v.datum, v.name AS wettkampf, v.ort
               FROM ergebnisse e
               JOIN veranstaltungen v ON v.id = e.veranstaltung_id
               JOIN disziplin_mapping dm ON dm.id = e.disziplin_mapping_id
              WHERE e.athlet_id = ?
                AND e.geloescht_am IS NULL
                AND v.geloescht_am IS NULL
                AND dm.distanz BETWEEN ? AND ?
                AND e.resultat_num IS NOT NULL
                AND e.resultat_num > 0
                {$datumFilter}
           ORDER BY e.resultat_num ASC
              LIMIT 1",
            [$athletId, $dist - $tol, $dist + $tol]
        );
        if ($row) {
            $out[$key] = [
                'distanz_m'    => (int)round($dist),
                'sekunden'     => (float)$row['resultat_num'],
                'resultat'     => $row['resultat'],
                'datum'        => $row['datum'],
                'wettkampf'    => $row['wettkampf'],
                'ort'          => $row['ort'],
            ];
        }
    }

    echo json_encode([
        'ok'        => true,
        'modus'     => $modus,
        'athlet_id' => $athletId,
        'distanzen' => (object)$out,
    ]);
}

// ============================================================
function mapEinheit(array $r): array {
    return [
        'id'           => (int)$r['id'],
        'datum'        => $r['datum'],
        'uhrzeit'      => $r['uhrzeit'] ? substr($r['uhrzeit'], 0, 5) : null,
        'typ'          => $r['typ'],
        'titel'        => $r['titel'],
        'treffpunkt'   => $r['treffpunkt'],
        'bemerkung'    => $r['bemerkung'],
        'sichtbarkeit' => $r['sichtbarkeit'] ?? 'oeffentlich',
        'status'       => $r['status'] ?? 'geplant',
    ];
}
function mapSegment(array $r): array {
    return [
        'id'             => (int)$r['id'],
        'reihenfolge'    => (int)$r['reihenfolge'],
        'block_id'       => $r['block_id'] !== null ? (int)$r['block_id'] : null,
        'wiederholungen' => (int)$r['wiederholungen'],
        'distanz_m'      => (int)$r['distanz_m'],
        'pause_m'        => $r['pause_m'] !== null ? (int)$r['pause_m'] : null,
        'pause_typ'      => $r['pause_typ'],
        'pace_referenz'  => $r['pace_referenz'],
        'notiz'          => $r['notiz'],
    ];
}

function replaceSegmente(int $einheitId, $segmente): void {
    DB::query('DELETE FROM ' . DB::tbl('training_segmente') . ' WHERE einheit_id = ?', [$einheitId]);
    if (!is_array($segmente)) return;
    $i = 0;
    foreach ($segmente as $s) {
        if (!is_array($s)) continue;
        $dist = isset($s['distanz_m']) ? (int)$s['distanz_m'] : 0;
        if ($dist <= 0) continue;
        $ptyp = $s['pause_typ'] ?? null;
        if ($ptyp !== null) {
            $ptyp = strtoupper((string)$ptyp);
            if (!in_array($ptyp, ['TP','GP','BP','frei','FREI'], true)) $ptyp = null;
            else if ($ptyp === 'FREI') $ptyp = 'frei';
        }
        DB::query(
            'INSERT INTO ' . DB::tbl('training_segmente') . '
             (einheit_id, reihenfolge, block_id, wiederholungen, distanz_m, pause_m, pause_typ, pace_referenz, notiz)
             VALUES (?,?,?,?,?,?,?,?,?)',
            [
                $einheitId,
                $i++,
                isset($s['block_id']) && $s['block_id'] !== '' ? (int)$s['block_id'] : null,
                isset($s['wiederholungen']) ? max(1, (int)$s['wiederholungen']) : 1,
                $dist,
                isset($s['pause_m']) && $s['pause_m'] !== '' ? (int)$s['pause_m'] : null,
                $ptyp,
                isset($s['pace_referenz']) && $s['pace_referenz'] !== '' ? substr((string)$s['pace_referenz'], 0, 40) : null,
                isset($s['notiz']) && $s['notiz'] !== '' ? substr((string)$s['notiz'], 0, 200) : null,
            ]
        );
    }
}

function readJsonBody(): array {
    $raw = file_get_contents('php://input');
    $j = json_decode($raw ?: '[]', true);
    return is_array($j) ? $j : [];
}

function validateEinheit(array $in): array {
    $errs = [];
    if (empty($in['datum']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['datum'])) {
        $errs[] = 'Feld "datum" (YYYY-MM-DD) erforderlich';
    }
    if (empty($in['titel']) || !is_string($in['titel'])) {
        $errs[] = 'Feld "titel" erforderlich';
    }
    if (!empty($in['uhrzeit']) && !preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $in['uhrzeit'])) {
        $errs[] = 'Feld "uhrzeit" muss HH:MM sein';
    }
    return $errs;
}
