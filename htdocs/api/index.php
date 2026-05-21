<?php
// ============================================================
// Trainingsportal – REST-API
// ============================================================
// Endpunkte:
//   GET  ping                       → Healthcheck
//   GET  auth/me                    → Session prüfen (gibt Login-Portal-URL bei 401)
//   POST auth/logout                → Session beenden
//   GET  einheiten?von=&bis=        → Liste (öffentlich = nur sichtbarkeit=oeffentlich)
//   GET  einheiten/{id}             → Einzelne Einheit inkl. Segmente
//   POST einheiten                  → Neu (auth + Recht: training_bearbeiten)
//   PUT  einheiten/{id}             → Update (auth + Recht)
//   DEL  einheiten/{id}             → Löschen (auth + Recht)
//   GET  bloecke                    → Liste aller Blöcke (auth erforderlich)
//   GET  bloecke/{id}               → Einzelner Block inkl. Segmente (auth)
//   POST bloecke                    → Neu (Recht: training_bloecke_verwalten)
//   PUT  bloecke/{id}               → Update (Trainer oder eigener privater Block)
//   DEL  bloecke/{id}               → Löschen (Trainer oder eigener privater Block)
//   POST bloecke/{id}/apply         → Block als Einheit auf den Kalender legen (auth)
//   GET  treffpunkte                → Liste (auth)
//   POST treffpunkte                → Neu (Recht: training_bloecke_verwalten)
//   PUT  treffpunkte/{id}           → Update (Recht: training_bloecke_verwalten)
//   DEL  treffpunkte/{id}           → Löschen (Recht: training_bloecke_verwalten)
//   GET  mein-plan/einheiten?von=&bis= → öffentl. + eigene private Einheiten (auth)
//   POST mein-plan/einheiten           → neue private Einheit (auth)
//   PUT  mein-plan/einheiten/{id}      → eigene private Einheit bearbeiten (auth)
//   DEL  mein-plan/einheiten/{id}      → eigene private Einheit löschen (auth)
//
// Beim ersten Aufruf werden ausstehende DB-Migrationen automatisch
// ausgeführt (training_db_version in einstellungen).
// ============================================================

declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/db.php';
require_once __DIR__ . '/../../includes/settings.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// ============================================================
// Auto-Migrationen – werden beim ersten API-Aufruf ausgeführt.
// Jede Migration ist idempotent (CREATE TABLE IF NOT EXISTS u.ä.),
// sodass sie auch auf einer bereits teilweise migrierten DB sicher ist.
// Der aktuelle Stand wird als „training_db_version" in einstellungen
// gespeichert; bereits erledigte Migrationen werden übersprungen.
// ============================================================

function runPendingMigrations(): void
{
    static $done = false;
    if ($done) return;
    $done = true;

    // Aktuelle DB-Version lesen (0 = noch keine Migration gelaufen)
    $current = (int) Settings::get('training_db_version', '0');
    $migs    = _migrationStmts();
    if ($current >= max(array_keys($migs))) return; // Fast-Path: alles aktuell

    foreach ($migs as $num => $stmts) {
        if ($num <= $current) continue;
        foreach ($stmts as $sql) {
            try {
                DB::query($sql);
            } catch (Throwable $e) {
                // DDL-Fehler ("already exists", "duplicate key name" …) sicher ignorieren;
                // echte Fehler werden ins PHP-Error-Log geschrieben.
                error_log("[migration {$num}] " . $e->getMessage());
            }
        }
        Settings::set('training_db_version', (string) $num);
        $current = $num;
    }
}

/** Gibt alle Migrationen als [versionsnummer => [sql, ...]] zurück. */
function _migrationStmts(): array
{
    // Tabellennamen mit konfiguriertem Prefix
    $tr  = DB::tbl('training_treffpunkte');
    $te  = DB::tbl('training_einheiten');
    $ts  = DB::tbl('training_segmente');
    $tb  = DB::tbl('training_bloecke');
    $tbs = DB::tbl('training_block_segmente');
    $tt  = DB::tbl('training_typen');
    $tp  = DB::tbl('training_privat_einheiten');
    $ta  = DB::tbl('training_abos');
    $tas = DB::tbl('training_abo_skips');
    $ro  = DB::tbl('rollen');

    return [
        // ── 1: Grundschema + Trainer-Rollen ─────────────────────────────
        1 => [
            "CREATE TABLE IF NOT EXISTS $tr (
              id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
              name         VARCHAR(200)  NOT NULL,
              lat          DECIMAL(10,7) NULL,
              lng          DECIMAL(10,7) NULL,
              erstellt_von INT UNSIGNED  NULL,
              erstellt_am  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
              geaendert_am TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            // Typ, Sichtbarkeit und Status direkt als VARCHAR – umgeht spätere ENUM→VARCHAR-Migrationen
            "CREATE TABLE IF NOT EXISTS $te (
              id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
              datum         DATE         NOT NULL,
              uhrzeit       TIME         NULL,
              typ           VARCHAR(40)  NOT NULL DEFAULT 'frei',
              titel         VARCHAR(200) NOT NULL,
              treffpunkt_id INT UNSIGNED NULL,
              komoot_url    VARCHAR(500) NULL,
              bemerkung     TEXT         NULL,
              sichtbarkeit  VARCHAR(20)  NOT NULL DEFAULT 'oeffentlich',
              status        VARCHAR(20)  NOT NULL DEFAULT 'geplant',
              erstellt_von  INT UNSIGNED NULL,
              erstellt_am   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              geaendert_am  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_datum (datum),
              KEY idx_sichtbarkeit (sichtbarkeit, datum)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            "CREATE TABLE IF NOT EXISTS $ts (
              id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
              einheit_id     INT UNSIGNED      NOT NULL,
              reihenfolge    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
              block_id       SMALLINT UNSIGNED NULL,
              wiederholungen SMALLINT UNSIGNED NOT NULL DEFAULT 1,
              distanz_m      INT UNSIGNED      NOT NULL,
              pause_m        INT UNSIGNED      NULL,
              pause_typ      VARCHAR(10)       NULL,
              pace_referenz  VARCHAR(40)       NULL,
              notiz          VARCHAR(200)      NULL,
              PRIMARY KEY (id),
              KEY idx_einheit (einheit_id, reihenfolge),
              CONSTRAINT fk_segm_einheit FOREIGN KEY (einheit_id)
                REFERENCES $te (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            "CREATE TABLE IF NOT EXISTS $tb (
              id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
              titel         VARCHAR(200)      NOT NULL,
              typ           VARCHAR(40)       NOT NULL DEFAULT 'intervall',
              komoot_url    VARCHAR(500)      NULL,
              bemerkung     TEXT              NULL,
              sichtbarkeit  VARCHAR(20)       NOT NULL DEFAULT 'global',
              erstellt_von  INT UNSIGNED      NULL,
              erstellt_am   TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
              geaendert_am  TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_sichtbarkeit (sichtbarkeit)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            "CREATE TABLE IF NOT EXISTS $tbs (
              id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
              block_id       INT UNSIGNED      NOT NULL,
              reihenfolge    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
              gruppen_id     SMALLINT UNSIGNED NULL,
              wiederholungen SMALLINT UNSIGNED NOT NULL DEFAULT 1,
              distanz_m      INT UNSIGNED      NOT NULL,
              pause_m        INT UNSIGNED      NULL,
              pause_typ      VARCHAR(10)       NULL,
              pace_referenz  VARCHAR(40)       NULL,
              notiz          VARCHAR(200)      NULL,
              PRIMARY KEY (id),
              KEY idx_block (block_id, reihenfolge),
              CONSTRAINT fk_bsegm_block FOREIGN KEY (block_id)
                REFERENCES $tb (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            "INSERT IGNORE INTO $ro (name, rechte) VALUES
              ('trainer', '[\"training_bloecke_verwalten\",\"training_bearbeiten\"]'),
              ('editor',  '[\"training_bearbeiten\"]')",
        ],

        // ── 2: Trainingstypen-Tabelle + ENUM→VARCHAR ─────────────────────
        2 => [
            "CREATE TABLE IF NOT EXISTS $tt (
              slug        VARCHAR(40)       NOT NULL,
              bezeichnung VARCHAR(100)      NOT NULL,
              farbe       VARCHAR(20)       NULL,
              reihenfolge SMALLINT UNSIGNED NOT NULL DEFAULT 0,
              aktiv       TINYINT(1)        NOT NULL DEFAULT 1,
              PRIMARY KEY (slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            "INSERT IGNORE INTO $tt (slug, bezeichnung, reihenfolge) VALUES
              ('intervall',     'Intervall',              1),
              ('dauerlauf',     'Dauerlauf',              2),
              ('funktionell',   'Funktionelles Training', 3),
              ('runde',         'Runde / Strecke',        4),
              ('event',         'Event / Wettkampf',      5),
              ('frei',          'Sonstiges',              6),
              ('kein_training', 'Kein Training',          7)",

            // MODIFY COLUMN ist idempotent (VARCHAR → VARCHAR ist keine Änderung);
            // auf bestehenden ENUM-Spalten migriert es die Definition sicher zu VARCHAR.
            "ALTER TABLE $te MODIFY COLUMN typ VARCHAR(40) NOT NULL DEFAULT 'frei'",
            "ALTER TABLE $tb MODIFY COLUMN typ VARCHAR(40) NOT NULL DEFAULT 'intervall'",
        ],

        // ── 3: Privater Trainingsplan ────────────────────────────────────
        3 => [
            "CREATE TABLE IF NOT EXISTS $tp (
              id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
              benutzer_id    INT UNSIGNED NOT NULL,
              datum          DATE         NOT NULL,
              typ            VARCHAR(40)  NOT NULL DEFAULT 'dauerlauf',
              titel          VARCHAR(200) NOT NULL,
              distanz_km     DECIMAL(6,2) NULL,
              bemerkung      TEXT         NULL,
              ref_einheit_id INT UNSIGNED NULL,
              erstellt_am    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              geaendert_am   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_benutzer_datum (benutzer_id, datum)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ],

        // ── 4: Abo-Funktion + Fallback-km pro Typ ────────────────────────
        4 => [
            // Abonnements waren global (wird in #5 auf per-Typ umgebaut)

            // Fallback-Distanz je Trainingstyp (für „In meinen Plan" ohne Dialog)
            "ALTER TABLE $tt ADD COLUMN IF NOT EXISTS fallback_km DECIMAL(6,2) NULL",

            // Abonnements: ein Nutzer abonniert den gesamten Teamplan
            "CREATE TABLE IF NOT EXISTS $ta (
              id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
              benutzer_id  INT UNSIGNED NOT NULL,
              aktiv        TINYINT(1)   NOT NULL DEFAULT 1,
              erstellt_am  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              UNIQUE KEY uk_benutzer (benutzer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            // Ausnahmen: Einheiten, die trotz Abo nicht (mehr) im privaten Plan stehen sollen
            "CREATE TABLE IF NOT EXISTS $tas (
              benutzer_id INT UNSIGNED NOT NULL,
              einheit_id  INT UNSIGNED NOT NULL,
              erstellt_am TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (benutzer_id, einheit_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ],

        // ── 5: Abos werden typ-spezifisch ────────────────────────────────
        // Hinweis: Kommentar aus #4 korrigiert – Abos waren von Anfang an global

        5 => [
            // typ-Spalte hinzufügen (bestehende globale Abos erhalten typ='', werden ignoriert)
            "ALTER TABLE $ta ADD COLUMN IF NOT EXISTS typ VARCHAR(40) NOT NULL DEFAULT ''",
            // Alten globalen Unique-Key entfernen (schlägt harmlos fehl, wenn er nicht existiert)
            "ALTER TABLE $ta DROP INDEX uk_benutzer",
            // Neuer Unique-Key: pro Nutzer + Typ ein Eintrag
            "ALTER TABLE $ta ADD UNIQUE KEY uk_benutzer_typ (benutzer_id, typ)",
        ],

        // ── 6: Uhrzeit in privaten Einheiten ─────────────────────────────
        6 => [
            "ALTER TABLE $tp ADD COLUMN IF NOT EXISTS uhrzeit TIME NULL AFTER datum",
        ],

        // ── 7: Uhrzeit-Backfill für bestehende Abo-Einheiten ─────────────
        // Vor Migration 6 angelegte Zeilen haben uhrzeit=NULL; hier wird
        // die Uhrzeit aus der zugehörigen öffentlichen Einheit nachgefüllt.
        7 => [
            "UPDATE $tp tp
             JOIN $te te ON te.id = tp.ref_einheit_id
             SET tp.uhrzeit = te.uhrzeit
             WHERE tp.uhrzeit IS NULL AND tp.ref_einheit_id IS NOT NULL",
        ],
    ];
}

Auth::startSession();
runPendingMigrations();

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
    if ($head === 'typen') {
        handleTypen($method, $tail);
        exit;
    }
    if ($head === 'bloecke') {
        handleBloecke($method, $tail);
        exit;
    }
    if ($head === 'treffpunkte') {
        handleTreffpunkte($method, $tail);
        exit;
    }
    if ($head === 'admin') {
        handleAdmin($method, $tail);
        exit;
    }
    if ($head === 'mein-plan') {
        handleMeinPlan($method, $tail);
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
                    'vorname'      => $user['vorname'] ?? null,
                    'nachname'     => $user['nachname'] ?? null,
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
            'SELECT e.id, e.datum, e.uhrzeit, e.typ, e.titel, e.treffpunkt_id, e.komoot_url,
                    e.bemerkung, e.sichtbarkeit, e.status,
                    t.name AS tp_name, t.lat AS tp_lat, t.lng AS tp_lng
               FROM ' . DB::tbl('training_einheiten') . ' e
               LEFT JOIN ' . DB::tbl('training_treffpunkte') . ' t ON t.id = e.treffpunkt_id
              WHERE ' . $where . '
           ORDER BY e.datum, e.uhrzeit',
            $params
        );

        echo json_encode(['ok' => true, 'einheiten' => array_map('mapEinheit', $rows)]);
        return;
    }

    // ── GET einzeln ──
    if ($sub !== '' && $method === 'GET' && ctype_digit($sub)) {
        $id = (int)$sub;
        $row = DB::fetchOne(
            'SELECT e.*, t.name AS tp_name, t.lat AS tp_lat, t.lng AS tp_lng
               FROM ' . DB::tbl('training_einheiten') . ' e
               LEFT JOIN ' . DB::tbl('training_treffpunkte') . ' t ON t.id = e.treffpunkt_id
              WHERE e.id = ?',
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

    // Ab hier: Schreibzugriff → auth + Recht 'training_bearbeiten' Pflicht
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    if (!Auth::hasRecht('training_bearbeiten')) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung. Nur Trainer und Editoren dürfen Trainingseinheiten anlegen.']);
        return;
    }

    if ($sub === '' && $method === 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'fehler' => 'Trainingseinheiten werden über Trainingsblöcke angelegt (POST bloecke/{id}/apply).']);
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
                    SET datum=?, uhrzeit=?, typ=?, titel=?, treffpunkt_id=?, komoot_url=?, bemerkung=?, sichtbarkeit=?, status=?
                  WHERE id=?',
                [
                    $in['datum'],
                    $in['uhrzeit'] ?? null,
                    $in['typ'] ?? 'frei',
                    $in['titel'],
                    isset($in['treffpunkt_id']) && $in['treffpunkt_id'] !== '' && $in['treffpunkt_id'] !== null
                        ? (int)$in['treffpunkt_id'] : null,
                    isset($in['komoot_url']) && $in['komoot_url'] !== '' ? substr((string)$in['komoot_url'], 0, 500) : null,
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

    $athletId = isset($user['athlet_id']) ? (int)$user['athlet_id'] : 0;

    if ($sub === 'me' && $method === 'GET') {
        if ($athletId <= 0) {
            echo json_encode(['ok' => true, 'modus' => 'pb', 'distanzen' => new stdClass(), 'hinweis' => 'Kein Athletenprofil verknüpft']);
            return;
        }
        $modus = $_GET['modus'] ?? 'pb';
        if (!in_array($modus, ['pb', '12m'], true)) $modus = 'pb';
        $out = fetchBestzeiten($athletId, $modus);
        echo json_encode(['ok' => true, 'modus' => $modus, 'athlet_id' => $athletId, 'distanzen' => (object)$out]);
        return;
    }

    if ($sub === 'prefs') {
        if ($method === 'GET') {
            handlePacePrefsGet((int)$user['id'], $athletId);
        } elseif ($method === 'PUT') {
            handlePacePrefsSet((int)$user['id']);
        } else {
            http_response_code(405);
            echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
        }
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Pace-Endpoint nicht gefunden']);
}

// Bestzeiten je Referenzdistanz aus dem Statistikportal holen
// $refs: ['KEY' => distanzInMetern, ...] – wenn leer, werden Defaults verwendet
function fetchBestzeiten(int $athletId, string $modus, array $refs = []): array
{
    if (empty($refs)) {
        $refs = ['5000' => 5000.0, '10000' => 10000.0, '21098' => 21097.5, '42195' => 42195.0];
    }
    $datumFilter = ($modus === '12m') ? ' AND v.datum >= (CURDATE() - INTERVAL 12 MONTH)' : '';
    $out = [];
    foreach ($refs as $key => $dist) {
        $tol = 25.0;
        $row = DB::fetchOne(
            "SELECT e.resultat, e.resultat_num, v.datum, v.name AS wettkampf, v.ort
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
                'distanz_m' => (int)round($dist),
                'sekunden'  => (float)$row['resultat_num'],
                'resultat'  => $row['resultat'],
                'datum'     => $row['datum'],
                'wettkampf' => $row['wettkampf'],
                'ort'       => $row['ort'],
            ];
        }
    }
    return $out;
}

// Pace-Präferenzen aus benutzer.prefs laden.
// Maßgeblich sind ausschließlich die Admin-konfigurierten Distanzen.
// Alte benannte Keys (5km, 10km, HM, M) werden bei Fund migriert.
function ladePacePrefs(int $userId): array
{
    $adminDists = ladeAdminPaceDistanzen();

    $row = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
    $prefs = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
    if (!is_array($prefs)) $prefs = [];
    $saved = is_array($prefs['training_pace_prefs'] ?? null) ? $prefs['training_pace_prefs'] : [];

    // Alte benannte Keys auf Meter-Strings migrieren
    $keyMap = ['5km' => '5000', '10km' => '10000', 'HM' => '21098', 'M' => '42195'];
    foreach ($keyMap as $old => $new) {
        if (isset($saved[$old]) && !isset($saved[$new])) {
            $saved[$new] = $saved[$old];
        }
        unset($saved[$old]);
    }

    // Nur Admin-Distanzen ausgeben, fehlende mit Defaults füllen
    $result = [];
    foreach ($adminDists as $ref) {
        $p     = is_array($saved[$ref] ?? null) ? $saved[$ref] : [];
        $modus = in_array($p['modus'] ?? '', ['pb', '12m', 'manual'], true) ? $p['modus'] : 'pb';
        $result[$ref] = [
            'modus'      => $modus,
            'manual_sek' => (isset($p['manual_sek']) && is_numeric($p['manual_sek'])) ? (float)$p['manual_sek'] : null,
        ];
    }
    return $result;
}

// Pace-Präferenzen in benutzer.prefs speichern
function speicherePacePrefs(int $userId, array $prefs): void
{
    $row      = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
    $existing = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
    if (!is_array($existing)) $existing = [];
    $existing['training_pace_prefs'] = $prefs;
    DB::query(
        'UPDATE ' . DB::tbl('benutzer') . ' SET prefs = ? WHERE id = ?',
        [json_encode($existing, JSON_UNESCAPED_UNICODE), $userId]
    );
}

// GET pace/prefs → Prefs + verfügbare Bestzeiten + Admin-Distanzliste
function handlePacePrefsGet(int $userId, int $athletId): void
{
    $prefs      = ladePacePrefs($userId);
    $adminDists = ladeAdminPaceDistanzen();
    $distanzen  = [];
    if ($athletId > 0) {
        $refsMap = [];
        foreach ($prefs as $key => $p) {
            $refsMap[$key] = (float)$key;
        }
        $distanzen['pb']  = fetchBestzeiten($athletId, 'pb',  $refsMap);
        $distanzen['12m'] = fetchBestzeiten($athletId, '12m', $refsMap);
    }
    echo json_encode([
        'ok'         => true,
        'prefs'      => $prefs,
        'distanzen'  => $distanzen,
        'dist_admin' => $adminDists,
        'hat_athlet' => $athletId > 0,
    ]);
}

// PUT pace/prefs → Prefs speichern (nur Admin-Distanzen erlaubt)
function handlePacePrefsSet(int $userId): void
{
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body) || !isset($body['prefs']) || !is_array($body['prefs'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'fehler' => 'Ungültige Daten']);
        return;
    }
    $adminAllowed = array_flip(ladeAdminPaceDistanzen());
    $validated    = [];
    foreach ($body['prefs'] as $ref => $p) {
        if (!is_numeric($ref) || (float)$ref <= 0 || (float)$ref > 200000) continue;
        $ref = (string)(int)round((float)$ref);
        if (!isset($adminAllowed[$ref])) continue; // nur Admin-Distanzen speichern
        $p      = is_array($p) ? $p : [];
        $modus  = in_array($p['modus'] ?? '', ['pb', '12m', 'manual'], true) ? $p['modus'] : 'pb';
        $manSek = (isset($p['manual_sek']) && is_numeric($p['manual_sek']) && (float)$p['manual_sek'] > 0)
            ? (float)$p['manual_sek'] : null;
        $validated[$ref] = ['modus' => $modus, 'manual_sek' => $manSek];
    }
    speicherePacePrefs($userId, $validated);
    echo json_encode(['ok' => true]);
}

// ============================================================
// Admin-Settings (Trainingsportal-spezifische Keys)
//   GET  admin/settings    → aktuelle Werte (auth+admin)
//   PUT  admin/settings    → Batch-Save (auth+admin)
//
// Geteilte Keys (farbe_*, logo_*, verein_*) werden im Statistik-/
// Login-Portal verwaltet. Hier nur trainingsspezifische Keys.
// ============================================================
/**
 * Whitelist erlaubter Trainingsportal-Settings-Keys.
 * Funktion statt `const`, weil `const` im Datei-Scope erst zur
 * Ausführungszeit der Zeile definiert wird – das Routing oben
 * im File würde sonst eine noch nicht existierende Konstante sehen.
 */
function trainingSettingsKeys(): array {
    return [
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
        'training_pace_distanzen' => [
            'label'    => 'Pace-Referenz-Distanzen',
            'gruppe'   => 'training',
            'beschreibung' => 'JSON-Array der Distanzen in Metern, die als Pace-Referenz angeboten werden, z. B. [5000,10000,21098,42195]',
            'default'  => '[5000,10000,21098,42195]',
        ],
        'training_default_uhrzeiten' => [
            'label'    => 'Standard-Uhrzeiten pro Wochentag',
            'gruppe'   => 'training',
            'beschreibung' => 'JSON-Objekt {"1":"18:00","2":"","3":"18:00",...} – 1=Mo bis 7=So, leer = kein Standard',
            'default'  => '{}',
        ],
        'training_standard_treffpunkt_id' => [
            'label'    => 'Standard-Treffpunkt',
            'gruppe'   => 'training',
            'beschreibung' => 'ID des Treffpunkts, der beim Einplanen eines Blocks vorausgewählt wird',
            'default'  => '',
        ],
    ];
}

// Admin-konfigurierte Pace-Distanzen laden (Meter-Strings, sortiert)
function ladeAdminPaceDistanzen(): array
{
    $raw = Settings::get('training_pace_distanzen', '');
    if ($raw !== '') {
        $j = json_decode($raw, true);
        if (is_array($j)) {
            $result = [];
            foreach ($j as $v) {
                if (is_numeric($v) && (float)$v > 0 && (float)$v <= 200000) {
                    $result[] = (string)(int)round((float)$v);
                }
            }
            if (!empty($result)) {
                usort($result, fn($a, $b) => (float)$a <=> (float)$b);
                return $result;
            }
        }
    }
    return ['5000', '10000', '21098', '42195']; // Fallback-Defaults
}

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

    // Trainingstypen verwalten
    if ($sub === 'typen' || str_starts_with($sub, 'typen/')) {
        $typSub = $sub === 'typen' ? '' : substr($sub, 6);
        handleAdminTypen($method, $typSub);
        return;
    }

    // Diagnose-Endpoint: prüft alle konfigurierten Feiertage-Feeds
    if ($sub === 'feiertage_test' && $method === 'GET') {
        $raw = Settings::get('training_feiertage_ics_urls', '');
        $entries = [];
        if ($raw !== '') {
            $j = json_decode($raw, true);
            if (is_array($j)) {
                foreach ($j as $e) {
                    if (is_string($e)) $entries[] = ['url' => $e];
                    elseif (is_array($e) && !empty($e['url'])) $entries[] = ['url' => (string)$e['url']];
                }
            }
        }
        $von = date('Y-m-d', strtotime('-7 days'));
        $bis = date('Y-m-d', strtotime('+400 days'));
        $quellen = [];
        foreach ($entries as $entry) {
            // builtin://-URLs direkt auswerten
            if (str_starts_with($entry['url'], 'builtin://')) {
                $rowEvents = berechneBuiltinEvents($entry['url'], $von, $bis);
                $quellen[] = [
                    'url'                => $entry['url'],
                    'ok'                 => true,
                    'status'             => 'OK (builtin)',
                    'events_im_zeitraum' => count($rowEvents),
                    'events_gesamt'      => count($rowEvents),
                    'sample'             => array_slice($rowEvents, 0, 3),
                    'fehler'             => null,
                ];
                continue;
            }
            $expandedUrls = expandJahresUrls($entry['url'], $von, $bis);
            $rowEvents = [];
            $rowFehler = [];
            $rowBytes  = 0;
            $rowOk     = false;
            foreach ($expandedUrls as $eu) {
                $fehler = null;
                $body = ladeIcsCached($eu, 0, $fehler); // ttl=0 → stets neu
                if ($body === null) {
                    $rowFehler[] = basename(parse_url($eu, PHP_URL_QUERY) ?: $eu) . ': ' . ($fehler ?? 'unerreichbar');
                    continue;
                }
                $rowOk = true;
                $rowBytes += strlen($body);
                $rowEvents = array_merge($rowEvents, parseIcsEvents($body, $von, $bis));
            }
            if (!$rowOk) {
                $quellen[] = ['url' => $entry['url'], 'ok' => false, 'status' => 'unerreichbar', 'fehler' => implode('; ', $rowFehler)];
                continue;
            }
            usort($rowEvents, fn($a, $b) => $a['datum'] <=> $b['datum']);
            $quellen[] = [
                'url'                => $entry['url'],
                'ok'                 => true,
                'status'             => 'OK (' . $rowBytes . ' B, ' . count($expandedUrls) . ' URLs)',
                'events_im_zeitraum' => count($rowEvents),
                'events_gesamt'      => count($rowEvents),
                'sample'             => array_slice($rowEvents, 0, 3),
                'fehler'             => $rowFehler ? implode('; ', $rowFehler) : null,
            ];
        }
        echo json_encode(['ok' => true, 'quellen' => $quellen, 'zeitraum' => ['von' => $von, 'bis' => $bis]]);
        return;
    }

    // ── Einheiten → Blöcke migrieren ──
    if ($sub === 'migrate_einheiten_zu_bloecken' && $method === 'POST') {
        ensureBloeckeTabellen();
        // Alle Einheiten mit Segment-Anzahl laden; je Titel-Gruppe die mit den
        // meisten Segmenten (dann neueste) als Block-Vorlage verwenden.
        $einheiten = DB::fetchAll(
            'SELECT e.*, COUNT(s.id) AS seg_count
               FROM ' . DB::tbl('training_einheiten') . ' e
               LEFT JOIN ' . DB::tbl('training_segmente') . ' s ON s.einheit_id = e.id
              GROUP BY e.id
              ORDER BY e.titel ASC, seg_count DESC, e.erstellt_am DESC'
        );
        // In PHP nach normalisertem Titel deduplizieren
        $seen     = [];
        $vorlagen = [];
        foreach ($einheiten as $e) {
            $key = mb_strtolower(trim((string)$e['titel']));
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $vorlagen[] = $e;
            }
        }
        $erstellt     = 0;
        $uebersprungen = 0;
        foreach ($vorlagen as $e) {
            $existing = DB::fetchOne(
                'SELECT id FROM ' . DB::tbl('training_bloecke') . ' WHERE LOWER(TRIM(titel)) = LOWER(TRIM(?))',
                [$e['titel']]
            );
            if ($existing) { $uebersprungen++; continue; }
            $pdo = DB::get();
            $pdo->beginTransaction();
            try {
                DB::query(
                    'INSERT INTO ' . DB::tbl('training_bloecke') . '
                     (titel, typ, treffpunkt, bemerkung, sichtbarkeit, erstellt_von)
                     VALUES (?,?,?,?,?,?)',
                    [
                        $e['titel'], $e['typ'], $e['treffpunkt'], $e['bemerkung'],
                        'global',
                        $e['erstellt_von'] ? (int)$e['erstellt_von'] : null,
                    ]
                );
                $blockId = (int)DB::lastInsertId();
                $segs = DB::fetchAll(
                    'SELECT * FROM ' . DB::tbl('training_segmente') . '
                      WHERE einheit_id = ? ORDER BY reihenfolge, id',
                    [(int)$e['id']]
                );
                foreach ($segs as $i => $s) {
                    DB::query(
                        'INSERT INTO ' . DB::tbl('training_block_segmente') . '
                         (block_id, reihenfolge, gruppen_id, wiederholungen, distanz_m, pause_m, pause_typ, pace_referenz, notiz)
                         VALUES (?,?,?,?,?,?,?,?,?)',
                        [
                            $blockId, $i,
                            isset($s['block_id']) ? $s['block_id'] : null,
                            (int)($s['wiederholungen'] ?? 1),
                            (int)$s['distanz_m'],
                            $s['pause_m'] ?? null,
                            $s['pause_typ'] ?? null,
                            $s['pace_referenz'] ?? null,
                            $s['notiz'] ?? null,
                        ]
                    );
                }
                $pdo->commit();
                $erstellt++;
            } catch (Throwable $ex) {
                $pdo->rollBack();
                throw $ex;
            }
        }
        echo json_encode([
            'ok'              => true,
            'erstellt'        => $erstellt,
            'uebersprungen'   => $uebersprungen,
            'einheiten_gesamt'=> count($einheiten),
            'unique_titel'    => count($vorlagen),
        ]);
        return;
    }

    // ── Alle Einheiten (Admin-Liste, ohne Datumfilter) ──
    if ($sub === 'einheiten' && $method === 'GET') {
        $limit  = min(max(1, (int)($_GET['limit']  ?? 2000)), 5000);
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        $total  = (int)(DB::fetchOne('SELECT COUNT(*) AS n FROM ' . DB::tbl('training_einheiten'))['n'] ?? 0);
        $rows   = DB::fetchAll(
            'SELECT e.id, e.datum, e.uhrzeit, e.typ, e.titel, e.sichtbarkeit, e.status,
                    t.name AS tp_name
               FROM ' . DB::tbl('training_einheiten') . ' e
               LEFT JOIN ' . DB::tbl('training_treffpunkte') . ' t ON t.id = e.treffpunkt_id
              ORDER BY e.datum DESC, e.uhrzeit DESC
              LIMIT ? OFFSET ?',
            [$limit, $offset]
        );
        echo json_encode([
            'ok'        => true,
            'einheiten' => array_map(fn($r) => [
                'id'           => (int)$r['id'],
                'datum'        => $r['datum'],
                'uhrzeit'      => $r['uhrzeit'],
                'typ'          => $r['typ'],
                'titel'        => $r['titel'],
                'sichtbarkeit' => $r['sichtbarkeit'],
                'status'       => $r['status'],
                'treffpunkt'   => $r['tp_name'],
            ], $rows),
            'total'  => $total,
            'limit'  => $limit,
            'offset' => $offset,
        ]);
        return;
    }

    // ── Mehrere Einheiten auf einmal ändern (Status / Treffpunkt) ──
    if ($sub === 'einheiten/bulk_update' && $method === 'POST') {
        $in  = readJsonBody();
        $ids = array_values(array_filter(array_map('intval', $in['ids'] ?? []), fn($id) => $id > 0));
        if (!$ids) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Keine gültigen IDs']);
            return;
        }
        $sets   = [];
        $params = [];
        if (array_key_exists('status', $in) && in_array($in['status'] ?? '', ['geplant', 'abgesagt'], true)) {
            $sets[]   = 'status = ?';
            $params[] = $in['status'];
        }
        if (array_key_exists('treffpunkt_id', $in)) {
            $sets[]   = 'treffpunkt_id = ?';
            $params[]  = ($in['treffpunkt_id'] !== null && $in['treffpunkt_id'] !== '')
                ? (int)$in['treffpunkt_id'] : null;
        }
        if (!$sets) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Nichts zu ändern']);
            return;
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        DB::query(
            'UPDATE ' . DB::tbl('training_einheiten') . ' SET ' . implode(', ', $sets) . ' WHERE id IN (' . $ph . ')',
            array_merge($params, $ids)
        );
        echo json_encode(['ok' => true, 'geaendert' => count($ids)]);
        return;
    }

    // ── Mehrere Einheiten auf einmal löschen ──
    if ($sub === 'einheiten/bulk_delete' && $method === 'POST') {
        $in  = readJsonBody();
        $ids = is_array($in['ids'] ?? null) ? $in['ids'] : [];
        $ids = array_values(array_filter(array_map('intval', $ids), fn($id) => $id > 0));
        if (!$ids) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Keine gültigen IDs']);
            return;
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        DB::query('DELETE FROM ' . DB::tbl('training_einheiten') . ' WHERE id IN (' . $ph . ')', $ids);
        echo json_encode(['ok' => true, 'geloescht' => count($ids)]);
        return;
    }

    if ($sub !== 'settings') {
        http_response_code(404);
        echo json_encode(['ok' => false, 'fehler' => 'Admin-Endpoint nicht gefunden']);
        return;
    }

    if ($method === 'GET') {
        $felder = [];
        foreach (trainingSettingsKeys() as $key => $meta) {
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
        $erlaubt = array_keys(trainingSettingsKeys());
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
    // Komplette Settings (öffentlich, identisch zum Statistikportal-Endpoint
    // `einstellungen`), damit das gemeinsame applyConfig() darauf läuft.
    $cfg = Settings::all();
    // Sensible Keys (Tokens) NICHT öffentlich ausspielen
    foreach (['github_token', 'github_token_expires'] as $sec) {
        unset($cfg[$sec]);
    }
    // Feiertage-Liste vorparsen für den Kalender
    $urls = [];
    $raw = $cfg['training_feiertage_ics_urls'] ?? '';
    if ($raw !== '') {
        $j = json_decode($raw, true);
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

    // Aktive Trainingstypen mitliefern damit Editor/Blöcke-Seite
    // keine extra Anfrage brauchen.
    try {
        ensureTypenTabelle();
        $typenRows = DB::fetchAll(
            'SELECT slug, bezeichnung, farbe, reihenfolge, fallback_km
               FROM ' . DB::tbl('training_typen') . '
              WHERE aktiv = 1
              ORDER BY reihenfolge, slug'
        );
        $cfg['typen'] = array_map(function($r) {
            return [
                'slug'        => $r['slug'],
                'bezeichnung' => $r['bezeichnung'],
                'farbe'       => $r['farbe'] ?? '',
                'reihenfolge' => (int)$r['reihenfolge'],
                'fallback_km' => $r['fallback_km'] !== null ? (float)$r['fallback_km'] : null,
            ];
        }, $typenRows);
    } catch (Throwable $_) {
        $cfg['typen'] = [];
    }

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
        $url = $entry['url'];
        // Eingebauter Rechner für builtin://-URLs
        if (str_starts_with($url, 'builtin://')) {
            foreach (berechneBuiltinEvents($url, $von, $bis) as $ev) {
                $events[] = [
                    'datum'     => $ev['datum'],
                    'datum_bis' => $ev['datum_bis'],
                    'titel'     => $ev['titel'],
                    'kategorie' => $entry['label'] ?: 'Feiertag',
                    'farbe'     => $entry['farbe'] ?: '',
                ];
            }
            continue;
        }
        // Externe ICS-Feeds
        foreach (expandJahresUrls($url, $von, $bis) as $expandedUrl) {
            $body = ladeIcsCached($expandedUrl, 6 * 3600);
            if (!$body) continue;
            foreach (parseIcsEvents($body, $von, $bis) as $ev) {
                $events[] = [
                    'datum'     => $ev['datum'],
                    'datum_bis' => $ev['datum_bis'],
                    'titel'     => $ev['titel'],
                    'kategorie' => $entry['label'] ?: 'Feiertag',
                    'farbe'     => $entry['farbe'] ?: '',
                ];
            }
        }
    }

    echo json_encode(['ok' => true, 'feiertage' => $events]);
}

// Ersetzt {year} in einer URL durch alle relevanten Jahre des Abfragezeitraums.
// Ohne {year}-Platzhalter wird die URL unverändert zurückgegeben.
function expandJahresUrls(string $url, string $von, string $bis): array {
    if (!str_contains($url, '{year}')) return [$url];
    $vonJahr = (int)substr($von, 0, 4);
    $bisJahr = (int)substr($bis, 0, 4);
    $urls = [];
    for ($y = $vonJahr; $y <= $bisJahr; $y++) {
        $urls[] = str_replace('{year}', (string)$y, $url);
    }
    return $urls;
}

// ============================================================
// Eingebauter Feiertags-/Ferien-Rechner (builtin://-URLs)
// Syntax: builtin://feiertage/<land>   z. B. builtin://feiertage/NRW
//         builtin://schulferien/<land>  (Platzhalter, liefert leeres Array)
// Gibt ein Array von ['datum'=>…,'datum_bis'=>…,'titel'=>…] zurück.
// ============================================================
function berechneBuiltinEvents(string $url, string $von, string $bis): array {
    if (!preg_match('#^builtin://([^/]+)/(.+)$#i', $url, $m)) return [];
    $typ  = strtolower($m[1]); // 'feiertage'
    $land = strtoupper($m[2]); // 'NRW', 'BY', …

    if ($typ !== 'feiertage') return [];

    $vonJahr = (int)substr($von, 0, 4);
    $bisJahr = (int)substr($bis, 0, 4);
    $events  = [];

    for ($y = $vonJahr; $y <= $bisJahr; $y++) {
        $easter = berechneeOstern($y); // Unix-Timestamp Ostersonntag

        $feiertage = [
            // Bundesweite Feiertage
            ['datum' => "$y-01-01", 'titel' => 'Neujahr'],
            ['datum' => date('Y-m-d', strtotime("$y-01-01 -2 days", $easter + 86400)), 'titel' => 'Karfreitag',
             'datum' => date('Y-m-d', $easter - 2 * 86400)],
            ['datum' => date('Y-m-d', $easter + 86400),  'titel' => 'Ostermontag'],
            ['datum' => "$y-05-01", 'titel' => 'Tag der Arbeit'],
            ['datum' => date('Y-m-d', $easter + 39 * 86400), 'titel' => 'Christi Himmelfahrt'],
            ['datum' => date('Y-m-d', $easter + 50 * 86400), 'titel' => 'Pfingstmontag'],
            ['datum' => "$y-10-03", 'titel' => 'Tag der Deutschen Einheit'],
            ['datum' => "$y-12-25", 'titel' => '1. Weihnachtstag'],
            ['datum' => "$y-12-26", 'titel' => '2. Weihnachtstag'],
        ];

        // Bundesland-spezifische Ergänzungen
        if (in_array($land, ['NRW', 'BY', 'BW', 'ST', 'SN', 'HE', 'RP', 'SL', 'TH'])) {
            $feiertage[] = ['datum' => date('Y-m-d', $easter + 60 * 86400), 'titel' => 'Fronleichnam'];
        }
        if (in_array($land, ['NRW', 'BY', 'BW', 'ST', 'SL', 'RP', 'TH'])) {
            $feiertage[] = ['datum' => "$y-11-01", 'titel' => 'Allerheiligen'];
        }
        if (in_array($land, ['BW', 'BY', 'ST'])) {
            $feiertage[] = ['datum' => "$y-01-06", 'titel' => 'Heilige Drei Könige'];
        }
        if (in_array($land, ['BB', 'MV', 'SN', 'ST', 'TH'])) {
            $feiertage[] = ['datum' => "$y-10-31", 'titel' => 'Reformationstag'];
        }
        if ($land === 'BY') {
            $feiertage[] = ['datum' => "$y-08-15", 'titel' => 'Mariä Himmelfahrt'];
        }

        foreach ($feiertage as $f) {
            if (!isset($f['datum'])) continue;
            if ($f['datum'] >= $von && $f['datum'] <= $bis) {
                $events[] = ['datum' => $f['datum'], 'datum_bis' => $f['datum'], 'titel' => $f['titel']];
            }
        }
    }

    usort($events, fn($a, $b) => $a['datum'] <=> $b['datum']);
    return $events;
}

function berechneeOstern(int $jahr): int {
    // Anonyme Gregorianische Algorithmus
    $a = $jahr % 19;
    $b = intdiv($jahr, 100);
    $c = $jahr % 100;
    $d = intdiv($b, 4);
    $e = $b % 4;
    $f = intdiv($b + 8, 25);
    $g = intdiv($b - $f + 1, 3);
    $h = (19 * $a + $b - $d - $g + 15) % 30;
    $i = intdiv($c, 4);
    $k = $c % 4;
    $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
    $m = intdiv($a + 11 * $h + 22 * $l, 451);
    $monat = intdiv($h + $l - 7 * $m + 114, 31);
    $tag   = (($h + $l - 7 * $m + 114) % 31) + 1;
    return mktime(12, 0, 0, $monat, $tag, $jahr);
}

function ladeIcsCached(string $url, int $ttl, ?string &$fehler = null): ?string {
    $fehler = null;
    if (!preg_match('#^https?://#i', $url)) { $fehler = 'Keine HTTP(S)-URL'; return null; }
    $cacheDir = __DIR__ . '/../uploads/feiertage_cache';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0775, true);
    $f = $cacheDir . '/' . sha1($url) . '.ics';
    if (is_file($f) && (time() - filemtime($f) < $ttl)) {
        $cached = file_get_contents($f);
        // Ungültigen Cache (z. B. alten HTML-Inhalt vom früheren Bug) verwerfen
        if (str_contains($cached, 'BEGIN:VCALENDAR') || str_contains($cached, 'BEGIN:VEVENT')) {
            return $cached;
        }
        @unlink($f); // HTML-Cache löschen, Neu-Fetch erzwingen
    }

    $body = false;
    // Bevorzugt cURL (auf shared hosting oft vorhanden, robuster als file_get_contents)
    if (function_exists('curl_init')) {
        $curlOpts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; Trainingsportal/1.0)',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER     => ['Accept: text/calendar, application/ics, */*'],
        ];
        $ch = curl_init($url);
        curl_setopt_array($ch, $curlOpts);
        $body = curl_exec($ch);
        $curlErr = curl_error($ch);
        $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body === false) {
            $fehler = 'curl: ' . $curlErr;
            // SSL-Fehler: einmalig ohne Peer-Verify wiederholen (Shared-Hosting-CA-Bundle oft veraltet)
            if (str_contains($curlErr, 'SSL') || str_contains($curlErr, 'certificate')) {
                $ch2 = curl_init($url);
                curl_setopt_array($ch2, $curlOpts + [CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => false]);
                $body = curl_exec($ch2);
                $http  = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
                if ($body === false) $fehler = 'curl (SSL-Fallback): ' . curl_error($ch2);
                else $fehler = null;
                curl_close($ch2);
            }
        }
        if ($body !== false && $http >= 400) { $fehler = 'HTTP ' . $http; $body = false; }
    }

    // Fallback: file_get_contents (falls allow_url_fopen=On)
    if ($body === false && ini_get('allow_url_fopen')) {
        $ctx = stream_context_create([
            'http'  => ['timeout' => 10, 'header' => "User-Agent: Mozilla/5.0 (compatible; Trainingsportal/1.0)\r\nAccept: text/calendar, application/ics, */*\r\n"],
            'https' => ['timeout' => 10, 'header' => "User-Agent: Mozilla/5.0 (compatible; Trainingsportal/1.0)\r\nAccept: text/calendar, application/ics, */*\r\n"],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) $fehler = ($fehler ? $fehler . '; ' : '') . 'file_get_contents fehlgeschlagen';
    } elseif ($body === false && !function_exists('curl_init') && !$fehler) {
        $fehler = 'cURL nicht verfügbar und allow_url_fopen=Off';
    }

    if ($body === false) {
        if (is_file($f)) { $fehler = ($fehler ?: '') . ' – nutze alten Cache'; return file_get_contents($f); }
        return null;
    }

    // Schutz: Server lieferte HTML statt ICS (z. B. Login-/Download-Seite)
    if (!str_contains($body, 'BEGIN:VCALENDAR') && !str_contains($body, 'BEGIN:VEVENT')) {
        $fehler = 'Kein gültiges ICS (Antwort ist kein Kalender – HTML statt .ics?)';
        if (is_file($f)) { $fehler .= ' – nutze alten Cache'; return file_get_contents($f); }
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
        'SELECT e.*, t.name AS tp_name FROM ' . DB::tbl('training_einheiten') . ' e
         LEFT JOIN ' . DB::tbl('training_treffpunkte') . " t ON t.id = e.treffpunkt_id
          WHERE e.sichtbarkeit = 'oeffentlich'
            AND e.datum >= (CURDATE() - INTERVAL 60 DAY)
            AND e.datum <= (CURDATE() + INTERVAL 365 DAY)
       ORDER BY e.datum, e.uhrzeit"
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
        'SELECT e.*, t.name AS tp_name FROM ' . DB::tbl('training_einheiten') . ' e
         LEFT JOIN ' . DB::tbl('training_treffpunkte') . ' t ON t.id = e.treffpunkt_id
          WHERE e.datum >= (CURDATE() - INTERVAL 60 DAY)
            AND e.datum <= (CURDATE() + INTERVAL 365 DAY)
       ORDER BY e.datum, e.uhrzeit'
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
    if (!empty($e['tp_name'])) {
        $lines[] = 'LOCATION:' . icsEsc($e['tp_name']);
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
// Trainingsblöcke (datumsunabhängige Templates)
// ============================================================

// ============================================================
// GET typen  →  Aktive Trainingstypen (kein Auth erforderlich)
// ============================================================
function handleTypen(string $method, string $sub): void
{
    if ($method !== 'GET' || $sub !== '') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
        return;
    }
    ensureTypenTabelle();
    $rows = DB::fetchAll(
        'SELECT slug, bezeichnung, farbe, reihenfolge, fallback_km
           FROM ' . DB::tbl('training_typen') . '
          WHERE aktiv = 1
          ORDER BY reihenfolge, slug'
    );
    echo json_encode(['ok' => true, 'typen' => array_map(function($r) {
        return [
            'slug'        => $r['slug'],
            'bezeichnung' => $r['bezeichnung'],
            'farbe'       => $r['farbe'] ?? '',
            'reihenfolge' => (int)$r['reihenfolge'],
            'fallback_km' => $r['fallback_km'] !== null ? (float)$r['fallback_km'] : null,
        ];
    }, $rows)]);
}

// ============================================================
// Admin: Trainingstypen verwalten
//   GET  admin/typen           → alle Typen mit Block-Anzahl
//   POST admin/typen           → neuen Typ anlegen
//   PUT  admin/typen/{slug}    → Typ bearbeiten
//   DELETE admin/typen/{slug}  → Typ löschen (nur wenn keine Blöcke)
// ============================================================
function handleAdminTypen(string $method, string $sub): void
{
    ensureTypenTabelle();

    if ($sub === '' && $method === 'GET') {
        $rows = DB::fetchAll(
            'SELECT t.slug, t.bezeichnung, t.farbe, t.reihenfolge, t.aktiv, t.fallback_km,
                    COUNT(b.id) AS block_count
               FROM ' . DB::tbl('training_typen') . ' t
               LEFT JOIN ' . DB::tbl('training_bloecke') . ' b ON b.typ = t.slug
              GROUP BY t.slug
              ORDER BY t.reihenfolge, t.slug'
        );
        echo json_encode(['ok' => true, 'typen' => array_map(function ($r) {
            return [
                'slug'        => $r['slug'],
                'bezeichnung' => $r['bezeichnung'],
                'farbe'       => $r['farbe'] ?? '',
                'reihenfolge' => (int)$r['reihenfolge'],
                'aktiv'       => (bool)$r['aktiv'],
                'block_count' => (int)$r['block_count'],
                'fallback_km' => $r['fallback_km'] !== null ? (float)$r['fallback_km'] : null,
            ];
        }, $rows)]);
        return;
    }

    if ($sub === '' && $method === 'POST') {
        $in = readJsonBody();
        $slug = preg_replace('/[^a-z0-9_]/', '_', strtolower(trim((string)($in['slug'] ?? ''))));
        if ($slug === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Slug erforderlich (nur a-z, 0-9, _)']);
            return;
        }
        $bezeichnung = trim((string)($in['bezeichnung'] ?? ''));
        if ($bezeichnung === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Bezeichnung erforderlich']);
            return;
        }
        $existing = DB::fetchOne('SELECT slug FROM ' . DB::tbl('training_typen') . ' WHERE slug = ?', [$slug]);
        if ($existing) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'fehler' => 'Slug bereits vorhanden']);
            return;
        }
        $farbe       = substr(trim((string)($in['farbe'] ?? '')), 0, 20) ?: null;
        $reihenfolge = isset($in['reihenfolge']) ? max(0, (int)$in['reihenfolge']) : 99;
        DB::query(
            'INSERT INTO ' . DB::tbl('training_typen') . ' (slug, bezeichnung, farbe, reihenfolge, aktiv) VALUES (?,?,?,?,1)',
            [$slug, substr($bezeichnung, 0, 100), $farbe, $reihenfolge]
        );
        echo json_encode(['ok' => true, 'slug' => $slug]);
        return;
    }

    if ($sub !== '' && $method === 'PUT') {
        $slug = $sub;
        $row = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_typen') . ' WHERE slug = ?', [$slug]);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Typ nicht gefunden']);
            return;
        }
        $in          = readJsonBody();
        $bezeichnung = trim((string)($in['bezeichnung'] ?? $row['bezeichnung']));
        if ($bezeichnung === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Bezeichnung darf nicht leer sein']);
            return;
        }
        $farbe       = array_key_exists('farbe', $in)
            ? (substr(trim((string)$in['farbe']), 0, 20) ?: null)
            : $row['farbe'];
        $reihenfolge = isset($in['reihenfolge']) ? max(0, (int)$in['reihenfolge']) : (int)$row['reihenfolge'];
        $aktiv       = isset($in['aktiv']) ? ($in['aktiv'] ? 1 : 0) : (int)$row['aktiv'];
        $fallbackKm  = array_key_exists('fallback_km', $in)
            ? ($in['fallback_km'] !== null && $in['fallback_km'] !== ''
                ? round(max(0.0, min(9999.0, (float)$in['fallback_km'])), 2)
                : null)
            : ($row['fallback_km'] !== null ? (float)$row['fallback_km'] : null);
        DB::query(
            'UPDATE ' . DB::tbl('training_typen') . ' SET bezeichnung=?, farbe=?, reihenfolge=?, aktiv=?, fallback_km=? WHERE slug=?',
            [substr($bezeichnung, 0, 100), $farbe, $reihenfolge, $aktiv, $fallbackKm, $slug]
        );
        echo json_encode(['ok' => true]);
        return;
    }

    if ($sub !== '' && $method === 'DELETE') {
        $slug = $sub;
        $row = DB::fetchOne('SELECT slug FROM ' . DB::tbl('training_typen') . ' WHERE slug = ?', [$slug]);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Typ nicht gefunden']);
            return;
        }
        $blockCount = (int)(DB::fetchOne(
            'SELECT COUNT(*) AS n FROM ' . DB::tbl('training_bloecke') . ' WHERE typ = ?',
            [$slug]
        )['n'] ?? 0);
        if ($blockCount > 0) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'fehler' => "Typ wird von $blockCount Block(s) verwendet und kann nicht gelöscht werden."]);
            return;
        }
        DB::query('DELETE FROM ' . DB::tbl('training_typen') . ' WHERE slug = ?', [$slug]);
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
}

function ensureTypenTabelle(): void
{
    DB::query(
        "CREATE TABLE IF NOT EXISTS " . DB::tbl('training_typen') . " (
          slug        VARCHAR(40)        NOT NULL,
          bezeichnung VARCHAR(100)       NOT NULL,
          farbe       VARCHAR(20)        NULL,
          reihenfolge SMALLINT UNSIGNED  NOT NULL DEFAULT 0,
          aktiv       TINYINT(1)         NOT NULL DEFAULT 1,
          PRIMARY KEY (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    // Standard-Typen einspielen, falls noch leer
    $count = (int)(DB::fetchOne('SELECT COUNT(*) AS n FROM ' . DB::tbl('training_typen'))['n'] ?? 0);
    if ($count === 0) {
        DB::query(
            "INSERT IGNORE INTO " . DB::tbl('training_typen') . " (slug, bezeichnung, reihenfolge) VALUES
             ('intervall',     'Intervall',              1),
             ('dauerlauf',     'Dauerlauf',              2),
             ('funktionell',   'Funktionelles Training',  3),
             ('runde',         'Runde / Strecke',         4),
             ('event',         'Event / Wettkampf',       5),
             ('frei',          'Sonstiges',              6),
             ('kein_training', 'Kein Training',           7)"
        );
    }
}

// ============================================================
function ensureTreffpunkteTabelle(): void {
    DB::query(
        "CREATE TABLE IF NOT EXISTS " . DB::tbl('training_treffpunkte') . " (
          id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
          name          VARCHAR(200)    NOT NULL,
          lat           DECIMAL(10,7)   NULL,
          lng           DECIMAL(10,7)   NULL,
          erstellt_von  INT UNSIGNED    NULL,
          erstellt_am   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
          geaendert_am  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    // Migration: treffpunkt_id zu training_einheiten hinzufügen, falls noch nicht vorhanden
    $cols = DB::fetchAll(
        "SHOW COLUMNS FROM " . DB::tbl('training_einheiten') . " LIKE 'treffpunkt_id'"
    );
    if (empty($cols)) {
        DB::query(
            "ALTER TABLE " . DB::tbl('training_einheiten') . "
             ADD COLUMN treffpunkt_id INT UNSIGNED NULL AFTER titel"
        );
    }
    // Migration: komoot_url zu training_einheiten hinzufügen, falls noch nicht vorhanden
    $cols2 = DB::fetchAll(
        "SHOW COLUMNS FROM " . DB::tbl('training_einheiten') . " LIKE 'komoot_url'"
    );
    if (empty($cols2)) {
        DB::query(
            "ALTER TABLE " . DB::tbl('training_einheiten') . "
             ADD COLUMN komoot_url VARCHAR(500) NULL AFTER treffpunkt_id"
        );
    }
}

function mapTreffpunkt(array $r): array {
    $lat = $r['lat'] !== null ? (float)$r['lat'] : null;
    $lng = $r['lng'] !== null ? (float)$r['lng'] : null;
    return [
        'id'          => (int)$r['id'],
        'name'        => $r['name'],
        'lat'         => $lat,
        'lng'         => $lng,
        'maps_google' => ($lat !== null && $lng !== null)
            ? 'https://www.google.com/maps/search/?api=1&query=' . $lat . ',' . $lng
            : null,
        'maps_apple'  => ($lat !== null && $lng !== null)
            ? 'https://maps.apple.com/?ll=' . $lat . ',' . $lng . '&q=' . rawurlencode($r['name'])
            : null,
        'maps_komoot' => ($lat !== null && $lng !== null)
            ? 'https://www.komoot.com/de-de/plan/@' . $lat . ',' . $lng . ',16.000z?p[0]&p[1][loc]=' . $lat . ',' . $lng . '&sport=jogging'
            : null,
        'erstellt_von' => $r['erstellt_von'] !== null ? (int)$r['erstellt_von'] : null,
    ];
}

function handleTreffpunkte(string $method, string $sub): void
{
    ensureTreffpunkteTabelle();
    $user      = Auth::check();
    $istTrainer = $user && Auth::hasRecht('training_bloecke_verwalten');

    // GET Liste
    if ($sub === '' && $method === 'GET') {
        if (!$user) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
            return;
        }
        $rows = DB::fetchAll(
            'SELECT * FROM ' . DB::tbl('training_treffpunkte') . ' ORDER BY name'
        );
        echo json_encode(['ok' => true, 'treffpunkte' => array_map('mapTreffpunkt', $rows)]);
        return;
    }

    // POST neu
    if ($sub === '' && $method === 'POST') {
        if (!$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Nur Trainer dürfen Treffpunkte anlegen.']);
            return;
        }
        $in = readJsonBody();
        if (empty($in['name'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "name" erforderlich']);
            return;
        }
        $lat = isset($in['lat']) && $in['lat'] !== '' && $in['lat'] !== null ? (float)$in['lat'] : null;
        $lng = isset($in['lng']) && $in['lng'] !== '' && $in['lng'] !== null ? (float)$in['lng'] : null;
        DB::query(
            'INSERT INTO ' . DB::tbl('training_treffpunkte') . ' (name, lat, lng, erstellt_von) VALUES (?,?,?,?)',
            [trim($in['name']), $lat, $lng, (int)$user['id']]
        );
        $id = (int)DB::lastInsertId();
        $row = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_treffpunkte') . ' WHERE id = ?', [$id]);
        echo json_encode(['ok' => true, 'treffpunkt' => mapTreffpunkt($row)]);
        return;
    }

    // PUT update
    if ($sub !== '' && $method === 'PUT' && ctype_digit($sub)) {
        if (!$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        $id = (int)$sub;
        $in = readJsonBody();
        if (empty($in['name'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "name" erforderlich']);
            return;
        }
        $lat = isset($in['lat']) && $in['lat'] !== '' && $in['lat'] !== null ? (float)$in['lat'] : null;
        $lng = isset($in['lng']) && $in['lng'] !== '' && $in['lng'] !== null ? (float)$in['lng'] : null;
        DB::query(
            'UPDATE ' . DB::tbl('training_treffpunkte') . ' SET name=?, lat=?, lng=? WHERE id=?',
            [trim($in['name']), $lat, $lng, $id]
        );
        $row = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_treffpunkte') . ' WHERE id = ?', [$id]);
        echo json_encode(['ok' => true, 'treffpunkt' => mapTreffpunkt($row)]);
        return;
    }

    // DELETE
    if ($sub !== '' && $method === 'DELETE' && ctype_digit($sub)) {
        if (!$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        $id = (int)$sub;
        // Referenzen auf diesen Treffpunkt auf NULL setzen
        DB::query(
            'UPDATE ' . DB::tbl('training_einheiten') . ' SET treffpunkt_id = NULL WHERE treffpunkt_id = ?',
            [$id]
        );
        DB::query('DELETE FROM ' . DB::tbl('training_treffpunkte') . ' WHERE id = ?', [$id]);
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Treffpunkte-Endpoint nicht gefunden']);
}

// ============================================================
// Legt training_bloecke + training_block_segmente an, falls noch nicht vorhanden,
// und stellt sicher, dass die Trainer-Rolle in der rollen-Tabelle existiert.
function ensureBloeckeTabellen(): void {
    // Treffpunkte-Tabelle und Migration von training_einheiten
    ensureTreffpunkteTabelle();

    DB::query(
        "CREATE TABLE IF NOT EXISTS " . DB::tbl('training_bloecke') . " (
          id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
          titel         VARCHAR(200)       NOT NULL,
          typ           ENUM('intervall','dauerlauf','funktionell','runde','event','frei','kein_training')
                                           NOT NULL DEFAULT 'intervall',
          bemerkung     TEXT               NULL,
          sichtbarkeit  ENUM('global','privat') NOT NULL DEFAULT 'global',
          erstellt_von  INT UNSIGNED       NULL,
          erstellt_am   TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
          geaendert_am  TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_sichtbarkeit (sichtbarkeit)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    DB::query(
        "CREATE TABLE IF NOT EXISTS " . DB::tbl('training_block_segmente') . " (
          id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
          block_id        INT UNSIGNED    NOT NULL,
          reihenfolge     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          abschnitt_typ   ENUM('work','pause') NOT NULL DEFAULT 'work',
          gruppen_id      SMALLINT UNSIGNED NULL,
          wiederholungen  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
          distanz_m       INT UNSIGNED    NOT NULL,
          pause_m         INT UNSIGNED    NULL,
          pause_typ       ENUM('TP','GP','BP','frei') NULL,
          pace_referenz   VARCHAR(40)     NULL,
          notiz           VARCHAR(200)    NULL,
          PRIMARY KEY (id),
          KEY idx_block (block_id, reihenfolge),
          CONSTRAINT fk_bsegm_block FOREIGN KEY (block_id)
              REFERENCES " . DB::tbl('training_bloecke') . "(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    // Migration: komoot_url zu training_bloecke hinzufügen, falls noch nicht vorhanden
    $bCols = DB::fetchAll(
        "SHOW COLUMNS FROM " . DB::tbl('training_bloecke') . " LIKE 'komoot_url'"
    );
    if (empty($bCols)) {
        DB::query(
            "ALTER TABLE " . DB::tbl('training_bloecke') . "
             ADD COLUMN komoot_url VARCHAR(500) NULL AFTER typ"
        );
    }
    // Migration: abschnitt_typ zu training_block_segmente hinzufügen
    $bsCols = DB::fetchAll(
        "SHOW COLUMNS FROM " . DB::tbl('training_block_segmente') . " LIKE 'abschnitt_typ'"
    );
    if (empty($bsCols)) {
        DB::query(
            "ALTER TABLE " . DB::tbl('training_block_segmente') . "
             ADD COLUMN abschnitt_typ ENUM('work','pause') NOT NULL DEFAULT 'work' AFTER reihenfolge"
        );
    }
    // Trainer- und Editor-Rolle anlegen, falls noch nicht vorhanden
    DB::query(
        "INSERT IGNORE INTO " . DB::tbl('rollen') . " (name, rechte) VALUES
         ('trainer', '[\"training_bloecke_verwalten\",\"training_bearbeiten\"]'),
         ('editor',  '[\"training_bearbeiten\"]')"
    );
}

function handleBloecke(string $method, string $sub): void
{
    ensureBloeckeTabellen();
    $user = Auth::check();
    $istTrainer = $user && Auth::hasRecht('training_bloecke_verwalten');

    // ── GET Liste ──
    if ($sub === '' && $method === 'GET') {
        if (!$user) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
            return;
        }
        $subSeg = "(SELECT COUNT(*) FROM " . DB::tbl('training_block_segmente') . " s WHERE s.block_id = b.id)";
        if ($istTrainer) {
            $rows = DB::fetchAll(
                "SELECT b.*, $subSeg AS seg_count FROM " . DB::tbl('training_bloecke') . " b ORDER BY b.titel"
            );
        } else {
            $rows = DB::fetchAll(
                "SELECT b.*, $subSeg AS seg_count
                   FROM " . DB::tbl('training_bloecke') . " b
                  WHERE b.sichtbarkeit = 'global' OR b.erstellt_von = ?
                  ORDER BY b.sichtbarkeit, b.titel",
                [(int)$user['id']]
            );
        }
        echo json_encode(['ok' => true, 'bloecke' => array_map('mapBlock', $rows)]);
        return;
    }

    // ── GET einzeln ──
    if ($sub !== '' && $method === 'GET' && preg_match('/^(\d+)$/', $sub, $m)) {
        if (!$user) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
            return;
        }
        $id = (int)$m[1];
        $row = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_bloecke') . ' WHERE id = ?', [$id]);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Block nicht gefunden']);
            return;
        }
        if ($row['sichtbarkeit'] === 'privat'
            && (int)$row['erstellt_von'] !== (int)$user['id']
            && !$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        $segs = DB::fetchAll(
            'SELECT * FROM ' . DB::tbl('training_block_segmente') . '
              WHERE block_id = ? ORDER BY reihenfolge, id',
            [$id]
        );
        echo json_encode([
            'ok'       => true,
            'block'    => mapBlock($row),
            'segmente' => array_map('mapBlockSegment', $segs),
        ]);
        return;
    }

    // ── POST Block auf den Kalender anwenden ──
    if (preg_match('/^(\d+)\/apply$/', $sub, $m) && $method === 'POST') {
        if (!$user) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
            return;
        }
        $id = (int)$m[1];
        $block = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_bloecke') . ' WHERE id = ?', [$id]);
        if (!$block) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Block nicht gefunden']);
            return;
        }
        if ($block['sichtbarkeit'] === 'privat'
            && (int)$block['erstellt_von'] !== (int)$user['id']
            && !$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        $in = readJsonBody();
        if (empty($in['datum']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['datum'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "datum" (YYYY-MM-DD) erforderlich']);
            return;
        }
        $segs = DB::fetchAll(
            'SELECT * FROM ' . DB::tbl('training_block_segmente') . '
              WHERE block_id = ? ORDER BY reihenfolge, id',
            [$id]
        );
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            $defaultSicht = ($block['sichtbarkeit'] === 'global') ? 'oeffentlich' : 'intern';
            $tpId = isset($in['treffpunkt_id']) && $in['treffpunkt_id'] !== '' && $in['treffpunkt_id'] !== null
                ? (int)$in['treffpunkt_id'] : null;
            DB::query(
                'INSERT INTO ' . DB::tbl('training_einheiten') . '
                 (datum, uhrzeit, typ, titel, treffpunkt_id, komoot_url, bemerkung, sichtbarkeit, status, erstellt_von)
                 VALUES (?,?,?,?,?,?,?,?,?,?)',
                [
                    $in['datum'],
                    $in['uhrzeit'] ?? null,
                    $block['typ'],
                    $block['titel'],
                    $tpId,
                    $block['komoot_url'] ?? null,
                    $block['bemerkung'] ?? null,
                    $in['sichtbarkeit'] ?? $defaultSicht,
                    'geplant',
                    (int)$user['id'],
                ]
            );
            $einheitId = (int)DB::lastInsertId();
            $segArr = array_map(function ($s) {
                return [
                    'wiederholungen' => $s['wiederholungen'],
                    'distanz_m'      => $s['distanz_m'],
                    'pause_m'        => $s['pause_m'],
                    'pause_typ'      => $s['pause_typ'],
                    'pace_referenz'  => $s['pace_referenz'],
                    'notiz'          => $s['notiz'],
                    'block_id'       => $s['gruppen_id'],
                ];
            }, $segs);
            replaceSegmente($einheitId, $segArr);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        echo json_encode(['ok' => true, 'einheit_id' => $einheitId]);
        return;
    }

    // ── POST neuer Block ──
    if ($sub === '' && $method === 'POST') {
        if (!$user) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
            return;
        }
        $in = readJsonBody();
        $sicht = $in['sichtbarkeit'] ?? 'global';
        // Globale Blöcke nur für Trainer; private Blöcke für alle eingeloggten User
        if ($sicht === 'global' && !$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Nur Trainer dürfen globale Blöcke erstellen.']);
            return;
        }
        $errs = validateBlock($in);
        if ($errs) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => $errs[0]]);
            return;
        }
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            DB::query(
                'INSERT INTO ' . DB::tbl('training_bloecke') . '
                 (titel, typ, komoot_url, bemerkung, sichtbarkeit, erstellt_von)
                 VALUES (?,?,?,?,?,?)',
                [
                    $in['titel'],
                    $in['typ'] ?? 'intervall',
                    isset($in['komoot_url']) && $in['komoot_url'] !== '' ? substr((string)$in['komoot_url'], 0, 500) : null,
                    $in['bemerkung'] ?? null,
                    $sicht,
                    (int)$user['id'],
                ]
            );
            $id = (int)DB::lastInsertId();
            replaceBlockSegmente($id, $in['segmente'] ?? []);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        echo json_encode(['ok' => true, 'id' => $id]);
        return;
    }

    // ── PUT Block bearbeiten ──
    if ($sub !== '' && $method === 'PUT' && ctype_digit($sub)) {
        if (!$user) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
            return;
        }
        $id = (int)$sub;
        $block = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_bloecke') . ' WHERE id = ?', [$id]);
        if (!$block) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Block nicht gefunden']);
            return;
        }
        $isOwner = (int)$block['erstellt_von'] === (int)$user['id'];
        if (!$istTrainer && !($isOwner && $block['sichtbarkeit'] === 'privat')) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        $in = readJsonBody();
        $errs = validateBlock($in);
        if ($errs) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => $errs[0]]);
            return;
        }
        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            DB::query(
                'UPDATE ' . DB::tbl('training_bloecke') . '
                    SET titel=?, typ=?, komoot_url=?, bemerkung=?, sichtbarkeit=?
                  WHERE id=?',
                [
                    $in['titel'],
                    $in['typ'] ?? 'intervall',
                    isset($in['komoot_url']) && $in['komoot_url'] !== '' ? substr((string)$in['komoot_url'], 0, 500) : null,
                    $in['bemerkung'] ?? null,
                    $in['sichtbarkeit'] ?? $block['sichtbarkeit'],
                    $id,
                ]
            );
            if (array_key_exists('segmente', $in)) {
                replaceBlockSegmente($id, $in['segmente'] ?? []);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        echo json_encode(['ok' => true]);
        return;
    }

    // ── DELETE Block löschen ──
    if ($sub !== '' && $method === 'DELETE' && ctype_digit($sub)) {
        if (!$user) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
            return;
        }
        $id = (int)$sub;
        $block = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_bloecke') . ' WHERE id = ?', [$id]);
        if (!$block) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Block nicht gefunden']);
            return;
        }
        $isOwner = (int)$block['erstellt_von'] === (int)$user['id'];
        if (!$istTrainer && !($isOwner && $block['sichtbarkeit'] === 'privat')) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        DB::query('DELETE FROM ' . DB::tbl('training_bloecke') . ' WHERE id = ?', [$id]);
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Blöcke-Endpoint nicht gefunden']);
}

function mapBlock(array $r): array {
    return [
        'id'           => (int)$r['id'],
        'titel'        => $r['titel'],
        'typ'          => $r['typ'],
        'komoot_url'   => $r['komoot_url'] ?? null,
        'bemerkung'    => $r['bemerkung'],
        'sichtbarkeit' => $r['sichtbarkeit'],
        'erstellt_von' => $r['erstellt_von'] !== null ? (int)$r['erstellt_von'] : null,
        'erstellt_am'  => $r['erstellt_am'],
        'seg_count'    => isset($r['seg_count']) ? (int)$r['seg_count'] : null,
    ];
}

function mapBlockSegment(array $r): array {
    return [
        'id'             => (int)$r['id'],
        'reihenfolge'    => (int)$r['reihenfolge'],
        'abschnitt_typ'  => $r['abschnitt_typ'] ?? 'work',
        'gruppen_id'     => $r['gruppen_id'] !== null ? (int)$r['gruppen_id'] : null,
        'wiederholungen' => (int)$r['wiederholungen'],
        'distanz_m'      => (int)$r['distanz_m'],
        'pause_m'        => $r['pause_m'] !== null ? (int)$r['pause_m'] : null,
        'pause_typ'      => $r['pause_typ'],
        'pace_referenz'  => $r['pace_referenz'],
        'notiz'          => $r['notiz'],
    ];
}

function replaceBlockSegmente(int $blockId, $segmente): void {
    DB::query('DELETE FROM ' . DB::tbl('training_block_segmente') . ' WHERE block_id = ?', [$blockId]);
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
            'INSERT INTO ' . DB::tbl('training_block_segmente') . '
             (block_id, reihenfolge, abschnitt_typ, gruppen_id, wiederholungen, distanz_m, pause_m, pause_typ, pace_referenz, notiz)
             VALUES (?,?,?,?,?,?,?,?,?,?)',
            [
                $blockId,
                $i++,
                in_array($s['abschnitt_typ'] ?? '', ['work','pause'], true) ? $s['abschnitt_typ'] : 'work',
                isset($s['gruppen_id']) && $s['gruppen_id'] !== '' ? (int)$s['gruppen_id'] : null,
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

function validateBlock(array $in): array {
    $errs = [];
    if (empty($in['titel']) || !is_string($in['titel'])) {
        $errs[] = 'Feld "titel" erforderlich';
    }
    return $errs;
}

// ============================================================
function mapEinheit(array $r): array {
    $tp = null;
    if (!empty($r['treffpunkt_id'])) {
        $lat = $r['tp_lat'] !== null ? (float)$r['tp_lat'] : null;
        $lng = $r['tp_lng'] !== null ? (float)$r['tp_lng'] : null;
        $tp = [
            'id'          => (int)$r['treffpunkt_id'],
            'name'        => $r['tp_name'] ?? null,
            'lat'         => $lat,
            'lng'         => $lng,
            'maps_google' => ($lat !== null && $lng !== null)
                ? 'https://www.google.com/maps/search/?api=1&query=' . $lat . ',' . $lng
                : null,
            'maps_apple'  => ($lat !== null && $lng !== null)
                ? 'https://maps.apple.com/?ll=' . $lat . ',' . $lng . '&q=' . rawurlencode($r['tp_name'] ?? '')
                : null,
            'maps_komoot' => ($lat !== null && $lng !== null)
                ? 'https://www.komoot.com/de-de/plan/@' . $lat . ',' . $lng . ',16.000z?p[0]&p[1][loc]=' . $lat . ',' . $lng . '&sport=jogging'
                : null,
        ];
    }
    return [
        'id'           => (int)$r['id'],
        'datum'        => $r['datum'],
        'uhrzeit'      => $r['uhrzeit'] ? substr($r['uhrzeit'], 0, 5) : null,
        'typ'          => $r['typ'],
        'titel'        => $r['titel'],
        'treffpunkt'   => $tp,
        'komoot_url'   => $r['komoot_url'] ?? null,
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

// ============================================================
// Privater Trainingsplan
//   GET  mein-plan/einheiten?von=&bis=  → öffentl. + eigene private Einheiten
//   GET  mein-plan/einheiten/{id}       → einzelne private Einheit
//   POST mein-plan/einheiten            → neue private Einheit anlegen
//   PUT  mein-plan/einheiten/{id}       → eigene private Einheit bearbeiten
//   DEL  mein-plan/einheiten/{id}       → eigene private Einheit löschen
//   GET  mein-plan/abo                  → Abo-Status
//   POST mein-plan/abo                  → Abo aktivieren + alle Zukunftseinheiten anlegen
//   DEL  mein-plan/abo                  → Abo deaktivieren
// ============================================================
function handleMeinPlan(string $method, string $tail): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    $userId = (int)$user['id'];

    // ── Abo-Status ──────────────────────────────────────────
    if ($tail === 'abo' && $method === 'GET') {
        $rows = DB::fetchAll(
            'SELECT typ FROM ' . DB::tbl('training_abos') . ' WHERE benutzer_id = ? AND aktiv = 1 AND typ != \'\'',
            [$userId]
        );
        echo json_encode(['ok' => true, 'abo_typen' => array_column($rows, 'typ')]);
        return;
    }

    // ── Abo aktivieren (für einen Typ) ──────────────────────
    if ($tail === 'abo' && $method === 'POST') {
        $in  = readJsonBody();
        $typ = substr(preg_replace('/[^a-z0-9_]/', '_', strtolower(trim((string)($in['typ'] ?? '')))), 0, 40);
        if ($typ === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "typ" erforderlich']);
            return;
        }
        DB::query(
            'INSERT INTO ' . DB::tbl('training_abos') . ' (benutzer_id, typ, aktiv)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE aktiv = 1',
            [$userId, $typ]
        );
        // Alle künftigen öffentlichen Einheiten dieses Typs direkt einpflegen
        _aboSync($userId, date('Y-m-d'), '2099-12-31', $typ);
        echo json_encode(['ok' => true]);
        return;
    }

    // ── Abo beenden + künftige Einheiten entfernen (für einen Typ) ──
    if ($tail === 'abo' && $method === 'DELETE') {
        $in  = readJsonBody();
        $typ = substr(preg_replace('/[^a-z0-9_]/', '_', strtolower(trim((string)($in['typ'] ?? '')))), 0, 40);
        if ($typ === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "typ" erforderlich']);
            return;
        }
        // Abo-Eintrag deaktivieren
        DB::query(
            'UPDATE ' . DB::tbl('training_abos') . ' SET aktiv = 0 WHERE benutzer_id = ? AND typ = ?',
            [$userId, $typ]
        );
        // Alle künftigen privaten Abo-Einheiten dieses Typs löschen (vergangene bleiben)
        $today = date('Y-m-d');
        DB::query(
            'DELETE FROM ' . DB::tbl('training_privat_einheiten') . '
             WHERE benutzer_id = ? AND typ = ? AND datum >= ? AND ref_einheit_id IS NOT NULL',
            [$userId, $typ, $today]
        );
        echo json_encode(['ok' => true]);
        return;
    }

    // ── GET Liste: öffentliche + eigene private Einheiten ───
    if ($tail === 'einheiten' && $method === 'GET') {
        $von = $_GET['von'] ?? null;
        $bis = $_GET['bis'] ?? null;
        if (!$von || !$bis
            || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $von)
            || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $bis)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Parameter von/bis (YYYY-MM-DD) erforderlich']);
            return;
        }

        // Aktive Abos des Nutzers laden
        $aboRows = DB::fetchAll(
            'SELECT typ FROM ' . DB::tbl('training_abos') . ' WHERE benutzer_id = ? AND aktiv = 1 AND typ != \'\'',
            [$userId]
        );
        $aboTypen = array_column($aboRows, 'typ');

        // Abo-Auto-Sync: für jeden abonnierten Typ neue öffentliche Einheiten einpflegen
        if ($aboTypen) {
            $today    = date('Y-m-d');
            $syncFrom = $von > $today ? $von : $today;
            if ($syncFrom <= $bis) {
                foreach ($aboTypen as $aboTyp) {
                    _aboSync($userId, $syncFrom, $bis, $aboTyp);
                }
            }
        }

        $rows = DB::fetchAll(
            'SELECT e.id, e.datum, e.uhrzeit, e.typ, e.titel, e.treffpunkt_id, e.komoot_url,
                    e.bemerkung, e.sichtbarkeit, e.status,
                    t.name AS tp_name, t.lat AS tp_lat, t.lng AS tp_lng
               FROM ' . DB::tbl('training_einheiten') . ' e
               LEFT JOIN ' . DB::tbl('training_treffpunkte') . " t ON t.id = e.treffpunkt_id
              WHERE e.datum BETWEEN ? AND ?
                AND e.sichtbarkeit IN ('oeffentlich','intern')
           ORDER BY e.datum, e.uhrzeit",
            [$von, $bis]
        );
        $privatRows = DB::fetchAll(
            'SELECT * FROM ' . DB::tbl('training_privat_einheiten') . '
             WHERE benutzer_id = ? AND datum BETWEEN ? AND ?
             ORDER BY datum',
            [$userId, $von, $bis]
        );
        echo json_encode([
            'ok'        => true,
            'einheiten' => array_map('mapEinheit', $rows),
            'privat'    => array_map('mapPrivatEinheit', $privatRows),
            'abo_typen' => $aboTypen,
        ]);
        return;
    }

    // ── GET einzelne private Einheit ────────────────────────
    if (preg_match('/^einheiten\/(\d+)$/', $tail, $m) && $method === 'GET') {
        $id  = (int)$m[1];
        $row = DB::fetchOne(
            'SELECT * FROM ' . DB::tbl('training_privat_einheiten') . ' WHERE id = ? AND benutzer_id = ?',
            [$id, $userId]
        );
        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Einheit nicht gefunden']);
            return;
        }
        echo json_encode(['ok' => true, 'einheit' => mapPrivatEinheit($row)]);
        return;
    }

    // ── POST neue private Einheit ────────────────────────────
    if ($tail === 'einheiten' && $method === 'POST') {
        $in = readJsonBody();
        if (empty($in['datum']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['datum'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "datum" erforderlich']);
            return;
        }
        if (empty($in['titel']) || !is_string($in['titel'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "titel" erforderlich']);
            return;
        }
        $km = null;
        if (isset($in['distanz_km']) && $in['distanz_km'] !== null && $in['distanz_km'] !== '') {
            $km = round(max(0.0, min(99999.0, (float)$in['distanz_km'])), 2);
        }
        $refId = (isset($in['ref_einheit_id']) && $in['ref_einheit_id']) ? (int)$in['ref_einheit_id'] : null;
        // Wenn eine Referenz-Einheit übergeben: skip-Eintrag entfernen (Nutzer hat bewusst übernommen)
        if ($refId) {
            DB::query(
                'DELETE FROM ' . DB::tbl('training_abo_skips') . ' WHERE benutzer_id = ? AND einheit_id = ?',
                [$userId, $refId]
            );
        }
        $uhrzeitIn = isset($in['uhrzeit']) && preg_match('/^\d{2}:\d{2}$/', (string)$in['uhrzeit'])
            ? (string)$in['uhrzeit'] : null;
        DB::query(
            'INSERT INTO ' . DB::tbl('training_privat_einheiten') . '
             (benutzer_id, datum, uhrzeit, typ, titel, distanz_km, bemerkung, ref_einheit_id)
             VALUES (?,?,?,?,?,?,?,?)',
            [
                $userId,
                $in['datum'],
                $uhrzeitIn,
                isset($in['typ']) && $in['typ'] !== '' ? substr((string)$in['typ'], 0, 40) : 'dauerlauf',
                substr((string)$in['titel'], 0, 200),
                $km,
                (isset($in['bemerkung']) && $in['bemerkung'] !== '') ? (string)$in['bemerkung'] : null,
                $refId,
            ]
        );
        echo json_encode(['ok' => true, 'id' => (int)DB::lastInsertId()]);
        return;
    }

    // ── PUT eigene private Einheit bearbeiten ────────────────
    if (preg_match('/^einheiten\/(\d+)$/', $tail, $m) && $method === 'PUT') {
        $id  = (int)$m[1];
        $chk = DB::fetchOne(
            'SELECT id FROM ' . DB::tbl('training_privat_einheiten') . ' WHERE id = ? AND benutzer_id = ?',
            [$id, $userId]
        );
        if (!$chk) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Einheit nicht gefunden']);
            return;
        }
        $in = readJsonBody();
        if (empty($in['datum']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['datum'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "datum" erforderlich']);
            return;
        }
        if (empty($in['titel']) || !is_string($in['titel'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Feld "titel" erforderlich']);
            return;
        }
        $km = null;
        if (isset($in['distanz_km']) && $in['distanz_km'] !== null && $in['distanz_km'] !== '') {
            $km = round(max(0.0, min(99999.0, (float)$in['distanz_km'])), 2);
        }
        $uhrzeitPut = isset($in['uhrzeit']) && preg_match('/^\d{2}:\d{2}$/', (string)$in['uhrzeit'])
            ? (string)$in['uhrzeit'] : null;
        DB::query(
            'UPDATE ' . DB::tbl('training_privat_einheiten') . '
             SET datum=?, uhrzeit=?, typ=?, titel=?, distanz_km=?, bemerkung=?, ref_einheit_id=?
             WHERE id=? AND benutzer_id=?',
            [
                $in['datum'],
                $uhrzeitPut,
                isset($in['typ']) && $in['typ'] !== '' ? substr((string)$in['typ'], 0, 40) : 'dauerlauf',
                substr((string)$in['titel'], 0, 200),
                $km,
                (isset($in['bemerkung']) && $in['bemerkung'] !== '') ? (string)$in['bemerkung'] : null,
                (isset($in['ref_einheit_id']) && $in['ref_einheit_id']) ? (int)$in['ref_einheit_id'] : null,
                $id,
                $userId,
            ]
        );
        echo json_encode(['ok' => true]);
        return;
    }

    // ── DELETE eigene private Einheit löschen ────────────────
    if (preg_match('/^einheiten\/(\d+)$/', $tail, $m) && $method === 'DELETE') {
        $id = (int)$m[1];
        // Wenn diese Einheit aus einem Abo stammt → skip-Eintrag anlegen
        $privRow = DB::fetchOne(
            'SELECT ref_einheit_id FROM ' . DB::tbl('training_privat_einheiten') . '
             WHERE id = ? AND benutzer_id = ?',
            [$id, $userId]
        );
        if ($privRow && $privRow['ref_einheit_id']) {
            DB::query(
                'INSERT IGNORE INTO ' . DB::tbl('training_abo_skips') . ' (benutzer_id, einheit_id)
                 VALUES (?, ?)',
                [$userId, (int)$privRow['ref_einheit_id']]
            );
        }
        DB::query(
            'DELETE FROM ' . DB::tbl('training_privat_einheiten') . ' WHERE id = ? AND benutzer_id = ?',
            [$id, $userId]
        );
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Mein-Plan-Endpoint nicht gefunden']);
}

/** Synct öffentliche Einheiten in den privaten Plan eines Abo-Nutzers. */
function _aboSync(int $userId, string $von, string $bis, string $typ = ''): void
{
    $te  = DB::tbl('training_einheiten');
    $tp  = DB::tbl('training_privat_einheiten');
    $tas = DB::tbl('training_abo_skips');
    $tt  = DB::tbl('training_typen');

    // Öffentliche Einheiten die noch nicht kopiert wurden und nicht übersprungen werden
    $typFilter = $typ !== '' ? "AND e.typ = ?" : '';
    $params    = $typ !== ''
        ? [$von, $bis, $typ, $userId, $userId]
        : [$von, $bis, $userId, $userId];

    $toSync = DB::fetchAll(
        "SELECT e.id, e.datum, e.uhrzeit, e.typ, e.titel
           FROM $te e
          WHERE e.datum BETWEEN ? AND ?
            AND e.sichtbarkeit = 'oeffentlich'
            AND e.status != 'abgesagt'
            $typFilter
            AND e.id NOT IN (
                SELECT ref_einheit_id FROM $tp
                 WHERE benutzer_id = ? AND ref_einheit_id IS NOT NULL
            )
            AND e.id NOT IN (
                SELECT einheit_id FROM $tas WHERE benutzer_id = ?
            )",
        $params
    );
    if (!$toSync) return;

    // Fallback-km je Typ einmalig laden
    $typKm = [];
    $typenRows = DB::fetchAll("SELECT slug, fallback_km FROM $tt");
    foreach ($typenRows as $r) {
        $typKm[$r['slug']] = $r['fallback_km'] !== null ? (float)$r['fallback_km'] : null;
    }

    foreach ($toSync as $e) {
        $km = $typKm[$e['typ']] ?? null;
        // uhrzeit auf HH:MM normieren
        $uhrzeitSync = null;
        if (!empty($e['uhrzeit']) && preg_match('/^(\d{2}:\d{2})/', $e['uhrzeit'], $um)) {
            $uhrzeitSync = $um[1];
        }
        DB::query(
            "INSERT INTO $tp (benutzer_id, datum, uhrzeit, typ, titel, distanz_km, ref_einheit_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            [$userId, $e['datum'], $uhrzeitSync, $e['typ'], $e['titel'], $km, (int)$e['id']]
        );
    }
}

function mapPrivatEinheit(array $r): array
{
    // uhrzeit auf HH:MM kürzen (DB liefert ggf. HH:MM:SS)
    $uhrzeitRaw = $r['uhrzeit'] ?? null;
    $uhrzeit = null;
    if ($uhrzeitRaw && preg_match('/^(\d{2}:\d{2})/', $uhrzeitRaw, $m)) {
        $uhrzeit = $m[1];
    }
    return [
        'id'             => (int)$r['id'],
        'datum'          => $r['datum'],
        'uhrzeit'        => $uhrzeit,
        'typ'            => $r['typ'],
        'titel'          => $r['titel'],
        'distanz_km'     => $r['distanz_km'] !== null ? (float)$r['distanz_km'] : null,
        'bemerkung'      => $r['bemerkung'],
        'ref_einheit_id' => $r['ref_einheit_id'] !== null ? (int)$r['ref_einheit_id'] : null,
    ];
}
