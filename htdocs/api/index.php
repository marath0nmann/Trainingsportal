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
    if ($head === 'ics') {
        handleIcs($method, $tail);
        exit;
    }
    if ($head === 'fit') {
        handleFit($method, $tail);
        exit;
    }
    if ($head === 'config') {
        handleConfig();
        exit;
    }
    if ($head === 'feiertage') {
        handleFeiertage($method, $tail);
        exit;
    }
    if ($head === 'admin') {
        handleAdmin($method, $tail);
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
// Admin-Settings (Trainingsportal-spezifische Keys)
//   GET  admin/settings    → aktuelle Werte (auth+admin)
//   PUT  admin/settings    → Batch-Save (auth+admin)
//
// Geteilte Keys (farbe_*, logo_*, verein_*) werden im Statistik-/
// Login-Portal verwaltet. Hier nur trainingsspezifische Keys.
// ============================================================
const TRAINING_SETTINGS_KEYS = [
    'training_feiertage_ics_urls' => [
        'label'    => 'Externe Feiertage-/Ferien-Kalender',
        'gruppe'   => 'training',
        'beschreibung' => 'JSON-Array, z. B. [{"url":"https://…","label":"Feiertage NRW","farbe":"#cc0000"}]',
        'default'  => '[]',
    ],
    'training_default_dauer_min' => [
        'label'    => 'Standard-Dauer pro Einheit (Minuten)',
        'gruppe'   => 'training',
        'beschreibung' => 'Wird im ICS-Export für DTEND benutzt, wenn Uhrzeit gesetzt ist',
        'default'  => '90',
    ],
];

function handleAdmin(string $method, string $sub): void {
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    if (($user['rolle'] ?? '') !== 'admin') {
        http_response_code(403);
        echo json_encode(['ok' => false, 'fehler' => 'Nur Admins']);
        return;
    }

    if ($sub !== 'settings') {
        http_response_code(404);
        echo json_encode(['ok' => false, 'fehler' => 'Admin-Endpoint nicht gefunden']);
        return;
    }

    if ($method === 'GET') {
        $felder = [];
        foreach (TRAINING_SETTINGS_KEYS as $key => $meta) {
            $felder[] = [
                'key'          => $key,
                'label'        => $meta['label'],
                'gruppe'       => $meta['gruppe'],
                'beschreibung' => $meta['beschreibung'],
                'wert'         => Settings::get($key, $meta['default']),
            ];
        }
        echo json_encode(['ok' => true, 'felder' => $felder]);
        return;
    }

    if ($method === 'PUT') {
        $in = readJsonBody();
        $kvs = $in['werte'] ?? [];
        if (!is_array($kvs)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "werte" (Objekt) erforderlich']);
            return;
        }
        $erlaubt = array_keys(TRAINING_SETTINGS_KEYS);
        foreach ($kvs as $k => $v) {
            if (!in_array($k, $erlaubt, true)) continue;
            if (!is_string($v) && !is_int($v)) continue;
            Settings::set($k, (string)$v);
        }
        // Caches invalidieren (Feiertage neu laden)
        $cacheDir = __DIR__ . '/../uploads/feiertage_cache';
        if (is_dir($cacheDir)) {
            foreach (glob($cacheDir . '/*.ics') as $f) @unlink($f);
        }
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
}

// ============================================================
// GET config  →  Optik + Vereinsdaten + Feiertage-URLs
//   wird beim App-Start vom Frontend gelesen und auf CSS-Variablen
//   abgebildet, damit das Trainingsportal optisch zum Statistik-/
//   Login-Portal passt (geteilte einstellungen-Tabelle).
// ============================================================
function handleConfig(): void {
    $keys = [
        'farbe_primary', 'farbe_primary2', 'farbe_primary3',
        'farbe_accent',  'farbe_accent2',
        'logo_datei', 'logo_url',
        'verein_name', 'verein_kuerzel',
        'app_untertitel',
        'training_feiertage_ics_urls',
    ];
    $cfg = [];
    foreach ($keys as $k) {
        $cfg[$k] = Settings::get($k, '');
    }
    // Feiertage-Liste als Array zurückgeben
    $urls = [];
    if ($cfg['training_feiertage_ics_urls'] !== '') {
        $j = json_decode($cfg['training_feiertage_ics_urls'], true);
        if (is_array($j)) {
            foreach ($j as $entry) {
                if (is_string($entry)) {
                    $urls[] = ['url' => $entry, 'label' => '', 'farbe' => ''];
                } elseif (is_array($entry) && !empty($entry['url'])) {
                    $urls[] = [
                        'url'    => (string)$entry['url'],
                        'label'  => (string)($entry['label']  ?? ''),
                        'farbe'  => (string)($entry['farbe']  ?? ''),
                    ];
                }
            }
        }
    }
    $cfg['feiertage'] = $urls;
    unset($cfg['training_feiertage_ics_urls']);

    echo json_encode(['ok' => true, 'config' => $cfg]);
}

// ============================================================
// GET feiertage?von=YYYY-MM-DD&bis=YYYY-MM-DD
//   Lädt die in `training_feiertage_ics_urls` konfigurierten ICS-
//   Feeds, parst die VEVENTs und gibt die im Zeitraum liegenden
//   Termine zurück. Inhalte werden 6 h serverseitig gecacht.
// ============================================================
function handleFeiertage(string $method, string $sub): void {
    if ($method !== 'GET') { http_response_code(405); echo json_encode(['ok'=>false,'fehler'=>'Methode nicht erlaubt']); return; }
    $von = $_GET['von'] ?? '';
    $bis = $_GET['bis'] ?? '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $von) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $bis)) {
        http_response_code(400); echo json_encode(['ok'=>false,'fehler'=>'Parameter von/bis erforderlich']);
        return;
    }

    $raw = Settings::get('training_feiertage_ics_urls', '');
    $entries = [];
    if ($raw !== '') {
        $j = json_decode($raw, true);
        if (is_array($j)) {
            foreach ($j as $e) {
                if (is_string($e)) {
                    $entries[] = ['url' => $e, 'label' => '', 'farbe' => ''];
                } elseif (is_array($e) && !empty($e['url'])) {
                    $entries[] = [
                        'url'   => (string)$e['url'],
                        'label' => (string)($e['label'] ?? ''),
                        'farbe' => (string)($e['farbe'] ?? ''),
                    ];
                }
            }
        }
    }

    $events = [];
    foreach ($entries as $entry) {
        $body = ladeIcsCached($entry['url'], 6 * 3600);
        if (!$body) continue;
        foreach (parseIcsEvents($body, $von, $bis) as $ev) {
            $events[] = [
                'datum'        => $ev['datum'],
                'datum_bis'    => $ev['datum_bis'],
                'titel'        => $ev['titel'],
                'kategorie'    => $entry['label'] ?: 'Feiertag',
                'farbe'        => $entry['farbe'] ?: '',
            ];
        }
    }

    echo json_encode(['ok' => true, 'feiertage' => $events]);
}

function ladeIcsCached(string $url, int $ttl): ?string {
    if (!preg_match('#^https?://#i', $url)) return null;
    $cacheDir = __DIR__ . '/../uploads/feiertage_cache';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0775, true);
    $f = $cacheDir . '/' . sha1($url) . '.ics';
    if (is_file($f) && (time() - filemtime($f) < $ttl)) {
        return file_get_contents($f);
    }
    $ctx = stream_context_create([
        'http' => ['timeout' => 8, 'header' => "User-Agent: Trainingsportal-TuSOedt/1.0\r\n"],
        'https' => ['timeout' => 8, 'header' => "User-Agent: Trainingsportal-TuSOedt/1.0\r\n"],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        // Fallback: alten Cache nehmen, falls vorhanden
        if (is_file($f)) return file_get_contents($f);
        return null;
    }
    @file_put_contents($f, $body);
    return $body;
}

function parseIcsEvents(string $body, string $von, string $bis): array {
    // Line-Unfolding (RFC 5545)
    $body = preg_replace("/\r?\n[ \t]/", '', $body);
    $lines = preg_split("/\r?\n/", $body);
    $events = [];
    $cur = null;
    foreach ($lines as $line) {
        if ($line === 'BEGIN:VEVENT') { $cur = []; continue; }
        if ($line === 'END:VEVENT') {
            if ($cur && !empty($cur['DTSTART']) && !empty($cur['SUMMARY'])) {
                $start = parseIcsDate($cur['DTSTART']);
                $end   = !empty($cur['DTEND']) ? parseIcsDate($cur['DTEND']) : $start;
                if ($start && $start <= $bis && $end >= $von) {
                    // bei DTEND: für all-day events ist DTEND exklusiv → einen Tag zurück
                    $endInkl = $end;
                    if (!empty($cur['DTEND_VALUE_DATE'])) {
                        $endInkl = date('Y-m-d', strtotime($end . ' -1 day'));
                    }
                    $events[] = [
                        'datum'      => $start,
                        'datum_bis'  => $endInkl,
                        'titel'      => icsUnesc($cur['SUMMARY']),
                    ];
                }
            }
            $cur = null;
            continue;
        }
        if ($cur === null) continue;
        if (preg_match('/^([A-Z][A-Z0-9-]*)(;[^:]*)?:(.*)$/s', $line, $m)) {
            $key  = $m[1];
            $params = $m[2];
            $val  = $m[3];
            if ($key === 'DTSTART' || $key === 'DTEND') {
                $cur[$key] = $val;
                if (strpos($params, 'VALUE=DATE') !== false) {
                    $cur[$key . '_VALUE_DATE'] = true;
                }
            } elseif ($key === 'SUMMARY') {
                $cur['SUMMARY'] = $val;
            }
        }
    }
    return $events;
}

function parseIcsDate(string $s): ?string {
    // Form: YYYYMMDD oder YYYYMMDDTHHMMSS(Z)?
    if (preg_match('/^(\d{4})(\d{2})(\d{2})/', $s, $m)) {
        return $m[1] . '-' . $m[2] . '-' . $m[3];
    }
    return null;
}

function icsUnesc(string $s): string {
    return strtr($s, ['\\,' => ',', '\\;' => ';', '\\n' => "\n", '\\\\' => '\\']);
}

// ============================================================
// FIT-Export (Garmin Workout)
//   GET fit/einheit/{id}.fit  → Binärdatei zum Import in Garmin Connect
// ============================================================
function handleFit(string $method, string $sub): void
{
    if ($method !== 'GET' || !preg_match('#^einheit/(\d+)(?:\.fit)?$#', $sub, $m)) {
        http_response_code(404);
        echo 'FIT-Endpoint nicht gefunden';
        return;
    }
    $id = (int)$m[1];
    $row = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_einheiten') . ' WHERE id = ?', [$id]);
    if (!$row) { http_response_code(404); echo 'Einheit nicht gefunden'; return; }
    if ($row['sichtbarkeit'] !== 'oeffentlich' && !Auth::check()) {
        http_response_code(401); echo 'Nicht angemeldet'; return;
    }

    $segs = DB::fetchAll(
        'SELECT * FROM ' . DB::tbl('training_segmente') . ' WHERE einheit_id = ? ORDER BY reihenfolge, id',
        [$id]
    );

    require_once __DIR__ . '/../../includes/fit_workout.php';

    // FIT-Workout-Name: max 15 ASCII-Zeichen
    $name = $row['datum'] . ' ' . $row['titel'];
    $name = preg_replace('/[^A-Za-z0-9 .\-_]/', '', $name);
    $name = substr($name, 0, 15);

    $fit = FitWorkout::encode($id, $name, $segs);
    $filename = 'training-' . $row['datum'] . '-' . $id . '.fit';

    header('Content-Type: application/vnd.ant.fit');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . strlen($fit));
    header('Cache-Control: no-store');
    echo $fit;
}

// ============================================================
// ICS-Export
//   GET  ics/public.ics           → öffentlicher Trainingsplan
//   GET  ics/me.ics?token=…       → persönlich, mit Pace-Vorgaben
//   GET  ics/me/token             → aktuellen Token zurückgeben (auth)
//   POST ics/me/token             → neuen Token erzeugen (auth)
//   DEL  ics/me/token             → Token widerrufen (auth)
// ============================================================
function handleIcs(string $method, string $sub): void
{
    // Token-Verwaltung (JSON-Antworten)
    if ($sub === 'me/token') {
        $user = Auth::check();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
            return;
        }
        if ($method === 'GET') {
            $tok = ladeIcsToken((int)$user['id']);
            echo json_encode(['ok' => true, 'token' => $tok]);
            return;
        }
        if ($method === 'POST') {
            $tok = bin2hex(random_bytes(16));
            speichereIcsToken((int)$user['id'], $tok);
            echo json_encode(['ok' => true, 'token' => $tok]);
            return;
        }
        if ($method === 'DELETE') {
            speichereIcsToken((int)$user['id'], null);
            echo json_encode(['ok' => true]);
            return;
        }
        http_response_code(405);
        echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
        return;
    }

    // Kalender-Downloads (text/calendar)
    if ($method !== 'GET') {
        http_response_code(405);
        echo 'Method not allowed';
        return;
    }

    if ($sub === 'public.ics' || $sub === 'public') {
        sendeIcs(buildIcsPublic(), 'training-public.ics');
        return;
    }

    if ($sub === 'me.ics' || $sub === 'me') {
        $token = $_GET['token'] ?? '';
        if (!$token || !preg_match('/^[a-f0-9]{32}$/', $token)) {
            http_response_code(400);
            echo 'Token fehlt oder ungültig';
            return;
        }
        $userId = findeBenutzerByToken($token);
        if (!$userId) {
            http_response_code(403);
            echo 'Token unbekannt';
            return;
        }
        sendeIcs(buildIcsForUser($userId), 'training-me.ics');
        return;
    }

    http_response_code(404);
    echo 'ICS-Endpoint nicht gefunden';
}

function ladeIcsToken(int $userId): ?string {
    $row = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
    if (!$row || !$row['prefs']) return null;
    $prefs = json_decode((string)$row['prefs'], true);
    return is_array($prefs) ? ($prefs['training_ics_token'] ?? null) : null;
}

function speichereIcsToken(int $userId, ?string $token): void {
    $row = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
    $prefs = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
    if (!is_array($prefs)) $prefs = [];
    if ($token === null) unset($prefs['training_ics_token']);
    else $prefs['training_ics_token'] = $token;
    DB::query('UPDATE ' . DB::tbl('benutzer') . ' SET prefs = ? WHERE id = ?', [json_encode($prefs, JSON_UNESCAPED_UNICODE), $userId]);
}

function findeBenutzerByToken(string $token): ?int {
    $row = DB::fetchOne(
        "SELECT id FROM " . DB::tbl('benutzer') . "
          WHERE JSON_EXTRACT(prefs, '$.training_ics_token') = ?
            AND aktiv = 1 LIMIT 1",
        [$token]
    );
    return $row ? (int)$row['id'] : null;
}

function sendeIcs(string $body, string $filename): void {
    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: max-age=600, public');
    echo $body;
}

function buildIcsPublic(): string {
    $rows = DB::fetchAll(
        'SELECT * FROM ' . DB::tbl('training_einheiten') . "
          WHERE sichtbarkeit = 'oeffentlich'
            AND datum >= (CURDATE() - INTERVAL 60 DAY)
            AND datum <= (CURDATE() + INTERVAL 365 DAY)
       ORDER BY datum, uhrzeit"
    );
    $events = [];
    foreach ($rows as $e) {
        $events[] = bauVevent($e, []);
    }
    return wickleIcs($events, 'TuS Oedt – Trainingsplan');
}

function buildIcsForUser(int $userId): string {
    $user = DB::fetchOne('SELECT id, athlet_id FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
    if (!$user) return wickleIcs([], 'TuS Oedt – Trainingsplan');

    // Persönliche Bestzeiten je Referenzdistanz (modus=pb)
    $paceRefs = ['5km' => 5000.0, '10km' => 10000.0, 'HM' => 21097.5, 'M' => 42195.0];
    $bestzeiten = [];
    if (!empty($user['athlet_id'])) {
        foreach ($paceRefs as $key => $dist) {
            $row = DB::fetchOne(
                "SELECT MIN(e.resultat_num) AS sek
                   FROM ergebnisse e
                   JOIN veranstaltungen v ON v.id = e.veranstaltung_id
                   JOIN disziplin_mapping dm ON dm.id = e.disziplin_mapping_id
                  WHERE e.athlet_id = ?
                    AND e.geloescht_am IS NULL
                    AND v.geloescht_am IS NULL
                    AND dm.distanz BETWEEN ? AND ?
                    AND e.resultat_num IS NOT NULL
                    AND e.resultat_num > 0",
                [(int)$user['athlet_id'], $dist - 25, $dist + 25]
            );
            if ($row && $row['sek']) {
                $bestzeiten[$key] = ['sek' => (float)$row['sek'], 'distanz_m' => $dist];
            }
        }
    }

    $rows = DB::fetchAll(
        'SELECT * FROM ' . DB::tbl('training_einheiten') . "
          WHERE datum >= (CURDATE() - INTERVAL 60 DAY)
            AND datum <= (CURDATE() + INTERVAL 365 DAY)
       ORDER BY datum, uhrzeit"
    );

    $events = [];
    foreach ($rows as $e) {
        $segs = DB::fetchAll(
            'SELECT * FROM ' . DB::tbl('training_segmente') . ' WHERE einheit_id = ? ORDER BY reihenfolge, id',
            [(int)$e['id']]
        );
        $events[] = bauVevent($e, $segs, $bestzeiten);
    }
    return wickleIcs($events, 'TuS Oedt – Mein Trainingsplan');
}

function bauVevent(array $e, array $segs, array $bestzeiten = []): string {
    $uid = 'einheit-' . (int)$e['id'] . '@training.tus-oedt.de';
    $stamp = gmdate('Ymd\\THis\\Z');
    $datum = preg_replace('/-/', '', $e['datum']);
    $hatZeit = !empty($e['uhrzeit']);

    $lines = [];
    $lines[] = 'BEGIN:VEVENT';
    $lines[] = 'UID:' . $uid;
    $lines[] = 'DTSTAMP:' . $stamp;
    $lines[] = 'SEQUENCE:' . (int)strtotime($e['geaendert_am'] ?? $e['erstellt_am'] ?? 'now');

    if ($hatZeit) {
        $h = substr($e['uhrzeit'], 0, 2);
        $mi = substr($e['uhrzeit'], 3, 2);
        $startBer = $datum . 'T' . $h . $mi . '00';
        $startTs  = mktime((int)$h, (int)$mi, 0, (int)substr($datum,4,2), (int)substr($datum,6,2), (int)substr($datum,0,4));
        $endTs    = $startTs + 90 * 60; // 90 Min Default
        $endBer   = date('Ymd\\THis', $endTs);
        $lines[] = 'DTSTART;TZID=Europe/Berlin:' . $startBer;
        $lines[] = 'DTEND;TZID=Europe/Berlin:'   . $endBer;
    } else {
        $lines[] = 'DTSTART;VALUE=DATE:' . $datum;
        // All-Day Ende = nächster Tag
        $endTs = strtotime($e['datum'] . ' +1 day');
        $lines[] = 'DTEND;VALUE=DATE:' . date('Ymd', $endTs);
    }

    $lines[] = 'SUMMARY:' . icsEsc($e['titel']);
    if (!empty($e['treffpunkt'])) {
        $lines[] = 'LOCATION:' . icsEsc($e['treffpunkt']);
    }
    if (($e['status'] ?? '') === 'abgesagt') {
        $lines[] = 'STATUS:CANCELLED';
    }

    // Beschreibung: Bemerkung + Segmente (mit Pace, falls Bestzeiten vorhanden)
    $descLines = [];
    if (!empty($e['bemerkung'])) {
        $descLines[] = $e['bemerkung'];
    }
    if (!empty($segs)) {
        $descLines[] = '';
        $descLines[] = 'Segmente:';
        foreach ($segs as $i => $s) {
            $z = ($i + 1) . '. ' . formatSegmentText($s);
            $bz = $bestzeiten[$s['pace_referenz']] ?? null;
            if ($bz && $s['pace_referenz']) {
                $sekProKm = $bz['sek'] / ($bz['distanz_m'] / 1000);
                $splitSek = $sekProKm * ((int)$s['distanz_m'] / 1000);
                $z .= ' → ' . formatTimeShort($splitSek) . ' / Wdh (' . formatPaceShort($sekProKm) . ')';
            }
            $descLines[] = $z;
        }
    }
    $desc = implode("\n", $descLines);
    if ($desc !== '') {
        $lines[] = 'DESCRIPTION:' . icsEsc($desc);
    }

    $lines[] = 'END:VEVENT';
    return implode("\r\n", array_map('icsFold', $lines));
}

function formatSegmentText(array $s): string {
    $wdh = ((int)$s['wiederholungen'] > 1) ? ((int)$s['wiederholungen'] . ' x ') : '';
    $dist = formatDistText((int)$s['distanz_m']);
    $pause = '';
    if (!empty($s['pause_m'])) {
        $pLbl = ['TP' => 'TP', 'GP' => 'GP', 'BP' => 'BP'][$s['pause_typ'] ?? ''] ?? 'P';
        $pause = ' (' . (int)$s['pause_m'] . ' ' . $pLbl . ')';
    }
    return $wdh . $dist . $pause;
}
function formatDistText(int $m): string {
    if ($m >= 1000) {
        $km = $m / 1000;
        if ($km == (int)$km) return ((int)$km) . ' km';
        return rtrim(rtrim(number_format($km, 2, ',', ''), '0'), ',') . ' km';
    }
    return $m . ' m';
}
function formatTimeShort(float $sek): string {
    $sek = (int)round($sek);
    $m = intdiv($sek, 60);
    $s = $sek % 60;
    return $m . ':' . str_pad((string)$s, 2, '0', STR_PAD_LEFT);
}
function formatPaceShort(float $sekProKm): string {
    return formatTimeShort($sekProKm) . ' /km';
}

function icsEsc(string $s): string {
    $s = str_replace(['\\', "\r\n", "\n", ',', ';'],
                      ['\\\\',    '\\n',  '\\n', '\\,', '\\;'], $s);
    return $s;
}

function icsFold(string $line): string {
    // RFC 5545: Zeilen >75 Oktett müssen gefaltet werden (CRLF + Leerzeichen)
    if (strlen($line) <= 75) return $line;
    $out = '';
    $first = true;
    while (strlen($line) > 0) {
        $chunk = substr($line, 0, $first ? 75 : 74);
        $line  = substr($line, $first ? 75 : 74);
        $out  .= ($first ? '' : "\r\n ") . $chunk;
        $first = false;
    }
    return $out;
}

function wickleIcs(array $events, string $name): string {
    $tz = vtimezoneEuropeBerlin();
    $head = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TuS Oedt//Trainingsportal//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:' . icsEsc($name),
        'X-WR-TIMEZONE:Europe/Berlin',
    ];
    $foot = ['END:VCALENDAR'];
    return implode("\r\n", array_merge($head, [$tz], $events, $foot)) . "\r\n";
}

function vtimezoneEuropeBerlin(): string {
    return implode("\r\n", [
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Berlin',
        'BEGIN:STANDARD',
        'DTSTART:19701025T030000',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0100',
        'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
        'TZNAME:CET',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'DTSTART:19700329T020000',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0200',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
        'TZNAME:CEST',
        'END:DAYLIGHT',
        'END:VTIMEZONE',
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
