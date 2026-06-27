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
require_once __DIR__ . '/../../includes/migrate.php';

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
    Migrations::run('training_db_version', _migrationStmts());
}

/** Gibt alle Migrationen als [versionsnummer => [sql, ...]] zurück. */
function _migrationStmts(): array
{
    // Tabellennamen mit konfiguriertem Prefix
    $tr   = DB::tbl('training_treffpunkte');
    $te   = DB::tbl('training_einheiten');
    $ts   = DB::tbl('training_segmente');
    $tb   = DB::tbl('training_bloecke');
    $tbs  = DB::tbl('training_block_segmente');
    $tt   = DB::tbl('training_typen');
    $tp   = DB::tbl('training_privat_einheiten');
    $ta   = DB::tbl('training_abos');
    $tas  = DB::tbl('training_abo_skips');
    $ro   = DB::tbl('rollen');
    $tser = DB::tbl('training_serien');
    $tbug = DB::tbl('training_benutzer_gruppen');
    $tpg  = DB::tbl('training_planung_gruppen');
    $tbgr = DB::tbl('training_block_gruppen');

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
            "UPDATE $tt SET ist_kein_training = 1 WHERE slug = 'kein_training' AND ist_kein_training = 0",
            "UPDATE $tt SET hat_strecke = 1       WHERE slug = 'runde'         AND hat_strecke = 0",

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

        // ── 8: Typ-Flags: konfigurierbare Sonderfunktionen ───────────────
        8 => [
            "ALTER TABLE $tt ADD COLUMN IF NOT EXISTS ist_kein_training TINYINT(1) NOT NULL DEFAULT 0",
            "ALTER TABLE $tt ADD COLUMN IF NOT EXISTS hat_strecke TINYINT(1) NOT NULL DEFAULT 0",
            "UPDATE $tt SET ist_kein_training = 1 WHERE slug = 'kein_training'",
            "UPDATE $tt SET hat_strecke = 1 WHERE slug = 'runde'",
        ],

        // ── 9: Trainingsserien (wiederkehrende Einheiten) ────────────────
        // Feature-Code referenziert training_serien + einheiten.serie_id,
        // die Schema-Migration fehlte bislang → GET /einheiten warf 500.
        9 => [
            "CREATE TABLE IF NOT EXISTS $tser (
              id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
              block_id      INT UNSIGNED NULL,
              titel         VARCHAR(200) NOT NULL,
              typ           VARCHAR(40)  NOT NULL DEFAULT 'frei',
              treffpunkt_id INT UNSIGNED NULL,
              uhrzeit       TIME         NULL,
              sichtbarkeit  VARCHAR(20)  NOT NULL DEFAULT 'oeffentlich',
              regel         TEXT         NULL,
              erstellt_von  INT UNSIGNED NULL,
              erstellt_am   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "ALTER TABLE $te ADD COLUMN IF NOT EXISTS serie_id INT UNSIGNED NULL AFTER status",
            "ALTER TABLE $te ADD KEY idx_serie (serie_id)",
        ],

        // ── 10: gruppe_id in training_einheiten ──────────────────────────
        10 => [
            "ALTER TABLE $te ADD COLUMN IF NOT EXISTS gruppe_id INT UNSIGNED NULL AFTER serie_id",
        ],

        // ── 11: Trainingsgruppen-Zuordnungen ─────────────────────────────
        // Gruppen kommen aus der gemeinsamen `gruppen`-Tabelle des Statistikportals.
        // training_benutzer_gruppen  → Nutzer hat sich selbst einer Gruppe zugeordnet
        // training_planung_gruppen   → Trainer sieht diese Gruppen im Planungskalender
        // training_block_gruppen     → Block-Vorlage ist einer/mehreren Gruppen zugeordnet
        11 => [
            "CREATE TABLE IF NOT EXISTS $tbug (
              benutzer_id INT UNSIGNED NOT NULL,
              gruppe_id   INT          NOT NULL,
              PRIMARY KEY (benutzer_id, gruppe_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS $tpg (
              benutzer_id INT UNSIGNED NOT NULL,
              gruppe_id   INT          NOT NULL,
              PRIMARY KEY (benutzer_id, gruppe_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS $tbgr (
              block_id  INT UNSIGNED NOT NULL,
              gruppe_id INT          NOT NULL,
              PRIMARY KEY (block_id, gruppe_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ],

        // ── 12: Wettkampf-Planung + Anmeldungen ─────────────────────────
        // training_wettkampf_planung  → ein Planungseintrag pro Veranstaltungsserie
        //   (naechstes_datum = manuell gesetztes Datum; sonst Prognose im Frontend)
        // training_wettkampf_anmeldungen → Athleten melden sich für eine Disziplin an
        12 => [
            "CREATE TABLE IF NOT EXISTS " . DB::tbl('training_wettkampf_planung') . " (
              id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
              serie_id          INT           NOT NULL COMMENT 'Referenz auf veranstaltung_serien.id',
              naechstes_datum   DATE          NULL,
              disziplinen_extra TEXT          NULL COMMENT 'JSON-Array mit zusätzlichen Disziplinen',
              aktiv             TINYINT(1)    NOT NULL DEFAULT 1,
              erstellt_am       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
              geaendert_am      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              UNIQUE KEY uk_serie (serie_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS " . DB::tbl('training_wettkampf_anmeldungen') . " (
              id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
              planung_id   INT UNSIGNED  NOT NULL,
              benutzer_id  INT UNSIGNED  NOT NULL,
              disziplin    VARCHAR(200)  NOT NULL,
              bemerkung    TEXT          NULL,
              erstellt_am  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
              geaendert_am TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              UNIQUE KEY uk_planung_benutzer (planung_id, benutzer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ],

        // ── 13: disziplinen_ausgeschlossen – vom Admin per Checkbox abgewählte Disziplinen ──
        13 => [
            "ALTER TABLE " . DB::tbl('training_wettkampf_planung') .
            " ADD COLUMN IF NOT EXISTS disziplinen_ausgeschlossen TEXT NULL" .
            " COMMENT 'JSON-Array: Disziplinen aus Ergebnissen, die ausgeblendet werden'" .
            " AFTER disziplinen_extra",
        ],

        // ── 14: Trainingstyp „wettkampf" – hardcodierter Typ für persönliche Wettkampf-Einträge ──
        14 => [
            "INSERT IGNORE INTO " . DB::tbl('training_typen') .
            " (slug, bezeichnung, farbe, reihenfolge, aktiv) VALUES ('wettkampf', 'Wettkampf', '#27ae60', 7, 1)",
        ],

        // ── 15: Wettkampfplanung ─────────────────────────────────────────────────────────────
        // – sortierindex / url / wettbewerbe zu veranstaltung_serien
        // – training_wettkampf_status (pro Nutzer, pro Jahr, pro Serie)
        // – Metadaten der vorhandenen 35 Serien befüllen
        // – ~94 neue Serien aus dem Notion-Export einfügen
        15 => static function (): void {
            $tws = DB::tbl('veranstaltung_serien');
            $tst = DB::tbl('training_wettkampf_status');

            // Neue Spalten
            foreach ([
                "ALTER TABLE `{$tws}` ADD COLUMN IF NOT EXISTS sortierindex SMALLINT UNSIGNED NULL COMMENT 'MMDD – Monat+Tag des typischen Termins, für Jahressortierung'",
                "ALTER TABLE `{$tws}` ADD COLUMN IF NOT EXISTS url VARCHAR(500) NULL COMMENT 'Website der Veranstaltung'",
                "ALTER TABLE `{$tws}` ADD COLUMN IF NOT EXISTS wettbewerbe TEXT NULL COMMENT 'JSON-Array der angebotenen Wettbewerbe/Disziplinen'",
            ] as $sql) {
                try { DB::query($sql); } catch (Throwable $e) { error_log('mig15: ' . $e->getMessage()); }
            }

            // Planungsstatus-Tabelle
            try {
                DB::query("CREATE TABLE IF NOT EXISTS `{$tst}` (
                    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    serie_id     INT          NOT NULL,
                    benutzer_id  INT UNSIGNED NOT NULL,
                    jahr         SMALLINT UNSIGNED NOT NULL,
                    status       ENUM('offen','in_klaerung','anmeldung_erforderlich','angemeldet',
                                      'absolviert','findet_nicht_statt','passt_nicht','nicht_angetreten')
                                 NOT NULL DEFAULT 'passt_nicht',
                    notiz        TEXT NULL,
                    erstellt_am  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    geaendert_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_serie_user_jahr (serie_id, benutzer_id, jahr)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            } catch (Throwable $e) { error_log('mig15: ' . $e->getMessage()); }

            // ── Metadaten für vorhandene 35 Serien (id → [sortierindex, url, wettbewerbe_json]) ──
            $updates = [
                [1,  329,  'https://venloop.nl',                             '["10km Straße","5km Straße","Halbmarathon"]'],
                [2,  214,  'https://www.hkl-mg.de',                          '["10km Straße","5km Straße"]'],
                [3,  308,  'https://www.tsvbayer04-leichtathletik.de/events/strassenlauf-rund-um-das-bayerkreuz/', '["10km Straße","5km Straße"]'],
                [4,  131,  'https://www.asv-winterlaufserie.de',              '["10km Straße","5km Straße"]'],
                [5,  228,  'https://www.asv-winterlaufserie.de',              '["15km Straße","7,5km Straße"]'],
                [6,  328,  'https://www.asv-winterlaufserie.de',              '["10km Straße","Halbmarathon"]'],
                [7,  531,  'https://rahser-run.de/',                          '["10km Straße","5km Straße"]'],
                [8,  426,  'https://www.uniper-duesseldorfmarathon.de',       '["Halbmarathon","Marathon"]'],
                [9,  419,  'https://apfel-blueten-lauf.de',                   '["10km Straße","5km Straße","Halbmarathon"]'],
                [11, 412,  'https://www.enschedemarathon.nl',                 '["Halbmarathon","Marathon"]'],
                [13, 117,  'https://vfl-hinsbeck.de/waldlauf.html',           '["10km Straße","5km Straße"]'],
                [14, 1011, null,                                              '["Trail"]'],
                [15, 518,  null,                                              '["Halbmarathon","Marathon"]'],
                [16, 1026, null,                                              '["Halbmarathon"]'],
                [17, 509,  null,                                              '["10km Straße","5km Straße"]'],
                [18, 1231, null,                                              '["10km Straße","5km Straße"]'],
                [19, 427,  null,                                              '["Halbmarathon","Marathon"]'],
                [20, 426,  'https://citylauf-korschenbroich.com',             '["10km Straße","5km Straße"]'],
                [21, 425,  'https://schlossparklauf.org',                     '["10km Straße","5km Straße"]'],
                [22, 104,  'https://www.marathon-wesel.de',                   '["Halbmarathon","Marathon"]'],
                [23, 506,  'https://www.tus-oedt.de',                        '["5.000m Bahn"]'],
                [24, 1122, 'http://www.tusem-leichtathletik.de/index.php/abg.html', '["10km Straße","Halbmarathon"]'],
                [25, 603,  'https://tus-oedt.de',                            '["3.000m Bahn"]'],
                [26, 701,  'https://tus-oedt.de',                            '["5.000m Bahn"]'],
                [27, 1115, null,                                              '["15km Straße","5km Straße"]'],
                [29, 1004, 'https://generali-koeln-marathon.de',              '["Halbmarathon","Marathon"]'],
                [30, 528,  'https://sv-sonsbeck.de/index.php/leichtathletik/events/enni-brunnenlauf', '["10km Straße","5km Straße"]'],
                [31, 517,  'https://www.brueckenlauf-duesseldorf.de/',        '["10km Straße","5km Straße"]'],
                [33, 927,  null,                                              '["Marathon"]'],
                [35, 618,  null,                                              '["10km Straße","5km Straße"]'],
            ];
            foreach ($updates as [$id, $si, $url, $wb]) {
                try {
                    DB::query("UPDATE `{$tws}` SET sortierindex=COALESCE(sortierindex,?), url=COALESCE(url,?), wettbewerbe=COALESCE(wettbewerbe,?) WHERE id=?",
                        [$si, $url, $wb, $id]);
                } catch (Throwable $e) { error_log('mig15: ' . $e->getMessage()); }
            }

            // ── Neue Serien aus Notion-Export ─────────────────────────────────────────────
            // [name, kuerzel, sortierindex|null, url|null, wettbewerbe_json|null]
            $neue = [
                ['ASV Süchteln Läufertag',                'ASV-SUECHTELN-LAUEFTAG',               null, null, null],
                ['B2Run Düsseldorf',                      'B2RUN-DUESSELDORF',                     null, null, '["Firmenlauf"]'],
                ['Herbstlauf Niederrhein',                'HERBSTLAUF-NIEDERRHEIN',               1012, null, '["10km Straße","5km Straße"]'],
                ['Die Kö-Meile',                          'DIE-KOE-MEILE',                         907, 'https://www.diekoemeile.de', '["1 Meile","5km Straße"]'],
                ['HRS BusinessRun Cologne',               'HRS-BUSINESSRUN-COLOGNE',               null, null, '["Firmenlauf"]'],
                ['Geilenkirchener Volkslauf',             'GEILENKIRCHENER-VOLKSLAUF',             null, null, null],
                ['Mars-Nikolauslauf Süchteln',            'MARS-NIKOLAUSLAUF-SUECHTELN',           null, null, null],
                ['NEW Volksbad-Lauf Mönchengladbach',     'NEW-VOLKSBAD-LAUF-MOENCHENGL',          null, null, null],
                ['Santander-Marathon Mönchengladbach',    'SANTANDER-MARATHON-MOENCHENGL',         null, null, null],
                ['Rheinuferlauf Duisburg',                'RHEINUFERLAUF-DUISBURG',                726, 'https://hombergertv.de/rheinuferlauf/', '["10km Straße","5km Straße","Halbmarathon"]'],
                ['Run&Fun Mönchengladbach',               'RUN-FUN-MOENCHENGLADBACH',              915, null, '["Firmenlauf"]'],
                ['Nikolauslauf der TSG Dülmen',           'NIKOLAUSLAUF-TSG-DUELMEN',             1206, null, '["10km Straße","5km Straße"]'],
                ['Run&Fun Krefeld',                       'RUN-FUN-KREFELD',                       827, null, '["Firmenlauf"]'],
                ['Seidenraupen-Cross',                    'SEIDENRAUPEN-CROSS',                    921, null, '["Trail"]'],
                ['Selfkantlauf',                          'SELFKANTLAUF',                          null, null, null],
                ['Vivawest Marathon',                     'VIVAWEST-MARATHON',                     null, null, '["Marathon"]'],
                ['Ratinger Neujahrslauf',                 'RATINGER-NEUJAHRSLAUF',                 104, 'https://asc-ratingen.de/neujahrslauf/', '["10km Straße","5km Straße"]'],
                ['DO it fast Winter',                     'DO-IT-FAST-WINTER',                     201, 'https://doitfast.de', '["10km Straße","5km Straße"]'],
                ['Berliner Halbmarathon',                 'BERLINER-HALBMARATHON',                 329, null, '["Halbmarathon"]'],
                ['ADAC Marathon Hannover',                'ADAC-MARATHON-HANNOVER',                412, 'https://www.marathon-hannover.de', '["10km Straße","Halbmarathon","Marathon"]'],
                ['Deutsche Post Marathon Bonn',           'DEUTSCHE-POST-MARATHON-BONN',           419, 'https://www.deutschepostmarathonbonn.de', '["Halbmarathon","Marathon"]'],
                ['NN Marathon Rotterdam',                 'NN-MARATHON-ROTTERDAM',                 413, 'https://nnmarathonrotterdam.nl/en/', '["Marathon"]'],
                ['Boston Marathon',                       'BOSTON-MARATHON',                       420, 'https://www.baa.org/races/boston-marathon/', '["Marathon"]'],
                ['Schneider Electric Marathon de Paris',  'SCHNEIDER-ELECTRIC-MARATHON-P',         412, 'https://www.schneiderelectricparismarathon.com/en/', '["Marathon"]'],
                ['TCS London Marathon',                   'TCS-LONDON-MARATHON',                   426, null, '["Marathon"]'],
                ['Schloss-Dyck-Lauf',                     'SCHLOSS-DYCK-LAUF',                     505, null, '["10km Straße"]'],
                ['ING Night Marathon Luxembourg',         'ING-NIGHT-MARATHON-LUXEMBOURG',         531, null, '["Halbmarathon","Marathon"]'],
                ['Benrather Schlosslauf',                 'BENRATHER-SCHLOSSLAUF',                 601, null, '["10km Straße","5km Straße"]'],
                ['Neusser Sommernachtslauf',              'NEUSSER-SOMMERNACHTSLAUF',              524, 'https://tg-neuss.de/sommernachtslauf/', '["10km Straße","5km Straße"]'],
                ['Himmelgeister Brückenlauf',             'HIMMELGEISTER-BRUECKENLAUF',            614, null, '["Halbmarathon"]'],
                ['Grevenbroicher Citylauf',               'GREVENBROICHER-CITYLAUF',               613, 'https://citylauf-grevenbroich.de', '["10km Straße","5km Straße"]'],
                ['EVL-Halbmarathon Leverkusen',           'EVL-HALBMARATHON-LEVERKUSEN',           615, null, '["Halbmarathon"]'],
                ['NEW-Citylauf Erkelenz',                 'NEW-CITYLAUF-ERKELENZ',                 614, null, '["10km Straße"]'],
                ['Move&Groove Run',                       'MOVE-GROOVE-RUN',                       614, null, '["5km Straße"]'],
                ['Schloss Wickrath Lauf',                 'SCHLOSS-WICKRATH-LAUF',                 525, 'https://www.schloss-wickrath-lauf.de', '["10km Straße","5km Straße"]'],
                ['Hella-Halbmarathon Hamburg',            'HELLA-HALBMARATHON-HAMBURG',            628, 'https://www.hamburg-halbmarathon.de', '["Halbmarathon"]'],
                ['Dr. Ernst van Aaken Gedächtnislauf Waldniel', 'DR-VAN-AAKEN-GEDAECHTNISLAUF-WN', 627, 'http://osc-lauf.de', '["5.000m Bahn"]'],
                ['Lank läuft',                            'LANK-LAEUFT',                           630, null, '["10km Straße","5km Straße"]'],
                ['DO it fast Sommer',                     'DO-IT-FAST-SOMMER',                     831, 'https://doitfast.de', '["10km Straße","5km Straße"]'],
                ['Stadtwerke Halbmarathon Bochum',        'STADTWERKE-HALBMARATHON-BOCHUM',        906, null, '["10km Straße","5km Straße","Halbmarathon"]'],
                ['Sparkassen-Stadtlauf Wachtendonk',      'SPARKASSEN-STADTLAUF-WACHTENDONK',      907, 'https://niersrunners.de', '["10km Straße","5km Straße"]'],
                ['Welterbelauf Zollverein',               'WELTERBELAUF-ZOLLVEREIN',               913, null, '["10km Straße","5km Straße"]'],
                ['Bunerts Lichterlauf',                   'BUNERTS-LICHTERLAUF',                   913, 'https://lichterlauf.bunert.de', '["10km Straße","5km Straße"]'],
                ['Brachter Depotlauf',                    'BRACHTER-DEPOTLAUF',                    914, 'https://www.brachter-depotlauf.de', '["Landschaftslauf"]'],
                ['Gelderner Citylauf',                    'GELDERNER-CITYLAUF',                    510, 'https://citylauf-geldern.de', '["5km Straße"]'],
                ['PSD Bank Halbmarathon Hamburg',         'PSD-BANK-HALBMARATHON-HAMBURG',         921, null, '["Halbmarathon"]'],
                ['Münster Marathon',                      'MUENSTER-MARATHON',                     921, null, '["Marathon"]'],
                ['NRZ Klosterlauf',                       'NRZ-KLOSTERLAUF',                      1003, null, '["Halbmarathon"]'],
                ['Bridge2bridge Run Venlo',               'BRIDGE2BRIDGE-RUN-VENLO',              1005, null, '["5km Straße"]'],
                ['Chicago Marathon',                      'CHICAGO-MARATHON',                     1012, null, '["Marathon"]'],
                ['Sparkasse 3-Länder-Marathon',           'SPARKASSE-3-LAENDER-MARATHON',         1012, null, '["Halbmarathon","Marathon","Viertelmarathon"]'],
                ['Drei-Brücken-Lauf Bonn',               'DREI-BRUECKEN-LAUF-BONN',              1019, null, '["10km Straße","15km Straße","30km Straße"]'],
                ['München Marathon',                      'MUENCHEN-MARATHON',                    1012, 'https://marathonmuenchen.org', '["10km Straße","Halbmarathon","Marathon"]'],
                ['Herbstlauf Köln',                       'HERBSTLAUF-KOELN',                     1018, null, '["10km Straße"]'],
                ['TCS Amsterdam Marathon',                'TCS-AMSTERDAM-MARATHON',               1019, null, '["Halbmarathon","Marathon"]'],
                ['Mainova Frankfurt Marathon',            'MAINOVA-FRANKFURT-MARATHON',            1026, null, '["Marathon"]'],
                ['New York Marathon',                     'NEW-YORK-MARATHON',                    1103, null, '["Marathon"]'],
                ['Martinslauf Düsseldorf',               'MARTINSLAUF-DUESSELDORF',              1109, null, '["10km Straße"]'],
                ['Schmachtendorfer Nikolauslauf',         'SCHMACHTENDORFER-NIKOLAUSLAUF',        1130, null, '["10km Straße","5km Straße"]'],
                ['Seattle Marathon',                      'SEATTLE-MARATHON',                     1201, null, '["Marathon"]'],
                ['Neusser Silvesterlauf',                 'NEUSSER-SILVESTERLAUF',                1231, 'https://www.silvesterlauf-neuss.de', '["10km Straße"]'],
                ['Barbara-Runde Bergkamen',               'BARBARA-RUNDE-BERGKAMEN',              1207, null, '["5km Straße"]'],
                ['Essener Silvesterlauf',                 'ESSENER-SILVESTERLAUF',                1231, null, '["10km Straße","5km Straße"]'],
                ['Gutenberg Halbmarathon Mainz',          'GUTENBERG-HALBMARATHON-MAINZ',          504, null, '["Halbmarathon"]'],
                ['Mailauf Osterrath',                     'MAILAUF-OSTERRATH',                     501, null, '["10km Straße","5km Straße"]'],
                ['S25 Berlin',                            'S25-BERLIN',                            419, 'https://berlin-laeuft.de/s25berlin/', '["10km Straße","25km Straße","5km Straße","Halbmarathon"]'],
                ['Rosellener Abendlauf',                  'ROSELLENER-ABENDLAUF',                  509, 'https://sv-rosellen.de/abendlauf', '["10km Straße","5km Straße"]'],
                ['Wessumer Klumpenlauf',                  'WESSUMER-KLUMPENLAUF',                  517, 'https://unionwessum.de/klumpenlauf', '["10km Straße","5km Straße"]'],
                ['Westenergie-Marathon Essen',            'WESTENERGIE-MARATHON-ESSEN',           1012, 'https://westenergie-marathon.de', '["Marathon"]'],
                ['Salzkotten Marathon',                   'SALZKOTTEN-MARATHON',                   601, 'https://salzkotten-marathon.de/', '["10km Straße","5km Straße","Halbmarathon","Marathon"]'],
                ['Fun Run Jüchen',                        'FUN-RUN-JUECHEN',                       601, 'https://www.fun-run-juechen.de', '["10km Straße"]'],
                ['GVG-Abteilauf Brauweiler',             'GVG-ABTEILAUF-BRAUWEILER',              629, 'https://www.abtei-lauf.de', '["10km Straße","5km Straße"]'],
                ['Sommerlauf Hochneukirch',               'SOMMERLAUF-HOCHNEUKIRCH',               830, 'https://www.sommerlauf-hochneukirch.de', '["10km Straße","5km Straße"]'],
                ['Stadtlauf Jüchen',                      'STADTLAUF-JUECHEN',                     831, 'https://www.stadtlauf-juechen.de', '["10km Straße","5km Straße"]'],
                ['Volkslauf TV Schwafheim',               'VOLKSLAUF-TV-SCHWAFHEIM',               619, null, '["10km Straße","5km Straße","Halbmarathon"]'],
                ['ENNI-Donkenlauf Neukirchen-Vluyn',     'ENNI-DONKENLAUF-NK-VLUYN',              614, 'https://as-neukirchen-vluyn.de/sportgruppen/donkenlauf/', '["10km Straße","5km Straße"]'],
                ['Eschweiler Citylauf',                   'ESCHWEILER-CITYLAUF',                   824, 'https://mc-eschweiler.de/veranstaltungen/killewittchenlauf/', '["10km Straße","5km Straße"]'],
                ['Gocher Steintorlauf',                   'GOCHER-STEINTORLAUF',                   705, 'https://www.viktoria-leichtathletik.de', '["5km Straße"]'],
                ['adidas Runners City Night Berlin',      'ADIDAS-CITY-NIGHT-BERLIN',              801, 'https://www.berlin-citynight.de', '["10km Straße","5km Straße"]'],
                ['Kölner Halbmarathon',                  'KOELNER-HALBMARATHON',                  824, null, '["Halbmarathon"]'],
                ['10k Hamburg / Elbe',                   '10K-HAMBURG-ELBE',                      525, null, '["10km Straße"]'],
                ['Citylauf Siegburg',                     'CITYLAUF-SIEGBURG',                     907, 'https://hit-citylauf.de/infos/ausschreibung/', '["10km Straße","5km Straße"]'],
                ['10k Hamburg / Volkspark',              '10K-HAMBURG-VOLKSPARK',                  622, null, '["10km Straße"]'],
                ['10k Hamburg / Rotherbaum',             '10K-HAMBURG-ROTHERBAUM',                 824, null, '["10km Straße"]'],
                ['Hamminkelner Abendlauf',               'HAMMINKELNER-ABENDLAUF',                 829, 'https://sv-hamminkeln.de/uebersicht-citylauf/', '["10km Straße","5km Straße"]'],
                ['Michaelislauf Gronau-Epe',             'MICHAELISLAUF-GRONAU-EPE',               927, null, '["10km Straße","5km Straße"]'],
                ['Berliner Morgenpost Great 10k',        'BERLINER-MORGENPOST-GREAT-10K',         1012, 'https://berlin-laeuft.de/great10k/', '["10km Straße"]'],
                ['Bottroper Herbstwaldlauf',             'BOTTROPER-HERBSTWALDLAUF',              1109, 'https://www.adler-langlauf.de/herbstwaldlauf/', '["10km Straße","25km Straße"]'],
                ['Mallorca Marathon',                    'MALLORCA-MARATHON',                    1018, 'https://www.palmademallorcamarathon.com/deutsch/race-info', '["10km Straße","Halbmarathon","Marathon"]'],
                ['Hockenheimringlauf',                  'HOCKENHEIMRINGLAUF',                   1101, 'https://www.asgtria-hockenheim.de/Hockenheimringlauf/', '["10km Straße","5km Straße"]'],
                ['Brüssel Marathon',                     'BRUESSEL-MARATHON',                    1102, 'https://brusselsairportmarathon.be/en/', '["Halbmarathon","Marathon"]'],
                ['B2Run Gelsenkirchen',                  'B2RUN-GELSENKIRCHEN',                   null, null, '["Firmenlauf"]'],
                ['Orion Nieuwjaarsloop',                 'ORION-NIEUWJAARSLOOP',                   104, 'https://www.orionvenlo.nl/nieuwjaarsloop-2026/', '["10km Straße","5km Straße"]'],
                ['Neusser Osterlauf',                    'NEUSSER-OSTERLAUF',                      404, null, '["10km Straße","5km Straße"]'],
            ];
            foreach ($neue as [$name, $kuerzel, $si, $url, $wb]) {
                try {
                    $row = DB::fetchOne("SELECT id FROM `{$tws}` WHERE name = ?", [$name]);
                    if (!$row) {
                        DB::query("INSERT INTO `{$tws}` (name, kuerzel, sortierindex, url, wettbewerbe) VALUES (?,?,?,?,?)",
                            [$name, $kuerzel, $si, $url, $wb]);
                    } else {
                        // Metadaten ergänzen, bestehende Werte nicht überschreiben
                        DB::query("UPDATE `{$tws}` SET sortierindex=COALESCE(sortierindex,?), url=COALESCE(url,?), wettbewerbe=COALESCE(wettbewerbe,?) WHERE id=?",
                            [$si, $url, $wb, (int)$row['id']]);
                    }
                } catch (Throwable $e) { error_log('mig15: ' . $e->getMessage()); }
            }
        },


        // ── 16: Share-Tokens für Gastansicht ─────────────────────────────
        16 => [
            "CREATE TABLE IF NOT EXISTS " . DB::tbl('training_share_tokens') . " (
                token       CHAR(32)     NOT NULL COMMENT 'MD5-Hex, zufällig',
                gruppe_id   INT UNSIGNED NOT NULL,
                name        VARCHAR(200) NOT NULL COMMENT 'Anzeigename (z.B. Gruppenname)',
                erstellt_am DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (token),
                KEY idx_gruppe (gruppe_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ],


        // ── 17: referenz_datum – letzte bekannte Termine aus Notion-Export ─────────
        // Wird als Fallback für die Prognose genutzt, wenn veranstaltungen kein
        // aktuelles Datum hat. GREATEST(MAX(vv.datum), referenz_datum) → letztes_datum.
        17 => static function (): void {
            $tws = DB::tbl('veranstaltung_serien');

            try {
                DB::query("ALTER TABLE `{$tws}` ADD COLUMN IF NOT EXISTS referenz_datum DATE NULL
                    COMMENT 'Letztes bekanntes Datum aus externen Quellen (z.B. Notion); Fallback für Prognose'");
            } catch (Throwable $e) { error_log('mig16: ' . $e->getMessage()); }

            // Bestehende Serien – Zuordnung per ID (aus Migration 15)
            $nachId = [
                1  => '2026-03-29', // Venloop
                2  => '2026-02-14', // Hardter Karnevalslauf
                3  => '2026-03-08', // Straßenlauf Bayer-Kreuz
                4  => '2026-01-31', // ASV-Winterlaufserie 1/3
                5  => '2026-02-28', // ASV-Winterlaufserie 2/3
                6  => '2026-03-28', // ASV-Winterlaufserie 3/3
                7  => '2026-05-31', // Rahser Run Viersen
                8  => '2026-04-26', // Düsseldorf-Marathon
                9  => '2026-04-19', // Tönisvorster Apfelblütenlauf
                11 => '2026-04-12', // Enschede Marathon
                13 => '2026-01-17', // Waldlauf auf den Hinsbecker Höhen
                14 => '2025-10-11', // Herbstwaldlauf Viersen
                15 => '2025-05-18', // Rhein-Ruhr-Marathon Duisburg
                16 => '2025-10-26', // Rhein City Run
                17 => '2026-05-09', // Bocholter Citylauf
                18 => '2025-12-31', // Sylvesterlauf Pfalzdorf
                19 => '2025-04-27', // Haspa-Marathon Hamburg
                20 => '2026-04-26', // Korschenbroicher Citylauf
                21 => '2026-04-25', // Moerser Schlossparklauf
                22 => '2026-01-04', // HÜLSKENS Marathon Wesel
                23 => '2026-05-06', // TuS Oedt Bahneröffnung
                24 => '2025-11-22', // Blumensaatlauf Essen
                25 => '2026-06-03', // TuS Oedt Mittelstreckenabend
                26 => '2026-07-01', // TuS Oedt Sparkassen-Sportfest
                27 => '2025-11-15', // Neusser Erftlauf
                29 => '2026-10-04', // Kölnmarathon
                30 => '2025-05-28', // Brunnenlauf Sonsbeck
                31 => '2026-05-17', // Düsseldorfer Brückenlauf
                33 => '2026-09-27', // BMW Berlin Marathon
                35 => '2025-06-18', // Alpener Stadtlauf
            ];
            foreach ($nachId as $id => $datum) {
                try {
                    DB::query("UPDATE `{$tws}` SET referenz_datum = GREATEST(COALESCE(referenz_datum,'1900-01-01'),?)
                               WHERE id = ? AND (referenz_datum IS NULL OR referenz_datum < ?)",
                        [$datum, $id, $datum]);
                } catch (Throwable $e) { error_log('mig16: ' . $e->getMessage()); }
            }

            // Neue Serien – Zuordnung per kuerzel (aus Migration 15)
            $nachKuerzel = [
                'HERBSTLAUF-NIEDERRHEIN'          => '2025-10-12',
                'DIE-KOE-MEILE'                   => '2025-09-07',
                'RHEINUFERLAUF-DUISBURG'           => '2025-07-26',
                'RUN-FUN-MOENCHENGLADBACH'         => '2025-09-15',
                'NIKOLAUSLAUF-TSG-DUELMEN'         => '2025-12-06',
                'RUN-FUN-KREFELD'                  => '2025-08-27',
                'SEIDENRAUPEN-CROSS'               => '2025-09-21',
                'RATINGER-NEUJAHRSLAUF'            => '2026-01-04',
                'DO-IT-FAST-WINTER'                => '2026-02-01',
                'BERLINER-HALBMARATHON'            => '2026-03-29',
                'ADAC-MARATHON-HANNOVER'           => '2026-04-12',
                'DEUTSCHE-POST-MARATHON-BONN'      => '2026-04-19',
                'NN-MARATHON-ROTTERDAM'            => '2025-04-13',
                'BOSTON-MARATHON'                  => '2026-04-20',
                'SCHNEIDER-ELECTRIC-MARATHON-P'    => '2026-04-12',
                'TCS-LONDON-MARATHON'              => '2026-04-26',
                'SCHLOSS-DYCK-LAUF'                => '2024-05-05',
                'ING-NIGHT-MARATHON-LUXEMBOURG'    => '2025-05-31',
                'BENRATHER-SCHLOSSLAUF'            => '2025-06-01',
                'NEUSSER-SOMMERNACHTSLAUF'         => '2025-05-24',
                'HIMMELGEISTER-BRUECKENLAUF'       => '2025-06-14',
                'GREVENBROICHER-CITYLAUF'          => '2025-06-13',
                'EVL-HALBMARATHON-LEVERKUSEN'      => '2025-06-15',
                'NEW-CITYLAUF-ERKELENZ'            => '2026-06-14',
                'MOVE-GROOVE-RUN'                  => '2025-06-14',
                'SCHLOSS-WICKRATH-LAUF'            => '2025-05-25',
                'HELLA-HALBMARATHON-HAMBURG'       => '2026-06-28',
                'DR-VAN-AAKEN-GEDAECHTNISLAUF-WN'  => '2025-06-27',
                'LANK-LAEUFT'                      => '2024-06-30',
                'DO-IT-FAST-SOMMER'                => '2025-08-31',
                'STADTWERKE-HALBMARATHON-BOCHUM'   => '2026-09-06',
                'SPARKASSEN-STADTLAUF-WACHTENDONK' => '2025-09-07',
                'WELTERBELAUF-ZOLLVEREIN'          => '2025-09-13',
                'BUNERTS-LICHTERLAUF'              => '2025-09-13',
                'BRACHTER-DEPOTLAUF'               => '2025-09-14',
                'GELDERNER-CITYLAUF'               => '2025-05-10',
                'PSD-BANK-HALBMARATHON-HAMBURG'    => '2025-09-21',
                'MUENSTER-MARATHON'                => '2025-09-21',
                'NRZ-KLOSTERLAUF'                  => '2025-10-03',
                'BRIDGE2BRIDGE-RUN-VENLO'          => '2025-10-05',
                'CHICAGO-MARATHON'                 => '2025-10-12',
                'SPARKASSE-3-LAENDER-MARATHON'     => '2025-10-12',
                'DREI-BRUECKEN-LAUF-BONN'          => '2025-10-19',
                'MUENCHEN-MARATHON'                => '2025-10-12',
                'HERBSTLAUF-KOELN'                 => '2025-10-18',
                'TCS-AMSTERDAM-MARATHON'           => '2025-10-19',
                'MAINOVA-FRANKFURT-MARATHON'       => '2025-10-26',
                'NEW-YORK-MARATHON'                => '2024-11-03',
                'MARTINSLAUF-DUESSELDORF'          => '2025-11-09',
                'SCHMACHTENDORFER-NIKOLAUSLAUF'    => '2025-11-30',
                'SEATTLE-MARATHON'                 => '2024-12-01',
                'NEUSSER-SILVESTERLAUF'            => '2024-12-31',
                'BARBARA-RUNDE-BERGKAMEN'          => '2025-12-07',
                'ESSENER-SILVESTERLAUF'            => '2025-12-31',
                'GUTENBERG-HALBMARATHON-MAINZ'     => '2025-05-04',
                'MAILAUF-OSTERRATH'                => '2025-05-01',
                'S25-BERLIN'                       => '2026-04-19',
                'ROSELLENER-ABENDLAUF'             => '2025-05-09',
                'WESSUMER-KLUMPENLAUF'             => '2025-05-17',
                'WESTENERGIE-MARATHON-ESSEN'       => '2025-10-12',
                'SALZKOTTEN-MARATHON'              => '2025-06-01',
                'FUN-RUN-JUECHEN'                  => '2025-06-01',
                'GVG-ABTEILAUF-BRAUWEILER'         => '2025-06-29',
                'SOMMERLAUF-HOCHNEUKIRCH'          => '2025-08-30',
                'STADTLAUF-JUECHEN'                => '2025-08-31',
                'VOLKSLAUF-TV-SCHWAFHEIM'          => '2025-06-19',
                'ENNI-DONKENLAUF-NK-VLUYN'         => '2025-06-14',
                'ESCHWEILER-CITYLAUF'              => '2025-08-24',
                'GOCHER-STEINTORLAUF'              => '2025-07-05',
                'ADIDAS-CITY-NIGHT-BERLIN'         => '2026-08-01',
                'KOELNER-HALBMARATHON'             => '2025-08-24',
                '10K-HAMBURG-ELBE'                 => '2025-05-25',
                'CITYLAUF-SIEGBURG'                => '2025-09-07',
                '10K-HAMBURG-VOLKSPARK'            => '2025-06-22',
                '10K-HAMBURG-ROTHERBAUM'           => '2025-08-24',
                'HAMMINKELNER-ABENDLAUF'           => '2025-08-29',
                'MICHAELISLAUF-GRONAU-EPE'         => '2025-09-27',
                'BERLINER-MORGENPOST-GREAT-10K'    => '2025-10-12',
                'BOTTROPER-HERBSTWALDLAUF'         => '2025-11-09',
                'MALLORCA-MARATHON'                => '2026-10-18',
                'HOCKENHEIMRINGLAUF'               => '2025-11-01',
                'BRUESSEL-MARATHON'                => '2025-11-02',
                'ORION-NIEUWJAARSLOOP'             => '2026-01-04',
                'NEUSSER-OSTERLAUF'                => '2026-04-04',
            ];
            foreach ($nachKuerzel as $kuerzel => $datum) {
                try {
                    DB::query("UPDATE `{$tws}` SET referenz_datum = ?
                               WHERE kuerzel = ? AND (referenz_datum IS NULL OR referenz_datum < ?)",
                        [$datum, $kuerzel, $datum]);
                } catch (Throwable $e) { error_log('mig16: ' . $e->getMessage()); }
            }
        },

        // ── 18: Konsolidierung disziplinen_extra → wettbewerbe ───────────────────────
        // disziplinen_extra aus training_wettkampf_planung in veranstaltung_serien.wettbewerbe mergen.
        // disziplinen_ausgeschlossen entfällt (Admin entfernt Einträge direkt aus wettbewerbe).
        18 => static function (): void {
            $tws = DB::tbl('veranstaltung_serien');
            $twp = DB::tbl('training_wettkampf_planung');
            try {
                $planungen = DB::fetchAll(
                    "SELECT wp.serie_id, wp.disziplinen_extra FROM `{$twp}` wp
                     WHERE wp.disziplinen_extra IS NOT NULL AND wp.disziplinen_extra != '[]'"
                );
                foreach ($planungen as $p) {
                    $extras = json_decode((string)$p['disziplinen_extra'], true);
                    if (!is_array($extras) || empty($extras)) continue;

                    $serie = DB::fetchOne("SELECT wettbewerbe FROM `{$tws}` WHERE id=?", [$p['serie_id']]);
                    if (!$serie) continue;
                    $wb = ($serie['wettbewerbe'] && $serie['wettbewerbe'] !== '[]')
                        ? json_decode((string)$serie['wettbewerbe'], true) : [];
                    if (!is_array($wb)) $wb = [];

                    $changed = false;
                    foreach ($extras as $e) {
                        $e = trim((string)$e);
                        if ($e !== '' && !in_array($e, $wb, true)) { $wb[] = $e; $changed = true; }
                    }
                    if ($changed) {
                        DB::query("UPDATE `{$tws}` SET wettbewerbe=? WHERE id=?",
                            [json_encode(array_values($wb)), $p['serie_id']]);
                    }
                }
            } catch (Throwable $e) { error_log('mig18: ' . $e->getMessage()); }
        },

        // ── 19: Freigabe persönlicher Trainingspläne an Trainer/Admins ───────────────
        // Athlet (besitzer_id) gibt seinen privaten Plan für einen Trainer/Admin
        // (trainer_id) frei: stufe 'lesend' (nur ansehen) oder 'voll' (bearbeiten).
        // Fehlt eine Zeile → kein Zugriff.
        19 => [
            "CREATE TABLE IF NOT EXISTS " . DB::tbl('training_plan_freigaben') . " (
              besitzer_id  INT UNSIGNED NOT NULL,
              trainer_id   INT UNSIGNED NOT NULL,
              stufe        VARCHAR(10)  NOT NULL DEFAULT 'lesend',
              erstellt_am  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              geaendert_am TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (besitzer_id, trainer_id),
              KEY idx_trainer (trainer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ],

        // ── 21: wettbewerbe wiederherstellen ────────────────────────────────────────────
        // Migration 20 hat wettbewerbe für alle Serien geleert.
        // Serien MIT Statistikportal-Ergebnissen: wettbewerbe aus ergebnisse befüllen.
        // Serien OHNE Ergebnisse: vordefinierte Disziplinliste (aus Notion-CSV gemappt).
        21 => static function (): void {
            $tws = DB::tbl('veranstaltung_serien');
            $tvv = DB::tbl('veranstaltungen');
            $ter = DB::tbl('ergebnisse');
            $tdm = DB::tbl('disziplin_mapping');

            // 1. Disziplinen aus Statistikportal-Ergebnissen ermitteln
            $diszBySerie = [];
            try {
                $rows = DB::fetchAll("
                    SELECT v.serie_id,
                           COALESCE(dm.anzeige_name, e.disziplin) AS disziplin,
                           COUNT(*) AS anz
                    FROM `{$ter}` e
                    JOIN `{$tvv}` v  ON v.id  = e.veranstaltung_id
                    LEFT JOIN `{$tdm}` dm ON dm.id = e.disziplin_mapping_id
                    WHERE e.geloescht_am IS NULL
                      AND v.geloescht_am IS NULL
                      AND v.genehmigt    = 1
                      AND e.disziplin    IS NOT NULL
                    GROUP BY v.serie_id, COALESCE(dm.anzeige_name, e.disziplin)
                    ORDER BY v.serie_id, COUNT(*) DESC
                ");
                $seen = [];
                foreach ($rows as $r) {
                    $sid = (int)$r['serie_id'];
                    if (!isset($seen[$sid])) $seen[$sid] = [];
                    $d = trim((string)$r['disziplin']);
                    if ($d !== '' && !in_array($d, $seen[$sid], true)) {
                        $seen[$sid][]     = $d;
                        $diszBySerie[$sid][] = $d;
                    }
                }
            } catch (Throwable $ignored) {}

            // 2. wettbewerbe für Serien MIT Ergebnissen setzen
            foreach ($diszBySerie as $sid => $disz) {
                try {
                    DB::query("UPDATE `{$tws}` SET wettbewerbe=? WHERE id=? AND (wettbewerbe IS NULL OR wettbewerbe='' OR wettbewerbe='[]')",
                        [json_encode($disz), $sid]);
                } catch (Throwable $e) { error_log('mig21a: ' . $e->getMessage()); }
            }

            // 3. Vordefinierte Disziplinliste für Serien OHNE Statistikportal-Ergebnisse
            // Bereits auf Statistikportal-Bezeichnungen gemappt (10km Straße → 10km usw.)
            $mitErgebnissen = array_keys($diszBySerie);
            $serien = [
                'Herbstlauf Niederrhein'               => ['10km','5km'],
                'Die Kö-Meile'                         => ['1 Meile','5km'],
                'Rheinuferlauf Duisburg'               => ['10km','5km','Halbmarathon'],
                'Nikolauslauf der TSG Dülmen'          => ['10km','5km'],
                'Vivawest Marathon'                    => ['Marathon'],
                'Ratinger Neujahrslauf'                => ['10km','5km'],
                'DO it fast Winter'                    => ['10km','5km'],
                'Berliner Halbmarathon'                => ['Halbmarathon'],
                'ADAC Marathon Hannover'               => ['10km','Halbmarathon','Marathon'],
                'Deutsche Post Marathon Bonn'          => ['Halbmarathon','Marathon'],
                'NN Marathon Rotterdam'                => ['Marathon'],
                'Boston Marathon'                      => ['Marathon'],
                'Schneider Electric Marathon de Paris' => ['Marathon'],
                'TCS London Marathon'                  => ['Marathon'],
                'Schloss-Dyck-Lauf'                    => ['10km'],
                'ING Night Marathon Luxembourg'        => ['Halbmarathon','Marathon'],
                'Benrather Schlosslauf'                => ['10km','5km'],
                'Neusser Sommernachtslauf'             => ['10km','5km'],
                'Himmelgeister Brückenlauf'            => ['Halbmarathon'],
                'Grevenbroicher Citylauf'              => ['10km','5km'],
                'EVL-Halbmarathon Leverkusen'          => ['Halbmarathon'],
                'NEW-Citylauf Erkelenz'                => ['10km'],
                'Move&Groove Run'                      => ['5km'],
                'Schloss Wickrath Lauf'                => ['10km','5km'],
                'Hella-Halbmarathon Hamburg'           => ['Halbmarathon'],
                'Dr. Ernst van Aaken Gedächtnislauf Waldniel' => ['5.000m'],
                'Lank läuft'                           => ['10km','5km'],
                'DO it fast Sommer'                    => ['10km','5km'],
                'Stadtwerke Halbmarathon Bochum'       => ['10km','5km','Halbmarathon'],
                'Sparkassen-Stadtlauf Wachtendonk'     => ['10km','5km'],
                'Welterbelauf Zollverein'              => ['10km','5km'],
                'Bunerts Lichterlauf'                  => ['10km','5km'],
                'Gelderner Citylauf'                   => ['5km'],
                'PSD Bank Halbmarathon Hamburg'        => ['Halbmarathon'],
                'Münster Marathon'                     => ['Marathon'],
                'NRZ Klosterlauf'                      => ['Halbmarathon'],
                'Bridge2bridge Run Venlo'              => ['5km'],
                'Chicago Marathon'                     => ['Marathon'],
                'Sparkasse 3-Länder-Marathon'          => ['Halbmarathon','Marathon','Viertelmarathon'],
                'Drei-Brücken-Lauf Bonn'              => ['10km','15km','30km'],
                'München Marathon'                     => ['10km','Halbmarathon','Marathon'],
                'Herbstlauf Köln'                      => ['10km'],
                'TCS Amsterdam Marathon'               => ['Halbmarathon','Marathon'],
                'Mainova Frankfurt Marathon'           => ['Marathon'],
                'New York Marathon'                    => ['Marathon'],
                'Martinslauf Düsseldorf'              => ['10km'],
                'Schmachtendorfer Nikolauslauf'        => ['10km','5km'],
                'Seattle Marathon'                     => ['Marathon'],
                'Neusser Silvesterlauf'                => ['10km'],
                'Barbara-Runde Bergkamen'              => ['5km'],
                'Essener Silvesterlauf'                => ['10km','5km'],
                'Gutenberg Halbmarathon Mainz'         => ['Halbmarathon'],
                'Mailauf Osterrath'                    => ['10km','5km'],
                'S25 Berlin'                           => ['10km','25km','5km','Halbmarathon'],
                'Rosellener Abendlauf'                 => ['10km','5km'],
                'Wessumer Klumpenlauf'                 => ['10km','5km'],
                'Westenergie-Marathon Essen'           => ['Marathon'],
                'Salzkotten Marathon'                  => ['10km','5km','Halbmarathon','Marathon'],
                'Fun Run Jüchen'                       => ['10km'],
                'GVG-Abteilauf Brauweiler'            => ['10km','5km'],
                'Sommerlauf Hochneukirch'              => ['10km','5km'],
                'Stadtlauf Jüchen'                     => ['10km','5km'],
                'Volkslauf TV Schwafheim'              => ['10km','5km','Halbmarathon'],
                'ENNI-Donkenlauf Neukirchen-Vluyn'    => ['10km','5km'],
                'Eschweiler Citylauf'                  => ['10km','5km'],
                'Gocher Steintorlauf'                  => ['5km'],
                'adidas Runners City Night Berlin'     => ['10km','5km'],
                'Kölner Halbmarathon'                 => ['Halbmarathon'],
                '10k Hamburg / Elbe'                  => ['10km'],
                'Citylauf Siegburg'                    => ['10km','5km'],
                '10k Hamburg / Volkspark'             => ['10km'],
                '10k Hamburg / Rotherbaum'            => ['10km'],
                'Hamminkelner Abendlauf'               => ['10km','5km'],
                'Michaelislauf Gronau-Epe'             => ['10km','5km'],
                'Berliner Morgenpost Great 10k'        => ['10km'],
                'Bottroper Herbstwaldlauf'             => ['10km','25km'],
                'Mallorca Marathon'                    => ['10km','Halbmarathon','Marathon'],
                'Hockenheimringlauf'                   => ['10km','5km'],
                'Brüssel Marathon'                     => ['Halbmarathon','Marathon'],
                'Orion Nieuwjaarsloop'                 => ['10km','5km'],
                'Neusser Osterlauf'                    => ['10km','5km'],
            ];

            foreach ($serien as $name => $disz) {
                try {
                    $row = DB::fetchOne("SELECT id FROM `{$tws}` WHERE name = ?", [$name]);
                    if (!$row) continue;
                    $sid = (int)$row['id'];
                    if (in_array($sid, $mitErgebnissen, true)) continue; // hat Statistikportal-Daten
                    DB::query("UPDATE `{$tws}` SET wettbewerbe=? WHERE id=? AND (wettbewerbe IS NULL OR wettbewerbe='' OR wettbewerbe='[]')",
                        [json_encode($disz), $sid]);
                } catch (Throwable $e) { error_log('mig21b: ' . $e->getMessage()); }
            }
        },

        // ── 20: CSV-Disziplinen bereinigen → auf Statistikportal-Namen mappen ────────────
        // Für Serien ohne Statistikportal-Ergebnisse: wettbewerbe-CSV-Bezeichnungen
        // (z. B. „10km Straße") auf Statistikportal-Namen (z. B. „10km") abbilden und
        // als disziplinen_extra in training_wettkampf_planung eintragen.
        // Serien mit Statistikportal-Ergebnissen brauchen keine Extras –
        // die echten Disziplinen kommen aus ergebnisse.
        // Abschließend: wettbewerbe-Spalte für alle Serien leeren.
        20 => static function (): void {
            $tws = DB::tbl('veranstaltung_serien');
            $tvv = DB::tbl('veranstaltungen');
            $ter = DB::tbl('ergebnisse');
            $twp = DB::tbl('training_wettkampf_planung');

            // Mapping: CSV-Bezeichnung → Statistikportal-Bezeichnung
            // (nur Einträge, die im Statistikportal tatsächlich als Disziplinnamen vorkommen)
            $map = [
                '10km Straße'     => '10km',
                '5km Straße'      => '5km',
                '15km Straße'     => '15km',
                '25km Straße'     => '25km',
                '30km Straße'     => '30km',
                '7,5km Straße'    => '7,5km',
                'Halbmarathon'    => 'Halbmarathon',
                'Marathon'        => 'Marathon',
                'Viertelmarathon' => 'Viertelmarathon',
                '5.000m Bahn'     => '5.000m',
                '3.000m Bahn'     => '3.000m',
                '1 Meile'         => '1 Meile',
                // Kein Statistikportal-Äquivalent → nicht eintragen:
                // Firmenlauf, Trail, Landschaftslauf, geführter Landschaftslauf
            ];
            $csvNamen = array_keys($map); // zum Bereinigen aus disziplinen_extra

            // Serien mit Statistikportal-Ergebnissen (brauchen keine CSV-Extras)
            $mitErgebnissen = [];
            try {
                $rows = DB::fetchAll("
                    SELECT DISTINCT v.serie_id
                    FROM `{$ter}` e
                    JOIN `{$tvv}` v ON v.id = e.veranstaltung_id
                    WHERE v.serie_id   IS NOT NULL
                      AND e.geloescht_am IS NULL
                      AND v.geloescht_am IS NULL
                      AND v.genehmigt    = 1
                ");
                foreach ($rows as $r) { $mitErgebnissen[(int)$r['serie_id']] = true; }
            } catch (Throwable $ignored) {}

            // Alle Serien + aktuelle Planung laden
            $serien = DB::fetchAll("
                SELECT vs.id, vs.wettbewerbe,
                       wp.id AS planung_id, wp.disziplinen_extra
                FROM `{$tws}` vs
                LEFT JOIN `{$twp}` wp ON wp.serie_id = vs.id
            ");

            foreach ($serien as $s) {
                $serieId   = (int)$s['id'];
                $hatErgebn = isset($mitErgebnissen[$serieId]);
                $planungId = $s['planung_id'] ? (int)$s['planung_id'] : null;
                $csvDisz   = ($s['wettbewerbe'] && $s['wettbewerbe'] !== 'null')
                             ? (json_decode((string)$s['wettbewerbe'], true) ?: []) : [];
                $vorExtras = ($s['disziplinen_extra'] && $s['disziplinen_extra'] !== 'null')
                             ? (json_decode((string)$s['disziplinen_extra'], true) ?: []) : [];

                // 1. CSV-Bezeichnungen aus bestehenden Extras entfernen
                $neu = array_values(array_filter($vorExtras,
                    fn($d) => !in_array($d, $csvNamen, true)
                ));

                // 2. Gemappte Disziplinen hinzufügen – nur für Serien ohne Statistikportal-Daten
                if (!$hatErgebn) {
                    foreach ($csvDisz as $csvName) {
                        $statistikName = $map[$csvName] ?? null;
                        if ($statistikName && !in_array($statistikName, $neu, true)) {
                            $neu[] = $statistikName;
                        }
                    }
                }

                // 3. Schreiben wenn sich etwas geändert hat
                sort($neu);
                sort($vorExtras);
                if ($neu === $vorExtras) continue; // keine Änderung

                $json = count($neu) ? json_encode(array_values($neu)) : null;
                try {
                    if ($planungId) {
                        DB::query("UPDATE `{$twp}` SET disziplinen_extra = ? WHERE id = ?",
                            [$json, $planungId]);
                    } elseif (count($neu) > 0) {
                        DB::query("INSERT INTO `{$twp}` (serie_id, disziplinen_extra) VALUES (?, ?)",
                            [$serieId, $json]);
                    }
                } catch (Throwable $e) { error_log('mig20: ' . $e->getMessage()); }
            }

            // 4. wettbewerbe-Spalte leeren (CSV-Daten sind jetzt in disziplinen_extra)
            try {
                DB::query("UPDATE `{$tws}` SET wettbewerbe = NULL");
            } catch (Throwable $e) { error_log('mig20: ' . $e->getMessage()); }
        },

        // ── 22: ort_id / lat / lon zu veranstaltung_serien hinzufügen ─────────────────
        // Neue Spalten für Ort-Verknüpfung und exakte GPS-Koordinaten.
        // Ort wird aus der letzten bekannten Veranstaltung der Serie vorbelegt.
        22 => static function (): void {
            $tws = DB::tbl('veranstaltung_serien');
            $tvv = DB::tbl('veranstaltungen');
            $tor = DB::tbl('orte');

            // Spalten anlegen (idempotent: ignoriert Fehler wenn bereits vorhanden)
            foreach ([
                "ALTER TABLE `{$tws}` ADD COLUMN `ort_id` INT NULL DEFAULT NULL",
                "ALTER TABLE `{$tws}` ADD COLUMN `lat`    DECIMAL(9,6) NULL DEFAULT NULL",
                "ALTER TABLE `{$tws}` ADD COLUMN `lon`    DECIMAL(9,6) NULL DEFAULT NULL",
            ] as $sql) {
                try { DB::query($sql); } catch (Throwable $ignored) {}
            }

            // ort_id aus letzter Veranstaltung vorbelegen
            try {
                $rows = DB::fetchAll("
                    SELECT vs.id AS serie_id, v.ort_id
                    FROM `{$tws}` vs
                    JOIN `{$tvv}` v ON v.id = (
                        SELECT v2.id FROM `{$tvv}` v2
                        WHERE v2.serie_id     = vs.id
                          AND v2.ort_id      IS NOT NULL
                          AND v2.geloescht_am IS NULL
                          AND v2.genehmigt    = 1
                        ORDER BY v2.datum DESC
                        LIMIT 1
                    )
                    WHERE vs.ort_id IS NULL
                ");
                foreach ($rows as $r) {
                    DB::query("UPDATE `{$tws}` SET ort_id=? WHERE id=? AND ort_id IS NULL",
                        [(int)$r['ort_id'], (int)$r['serie_id']]);
                }
            } catch (Throwable $e) { error_log('mig22a: ' . $e->getMessage()); }

            // lat/lon aus orte-Tabelle befüllen
            try {
                DB::query("
                    UPDATE `{$tws}` vs
                    JOIN `{$tor}` o ON o.id = vs.ort_id
                    SET vs.lat = o.lat, vs.lon = o.lon
                    WHERE vs.ort_id IS NOT NULL
                      AND vs.lat IS NULL
                      AND vs.lon IS NULL
                      AND o.lat IS NOT NULL
                ");
            } catch (Throwable $e) { error_log('mig22b: ' . $e->getMessage()); }
        },

        // ── 27: Training-Rechte in bestehende Rollen einmergen ──────────────────────────
        // INSERT IGNORE aus Migration 1 greift nicht, wenn trainer/editor bereits aus dem
        // Statistikportal existieren. Diese Migration merged die fehlenden Rechte nach.
        27 => static function (): void {
            $tbl = DB::tbl('rollen');
            $needed = [
                'trainer' => ['training_bloecke_verwalten', 'training_bearbeiten'],
                'editor'  => ['training_bearbeiten'],
            ];
            foreach ($needed as $roleName => $newRights) {
                $row = DB::fetchOne("SELECT rechte FROM $tbl WHERE name = ?", [$roleName]);
                if ($row) {
                    $current = json_decode($row['rechte'] ?? '[]', true) ?: [];
                    $merged  = array_values(array_unique(array_merge($current, $newRights)));
                    if (count($merged) !== count($current) || array_diff($newRights, $current)) {
                        DB::query("UPDATE $tbl SET rechte = ? WHERE name = ?",
                            [json_encode($merged), $roleName]);
                    }
                } else {
                    DB::query("INSERT INTO $tbl (name, rechte) VALUES (?, ?)",
                        [$roleName, json_encode($newRights)]);
                }
            }
        },

        // ── 26: Wochenziele (km-Vorgaben pro Woche pro Benutzer) ────────────────────────
        26 => static function (): void {
            DB::query("CREATE TABLE IF NOT EXISTS " . DB::tbl('training_wochenziele') . " (
                benutzer_id  INT UNSIGNED   NOT NULL,
                woche_datum  DATE           NOT NULL,
                km_ziel      DECIMAL(6,2)   NOT NULL,
                PRIMARY KEY (benutzer_id, woche_datum)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        },

        // ── 25: abgesagt_von in training_einheiten ──────────────────────────────────────
        25 => static function (): void {
            try {
                DB::query("ALTER TABLE " . DB::tbl('training_einheiten') . "
                    ADD COLUMN IF NOT EXISTS abgesagt_von INT UNSIGNED NULL DEFAULT NULL");
            } catch (Throwable $e) { error_log('mig25: ' . $e->getMessage()); }
        },

        // ── 24: absage_notiz in training_einheiten ──────────────────────────────────────
        // Ermöglicht das sichtbare Absagen eines Trainings mit Begründung.
        24 => static function (): void {
            try {
                DB::query("ALTER TABLE " . DB::tbl('training_einheiten') . "
                    ADD COLUMN IF NOT EXISTS absage_notiz TEXT NULL DEFAULT NULL");
            } catch (Throwable $e) { error_log('mig24: ' . $e->getMessage()); }
        },

        // ── 23: Tagesnotizen ────────────────────────────────────────────────────────────
        // Trainer/Admins können pro Tag (optional pro Gruppe) Notizen hinterlegen.
        // Diese erscheinen im Planungskalender und im ICS-Export als ganztägiger Termin.
        23 => static function (): void {
            DB::query("CREATE TABLE IF NOT EXISTS " . DB::tbl('training_tagesnotizen') . " (
                id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                datum         DATE         NOT NULL,
                inhalt        TEXT         NOT NULL,
                gruppe_id     INT UNSIGNED NULL DEFAULT NULL,
                erstellt_von  INT UNSIGNED NOT NULL,
                erstellt_am   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                geaendert_am  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_datum  (datum),
                KEY idx_gruppe (gruppe_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        },

        // ── 28: Ansicht + Zeitraum für Share-Tokens ──────────────────────────────────────
        // Ein Gast-Link öffnet jetzt eine feste Ansicht (kalender/liste) und einen
        // festen Zeitraum (Monat YYYY-MM bzw. Quartal YYYY-QN). NULL = aktueller Zeitraum.
        28 => static function (): void {
            $tst = DB::tbl('training_share_tokens');
            foreach ([
                "ALTER TABLE `{$tst}` ADD COLUMN IF NOT EXISTS ansicht  VARCHAR(10) NOT NULL DEFAULT 'kalender'",
                "ALTER TABLE `{$tst}` ADD COLUMN IF NOT EXISTS zeitraum VARCHAR(10) NULL DEFAULT NULL",
            ] as $sql) {
                try { DB::query($sql); } catch (Throwable $e) { error_log('mig28: ' . $e->getMessage()); }
            }
            // Bestehenden Link nachträglich auf Listenansicht Q3/2026 setzen
            try {
                DB::query("UPDATE `{$tst}` SET ansicht='liste', zeitraum='2026-Q3' WHERE token=?",
                    ['87e538a6af3cc21c550a04a7458985e6']);
            } catch (Throwable $e) { error_log('mig28b: ' . $e->getMessage()); }
        },

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
    if ($head === 'share') {
        handleShare($method, $tail);
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
    if ($head === 'serien') {
        handleSerien($method, $tail);
        exit;
    }
    if ($head === 'treffpunkte') {
        handleTreffpunkte($method, $tail);
        exit;
    }
    if ($head === 'weg') {
        handleWeg($method, $tail);
        exit;
    }
    if ($head === 'admin-dashboard') {
        handleAdminDashboard($method);
        exit;
    }
    if ($head === 'admin') {
        handleAdmin($method, $tail);
        exit;
    }
    if ($head === 'trainingsgruppen') {
        handleTrainingsgruppen($method, $tail ?? '');
        exit;
    }
    if ($head === 'tagesnotizen') {
        handleTagesnotizen($method, $tail ?? '');
        exit;
    }
    if ($head === 'wochenziele') {
        handleWochenziele($method, $tail ?? '');
        exit;
    }
    if ($head === 'profil') {
        handleProfil($method, $tail);
        exit;
    }
    if ($head === 'planung') {
        handlePlanung($method, $tail);
        exit;
    }
    if ($head === 'kal') {
        handleKalPrefs($method, $tail ?? '');
        exit;
    }
    if ($head === 'mein-plan') {
        handleMeinPlan($method, $tail);
        exit;
    }
    if ($head === 'wettkampf') {
        handleWettkampf($method, $tail ?? '');
        exit;
    }
    if ($head === 'wettkampfplanung') {
        handleWettkampfplanung($method, $tail ?? '');
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

        $where = 'e.datum BETWEEN ? AND ?';
        $params = [$von, $bis];

        // Share-Token: Gast mit gültigem Token darf öffentliche Einheiten der Token-Gruppe sehen
        $shareToken = isset($_GET['share_token']) ? trim($_GET['share_token']) : null;
        $shareGruppeId = null;
        if (!$user && $shareToken) {
            $tokenRow = preg_match('/^[a-f0-9]{32}$/', $shareToken)
                ? DB::fetchOne('SELECT gruppe_id FROM ' . DB::tbl('training_share_tokens') . ' WHERE token = ?', [$shareToken])
                : null;
            if ($tokenRow) {
                $shareGruppeId = (int)$tokenRow['gruppe_id'];
            } else {
                http_response_code(403);
                echo json_encode(['ok' => false, 'fehler' => 'Ungültiger Share-Token']);
                return;
            }
        }

        if (!$user) {
            // Gäste ohne Token sehen gar nichts
            if ($shareGruppeId === null) {
                echo json_encode(['ok' => true, 'einheiten' => []]);
                return;
            }
            $where .= " AND e.sichtbarkeit = 'oeffentlich' AND e.gruppe_id = ?";
            $params[] = $shareGruppeId;
        } else {
            // Optionaler Gruppen-Filter für Planungskalender (nur für eingeloggte Nutzer)
            $gruppeId = isset($_GET['gruppe_id']) && ctype_digit((string)$_GET['gruppe_id'])
                ? (int)$_GET['gruppe_id'] : null;
            if ($gruppeId !== null) {
                $where .= ' AND e.gruppe_id = ?';
                $params[] = $gruppeId;
            }
        }

        $rows = DB::fetchAll(
            'SELECT e.id, e.datum, e.uhrzeit, e.typ, e.titel, e.treffpunkt_id, e.komoot_url,
                    e.bemerkung, e.absage_notiz, e.abgesagt_von, e.sichtbarkeit, e.status, e.serie_id, e.gruppe_id,
                    t.name AS tp_name, t.lat AS tp_lat, t.lng AS tp_lng,
                    COALESCE(CONCAT(av_a.vorname, \' \', av_a.nachname), av_b.benutzername) AS abgesagt_von_name
               FROM ' . DB::tbl('training_einheiten') . ' e
               LEFT JOIN ' . DB::tbl('training_treffpunkte') . ' t ON t.id = e.treffpunkt_id
               LEFT JOIN ' . DB::tbl('benutzer') . ' av_b ON av_b.id = e.abgesagt_von
               LEFT JOIN ' . DB::tbl('athleten')  . ' av_a ON av_a.id = av_b.athlet_id
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
                    SET datum=?, uhrzeit=?, typ=?, titel=?, treffpunkt_id=?, komoot_url=?, bemerkung=?, absage_notiz=?, sichtbarkeit=?, status=?, gruppe_id=?
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
                    isset($in['absage_notiz']) && $in['absage_notiz'] !== '' ? $in['absage_notiz'] : null,
                    $in['sichtbarkeit'] ?? 'oeffentlich',
                    $in['status'] ?? 'geplant',
                    isset($in['gruppe_id']) && $in['gruppe_id'] !== '' && $in['gruppe_id'] !== null
                        ? (int)$in['gruppe_id'] : null,
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

    // ── POST /einheiten/{id}/absagen  → sichtbar absagen (optional mit Notiz, Serien-Scope)
    // ── POST /einheiten/{id}/wiederherstellen → Absage aufheben
    if ($method === 'POST') {
        $parts = explode('/', $sub, 2);
        $eid   = ctype_digit($parts[0]) ? (int)$parts[0] : 0;
        $aktion = $parts[1] ?? '';
        if ($eid > 0 && ($aktion === 'absagen' || $aktion === 'wiederherstellen')) {
            $in    = readJsonBody();
            $scope = in_array($in['scope'] ?? '', ['abjetzt', 'alle'], true) ? $in['scope'] : 'einzel';
            $notiz = ($aktion === 'absagen' && isset($in['notiz']) && trim($in['notiz']) !== '')
                     ? trim($in['notiz']) : null;

            $te  = DB::tbl('training_einheiten');
            $row = DB::fetchOne("SELECT id, serie_id, datum FROM $te WHERE id = ?", [$eid]);
            if (!$row) {
                http_response_code(404);
                echo json_encode(['ok' => false, 'fehler' => 'Einheit nicht gefunden']);
                return;
            }

            $neuStatus = $aktion === 'absagen' ? 'abgesagt' : 'geplant';
            $neuNotiz  = $aktion === 'absagen' ? $notiz : null;

            $neuAbgesagtVon = ($aktion === 'absagen') ? (int)$user['id'] : null;
            if ($scope === 'einzel' || !$row['serie_id']) {
                DB::query("UPDATE $te SET status=?, absage_notiz=?, abgesagt_von=? WHERE id=?",
                    [$neuStatus, $neuNotiz, $neuAbgesagtVon, $eid]);
            } elseif ($scope === 'abjetzt') {
                DB::query("UPDATE $te SET status=?, absage_notiz=?, abgesagt_von=? WHERE serie_id=? AND datum>=?",
                    [$neuStatus, $neuNotiz, $neuAbgesagtVon, (int)$row['serie_id'], $row['datum']]);
            } else { // alle
                DB::query("UPDATE $te SET status=?, absage_notiz=?, abgesagt_von=? WHERE serie_id=?",
                    [$neuStatus, $neuNotiz, $neuAbgesagtVon, (int)$row['serie_id']]);
            }
            echo json_encode(['ok' => true]);
            return;
        }
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
        'training_seitentitel' => [
            'label'    => 'Seitentitel',
            'gruppe'   => 'training',
            'beschreibung' => 'Bezeichnung des Portals im Browser-Tab, Header und Login-Screen (Standard: Trainingsplan)',
            'default'  => '',
        ],
        'training_version_anzeigen' => [
            'label'    => 'Versionsstand im Header',
            'gruppe'   => 'training',
            'beschreibung' => 'Wenn aktiv (1), wird die Versionsnummer nur eingeloggten Admins angezeigt',
            'default'  => '',
        ],
        // Footer-Rechtsseiten – geteilt mit dem Statistikportal (gleiche einstellungen-Keys)
        'footer_datenschutz_text' => [
            'label'    => 'Footer: Datenschutz-Text',
            'gruppe'   => 'footer',
            'beschreibung' => 'Markdown der Datenschutz-Seite (im Footer verlinkt)',
            'default'  => '',
        ],
        'footer_nutzung_text' => [
            'label'    => 'Footer: Nutzungsbedingungen-Text',
            'gruppe'   => 'footer',
            'beschreibung' => 'Markdown der Nutzungsbedingungen-Seite (im Footer verlinkt)',
            'default'  => '',
        ],
        'footer_impressum_text' => [
            'label'    => 'Footer: Impressum-Text',
            'gruppe'   => 'footer',
            'beschreibung' => 'Markdown der Impressum-Seite (im Footer verlinkt)',
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

function handleAdminDashboard(string $method): void {
    if ($method !== 'GET') { http_response_code(405); echo json_encode(['ok'=>false]); return; }
    $user = Auth::check();
    if (!$user) { http_response_code(401); echo json_encode(['ok'=>false,'fehler'=>'Nicht angemeldet']); return; }
    if (($user['rolle'] ?? '') !== 'admin') { http_response_code(403); echo json_encode(['ok'=>false,'fehler'=>'Nur Admins']); return; }

    // 1. System-Info
    $phpVersion = PHP_VERSION;
    $dbVersion  = 'unbekannt';
    try { $dbVersion = DB::fetchOne('SELECT VERSION() AS v')['v'] ?? 'unbekannt'; } catch (\Exception $e) {}

    $dbSize = null;
    try {
        $dbName = DB::fetchOne('SELECT DATABASE() AS d')['d'] ?? null;
        if ($dbName) {
            $row    = DB::fetchOne("SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS mb FROM information_schema.tables WHERE table_schema = ?", [$dbName]);
            $dbSize = (float)($row['mb'] ?? 0);
        }
    } catch (\Exception $e) {}

    // 2. Aktive Benutzer (aktuell eingeloggter Admin + seitenaufrufe letzte 10 Min)
    $aktiveBenutzer = [];
    $geseheneIds    = [];
    $myUid          = (int)($user['id'] ?? 0);
    if ($myUid) {
        try {
            $meRow = DB::fetchOne('SELECT id, benutzername, email, rolle FROM ' . DB::tbl('benutzer') . ' WHERE id=? AND aktiv=1', [$myUid]);
            if ($meRow) {
                $aktiveBenutzer[] = ['id'=>(int)$meRow['id'], 'name'=>$meRow['email']??$meRow['benutzername'], 'rolle'=>$meRow['rolle'], 'seit'=>date('Y-m-d H:i:s')];
                $geseheneIds[$myUid] = true;
            }
        } catch (\Exception $e) {}
    }
    try {
        $rows = DB::fetchAll(
            "SELECT b.id, b.benutzername, b.email, b.rolle, MAX(s.erstellt_am) AS letzter_aktivitaet
             FROM " . DB::tbl('seitenaufrufe') . " s
             JOIN " . DB::tbl('benutzer') . " b ON b.id = s.benutzer_id
             WHERE s.erstellt_am >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) AND b.aktiv = 1
             GROUP BY b.id ORDER BY letzter_aktivitaet DESC"
        );
        foreach ($rows as $r) {
            if (!empty($geseheneIds[(int)$r['id']])) continue;
            $aktiveBenutzer[] = ['id'=>(int)$r['id'], 'name'=>$r['email']??$r['benutzername'], 'rolle'=>$r['rolle'], 'seit'=>$r['letzter_aktivitaet']];
        }
    } catch (\Exception $e) {}

    // 3. Gäste (seitenaufrufe ohne benutzer_id, letzte 15 Min)
    $gaeste = [];
    try {
        $gRows = DB::fetchAll(
            "SELECT ip, user_agent, MAX(erstellt_am) AS zuletzt, COUNT(*) AS aufrufe
             FROM " . DB::tbl('seitenaufrufe') . "
             WHERE benutzer_id IS NULL AND erstellt_am >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
             GROUP BY ip, user_agent ORDER BY zuletzt DESC LIMIT 50"
        );
        $geoCache = [];
        foreach ($gRows as $g) {
            $ip = $g['ip'] ?? null;
            $country = null; $countryCode = null;
            if ($ip && !in_array($ip, ['127.0.0.1','::1']) && !str_starts_with($ip,'192.168.') && !str_starts_with($ip,'10.')) {
                if (!isset($geoCache[$ip])) {
                    try {
                        $ctx  = stream_context_create(['http'=>['timeout'=>2,'ignore_errors'=>true]]);
                        $json = @file_get_contents('http://ip-api.com/json/' . urlencode($ip) . '?fields=country,countryCode,city&lang=de', false, $ctx);
                        $geo  = $json ? json_decode($json, true) : null;
                        $geoCache[$ip] = ($geo && ($geo['status'] ?? '') !== 'fail') ? $geo : null;
                    } catch (\Exception $e) { $geoCache[$ip] = null; }
                }
                if ($geoCache[$ip]) {
                    $country     = trim(($geoCache[$ip]['city'] ?? '') . ($geoCache[$ip]['city'] ? ', ' : '') . ($geoCache[$ip]['country'] ?? ''));
                    $countryCode = strtoupper($geoCache[$ip]['countryCode'] ?? '');
                }
            }
            $gaeste[] = ['ip'=>$ip, 'country'=>$country, 'countryCode'=>$countryCode, 'user_agent'=>$g['user_agent'], 'zuletzt'=>$g['zuletzt'], 'aufrufe'=>(int)$g['aufrufe']];
        }
    } catch (\Exception $e) {}

    // 4. Letzte Login-Versuche (letzte 5 Tage)
    $letzteLogins = [];
    try {
        $lvRows = DB::fetchAll(
            'SELECT lv.benutzername, lv.ip, lv.erfolg, lv.erstellt_am, COALESCE(lv.methode, NULL) AS methode'
            . ' FROM ' . DB::tbl('login_versuche') . ' lv'
            . ' WHERE lv.erstellt_am >= DATE_SUB(NOW(), INTERVAL 5 DAY)'
            . ' ORDER BY lv.erstellt_am DESC LIMIT 200'
        );
        $bNamen = [];
        try {
            $bRows = DB::fetchAll('SELECT benutzername, email, rolle FROM ' . DB::tbl('benutzer'));
            foreach ($bRows as $b) {
                $entry = ['name'=>$b['email']??$b['benutzername'], 'email'=>$b['email']??null, 'rolle'=>$b['rolle']??null];
                $bNamen[$b['benutzername']] = $entry;
                if (!empty($b['email'])) $bNamen[$b['email']] = $entry;
            }
        } catch (\Exception $e) {}
        $loginGeoCache = [];
        foreach ($lvRows as $l) {
            $lip = $l['ip'] ?? null;
            $lcountry = null; $lcountryCode = null;
            if ($lip && !in_array($lip, ['127.0.0.1','::1']) && !str_starts_with($lip,'192.168.') && !str_starts_with($lip,'10.')) {
                if (!isset($loginGeoCache[$lip])) {
                    try { $ctx=stream_context_create(['http'=>['timeout'=>2,'ignore_errors'=>true]]); $gj=@file_get_contents('http://ip-api.com/json/'.urlencode($lip).'?fields=country,countryCode&lang=de',false,$ctx); $gg=$gj?json_decode($gj,true):null; $loginGeoCache[$lip]=($gg&&($gg['status']??'')!=='fail')?$gg:null; } catch(\Exception $e){ $loginGeoCache[$lip]=null; }
                }
                if ($loginGeoCache[$lip]) { $lcountry=$loginGeoCache[$lip]['country']??null; $lcountryCode=strtoupper($loginGeoCache[$lip]['countryCode']??''); }
            }
            $bInfo = $bNamen[$l['benutzername']] ?? null;
            $letzteLogins[] = [
                'benutzername' => $l['benutzername'],
                'anzeigeName'  => $bInfo ? $bInfo['name'] : $l['benutzername'],
                'rolle'        => $bInfo['rolle'] ?? null,
                'ip'           => $lip,
                'country'      => $lcountry,
                'countryCode'  => $lcountryCode,
                'erfolg'       => (bool)$l['erfolg'],
                'methode'      => $l['methode'] ?? null,
                'datum'        => $l['erstellt_am'],
            ];
        }
    } catch (\Exception $e) {}

    // 5. Zählstatistiken
    $stats = [
        'benutzer'=>0,'portalSeit'=>null,'neusterBenutzer'=>null,'neusterBenutzerDatum'=>null,
        'einheiten'=>0,'einheitenJahr'=>0,'naechsteEinheit'=>null,'abgesagt'=>0,
        'bloeckeGlobal'=>0,'privatEinheiten'=>0,'abos'=>0,'dbVersion'=>null,
    ];
    try { $stats['benutzer'] = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('benutzer') . " WHERE aktiv=1 AND geloescht_am IS NULL")['c'] ?? 0); } catch(\Exception $e) {}
    try { $r2 = DB::fetchOne("SELECT MIN(erstellt_am) AS d FROM " . DB::tbl('benutzer')); $stats['portalSeit'] = $r2['d'] ?? null; } catch(\Exception $e) {}
    try { $nr = DB::fetchOne("SELECT benutzername, email, erstellt_am FROM " . DB::tbl('benutzer') . " WHERE aktiv=1 AND geloescht_am IS NULL ORDER BY erstellt_am DESC LIMIT 1"); $stats['neusterBenutzer'] = $nr ? ($nr['email'] ?: $nr['benutzername']) : null; $stats['neusterBenutzerDatum'] = $nr['erstellt_am'] ?? null; } catch(\Exception $e) {}
    try { $stats['einheiten'] = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('training_einheiten'))['c'] ?? 0); } catch(\Exception $e) {}
    try { $stats['einheitenJahr'] = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('training_einheiten') . " WHERE YEAR(datum)=YEAR(CURDATE())")['c'] ?? 0); } catch(\Exception $e) {}
    try { $ne = DB::fetchOne("SELECT datum FROM " . DB::tbl('training_einheiten') . " WHERE datum >= CURDATE() AND status='geplant' ORDER BY datum ASC LIMIT 1"); $stats['naechsteEinheit'] = $ne['datum'] ?? null; } catch(\Exception $e) {}
    try { $stats['abgesagt'] = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('training_einheiten') . " WHERE status='abgesagt'")['c'] ?? 0); } catch(\Exception $e) {}
    try { $stats['bloeckeGlobal'] = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('training_bloecke') . " WHERE sichtbarkeit='global'")['c'] ?? 0); } catch(\Exception $e) {}
    try { $stats['privatEinheiten'] = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('training_privat_einheiten'))['c'] ?? 0); } catch(\Exception $e) {}
    try { $stats['abos'] = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('training_abos'))['c'] ?? 0); } catch(\Exception $e) {}
    try { $dbVRow = DB::fetchOne("SELECT wert FROM " . DB::tbl('einstellungen') . " WHERE schluessel='training_db_version'"); $stats['dbVersion'] = $dbVRow['wert'] ?? null; } catch(\Exception $e) {}

    // 6. Seitenaufrufe
    $aufrufe = ['heute'=>0,'gestern'=>0,'7tage'=>0];
    try {
        $aufrufe['heute']   = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('seitenaufrufe') . " WHERE DATE(erstellt_am)=CURDATE()")['c'] ?? 0);
        $aufrufe['gestern'] = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('seitenaufrufe') . " WHERE DATE(erstellt_am)=DATE_SUB(CURDATE(),INTERVAL 1 DAY)")['c'] ?? 0);
        $aufrufe['7tage']   = (int)(DB::fetchOne("SELECT COUNT(*) c FROM " . DB::tbl('seitenaufrufe') . " WHERE erstellt_am >= DATE_SUB(NOW(),INTERVAL 7 DAY)")['c'] ?? 0);
    } catch (\Exception $e) {}

    echo json_encode(['ok'=>true, 'data'=>compact('phpVersion','dbVersion','dbSize','aktiveBenutzer','gaeste','letzteLogins','stats','aufrufe')]);
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
            'SELECT e.id, e.datum, e.uhrzeit, e.typ, e.titel, e.sichtbarkeit, e.status, e.gruppe_id,
                    t.name AS tp_name, g.name AS gruppe_name
               FROM ' . DB::tbl('training_einheiten') . ' e
               LEFT JOIN ' . DB::tbl('training_treffpunkte') . ' t ON t.id = e.treffpunkt_id
               LEFT JOIN ' . DB::tbl('gruppen') . ' g ON g.id = e.gruppe_id
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
                'gruppe_id'    => $r['gruppe_id'] !== null ? (int)$r['gruppe_id'] : null,
                'gruppe'       => $r['gruppe_name'],
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
            'SELECT slug, bezeichnung, farbe, reihenfolge, fallback_km, ist_kein_training, hat_strecke
               FROM ' . DB::tbl('training_typen') . '
              WHERE aktiv = 1
              ORDER BY reihenfolge, slug'
        );
        $cfg['typen'] = array_map(function($r) {
            return [
                'slug'        => $r['slug'],
                'bezeichnung' => $r['bezeichnung'],
                'farbe'       => $r['farbe'] ?? '',
                'reihenfolge'       => (int)$r['reihenfolge'],
                'fallback_km'       => $r['fallback_km'] !== null ? (float)$r['fallback_km'] : null,
                'ist_kein_training' => !empty($r['ist_kein_training']),
                'hat_strecke'       => !empty($r['hat_strecke']),
            ];
        }, $typenRows);
    } catch (Throwable $_) {
        $cfg['typen'] = [];
    }

    // Kalenderfarben (Default je Kalender, vom Trainer unter „Planung" gesetzt)
    // gespeichert als JSON-Map { "g5":"#003087", "meinplan":"#5b8def", ... }
    $kalFarben = [];
    $rawKf = $cfg['training_kalender_farben'] ?? '';
    if ($rawKf !== '') {
        $j = json_decode((string)$rawKf, true);
        if (is_array($j)) $kalFarben = $j;
    }
    $cfg['kalender_farben'] = $kalFarben;

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
                if (str_contains($params, 'VALUE=DATE')) {
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

    $mitUhrzeit = !empty($_GET['mit_uhrzeit']) && $_GET['mit_uhrzeit'] !== '0';

    if ($sub === 'public.ics' || $sub === 'public') {
        sendeIcs(buildIcsPublic($mitUhrzeit), 'training-public.ics');
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
        sendeIcs(buildIcsForUser($userId, $mitUhrzeit), 'training-me.ics');
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

function buildIcsPublic(bool $mitUhrzeit = false): string {
    $typenDauer = ladeTypenDauerMap();
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
        $e['_dauer_min'] = $typenDauer[$e['typ']] ?? null;
        $events[] = bauVevent($e, [], [], null, $mitUhrzeit);
    }
    // Tagesnotizen (ohne Gruppen-Einschränkung, da öffentlicher Feed)
    try {
        $notizRows = DB::fetchAll(
            "SELECT * FROM " . DB::tbl('training_tagesnotizen') . "
              WHERE datum >= (CURDATE() - INTERVAL 60 DAY)
                AND datum <= (CURDATE() + INTERVAL 365 DAY)
           ORDER BY datum, id"
        );
        foreach ($notizRows as $n) {
            $events[] = bauNotizVevent($n);
        }
    } catch (Throwable $e) { /* Tabelle existiert noch nicht */ }
    return wickleIcs($events, 'TuS Oedt – Trainingsplan');
}

function ladeTypenDauerMap(): array {
    $rows = DB::fetchAll('SELECT slug, default_dauer_min FROM ' . DB::tbl('training_typen') . ' WHERE default_dauer_min IS NOT NULL');
    $map = [];
    foreach ($rows as $r) { $map[$r['slug']] = (int)$r['default_dauer_min']; }
    return $map;
}

function buildIcsForUser(int $userId, bool $mitUhrzeit = false): string {
    $user = DB::fetchOne('SELECT id, athlet_id FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
    if (!$user) return wickleIcs([], 'TuS Oedt – Mein Trainingsplan');

    // Persönliche Bestzeiten je Referenzdistanz (für Pace-Berechnung)
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

    $typenDauer = ladeTypenDauerMap();

    // Nur Einheiten aus „Mein Plan" des Nutzers (privat_einheiten)
    $privatRows = DB::fetchAll(
        'SELECT p.id, p.datum, p.uhrzeit, p.typ, p.titel, p.bemerkung,
                p.ref_einheit_id, p.erstellt_am, p.geaendert_am,
                e.status, t.name AS tp_name
           FROM ' . DB::tbl('training_privat_einheiten') . ' p
           LEFT JOIN ' . DB::tbl('training_einheiten') . ' e ON e.id = p.ref_einheit_id
           LEFT JOIN ' . DB::tbl('training_treffpunkte') . ' t ON t.id = e.treffpunkt_id
          WHERE p.benutzer_id = ?
            AND p.datum >= (CURDATE() - INTERVAL 60 DAY)
            AND p.datum <= (CURDATE() + INTERVAL 365 DAY)
       ORDER BY p.datum, p.uhrzeit',
        [$userId]
    );

    $events = [];
    foreach ($privatRows as $p) {
        $segs = [];
        if (!empty($p['ref_einheit_id'])) {
            $segs = DB::fetchAll(
                'SELECT * FROM ' . DB::tbl('training_segmente') . ' WHERE einheit_id = ? ORDER BY reihenfolge, id',
                [(int)$p['ref_einheit_id']]
            );
        }
        $p['_dauer_min'] = $typenDauer[$p['typ']] ?? null;
        $uid = 'privat-' . (int)$p['id'] . '@training.tus-oedt.de';
        $events[] = bauVevent($p, $segs, $bestzeiten, $uid, $mitUhrzeit);
    }
    // Tagesnotizen: global (kein gruppe_id) + alle Gruppen des Nutzers
    try {
        $gruppenIds = [];
        if (!empty($user['athlet_id'])) {
            $gRows = DB::fetchAll(
                "SELECT gruppe_id FROM " . DB::tbl('athlet_gruppen') . " WHERE athlet_id = ?",
                [(int)$user['athlet_id']]
            );
            $gruppenIds = array_map(fn($r) => (int)$r['gruppe_id'], $gRows);
        }
        if (empty($gruppenIds)) {
            $notizRows = DB::fetchAll(
                "SELECT * FROM " . DB::tbl('training_tagesnotizen') . "
                  WHERE gruppe_id IS NULL
                    AND datum >= (CURDATE() - INTERVAL 60 DAY)
                    AND datum <= (CURDATE() + INTERVAL 365 DAY)
               ORDER BY datum, id"
            );
        } else {
            $in = implode(',', array_fill(0, count($gruppenIds), '?'));
            $notizRows = DB::fetchAll(
                "SELECT * FROM " . DB::tbl('training_tagesnotizen') . "
                  WHERE (gruppe_id IS NULL OR gruppe_id IN ($in))
                    AND datum >= (CURDATE() - INTERVAL 60 DAY)
                    AND datum <= (CURDATE() + INTERVAL 365 DAY)
               ORDER BY datum, id",
                $gruppenIds
            );
        }
        foreach ($notizRows as $n) {
            $events[] = bauNotizVevent($n);
        }
    } catch (Throwable $e) { /* Tabelle existiert noch nicht */ }
    return wickleIcs($events, 'TuS Oedt – Mein Trainingsplan');
}

function bauNotizVevent(array $n): string {
    $uid   = 'notiz-' . (int)$n['id'] . '@training.tus-oedt.de';
    $stamp = gmdate('Ymd\\THis\\Z');
    $datum = preg_replace('/-/', '', $n['datum']);
    $endTs = strtotime($n['datum'] . ' +1 day');

    $lines = [
        'BEGIN:VEVENT',
        'UID:'      . $uid,
        'DTSTAMP:'  . $stamp,
        'SEQUENCE:' . (int)strtotime($n['geaendert_am'] ?? $n['erstellt_am'] ?? 'now'),
        'DTSTART;VALUE=DATE:' . $datum,
        'DTEND;VALUE=DATE:'   . date('Ymd', $endTs),
        'SUMMARY:📋 ' . icsEsc($n['inhalt']),
        'CATEGORIES:Notiz',
    ];
    $lines[] = 'END:VEVENT';
    return implode("\r\n", array_map('icsFold', $lines));
}

function bauVevent(array $e, array $segs, array $bestzeiten = [], ?string $uid = null, bool $mitUhrzeit = false): string {
    $uid = $uid ?? ('einheit-' . (int)$e['id'] . '@training.tus-oedt.de');
    $stamp = gmdate('Ymd\\THis\\Z');
    $datum = preg_replace('/-/', '', $e['datum']);
    $hatZeit = $mitUhrzeit && !empty($e['uhrzeit']);

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
        $dauerMin = isset($e['_dauer_min']) && $e['_dauer_min'] > 0 ? (int)$e['_dauer_min'] : 90;
        $endTs    = $startTs + $dauerMin * 60;
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
    if (!empty($e['absage_notiz'])) {
        $lines[] = 'COMMENT:' . icsEsc('⚠ Absagegrund: ' . $e['absage_notiz']);
    }

    // Beschreibung: Absagegrund + Bemerkung + Segmente (mit Pace, falls Bestzeiten vorhanden)
    $descLines = [];
    if (!empty($e['absage_notiz'])) {
        $descLines[] = '⚠ ABGESAGT: ' . $e['absage_notiz'];
        $descLines[] = '';
    }
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
        return rtrim(rtrim(number_format($km, 2, ',', ''), '0'), ',') . 'km';
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
        'SELECT slug, bezeichnung, farbe, reihenfolge, fallback_km, default_dauer_min, default_treffpunkt_id
           FROM ' . DB::tbl('training_typen') . '
          WHERE aktiv = 1
          ORDER BY reihenfolge, slug'
    );
    echo json_encode(['ok' => true, 'typen' => array_map(function($r) {
        return [
            'slug'                 => $r['slug'],
            'bezeichnung'          => $r['bezeichnung'],
            'farbe'                => $r['farbe'] ?? '',
            'reihenfolge'          => (int)$r['reihenfolge'],
            'fallback_km'          => $r['fallback_km'] !== null ? (float)$r['fallback_km'] : null,
            'default_dauer_min'    => $r['default_dauer_min'] !== null ? (int)$r['default_dauer_min'] : null,
            'default_treffpunkt_id'=> $r['default_treffpunkt_id'] !== null ? (int)$r['default_treffpunkt_id'] : null,
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
                    t.ist_kein_training, t.hat_strecke, t.default_dauer_min, t.default_treffpunkt_id,
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
                'fallback_km'           => $r['fallback_km'] !== null ? (float)$r['fallback_km'] : null,
                'ist_kein_training'     => !empty($r['ist_kein_training']),
                'hat_strecke'           => !empty($r['hat_strecke']),
                'default_dauer_min'     => $r['default_dauer_min'] !== null ? (int)$r['default_dauer_min'] : null,
                'default_treffpunkt_id' => $r['default_treffpunkt_id'] !== null ? (int)$r['default_treffpunkt_id'] : null,
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
        $farbe            = substr(trim((string)($in['farbe'] ?? '')), 0, 20) ?: null;
        $reihenfolge      = isset($in['reihenfolge']) ? max(0, (int)$in['reihenfolge']) : 99;
        $istKeinTraining  = !empty($in['ist_kein_training']) ? 1 : 0;
        $hatStrecke       = !empty($in['hat_strecke']) ? 1 : 0;
        DB::query(
            'INSERT INTO ' . DB::tbl('training_typen') . ' (slug, bezeichnung, farbe, reihenfolge, aktiv, ist_kein_training, hat_strecke) VALUES (?,?,?,?,1,?,?)',
            [$slug, substr($bezeichnung, 0, 100), $farbe, $reihenfolge, $istKeinTraining, $hatStrecke]
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
        $fallbackKm      = array_key_exists('fallback_km', $in)
            ? ($in['fallback_km'] !== null && $in['fallback_km'] !== ''
                ? round(max(0.0, min(9999.0, (float)$in['fallback_km'])), 2)
                : null)
            : ($row['fallback_km'] !== null ? (float)$row['fallback_km'] : null);
        $istKeinTraining = array_key_exists('ist_kein_training', $in)
            ? (!empty($in['ist_kein_training']) ? 1 : 0)
            : (int)$row['ist_kein_training'];
        $hatStrecke      = array_key_exists('hat_strecke', $in)
            ? (!empty($in['hat_strecke']) ? 1 : 0)
            : (int)$row['hat_strecke'];
        $defaultDauerMin = array_key_exists('default_dauer_min', $in)
            ? ($in['default_dauer_min'] !== null && $in['default_dauer_min'] !== ''
                ? max(1, min(600, (int)$in['default_dauer_min'])) : null)
            : ($row['default_dauer_min'] !== null ? (int)$row['default_dauer_min'] : null);
        $defaultTreffpunktId = array_key_exists('default_treffpunkt_id', $in)
            ? ($in['default_treffpunkt_id'] !== null && $in['default_treffpunkt_id'] !== ''
                ? (int)$in['default_treffpunkt_id'] : null)
            : ($row['default_treffpunkt_id'] !== null ? (int)$row['default_treffpunkt_id'] : null);
        DB::query(
            'UPDATE ' . DB::tbl('training_typen') . ' SET bezeichnung=?, farbe=?, reihenfolge=?, aktiv=?, fallback_km=?, ist_kein_training=?, hat_strecke=?, default_dauer_min=?, default_treffpunkt_id=? WHERE slug=?',
            [substr($bezeichnung, 0, 100), $farbe, $reihenfolge, $aktiv, $fallbackKm, $istKeinTraining, $hatStrecke, $defaultDauerMin, $defaultTreffpunktId, $slug]
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
    // Migration: default_dauer_min hinzufügen
    $colDauer = DB::fetchAll("SHOW COLUMNS FROM " . DB::tbl('training_typen') . " LIKE 'default_dauer_min'");
    if (empty($colDauer)) {
        DB::query("ALTER TABLE " . DB::tbl('training_typen') . " ADD COLUMN default_dauer_min SMALLINT UNSIGNED NULL AFTER aktiv");
    }
    // Migration: default_treffpunkt_id hinzufügen
    $colTp = DB::fetchAll("SHOW COLUMNS FROM " . DB::tbl('training_typen') . " LIKE 'default_treffpunkt_id'");
    if (empty($colTp)) {
        DB::query("ALTER TABLE " . DB::tbl('training_typen') . " ADD COLUMN default_treffpunkt_id INT UNSIGNED NULL AFTER default_dauer_min");
    }
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

// ============================================================
// Serientermine
//   POST serien                      → Serie aus Block anlegen (auth)
//   GET  serien/{id}                 → Serieninfo + Termine (auth)
//   PUT  serien/{id}                 → Gesamte Serie aktualisieren (auth + Ersteller/Trainer)
//   PUT  serien/{id}/ab/{datum}      → Ab Datum aktualisieren (auth + Ersteller/Trainer)
//   DEL  serien/{id}                 → Gesamte Serie löschen (auth + Ersteller/Trainer)
//   DEL  serien/{id}/ab/{datum}      → Ab Datum löschen (auth + Ersteller/Trainer)
// ============================================================
function handleSerien(string $method, string $sub): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    $istTrainer = Auth::hasRecht('training_bearbeiten');

    // ── POST / → Neue Serie anlegen ──────────────────────────
    if ($sub === '' && $method === 'POST') {
        $in        = readJsonBody();
        $blockId   = isset($in['block_id']) ? (int)$in['block_id'] : 0;
        $startdatum = trim((string)($in['startdatum'] ?? ''));
        $uhrzeit   = isset($in['uhrzeit']) && $in['uhrzeit'] !== '' ? (string)$in['uhrzeit'] : null;
        $tpIdRaw   = $in['treffpunkt_id'] ?? null;
        $tpId      = ($tpIdRaw !== null && $tpIdRaw !== '') ? (int)$tpIdRaw : null;
        $sicht     = in_array($in['sichtbarkeit'] ?? '', ['oeffentlich', 'intern'], true)
                     ? $in['sichtbarkeit'] : 'oeffentlich';
        $serieGruppeId = isset($in['gruppe_id']) && $in['gruppe_id'] !== '' && $in['gruppe_id'] !== null
                     ? (int)$in['gruppe_id'] : null;
        $regel     = is_array($in['regel'] ?? null) ? $in['regel'] : [];

        if (!$blockId || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $startdatum)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => '"block_id" und "startdatum" erforderlich']);
            return;
        }
        if (empty($regel['freq']) || !in_array($regel['freq'], ['daily', 'weekly', 'monthly'], true)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => '"regel.freq" (daily|weekly|monthly) erforderlich']);
            return;
        }

        $block = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_bloecke') . ' WHERE id = ?', [$blockId]);
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

        $daten = generiereOccurrences($startdatum, $regel);
        if (empty($daten)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Termine generiert. Wiederholungsregel prüfen.']);
            return;
        }

        $segs = DB::fetchAll(
            'SELECT * FROM ' . DB::tbl('training_block_segmente') . '
              WHERE block_id = ? ORDER BY reihenfolge, id',
            [$blockId]
        );
        $segArr = array_map(fn($s) => [
            'wiederholungen' => $s['wiederholungen'],
            'distanz_m'      => $s['distanz_m'],
            'pause_m'        => $s['pause_m'],
            'pause_typ'      => $s['pause_typ'],
            'pace_referenz'  => $s['pace_referenz'],
            'notiz'          => $s['notiz'],
            'block_id'       => $s['gruppen_id'],
        ], $segs);

        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            DB::query(
                'INSERT INTO ' . DB::tbl('training_serien') . '
                 (block_id, titel, typ, treffpunkt_id, uhrzeit, sichtbarkeit, regel, erstellt_von)
                 VALUES (?,?,?,?,?,?,?,?)',
                [
                    $blockId,
                    $block['titel'],
                    $block['typ'],
                    $tpId,
                    $uhrzeit,
                    $sicht,
                    json_encode($regel, JSON_UNESCAPED_UNICODE),
                    (int)$user['id'],
                ]
            );
            $serieId = (int)DB::lastInsertId();

            foreach ($daten as $datum) {
                DB::query(
                    'INSERT INTO ' . DB::tbl('training_einheiten') . '
                     (datum, uhrzeit, typ, titel, treffpunkt_id, komoot_url, bemerkung,
                      sichtbarkeit, status, serie_id, gruppe_id, erstellt_von)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                    [
                        $datum,
                        $uhrzeit,
                        $block['typ'],
                        $block['titel'],
                        $tpId,
                        $block['komoot_url'] ?? null,
                        $block['bemerkung'] ?? null,
                        $sicht,
                        'geplant',
                        $serieId,
                        $serieGruppeId,
                        (int)$user['id'],
                    ]
                );
                replaceSegmente((int)DB::lastInsertId(), $segArr);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        echo json_encode(['ok' => true, 'serie_id' => $serieId, 'count' => count($daten)]);
        return;
    }

    // ── GET {id} → Serieninfo ────────────────────────────────
    if (ctype_digit($sub) && $method === 'GET') {
        $serieId = (int)$sub;
        $serie   = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_serien') . ' WHERE id = ?', [$serieId]);
        if (!$serie) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Serie nicht gefunden']);
            return;
        }
        $einheiten = DB::fetchAll(
            'SELECT id, datum, uhrzeit, status FROM ' . DB::tbl('training_einheiten') . '
              WHERE serie_id = ? ORDER BY datum, uhrzeit',
            [$serieId]
        );
        echo json_encode([
            'ok'        => true,
            'serie'     => [
                'id'          => (int)$serie['id'],
                'titel'       => $serie['titel'],
                'typ'         => $serie['typ'],
                'regel'       => json_decode((string)$serie['regel'], true),
                'erstellt_am' => $serie['erstellt_am'],
            ],
            'einheiten' => array_map(fn($e) => [
                'id'     => (int)$e['id'],
                'datum'  => $e['datum'],
                'status' => $e['status'],
            ], $einheiten),
        ]);
        return;
    }

    // ── DELETE {id} → Gesamte Serie löschen ─────────────────
    if (ctype_digit($sub) && $method === 'DELETE') {
        $serieId = (int)$sub;
        $serie   = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_serien') . ' WHERE id = ?', [$serieId]);
        if (!$serie) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Serie nicht gefunden']);
            return;
        }
        if ((int)$serie['erstellt_von'] !== (int)$user['id'] && !$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        DB::query('DELETE FROM ' . DB::tbl('training_einheiten') . ' WHERE serie_id = ?', [$serieId]);
        DB::query('DELETE FROM ' . DB::tbl('training_serien') . ' WHERE id = ?', [$serieId]);
        echo json_encode(['ok' => true]);
        return;
    }

    // ── DELETE {id}/ab/{datum} → Ab Datum löschen ───────────
    if (preg_match('#^(\d+)/ab/(\d{4}-\d{2}-\d{2})$#', $sub, $m) && $method === 'DELETE') {
        $serieId = (int)$m[1];
        $abDatum = $m[2];
        $serie   = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_serien') . ' WHERE id = ?', [$serieId]);
        if (!$serie) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Serie nicht gefunden']);
            return;
        }
        if ((int)$serie['erstellt_von'] !== (int)$user['id'] && !$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        DB::query(
            'DELETE FROM ' . DB::tbl('training_einheiten') . ' WHERE serie_id = ? AND datum >= ?',
            [$serieId, $abDatum]
        );
        $rest = DB::fetchOne(
            'SELECT COUNT(*) AS n FROM ' . DB::tbl('training_einheiten') . ' WHERE serie_id = ?',
            [$serieId]
        );
        if ((int)($rest['n'] ?? 0) === 0) {
            DB::query('DELETE FROM ' . DB::tbl('training_serien') . ' WHERE id = ?', [$serieId]);
        }
        echo json_encode(['ok' => true]);
        return;
    }

    // ── PUT {id} | PUT {id}/ab/{datum} → Serie (bzw. ab Datum) aktualisieren ──
    // Wendet die übergebenen Felder auf alle (bzw. ab Datum folgende) Termine an.
    // Das Datum wird NIE übernommen – jeder Termin behält sein eigenes Datum.
    if ($method === 'PUT' && preg_match('#^(\d+)(?:/ab/(\d{4}-\d{2}-\d{2}))?$#', $sub, $m)) {
        $serieId = (int)$m[1];
        $abDatum = $m[2] ?? null;
        $serie   = DB::fetchOne('SELECT * FROM ' . DB::tbl('training_serien') . ' WHERE id = ?', [$serieId]);
        if (!$serie) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Serie nicht gefunden']);
            return;
        }
        if ((int)$serie['erstellt_von'] !== (int)$user['id'] && !$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        $in = readJsonBody();

        // Nur tatsächlich übergebene Felder aktualisieren (datum ausgenommen)
        $sets = [];
        $vals = [];
        if (array_key_exists('uhrzeit', $in))       { $sets[] = 'uhrzeit=?';       $vals[] = ($in['uhrzeit'] !== '' ? $in['uhrzeit'] : null); }
        if (array_key_exists('typ', $in))           { $sets[] = 'typ=?';           $vals[] = $in['typ'] ?: 'frei'; }
        if (array_key_exists('titel', $in))         { $sets[] = 'titel=?';         $vals[] = (string)$in['titel']; }
        if (array_key_exists('treffpunkt_id', $in)) { $sets[] = 'treffpunkt_id=?'; $vals[] = ($in['treffpunkt_id'] !== '' && $in['treffpunkt_id'] !== null ? (int)$in['treffpunkt_id'] : null); }
        if (array_key_exists('komoot_url', $in))    { $sets[] = 'komoot_url=?';    $vals[] = ($in['komoot_url'] !== '' && $in['komoot_url'] !== null ? substr((string)$in['komoot_url'], 0, 500) : null); }
        if (array_key_exists('bemerkung', $in))     { $sets[] = 'bemerkung=?';     $vals[] = ($in['bemerkung'] !== '' ? $in['bemerkung'] : null); }
        if (array_key_exists('sichtbarkeit', $in))  { $sets[] = 'sichtbarkeit=?';  $vals[] = (in_array($in['sichtbarkeit'] ?? '', ['oeffentlich', 'intern'], true) ? $in['sichtbarkeit'] : 'oeffentlich'); }
        if (array_key_exists('status', $in))        { $sets[] = 'status=?';        $vals[] = $in['status'] ?: 'geplant'; }
        if (array_key_exists('gruppe_id', $in))     { $sets[] = 'gruppe_id=?';     $vals[] = ($in['gruppe_id'] !== '' && $in['gruppe_id'] !== null ? (int)$in['gruppe_id'] : null); }
        $hatSeg = array_key_exists('segmente', $in);

        $params = [$serieId];
        $whereDatum = '';
        if ($abDatum !== null) { $whereDatum = ' AND datum >= ?'; $params[] = $abDatum; }
        $ziele = DB::fetchAll(
            'SELECT id FROM ' . DB::tbl('training_einheiten') . ' WHERE serie_id = ?' . $whereDatum,
            $params
        );

        $pdo = DB::get();
        $pdo->beginTransaction();
        try {
            foreach ($ziele as $z) {
                $eid = (int)$z['id'];
                if ($sets) {
                    DB::query(
                        'UPDATE ' . DB::tbl('training_einheiten') . ' SET ' . implode(', ', $sets) . ' WHERE id = ?',
                        array_merge($vals, [$eid])
                    );
                }
                if ($hatSeg) replaceSegmente($eid, $in['segmente'] ?? []);
            }
            // Serien-Metadaten bei Gesamt-Update mitziehen (nicht bei „ab Datum")
            if ($abDatum === null) {
                $mSets = []; $mVals = [];
                if (array_key_exists('titel', $in))         { $mSets[] = 'titel=?';         $mVals[] = (string)$in['titel']; }
                if (array_key_exists('typ', $in))           { $mSets[] = 'typ=?';           $mVals[] = $in['typ'] ?: 'frei'; }
                if (array_key_exists('treffpunkt_id', $in)) { $mSets[] = 'treffpunkt_id=?'; $mVals[] = ($in['treffpunkt_id'] !== '' && $in['treffpunkt_id'] !== null ? (int)$in['treffpunkt_id'] : null); }
                if (array_key_exists('uhrzeit', $in))       { $mSets[] = 'uhrzeit=?';       $mVals[] = ($in['uhrzeit'] !== '' ? $in['uhrzeit'] : null); }
                if (array_key_exists('sichtbarkeit', $in))  { $mSets[] = 'sichtbarkeit=?';  $mVals[] = (in_array($in['sichtbarkeit'] ?? '', ['oeffentlich', 'intern'], true) ? $in['sichtbarkeit'] : 'oeffentlich'); }
                if ($mSets) {
                    DB::query('UPDATE ' . DB::tbl('training_serien') . ' SET ' . implode(', ', $mSets) . ' WHERE id = ?', array_merge($mVals, [$serieId]));
                }
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        echo json_encode(['ok' => true, 'count' => count($ziele)]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Serien-Endpoint nicht gefunden']);
}

/**
 * Erzeugt Datumsliste für eine Wiederholungsregel.
 * Maximal 200 Termine, maximal 2 Jahre ab Startdatum.
 *
 * @param string $startDatum YYYY-MM-DD
 * @param array  $regel      [freq, interval, byday, until, count]
 */
function generiereOccurrences(string $startDatum, array $regel, int $maxTermine = 200): array
{
    $freq     = $regel['freq']     ?? 'weekly';
    $interval = max(1, (int)($regel['interval'] ?? 1));
    $byday    = is_array($regel['byday'] ?? null) ? $regel['byday'] : [];
    $until    = (isset($regel['until']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $regel['until']))
                ? $regel['until'] : null;
    $count    = (isset($regel['count']) && is_numeric($regel['count']) && (int)$regel['count'] > 0)
                ? (int)$regel['count'] : null;

    // Safety cap: 2 Jahre ab Startdatum
    $safeUntil = date('Y-m-d', strtotime($startDatum . ' +2 years'));
    if (!$until && !$count) $until = $safeUntil;
    if ($until && $until > $safeUntil) $until = $safeUntil;

    // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa (wie PHP date('w'))
    $dayMap = ['SU' => 0, 'MO' => 1, 'TU' => 2, 'WE' => 3, 'TH' => 4, 'FR' => 5, 'SA' => 6];
    $targetDays = [];
    foreach ($byday as $d) {
        if (isset($dayMap[strtoupper((string)$d)])) {
            $targetDays[] = $dayMap[strtoupper((string)$d)];
        }
    }
    sort($targetDays);

    $dates = [];
    $n     = 0;

    if ($freq === 'daily') {
        $cur = $startDatum;
        while ($n < $maxTermine) {
            if ($until && $cur > $until) break;
            if ($count && $n >= $count) break;
            $dates[] = $cur;
            $n++;
            $cur = date('Y-m-d', strtotime($cur . " +{$interval} day"));
        }
    } elseif ($freq === 'weekly') {
        if (empty($targetDays)) {
            $targetDays = [(int)date('w', strtotime($startDatum))];
        }
        // Sonntagsanker der Startwoche
        $startTs  = strtotime($startDatum);
        $startDow = (int)date('w', $startTs);
        $sunTs    = $startTs - $startDow * 86400;

        $weekTs = $sunTs;
        while ($n < $maxTermine) {
            foreach ($targetDays as $dow) {
                $dateTs  = $weekTs + $dow * 86400;
                $dateStr = date('Y-m-d', $dateTs);
                if ($dateStr < $startDatum) continue;
                if ($until && $dateStr > $until) break 2;
                if ($count && $n >= $count) break 2;
                $dates[] = $dateStr;
                $n++;
                if ($n >= $maxTermine) break 2;
            }
            $weekTs += $interval * 7 * 86400;
        }
    } elseif ($freq === 'monthly') {
        $parts   = explode('-', $startDatum);
        $y       = (int)$parts[0];
        $m       = (int)$parts[1];
        $origDay = (int)$parts[2];

        while ($n < $maxTermine) {
            $maxDay  = (int)date('t', mktime(0, 0, 0, $m, 1, $y));
            $useDay  = min($origDay, $maxDay);
            $dateStr = sprintf('%04d-%02d-%02d', $y, $m, $useDay);
            if ($until && $dateStr > $until) break;
            if ($count && $n >= $count) break;
            $dates[] = $dateStr;
            $n++;
            $m += $interval;
            while ($m > 12) { $m -= 12; $y++; }
        }
    }

    return $dates;
}

// ============================================================
// Weg-Präferenzen: Typ + Treffpunkt → km An-/Abreise
//   GET  weg/prefs   → Konfiguration + verfügbare Treffpunkte
//   PUT  weg/prefs   → Konfiguration speichern
// ============================================================
function handleWeg(string $method, string $sub): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    $userId = (int)$user['id'];

    if ($sub === 'prefs' && $method === 'GET') {
        handleWegPrefsGet($userId);
        return;
    }
    if ($sub === 'prefs' && $method === 'PUT') {
        handleWegPrefsSet($userId);
        return;
    }
    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Weg-Endpoint nicht gefunden']);
}

function ladeWegPrefs(int $userId): array
{
    $row = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
    $prefs = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
    if (!is_array($prefs)) $prefs = [];
    $saved = is_array($prefs['training_weg_prefs'] ?? null) ? $prefs['training_weg_prefs'] : [];
    return array_values($saved);
}

function speichereWegPrefs(int $userId, array $config): void
{
    $row      = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
    $existing = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
    if (!is_array($existing)) $existing = [];
    $existing['training_weg_prefs'] = $config;
    DB::query(
        'UPDATE ' . DB::tbl('benutzer') . ' SET prefs = ? WHERE id = ?',
        [json_encode($existing, JSON_UNESCAPED_UNICODE), $userId]
    );
}

function handleWegPrefsGet(int $userId): void
{
    $prefs = ladeWegPrefs($userId);
    $treffpunkte = DB::fetchAll(
        'SELECT id, name FROM ' . DB::tbl('training_treffpunkte') . ' ORDER BY name',
        []
    );
    echo json_encode([
        'ok'          => true,
        'prefs'       => $prefs,
        'treffpunkte' => $treffpunkte,
    ]);
}

function handleWegPrefsSet(int $userId): void
{
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body) || !array_key_exists('config', $body)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'fehler' => 'Ungültige Daten']);
        return;
    }
    $validated = [];
    $seen = [];
    foreach ((array)$body['config'] as $entry) {
        if (!is_array($entry)) continue;
        $typ = trim((string)($entry['typ'] ?? ''));
        if (!preg_match('/^[a-z_]{1,50}$/', $typ)) continue;
        $tpId = (isset($entry['treffpunkt_id']) && is_numeric($entry['treffpunkt_id']))
            ? (int)$entry['treffpunkt_id'] : null;
        $km = (isset($entry['km']) && is_numeric($entry['km']) && (float)$entry['km'] > 0)
            ? round((float)$entry['km'], 2) : null;
        if (!$km) continue;
        $key = $typ . '|' . ($tpId ?? '');
        if (isset($seen[$key])) continue; // Duplikate überspringen
        $seen[$key] = true;
        $validated[] = ['typ' => $typ, 'treffpunkt_id' => $tpId, 'km' => $km];
    }
    speichereWegPrefs($userId, $validated);
    echo json_encode(['ok' => true]);
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
        // Gruppen-Zuordnungen laden und den Blöcken anhängen
        $blockIds = array_column($rows, 'id');
        $gruppenMap = [];
        if (!empty($blockIds)) {
            $placeholders = implode(',', array_fill(0, count($blockIds), '?'));
            $grRows = DB::fetchAll(
                "SELECT block_id, gruppe_id FROM " . DB::tbl('training_block_gruppen') . "
                  WHERE block_id IN ($placeholders)",
                array_map('intval', $blockIds)
            );
            foreach ($grRows as $gr) {
                $gruppenMap[(int)$gr['block_id']][] = (int)$gr['gruppe_id'];
            }
        }
        $mapped = array_map(function ($r) use ($gruppenMap) {
            $b = mapBlock($r);
            $b['gruppen_ids'] = $gruppenMap[(int)$r['id']] ?? [];
            return $b;
        }, $rows);
        echo json_encode(['ok' => true, 'bloecke' => $mapped]);
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
            $gruppeId = isset($in['gruppe_id']) && $in['gruppe_id'] !== '' && $in['gruppe_id'] !== null
                ? (int)$in['gruppe_id'] : null;
            DB::query(
                'INSERT INTO ' . DB::tbl('training_einheiten') . '
                 (datum, uhrzeit, typ, titel, treffpunkt_id, komoot_url, bemerkung, sichtbarkeit, status, gruppe_id, erstellt_von)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)',
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
                    $gruppeId,
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
            if (isset($in['gruppen_ids'])) {
                replaceBlockGruppen($id, (array)$in['gruppen_ids']);
            }
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
            if (array_key_exists('gruppen_ids', $in)) {
                replaceBlockGruppen($id, (array)$in['gruppen_ids']);
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

function replaceBlockGruppen(int $blockId, array $gruppenIds): void {
    $tbl = DB::tbl('training_block_gruppen');
    DB::query("DELETE FROM $tbl WHERE block_id = ?", [$blockId]);
    foreach ($gruppenIds as $gid) {
        $gid = (int)$gid;
        if ($gid <= 0) continue;
        DB::query("INSERT IGNORE INTO $tbl (block_id, gruppe_id) VALUES (?,?)", [$blockId, $gid]);
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
        'bemerkung'        => $r['bemerkung'],
        'absage_notiz'     => $r['absage_notiz'] ?? null,
        'abgesagt_von_name'=> $r['abgesagt_von_name'] ?? null,
        'sichtbarkeit'     => $r['sichtbarkeit'] ?? 'oeffentlich',
        'status'        => $r['status'] ?? 'geplant',
        'serie_id'      => isset($r['serie_id']) && $r['serie_id'] !== null ? (int)$r['serie_id'] : null,
        'gruppe_id'     => isset($r['gruppe_id']) && $r['gruppe_id'] !== null ? (int)$r['gruppe_id'] : null,
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
/** Anzeigename eines Benutzers (Vorname Nachname › E-Mail › Benutzername). */
function _benutzerAnzeigename(array $b): string
{
    $vn = trim((string)(($b['vorname'] ?? '') . ' ' . ($b['nachname'] ?? '')));
    if ($vn !== '') return $vn;
    if (!empty($b['email']))        return (string)$b['email'];
    if (!empty($b['benutzername'])) return (string)$b['benutzername'];
    return '#' . (int)($b['id'] ?? 0);
}

/** Freigabe-Stufe, die $trainerId für den privaten Plan von $besitzerId hat. */
function _planFreigabeStufe(int $besitzerId, int $trainerId): string
{
    if ($besitzerId === $trainerId) return 'voll';
    try {
        $row = DB::fetchOne(
            'SELECT stufe FROM ' . DB::tbl('training_plan_freigaben') . '
             WHERE besitzer_id = ? AND trainer_id = ?',
            [$besitzerId, $trainerId]
        );
    } catch (Throwable $e) { return 'nicht'; }
    $s = $row['stufe'] ?? '';
    return in_array($s, ['lesend', 'voll'], true) ? $s : 'nicht';
}

function handleMeinPlan(string $method, string $tail): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    $userId = (int)$user['id'];

    // ── Übersicht aller persönlichen Pläne (nur Trainer/Admin) ──
    // Listet ALLE Athleten mit ≥1 privater Einheit – auch ohne Zugriff.
    if ($tail === 'uebersicht' && $method === 'GET') {
        if (!in_array($user['rolle'] ?? '', ['admin', 'trainer'], true)) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Nur Trainer/Admins']);
            return;
        }
        // vorname/nachname liegen in der athleten-Tabelle (via athlet_id), nicht in benutzer
        $rows = DB::fetchAll(
            'SELECT p.benutzer_id, COUNT(*) AS anzahl, MAX(p.datum) AS letztes,
                    a.vorname, a.nachname, b.email, b.benutzername, b.rolle,
                    f.stufe AS meine_stufe
               FROM ' . DB::tbl('training_privat_einheiten') . ' p
               JOIN ' . DB::tbl('benutzer') . ' b ON b.id = p.benutzer_id
          LEFT JOIN ' . DB::tbl('athleten') . ' a ON a.id = b.athlet_id
          LEFT JOIN ' . DB::tbl('training_plan_freigaben') . ' f
                    ON f.besitzer_id = p.benutzer_id AND f.trainer_id = ?
           GROUP BY p.benutzer_id
           ORDER BY a.nachname, a.vorname, b.benutzername',
            [$userId]
        );
        $athleten = array_map(function ($r) use ($userId) {
            $bid   = (int)$r['benutzer_id'];
            $stufe = $bid === $userId ? 'voll'
                   : (in_array($r['meine_stufe'] ?? '', ['lesend', 'voll'], true) ? $r['meine_stufe'] : 'nicht');
            return [
                'benutzer_id' => $bid,
                'name'        => _benutzerAnzeigename($r),
                'rolle'       => $r['rolle'] ?? null,
                'anzahl'      => (int)$r['anzahl'],
                'letztes'     => $r['letztes'] ?? null,
                'meine_stufe' => $stufe,
                'ich'         => $bid === $userId,
            ];
        }, $rows);
        echo json_encode(['ok' => true, 'athleten' => $athleten]);
        return;
    }

    // ── Ziel-Benutzer auflösen: ?fuer=<id> erlaubt Trainern/Admins den
    // Zugriff auf einen freigegebenen Plan eines Athleten. ──
    $ownerId = $userId;
    $fuer    = isset($_GET['fuer']) ? (int)$_GET['fuer'] : 0;
    if ($fuer > 0 && $fuer !== $userId) {
        $istTrainer = in_array($user['rolle'] ?? '', ['admin', 'trainer'], true);
        $stufe      = $istTrainer ? _planFreigabeStufe($fuer, $userId) : 'nicht';
        $schreibend = in_array($method, ['POST', 'PUT', 'DELETE'], true);
        if ($stufe === 'nicht' || ($schreibend && $stufe !== 'voll')) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Kein Zugriff auf diesen Plan']);
            return;
        }
        $ownerId = $fuer;
    }

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

        // Aktive Abos + Auto-Sync nur für den eigenen Plan (nicht beim
        // Ansehen eines fremden, freigegebenen Plans).
        $aboTypen = [];
        if ($ownerId === $userId) {
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
        }

        // Gruppen des Benutzers laden (aus Statistikportal + eigene Zuordnung)
        $meineGruppen    = [];
        $meineGruppenIds = [];
        try {
            // athlet_id direkt aus DB (Fallback falls Session es nicht enthält)
            $athletId = isset($user['athlet_id']) && $user['athlet_id'] ? (int)$user['athlet_id'] : 0;
            if ($athletId === 0) {
                $bRow = DB::fetchOne('SELECT athlet_id FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
                if ($bRow && !empty($bRow['athlet_id'])) $athletId = (int)$bRow['athlet_id'];
            }
            // Stat-Gruppen via athlet_gruppen + eigene via training_benutzer_gruppen
            $statGruppenIds = [];
            if ($athletId > 0) {
                $statRows = DB::fetchAll(
                    'SELECT gruppe_id FROM ' . DB::tbl('athlet_gruppen') . ' WHERE athlet_id = ?',
                    [$athletId]
                );
                $statGruppenIds = array_map(fn($r) => (int)$r['gruppe_id'], $statRows);
            }
            $eigeneRows = DB::fetchAll(
                'SELECT gruppe_id FROM ' . DB::tbl('training_benutzer_gruppen') . ' WHERE benutzer_id = ?',
                [$userId]
            );
            $eigeneIds = array_map(fn($r) => (int)$r['gruppe_id'], $eigeneRows);
            $alleIds   = array_values(array_unique(array_merge($statGruppenIds, $eigeneIds)));
            if ($alleIds) {
                $in = implode(',', array_fill(0, count($alleIds), '?'));
                $gRows = DB::fetchAll("SELECT id, name FROM " . DB::tbl('gruppen') . " WHERE id IN ($in) ORDER BY name", $alleIds);
                $meineGruppen = array_map(fn($g) => [
                    'id'    => (int)$g['id'],
                    'name'  => $g['name'],
                    'farbe' => null,
                ], $gRows);
            }
        } catch (Throwable $_) {}
        $meineGruppenIds = array_column($meineGruppen, 'id');

        $rows = DB::fetchAll(
            'SELECT e.*, t.name AS tp_name, t.lat AS tp_lat, t.lng AS tp_lng,
                    COALESCE(CONCAT(av_a.vorname, \' \', av_a.nachname), av_b.benutzername) AS abgesagt_von_name
               FROM ' . DB::tbl('training_einheiten') . ' e
               LEFT JOIN ' . DB::tbl('training_treffpunkte') . ' t ON t.id = e.treffpunkt_id
               LEFT JOIN ' . DB::tbl('benutzer') . ' av_b ON av_b.id = e.abgesagt_von
               LEFT JOIN ' . DB::tbl('athleten')  . " av_a ON av_a.id = av_b.athlet_id
              WHERE e.datum BETWEEN ? AND ?
                AND e.sichtbarkeit IN ('oeffentlich','intern')
           ORDER BY e.datum, e.uhrzeit",
            [$von, $bis]
        );
        $privatRows = DB::fetchAll(
            'SELECT p.*, e.treffpunkt_id AS ref_treffpunkt_id
               FROM ' . DB::tbl('training_privat_einheiten') . ' p
               LEFT JOIN ' . DB::tbl('training_einheiten') . ' e ON e.id = p.ref_einheit_id
              WHERE p.benutzer_id = ? AND p.datum BETWEEN ? AND ?
              ORDER BY p.datum',
            [$ownerId, $von, $bis]
        );

        // Segment-km für adoptierte Einheiten dynamisch berechnen (distanz_m + pause_m)
        // → Kalender und Modal zeigen immer denselben Wert
        $refIds = array_values(array_filter(array_column($privatRows, 'ref_einheit_id')));
        $segKmByEinheit = [];
        if ($refIds) {
            $placeholders = implode(',', array_fill(0, count($refIds), '?'));
            $segRows = DB::fetchAll(
                "SELECT einheit_id, wiederholungen, distanz_m, pause_m
                   FROM " . DB::tbl('training_segmente') . "
                  WHERE einheit_id IN ($placeholders)",
                $refIds
            );
            foreach ($segRows as $sr) {
                $eid = (int)$sr['einheit_id'];
                $wdh = max(1, (int)$sr['wiederholungen']);
                $km  = $wdh * (((int)$sr['distanz_m'] + (int)($sr['pause_m'] ?? 0)) / 1000.0);
                $segKmByEinheit[$eid] = ($segKmByEinheit[$eid] ?? 0.0) + $km;
            }
        }
        $privatMapped = array_map(function ($r) use ($segKmByEinheit) {
            $mapped = mapPrivatEinheit($r);
            // Berechneten km aus Segmenten nehmen wenn vorhanden (überschreibt gespeicherten Wert)
            $refId = $mapped['ref_einheit_id'];
            if ($refId && isset($segKmByEinheit[$refId]) && $segKmByEinheit[$refId] > 0) {
                $mapped['distanz_km'] = round($segKmByEinheit[$refId], 2);
            }
            return $mapped;
        }, $privatRows);

        echo json_encode([
            'ok'           => true,
            'einheiten'    => array_map('mapEinheit', $rows),
            'privat'       => $privatMapped,
            'abo_typen'    => $aboTypen,
            'meine_gruppen'=> $meineGruppen,
        ]);
        return;
    }

    // ── GET einzelne private Einheit ────────────────────────
    if (preg_match('/^einheiten\/(\d+)$/', $tail, $m) && $method === 'GET') {
        $id  = (int)$m[1];
        $row = DB::fetchOne(
            'SELECT * FROM ' . DB::tbl('training_privat_einheiten') . ' WHERE id = ? AND benutzer_id = ?',
            [$id, $ownerId]
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
                [$ownerId, $refId]
            );
        }
        $uhrzeitIn = isset($in['uhrzeit']) && preg_match('/^\d{2}:\d{2}$/', (string)$in['uhrzeit'])
            ? (string)$in['uhrzeit'] : null;
        DB::query(
            'INSERT INTO ' . DB::tbl('training_privat_einheiten') . '
             (benutzer_id, datum, uhrzeit, typ, titel, distanz_km, bemerkung, ref_einheit_id)
             VALUES (?,?,?,?,?,?,?,?)',
            [
                $ownerId,
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
            [$id, $ownerId]
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
                $ownerId,
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
            [$id, $ownerId]
        );
        if ($privRow && $privRow['ref_einheit_id']) {
            DB::query(
                'INSERT IGNORE INTO ' . DB::tbl('training_abo_skips') . ' (benutzer_id, einheit_id)
                 VALUES (?, ?)',
                [$ownerId, (int)$privRow['ref_einheit_id']]
            );
        }
        DB::query(
            'DELETE FROM ' . DB::tbl('training_privat_einheiten') . ' WHERE id = ? AND benutzer_id = ?',
            [$id, $ownerId]
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
        // treffpunkt_id aus der referenzierten öffentlichen Einheit (für WEG-Matching)
        'treffpunkt_id'  => isset($r['ref_treffpunkt_id']) && $r['ref_treffpunkt_id'] !== null
                                ? (int)$r['ref_treffpunkt_id'] : null,
    ];
}


// ============================================================
// GET /trainingsgruppen → alle Gruppen aus der Statistikportal-Tabelle
// ============================================================
// ============================================================
// GET    /tagesnotizen?von=&bis=[&gruppe_id=] → Liste
// POST   /tagesnotizen                        → anlegen (Trainer/Admin)
// PUT    /tagesnotizen/{id}                   → bearbeiten (Trainer/Admin)
// DELETE /tagesnotizen/{id}                   → löschen (Trainer/Admin)
// ============================================================
function handleTagesnotizen(string $method, string $sub = ''): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }

    $tbl       = DB::tbl('training_tagesnotizen');
    $istTrainer = in_array($user['rolle'] ?? '', ['admin', 'trainer'], true);

    // ── GET /tagesnotizen ────────────────────────────────────────────────────
    if ($method === 'GET' && $sub === '') {
        $von      = $_GET['von']      ?? null;
        $bis      = $_GET['bis']      ?? null;
        $gruppeId = isset($_GET['gruppe_id']) && ctype_digit((string)$_GET['gruppe_id'])
                    ? (int)$_GET['gruppe_id'] : null;

        $where  = '1=1';
        $params = [];
        if ($von) { $where .= ' AND datum >= ?'; $params[] = $von; }
        if ($bis) { $where .= ' AND datum <= ?'; $params[] = $bis; }
        // Gruppe: liefere Notizen ohne Gruppe (global) + Notizen der angefragten Gruppe
        if ($gruppeId !== null) {
            $where .= ' AND (gruppe_id IS NULL OR gruppe_id = ?)';
            $params[] = $gruppeId;
        }

        $rows = DB::fetchAll(
            "SELECT n.id, n.datum, n.inhalt, n.gruppe_id, n.erstellt_von, n.erstellt_am, n.geaendert_am,
                    CONCAT(a.vorname, ' ', a.nachname) AS ersteller_name
               FROM $tbl n
               LEFT JOIN " . DB::tbl('benutzer') . " b ON b.id = n.erstellt_von
               LEFT JOIN " . DB::tbl('athleten')  . " a ON a.id = b.athlet_id
              WHERE $where
           ORDER BY n.datum, n.id",
            $params
        );

        $notizen = array_map(fn($r) => [
            'id'            => (int)$r['id'],
            'datum'         => $r['datum'],
            'inhalt'        => $r['inhalt'],
            'gruppe_id'     => $r['gruppe_id'] !== null ? (int)$r['gruppe_id'] : null,
            'erstellt_von'  => (int)$r['erstellt_von'],
            'ersteller_name'=> $r['ersteller_name'] ?? null,
            'erstellt_am'   => $r['erstellt_am'],
            'geaendert_am'  => $r['geaendert_am'],
        ], $rows);

        echo json_encode(['ok' => true, 'notizen' => $notizen]);
        return;
    }

    // Schreibzugriff: nur Trainer/Admins
    if (!$istTrainer) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'fehler' => 'Nur Trainer und Admins dürfen Tagesnotizen verwalten']);
        return;
    }

    $in = json_decode(file_get_contents('php://input'), true) ?? [];

    // ── POST /tagesnotizen ────────────────────────────────────────────────────
    if ($method === 'POST' && $sub === '') {
        $datum  = trim($in['datum']  ?? '');
        $inhalt = trim($in['inhalt'] ?? '');
        if (!$datum || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $datum)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Ungültiges Datum']);
            return;
        }
        if ($inhalt === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Notiz darf nicht leer sein']);
            return;
        }
        $gruppeId = isset($in['gruppe_id']) && $in['gruppe_id'] !== null && $in['gruppe_id'] !== ''
                    ? (int)$in['gruppe_id'] : null;

        DB::query(
            "INSERT INTO $tbl (datum, inhalt, gruppe_id, erstellt_von) VALUES (?,?,?,?)",
            [$datum, $inhalt, $gruppeId, (int)$user['id']]
        );
        $id = (int)DB::lastInsertId();
        echo json_encode(['ok' => true, 'notiz' => [
            'id'        => $id,
            'datum'     => $datum,
            'inhalt'    => $inhalt,
            'gruppe_id' => $gruppeId,
        ]]);
        return;
    }

    // ── PUT /tagesnotizen/{id} ────────────────────────────────────────────────
    if ($method === 'PUT' && ctype_digit($sub)) {
        $id     = (int)$sub;
        $inhalt = isset($in['inhalt']) ? trim($in['inhalt']) : null;
        $datum  = isset($in['datum'])  ? trim($in['datum'])  : null;
        if ($inhalt !== null && $inhalt === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Notiz darf nicht leer sein']);
            return;
        }
        if ($datum !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $datum)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Ungültiges Datum']);
            return;
        }
        $row = DB::fetchOne("SELECT id FROM $tbl WHERE id = ?", [$id]);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Notiz nicht gefunden']);
            return;
        }
        $sets = []; $vals = [];
        if ($inhalt !== null) { $sets[] = 'inhalt = ?'; $vals[] = $inhalt; }
        if ($datum  !== null) { $sets[] = 'datum = ?';  $vals[] = $datum; }
        if ($sets) {
            $vals[] = $id;
            DB::query("UPDATE $tbl SET " . implode(', ', $sets) . " WHERE id = ?", $vals);
        }
        echo json_encode(['ok' => true]);
        return;
    }

    // ── DELETE /tagesnotizen/{id} ─────────────────────────────────────────────
    if ($method === 'DELETE' && ctype_digit($sub)) {
        $id  = (int)$sub;
        $row = DB::fetchOne("SELECT id FROM $tbl WHERE id = ?", [$id]);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Notiz nicht gefunden']);
            return;
        }
        DB::query("DELETE FROM $tbl WHERE id = ?", [$id]);
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
}

function handleTrainingsgruppen(string $method, string $sub = ''): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }

    $tbl = DB::tbl('gruppen');

    // ── GET /trainingsgruppen → alle Gruppen ────────────────────────────────
    if ($method === 'GET' && $sub === '') {
        $gruppen = [];
        try {
            $rows    = DB::fetchAll("SELECT id, name FROM $tbl ORDER BY name");
            $gruppen = array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], $rows);
        } catch (Throwable $e) {
            // Tabelle existiert nicht (Statistikportal nicht verknüpft) → leere Liste
        }
        echo json_encode(['ok' => true, 'gruppen' => $gruppen]);
        return;
    }

    // ── GET /trainingsgruppen/{id}/mitglieder → Mitglieder + verfügbare Athleten ──
    // Einzige Quelle: athlet_gruppen (dieselbe Tabelle wie Statistikportal).
    // IDs sind immer athlet_id.
    if ($method === 'GET' && preg_match('/^(\d+)\/mitglieder$/', $sub, $m)) {
        $gruppeId = (int)$m[1];
        $tbAthGr  = DB::tbl('athlet_gruppen');
        $tbAth    = DB::tbl('athleten');

        // Aktuelle Mitglieder
        $mitglieder   = [];
        $athIdsMitgl  = [];
        try {
            $rows = DB::fetchAll(
                "SELECT a.id AS athlet_id, a.vorname, a.nachname
                   FROM $tbAthGr ag
                   JOIN $tbAth a ON a.id = ag.athlet_id
                  WHERE ag.gruppe_id = ?
               ORDER BY a.nachname, a.vorname",
                [$gruppeId]
            );
            foreach ($rows as $r) {
                $name = trim(($r['vorname'] ?? '') . ' ' . ($r['nachname'] ?? ''));
                if ($name === '') $name = '#A' . $r['athlet_id'];
                $mitglieder[]             = ['id' => (int)$r['athlet_id'], 'name' => $name];
                $athIdsMitgl[(int)$r['athlet_id']] = true;
            }
        } catch (Throwable $_) {}

        // Verfügbare Athleten (noch nicht in dieser Gruppe)
        $verfuegbar = [];
        try {
            $alle = DB::fetchAll(
                "SELECT id, vorname, nachname FROM $tbAth ORDER BY nachname, vorname"
            );
            foreach ($alle as $a) {
                $id = (int)$a['id'];
                if (!isset($athIdsMitgl[$id])) {
                    $name = trim(($a['vorname'] ?? '') . ' ' . ($a['nachname'] ?? ''));
                    if ($name === '') $name = '#A' . $id;
                    $verfuegbar[] = ['id' => $id, 'name' => $name];
                }
            }
        } catch (Throwable $_) {}

        echo json_encode(['ok' => true, 'mitglieder' => $mitglieder, 'verfuegbar' => $verfuegbar]);
        return;
    }

    // Schreibzugriff: nur Admins
    if (($user['rolle'] ?? '') !== 'admin') {
        http_response_code(403);
        echo json_encode(['ok' => false, 'fehler' => 'Nur Admins dürfen Trainingsgruppen verwalten']);
        return;
    }

    $in = json_decode(file_get_contents('php://input'), true) ?? [];

    // ── PUT /trainingsgruppen/{id}/mitglieder → Mitglieder hinzufügen/entfernen ──
    // add:    [athlet_id, ...]  → INSERT IGNORE in athlet_gruppen
    // remove: [athlet_id, ...]  → DELETE aus athlet_gruppen
    if ($method === 'PUT' && preg_match('/^(\d+)\/mitglieder$/', $sub, $m)) {
        $gruppeId = (int)$m[1];
        $tbAthGr  = DB::tbl('athlet_gruppen');

        $add    = array_map('intval', $in['add']    ?? []);
        $remove = array_map('intval', $in['remove'] ?? []);

        foreach ($add as $athId) {
            if ($athId > 0) DB::query(
                "INSERT IGNORE INTO $tbAthGr (athlet_id, gruppe_id) VALUES (?,?)",
                [$athId, $gruppeId]
            );
        }
        foreach ($remove as $athId) {
            if ($athId > 0) DB::query(
                "DELETE FROM $tbAthGr WHERE athlet_id = ? AND gruppe_id = ?",
                [$athId, $gruppeId]
            );
        }

        echo json_encode(['ok' => true]);
        return;
    }

    // ── POST /trainingsgruppen → neue Gruppe anlegen ────────────────────────
    if ($method === 'POST') {
        $name = trim($in['name'] ?? '');
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Name darf nicht leer sein']);
            return;
        }
        try {
            // Duplikat prüfen
            $exists = DB::fetchOne("SELECT id FROM $tbl WHERE name = ?", [$name]);
            if ($exists) {
                http_response_code(409);
                echo json_encode(['ok' => false, 'fehler' => 'Eine Gruppe mit diesem Namen existiert bereits']);
                return;
            }
            DB::execute("INSERT INTO $tbl (name) VALUES (?)", [$name]);
            $id = (int)DB::lastInsertId();
            echo json_encode(['ok' => true, 'gruppe' => ['id' => $id, 'name' => $name]]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'fehler' => 'Datenbankfehler: ' . $e->getMessage()]);
        }
        return;
    }

    // ── PUT /trainingsgruppen/{id} → Gruppe umbenennen ──────────────────────
    if ($method === 'PUT' && ctype_digit($sub)) {
        $id   = (int)$sub;
        $name = trim($in['name'] ?? '');
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Name darf nicht leer sein']);
            return;
        }
        try {
            $row = DB::fetchOne("SELECT id FROM $tbl WHERE id = ?", [$id]);
            if (!$row) {
                http_response_code(404);
                echo json_encode(['ok' => false, 'fehler' => 'Gruppe nicht gefunden']);
                return;
            }
            // Duplikat prüfen (anderer Datensatz)
            $exists = DB::fetchOne("SELECT id FROM $tbl WHERE name = ? AND id != ?", [$name, $id]);
            if ($exists) {
                http_response_code(409);
                echo json_encode(['ok' => false, 'fehler' => 'Eine Gruppe mit diesem Namen existiert bereits']);
                return;
            }
            DB::execute("UPDATE $tbl SET name = ? WHERE id = ?", [$name, $id]);
            echo json_encode(['ok' => true, 'gruppe' => ['id' => $id, 'name' => $name]]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'fehler' => 'Datenbankfehler: ' . $e->getMessage()]);
        }
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
}

// ============================================================
// GET  /profil/gruppen → Gruppen-Mitgliedschaften des angemeldeten Nutzers
// PUT  /profil/gruppen → Gruppen-Zuordnung direkt in Statistikportal-Tabelle schreiben
//
// Wenn der Nutzer eine Athletenverknüpfung hat (benutzer.athlet_id):
//   → liest/schreibt direkt in athlet_gruppen (Statistikportal)
// Fallback ohne Athletenverknüpfung:
//   → liest/schreibt in training_benutzer_gruppen (Trainingsportal)
// ============================================================
function handleProfil(string $method, string $sub): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    $userId = (int)$user['id'];

    // athlet_id: erst aus Session-Cache, dann direkt aus benutzer-Tabelle
    $athletId = isset($user['athlet_id']) && $user['athlet_id'] ? (int)$user['athlet_id'] : 0;
    if ($athletId === 0) {
        try {
            $b = DB::fetchOne("SELECT athlet_id FROM " . DB::tbl('benutzer') . " WHERE id = ?", [$userId]);
            if ($b && !empty($b['athlet_id'])) $athletId = (int)$b['athlet_id'];
        } catch (Throwable $e) {}
    }

    if ($sub === 'gruppen' && $method === 'GET') {
        $ids = [];
        if ($athletId > 0) {
            // Primäre Quelle: Statistikportal-Tabelle athlet_gruppen
            try {
                $rows = DB::fetchAll(
                    "SELECT gruppe_id FROM " . DB::tbl('athlet_gruppen') . " WHERE athlet_id = ?",
                    [$athletId]
                );
                $ids = array_map(fn($r) => (int)$r['gruppe_id'], $rows);
            } catch (Throwable $e) {}
        } else {
            // Fallback für Nutzer ohne Athletenverknüpfung
            try {
                $rows = DB::fetchAll(
                    "SELECT gruppe_id FROM " . DB::tbl('training_benutzer_gruppen') . " WHERE benutzer_id = ?",
                    [$userId]
                );
                $ids = array_map(fn($r) => (int)$r['gruppe_id'], $rows);
            } catch (Throwable $e) {}
        }
        echo json_encode([
            'ok'          => true,
            'gruppen_ids' => $ids,
            'hat_athlet'  => $athletId > 0,
        ]);
        return;
    }

    if ($sub === 'gruppen' && $method === 'PUT') {
        $in  = readJsonBody();
        $neu = isset($in['gruppen_ids']) && is_array($in['gruppen_ids']) ? $in['gruppen_ids'] : [];
        $neu = array_values(array_filter(array_map('intval', $neu), fn($id) => $id > 0));

        if ($athletId > 0) {
            // Direkt in Statistikportal-Tabelle schreiben
            DB::query(
                "DELETE FROM " . DB::tbl('athlet_gruppen') . " WHERE athlet_id = ?",
                [$athletId]
            );
            foreach ($neu as $gid) {
                DB::query(
                    "INSERT IGNORE INTO " . DB::tbl('athlet_gruppen') . " (athlet_id, gruppe_id) VALUES (?,?)",
                    [$athletId, $gid]
                );
            }
        } else {
            // Fallback für Nutzer ohne Athletenverknüpfung
            DB::query(
                "DELETE FROM " . DB::tbl('training_benutzer_gruppen') . " WHERE benutzer_id = ?",
                [$userId]
            );
            foreach ($neu as $gid) {
                DB::query(
                    "INSERT IGNORE INTO " . DB::tbl('training_benutzer_gruppen') . " (benutzer_id, gruppe_id) VALUES (?,?)",
                    [$userId, $gid]
                );
            }
        }
        echo json_encode(['ok' => true]);
        return;
    }

    // ── Plan-Freigaben: an welche Trainer/Admins gebe ich meinen Plan frei? ──
    if ($sub === 'freigaben' && $method === 'GET') {
        // vorname/nachname kommen aus athleten (via athlet_id), nicht aus benutzer
        $trainerRows = DB::fetchAll(
            "SELECT b.id, a.vorname, a.nachname, b.email, b.benutzername, b.rolle
               FROM " . DB::tbl('benutzer') . " b
          LEFT JOIN " . DB::tbl('athleten') . " a ON a.id = b.athlet_id
              WHERE b.rolle IN ('admin','trainer') AND b.aktiv = 1 AND b.id != ?
              ORDER BY a.nachname, a.vorname, b.benutzername",
            [$userId]
        );
        $freigRows = DB::fetchAll(
            "SELECT trainer_id, stufe FROM " . DB::tbl('training_plan_freigaben') . " WHERE besitzer_id = ?",
            [$userId]
        );
        $stufeMap = [];
        foreach ($freigRows as $f) $stufeMap[(int)$f['trainer_id']] = $f['stufe'];

        $trainer = array_map(function ($t) use ($stufeMap) {
            $tid = (int)$t['id'];
            return [
                'id'    => $tid,
                'name'  => _benutzerAnzeigename($t),
                'rolle' => $t['rolle'] ?? null,
                'stufe' => $stufeMap[$tid] ?? 'nicht',
            ];
        }, $trainerRows);
        echo json_encode(['ok' => true, 'trainer' => $trainer]);
        return;
    }

    if ($sub === 'freigaben' && $method === 'PUT') {
        $in    = readJsonBody();
        $freig = (isset($in['freigaben']) && is_array($in['freigaben'])) ? $in['freigaben'] : [];

        // Gültige Trainer/Admin-IDs (gegen Manipulation absichern)
        $validRows = DB::fetchAll(
            "SELECT id FROM " . DB::tbl('benutzer') . "
              WHERE rolle IN ('admin','trainer') AND aktiv = 1 AND id != ?",
            [$userId]
        );
        $valid = array_map(fn($r) => (int)$r['id'], $validRows);

        DB::query("DELETE FROM " . DB::tbl('training_plan_freigaben') . " WHERE besitzer_id = ?", [$userId]);
        foreach ($freig as $tid => $stufe) {
            $tid = (int)$tid;
            if (!in_array($tid, $valid, true)) continue;
            if (!in_array($stufe, ['lesend', 'voll'], true)) continue; // 'nicht' → keine Zeile
            DB::query(
                "INSERT INTO " . DB::tbl('training_plan_freigaben') . " (besitzer_id, trainer_id, stufe) VALUES (?,?,?)",
                [$userId, $tid, $stufe]
            );
        }
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Endpoint nicht gefunden']);
}

// ============================================================
// GET  /planung/gruppen-prefs → Gruppen-Auswahl des Trainers im Planungskalender
// PUT  /planung/gruppen-prefs → Gruppen-Auswahl speichern
// ============================================================
function handlePlanung(string $method, string $tail): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    $userId = (int)$user['id'];

    if ($tail === 'gruppen-prefs') {
        if ($method === 'GET') {
            try {
                $row          = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
                $prefs        = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
                if (!is_array($prefs)) $prefs = [];
                // konfiguriert=false → Schlüssel noch nie gesetzt (Erstbesuch)
                // konfiguriert=true  → Schlüssel existiert, auch wenn leer (bewusst abgewählt)
                $konfiguriert = array_key_exists('planung_gruppen', $prefs);
                $ids          = $konfiguriert ? (array)$prefs['planung_gruppen'] : [];
            } catch (Throwable $e) { $ids = []; $konfiguriert = false; }
            echo json_encode(['ok' => true, 'gruppen_ids' => $ids, 'konfiguriert' => $konfiguriert]);
            return;
        }
        if ($method === 'PUT') {
            $in  = readJsonBody();
            $ids = isset($in['gruppen_ids']) && is_array($in['gruppen_ids'])
                 ? array_map('intval', $in['gruppen_ids']) : [];
            try {
                $row   = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
                $prefs = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
                if (!is_array($prefs)) $prefs = [];
                $prefs['planung_gruppen'] = $ids;
                DB::query('UPDATE ' . DB::tbl('benutzer') . ' SET prefs = ? WHERE id = ?',
                    [json_encode($prefs), $userId]);
            } catch (Throwable $e) {}
            echo json_encode(['ok' => true]);
            return;
        }
    }

    // ── Default-Kalenderfarbe setzen (Trainer/Admin): PUT /planung/kalender-farbe ──
    // Body { key, farbe } → wird in die globale JSON-Einstellung
    // `training_kalender_farben` gemerged. Leere/ungültige Farbe entfernt den Eintrag.
    if ($tail === 'kalender-farbe' && $method === 'PUT') {
        if (!in_array($user['rolle'] ?? '', ['admin', 'trainer'], true)) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung']);
            return;
        }
        $in  = readJsonBody();
        $key = preg_replace('/[^a-z0-9_-]/i', '', (string)($in['key'] ?? ''));
        if ($key === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'key fehlt']);
            return;
        }
        $farbe = trim((string)($in['farbe'] ?? ''));
        $raw   = Settings::get('training_kalender_farben', '');
        $map   = $raw !== '' ? json_decode($raw, true) : [];
        if (!is_array($map)) $map = [];
        if (preg_match('/^#[0-9a-fA-F]{6}$/', $farbe)) {
            $map[$key] = strtolower($farbe);
        } else {
            unset($map[$key]);
        }
        Settings::set('training_kalender_farben', json_encode($map));
        echo json_encode(['ok' => true, 'farben' => (object)$map]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Endpoint nicht gefunden']);
}

// ============================================================
// Kalender-Filter-Präferenzen: GET/PUT /kal/prefs
// ============================================================
function handleKalPrefs(string $method, string $sub): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    $userId = (int)$user['id'];

    if ($sub !== 'prefs' && $sub !== 'farben') {
        http_response_code(404);
        echo json_encode(['ok' => false, 'fehler' => 'Endpoint nicht gefunden']);
        return;
    }

    // ── Persönliche Kalenderfarben-Overrides: GET/PUT /kal/farben ──
    // Map { kalenderKey: "#rrggbb" } im prefs.kal_farben des Athleten.
    if ($sub === 'farben') {
        if ($method === 'GET') {
            $row   = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
            $prefs = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
            if (!is_array($prefs)) $prefs = [];
            $farben = is_array($prefs['kal_farben'] ?? null) ? $prefs['kal_farben'] : [];
            echo json_encode(['ok' => true, 'farben' => (object)$farben]);
            return;
        }
        if ($method === 'PUT') {
            $in     = readJsonBody();
            $farben = sanitizeKalenderFarben(is_array($in) ? $in : []);
            $row    = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
            $prefs  = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
            if (!is_array($prefs)) $prefs = [];
            $prefs['kal_farben'] = $farben;
            DB::query('UPDATE ' . DB::tbl('benutzer') . ' SET prefs = ? WHERE id = ?',
                [json_encode($prefs), $userId]);
            echo json_encode(['ok' => true]);
            return;
        }
        http_response_code(405);
        echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
        return;
    }

    if ($method === 'GET') {
        $row   = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
        $prefs = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
        if (!is_array($prefs)) $prefs = [];
        $kal    = is_array($prefs['kal_filter'] ?? null) ? $prefs['kal_filter'] : null;
        $farben = is_array($prefs['kal_farben'] ?? null) ? $prefs['kal_farben'] : [];
        echo json_encode(['ok' => true, 'prefs' => $kal, 'farben' => (object)$farben]);
        return;
    }

    if ($method === 'PUT') {
        $in   = readJsonBody();
        $row  = DB::fetchOne('SELECT prefs FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);
        $prefs = ($row && $row['prefs']) ? json_decode((string)$row['prefs'], true) : [];
        if (!is_array($prefs)) $prefs = [];
        $prefs['kal_filter'] = $in;
        DB::query('UPDATE ' . DB::tbl('benutzer') . ' SET prefs = ? WHERE id = ?',
            [json_encode($prefs), $userId]);
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
}

// Validiert eine Kalenderfarben-Map: Keys [a-z0-9_-], Werte #rrggbb.
// Ungültige Werte werden verworfen (→ entfernt den Override).
function sanitizeKalenderFarben($in): array {
    $out = [];
    if (!is_array($in)) return $out;
    foreach ($in as $key => $val) {
        $k = preg_replace('/[^a-z0-9_-]/i', '', (string)$key);
        if ($k === '') continue;
        $v = trim((string)$val);
        if (preg_match('/^#[0-9a-fA-F]{6}$/', $v)) {
            $out[$k] = strtolower($v);
        }
    }
    return $out;
}

// ============================================================
// Wettkämpfe – Veranstaltungsserien aus dem Statistikportal
// mit Planungs- und Anmeldungsfunktion
//
// GET  /wettkampf                        → Alle Serien inkl. Disziplinen, Planung, Anmeldungen
// PUT  /wettkampf/{serie_id}/planung     → Nächstes Datum + Extra-Disziplinen setzen (Admin)
// POST /wettkampf/{serie_id}/anmeldungen → Für Disziplin anmelden (erstellt Planung falls nötig)
// DEL  /wettkampf/anmeldungen/{id}       → Anmeldung stornieren
// ============================================================
function handleWettkampf(string $method, string $tail): void
{
    $user = Auth::check();
    // GET (Lesen) ist auch ohne Login erlaubt – Anzeige der Wettkämpfe für Gäste.
    // Schreibende Operationen (Anmeldung/Planung) erfordern weiterhin Login.
    if ($method !== 'GET' && !$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    $userId  = $user ? (int)$user['id'] : 0;
    $isAdmin = $user && in_array($user['rolle'] ?? '', ['admin', 'trainer']);

    $tws = DB::tbl('veranstaltung_serien');
    $tvv = DB::tbl('veranstaltungen');
    $ter = DB::tbl('ergebnisse');
    $tdm = DB::tbl('disziplin_mapping');
    $twp = DB::tbl('training_wettkampf_planung');
    $twa = DB::tbl('training_wettkampf_anmeldungen');
    $tbu = DB::tbl('benutzer');
    $tat = DB::tbl('athleten');

    // ── POST /{serie_id}/anmeldungen ─────────────────────────────
    if (preg_match('/^(\d+)\/anmeldungen$/', $tail, $m) && $method === 'POST') {
        $serieId   = (int)$m[1];
        $in        = readJsonBody();
        $disziplin = trim((string)($in['disziplin'] ?? ''));  // '' = allgemeine Teilnahme
        $bemerkung = trim((string)($in['bemerkung'] ?? '')) ?: null;

        $serie = DB::fetchOne("SELECT id FROM $tws WHERE id=?", [$serieId]);
        if (!$serie) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Serie nicht gefunden']);
            return;
        }

        // Planung holen oder auto-anlegen
        $planung = DB::fetchOne("SELECT id FROM $twp WHERE serie_id=?", [$serieId]);
        if (!$planung) {
            DB::query("INSERT INTO $twp (serie_id) VALUES (?)", [$serieId]);
            $planungId = (int)DB::lastInsertId();
        } else {
            $planungId = (int)$planung['id'];
        }

        // Upsert – Disziplin ändern ist erlaubt
        DB::query(
            "INSERT INTO $twa (planung_id, benutzer_id, disziplin, bemerkung)
             VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE disziplin=VALUES(disziplin), bemerkung=VALUES(bemerkung)",
            [$planungId, $userId, $disziplin, $bemerkung]
        );
        echo json_encode(['ok' => true, 'planung_id' => $planungId]);
        return;
    }

    // ── DELETE /anmeldungen/{id} ──────────────────────────────────
    if (preg_match('/^anmeldungen\/(\d+)$/', $tail, $m) && $method === 'DELETE') {
        $anmId = (int)$m[1];
        $anm   = DB::fetchOne("SELECT id, benutzer_id FROM $twa WHERE id=?", [$anmId]);
        if (!$anm) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Anmeldung nicht gefunden']);
            return;
        }
        if ((int)$anm['benutzer_id'] !== $userId && !$isAdmin) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Kein Zugriff']);
            return;
        }
        DB::query("DELETE FROM $twa WHERE id=?", [$anmId]);
        echo json_encode(['ok' => true]);
        return;
    }

    // ── PUT /{serie_id}/planung ───────────────────────────────────
    if (preg_match('/^(\d+)\/planung$/', $tail, $m) && $method === 'PUT') {
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Nur Admins/Trainer dürfen die Planung bearbeiten']);
            return;
        }
        $serieId = (int)$m[1];
        $in      = readJsonBody();

        $sets   = [];
        $params = [];

        if (array_key_exists('naechstes_datum', $in)) {
            $sets[]   = 'naechstes_datum=?';
            $params[] = ($in['naechstes_datum'] !== null && $in['naechstes_datum'] !== '')
                        ? (string)$in['naechstes_datum'] : null;
        }
        // Metadaten direkt auf veranstaltung_serien speichern
        if (array_key_exists('wettbewerbe', $in)) {
            $arr = is_array($in['wettbewerbe']) ? $in['wettbewerbe'] : [];
            $arr = array_values(array_filter(array_map('trim', $arr)));
            DB::query("UPDATE `{$tws}` SET wettbewerbe=? WHERE id=?",
                [count($arr) ? json_encode($arr) : null, $serieId]);
        }
        if (array_key_exists('url', $in)) {
            $url = trim((string)($in['url'] ?? '')) ?: null;
            DB::query("UPDATE `{$tws}` SET url=? WHERE id=?", [$url, $serieId]);
        }
        if (array_key_exists('ort_id', $in)) {
            $ortId = ($in['ort_id'] !== null && $in['ort_id'] !== '') ? (int)$in['ort_id'] : null;
            DB::query("UPDATE `{$tws}` SET ort_id=? WHERE id=?", [$ortId, $serieId]);
        }
        if (array_key_exists('lat', $in) || array_key_exists('lon', $in)) {
            $lat = (isset($in['lat']) && is_numeric($in['lat'])) ? (float)$in['lat'] : null;
            $lon = (isset($in['lon']) && is_numeric($in['lon'])) ? (float)$in['lon'] : null;
            DB::query("UPDATE `{$tws}` SET lat=?, lon=? WHERE id=?", [$lat, $lon, $serieId]);
        }
        if (array_key_exists('aktiv', $in)) {
            $sets[]   = 'aktiv=?';
            $params[] = $in['aktiv'] ? 1 : 0;
        }

        $planung = DB::fetchOne("SELECT id FROM $twp WHERE serie_id=?", [$serieId]);
        if ($planung) {
            if ($sets) {
                $params[] = $planung['id'];
                DB::query("UPDATE $twp SET " . implode(',', $sets) . " WHERE id=?", $params);
            }
        } else {
            $nd = array_key_exists('naechstes_datum', $in)
                ? (($in['naechstes_datum'] !== null && $in['naechstes_datum'] !== '') ? (string)$in['naechstes_datum'] : null)
                : null;
            $ak = array_key_exists('aktiv', $in) ? ($in['aktiv'] ? 1 : 0) : 1;
            DB::query(
                "INSERT INTO $twp (serie_id, naechstes_datum, aktiv) VALUES (?,?,?)",
                [$serieId, $nd, $ak]
            );
        }
        echo json_encode(['ok' => true]);
        return;
    }

    // ── GET /wettkampf ────────────────────────────────────────────
    if ($method === 'GET' && $tail === '') {
        $tst     = DB::tbl('training_wettkampf_status');
        $curYear = (int)date('Y');
        try {
            $serien = DB::fetchAll(
                "SELECT vs.id, vs.name, vs.kuerzel, vs.wettbewerbe,
                        vs.url, vs.ort_id, vs.lat, vs.lon,
                        COUNT(DISTINCT v.id)      AS anz_veranstaltungen,
                        MIN(v.datum)              AS erstes_datum,
                        MAX(v.datum)              AS letztes_datum_statistik,
                        CASE
                            WHEN MAX(v.datum) IS NULL AND vs.referenz_datum IS NULL THEN NULL
                            ELSE GREATEST(
                                COALESCE(MAX(v.datum),       '1900-01-01'),
                                COALESCE(vs.referenz_datum,  '1900-01-01')
                            )
                        END                       AS letztes_datum,
                        (SELECT v2.ort FROM $tvv v2
                         WHERE v2.serie_id = vs.id
                           AND v2.geloescht_am IS NULL
                           AND v2.genehmigt   = 1
                         ORDER BY v2.datum DESC LIMIT 1) AS ort_letzter,
                        wp.id                     AS planung_id,
                        wp.naechstes_datum,
                        wp.disziplinen_extra,
                        wp.disziplinen_ausgeschlossen,
                        wp.aktiv,
                        tst.status
                 FROM $tws vs
                 LEFT JOIN $tvv v  ON v.serie_id = vs.id
                                   AND v.geloescht_am IS NULL
                                   AND v.genehmigt   = 1
                 LEFT JOIN $twp wp ON wp.serie_id = vs.id
                 LEFT JOIN $tst tst ON tst.serie_id    = vs.id
                                    AND tst.benutzer_id = ?
                                    AND tst.jahr        = ?
                 GROUP BY vs.id, vs.name, vs.kuerzel, vs.wettbewerbe, vs.referenz_datum,
                          vs.url, vs.ort_id, vs.lat, vs.lon,
                          wp.id, wp.naechstes_datum, wp.disziplinen_extra,
                          wp.disziplinen_ausgeschlossen, wp.aktiv, tst.status
                 ORDER BY MONTH(COALESCE(MAX(v.datum), vs.referenz_datum)) ASC,
                          DAY(COALESCE(MAX(v.datum), vs.referenz_datum))   ASC,
                          vs.name             ASC",
                [$userId, $curYear]
            );
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'fehler' => 'Datenbankfehler', 'detail' => $e->getMessage()]);
            return;
        }

        if (empty($serien)) {
            echo json_encode(['ok' => true, 'serien' => []]);
            return;
        }

        $serieIds = array_map(fn($s) => (int)$s['id'], $serien);
        $ph       = implode(',', array_fill(0, count($serieIds), '?'));

        // Disziplinen aus Ergebnissen, sortiert nach Häufigkeit (inkl. Distanz aus disziplin_mapping)
        $diszRows = [];
        try {
            $diszRows = DB::fetchAll(
                "SELECT v.serie_id,
                        COALESCE(dm.anzeige_name, e.disziplin) AS disziplin,
                        MAX(dm.distanz) AS distanz_m,
                        COUNT(*) AS anz
                 FROM $ter e
                 JOIN $tvv v  ON v.id = e.veranstaltung_id
                 LEFT JOIN $tdm dm ON dm.id = e.disziplin_mapping_id
                 WHERE v.serie_id IN ($ph)
                   AND e.geloescht_am IS NULL
                   AND v.geloescht_am IS NULL
                   AND v.genehmigt   = 1
                   AND e.disziplin   IS NOT NULL
                 GROUP BY v.serie_id, COALESCE(dm.anzeige_name, e.disziplin)
                 ORDER BY v.serie_id, COUNT(*) DESC",
                $serieIds
            );
        } catch (\Throwable $e) { /* Disziplinen sind optional */ }

        $diszBySerie  = [];
        $diszDistBySerie = []; // Name → distanz_m
        $seenBySerie  = [];
        foreach ($diszRows as $d) {
            $sid  = (int)$d['serie_id'];
            $disp = $d['disziplin'];
            if (!isset($seenBySerie[$sid])) $seenBySerie[$sid] = [];
            if (in_array($disp, $seenBySerie[$sid], true)) continue;
            $seenBySerie[$sid][] = $disp;
            $diszBySerie[$sid][] = $disp;
            if ($d['distanz_m'] !== null) {
                $diszDistBySerie[$sid][$disp] = (int)$d['distanz_m'];
            }
        }

        // Anmeldungen für alle aktiven Planungen laden (auch für Gäste, damit die
        // Teilnehmerzahl angezeigt werden kann). Namen werden für Gäste unten entfernt.
        $planungIds     = array_values(array_filter(
            array_map(fn($s) => $s['planung_id'] ? (int)$s['planung_id'] : null, $serien)
        ));
        $anmByPlanungId = [];
        if ($planungIds) {
            $phAnm = implode(',', array_fill(0, count($planungIds), '?'));
            try {
                $anmRows = DB::fetchAll(
                    "SELECT a.id, a.planung_id, a.benutzer_id, a.disziplin,
                            COALESCE(
                              NULLIF(TRIM(CONCAT_WS(' ', ath.vorname, ath.nachname)), ''),
                              b.benutzername
                            ) AS anzeige_name
                     FROM $twa a
                     JOIN $tbu b ON b.id = a.benutzer_id
                     LEFT JOIN $tat ath ON ath.id = b.athlet_id
                     WHERE a.planung_id IN ($phAnm)
                     ORDER BY a.id ASC",
                    $planungIds
                );
                foreach ($anmRows as $a) {
                    $pid = (int)$a['planung_id'];
                    $anmByPlanungId[$pid][] = [
                        'id'          => (int)$a['id'],
                        'benutzer_id' => (int)$a['benutzer_id'],
                        'name'        => $a['anzeige_name'] ?? null,
                        'disziplin'   => $a['disziplin'],
                    ];
                }
            } catch (\Throwable $e) { /* Anmeldungen sind optional */ }
        }

        $result = [];
        foreach ($serien as $s) {
            $sid       = (int)$s['id'];
            $pid       = $s['planung_id'] ? (int)$s['planung_id'] : null;
            $diszExtra = [];
            if ($s['disziplinen_extra']) {
                $decoded = json_decode((string)$s['disziplinen_extra'], true);
                if (is_array($decoded)) $diszExtra = $decoded;
            }
            $diszAusgeschlossen = [];
            if (!empty($s['disziplinen_ausgeschlossen'])) {
                $decoded = json_decode((string)$s['disziplinen_ausgeschlossen'], true);
                if (is_array($decoded)) $diszAusgeschlossen = $decoded;
            }
            $anmeldungen    = $pid ? ($anmByPlanungId[$pid] ?? []) : [];
            // Gäste: keine Namen/IDs preisgeben – nur Anzahl + Disziplinverteilung
            if (!$user) {
                $anmeldungen = array_map(fn($a) => [
                    'id'          => 0,
                    'benutzer_id' => 0,
                    'name'        => null,
                    'disziplin'   => $a['disziplin'],
                ], $anmeldungen);
            }
            $meineAnmId     = null;
            $meineDisziplin = null;
            foreach ($anmeldungen as $anm) {
                if ($userId && (int)$anm['benutzer_id'] === $userId) {
                    $meineAnmId     = (int)$anm['id'];
                    $meineDisziplin = $anm['disziplin'];
                    break;
                }
            }
            $result[] = [
                'id'                  => $sid,
                'name'                => $s['name'],
                'kuerzel'             => $s['kuerzel'],
                'anz_veranstaltungen' => (int)$s['anz_veranstaltungen'],
                'erstes_datum'        => $s['erstes_datum'],
                'letztes_datum'           => $s['letztes_datum'],
                'letztes_datum_statistik' => $s['letztes_datum_statistik'],
                'ort_letzter'         => $s['ort_letzter'],
                'disziplinen'              => $diszBySerie[$sid] ?? [],
                'disziplin_distanzen'      => (object)($diszDistBySerie[$sid] ?? []),
                'disziplinen_extra'        => $diszExtra,
                'wettbewerbe'              => $s['wettbewerbe'] ? json_decode((string)$s['wettbewerbe'], true) : [],
                'disziplinen_ausgeschlossen' => $diszAusgeschlossen,
                'planung_id'               => $pid,
                'aktiv'                    => $s['aktiv'] !== null ? (int)$s['aktiv'] : 1,
                'naechstes_datum'     => $s['naechstes_datum'],
                'status'              => $s['status'] ?? null,
                'url'                 => $s['url'] ?? null,
                'ort_id'              => isset($s['ort_id']) && $s['ort_id'] !== null ? (int)$s['ort_id'] : null,
                'lat'                 => isset($s['lat'])    && $s['lat']    !== null ? (float)$s['lat']    : null,
                'lon'                 => isset($s['lon'])    && $s['lon']    !== null ? (float)$s['lon']    : null,
                'anmeldungen'         => $anmeldungen,
                'meine_anmeldung_id'  => $meineAnmId,
                'meine_disziplin'     => $meineDisziplin,
            ];
        }

        echo json_encode(['ok' => true, 'serien' => $result]);
        return;
    }

    // ── GET /wettkampf/disziplinen ────────────────────────────────
    // Alle eindeutigen Disziplinbezeichnungen aus dem Statistikportal.
    // Nur für eingeloggte Nutzer.
    if ($method === 'GET' && $tail === 'disziplinen') {
        if (!$userId) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Login erforderlich']);
            return;
        }
        try {
            // Aus disziplin_mapping: COALESCE(anzeige_name, disziplin) –
            // anzeige_name ist ein optionales Override-Feld, das meist NULL ist;
            // Fallback auf den Pflicht-Rohdisziplin-Namen.
            $mapped = DB::fetchAll(
                "SELECT DISTINCT COALESCE(anzeige_name, disziplin) AS name
                   FROM $tdm
                  WHERE disziplin IS NOT NULL AND disziplin != ''
                  ORDER BY name ASC"
            );
            // Nicht gemappte Rohdisziplinen aus Ergebnissen
            $raw = DB::fetchAll(
                "SELECT DISTINCT e.disziplin AS name
                   FROM $ter e
                  WHERE e.disziplin IS NOT NULL
                    AND e.disziplin != ''
                    AND e.disziplin_mapping_id IS NULL
                    AND e.geloescht_am IS NULL
                  ORDER BY e.disziplin ASC"
            );
            $alle = array_unique(array_merge(
                array_column($mapped, 'name'),
                array_column($raw, 'name')
            ));
            sort($alle);
            echo json_encode(['ok' => true, 'disziplinen' => array_values($alle)]);
        } catch (\Throwable $e) {
            echo json_encode(['ok' => true, 'disziplinen' => [], '_debug' => $e->getMessage()]);
        }
        return;
    }

    // ── GET /wettkampf/orte ───────────────────────────────────────
    // Alle Orte aus dem Statistikportal (für Ort-Picker im Admin-Modal).
    // Nur für eingeloggte Nutzer.
    if ($method === 'GET' && $tail === 'orte') {
        if (!$userId) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'fehler' => 'Login erforderlich']);
            return;
        }
        try {
            $tor  = DB::tbl('orte');
            $rows = DB::fetchAll(
                "SELECT id, name, region, land, land_code, lat, lon, display_name
                   FROM `{$tor}`
                  ORDER BY name ASC"
            );
            $orte = array_map(fn($r) => [
                'id'           => (int)$r['id'],
                'name'         => $r['name'],
                'region'       => $r['region'],
                'land'         => $r['land'],
                'land_code'    => $r['land_code'],
                'lat'          => $r['lat'] !== null ? (float)$r['lat'] : null,
                'lon'          => $r['lon'] !== null ? (float)$r['lon'] : null,
                'display_name' => $r['display_name'],
            ], $rows);
            echo json_encode(['ok' => true, 'orte' => $orte]);
        } catch (\Throwable $e) {
            echo json_encode(['ok' => true, 'orte' => [], '_debug' => $e->getMessage()]);
        }
        return;
    }

    // ── GET /wettkampf/termine?von=YYYY-MM-DD&bis=YYYY-MM-DD ─────
    // Gibt individuelle vergangene Veranstaltungen aus dem Statistikportal zurück.
    // Öffentlich (kein Login erforderlich).
    if ($method === 'GET' && $tail === 'termine') {
        $von = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['von'] ?? '') ? $_GET['von'] : null;
        $bis = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['bis'] ?? '') ? $_GET['bis'] : null;
        if (!$von || !$bis) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Parameter von und bis (YYYY-MM-DD) erforderlich']);
            return;
        }
        try {
            $rows = DB::fetchAll(
                "SELECT v.id, v.datum, v.ort, v.serie_id,
                        COALESCE(vs.name, vs.kuerzel) AS serie_name
                   FROM $tvv v
                   JOIN $tws vs ON vs.id = v.serie_id
                  WHERE v.datum BETWEEN ? AND ?
                    AND v.geloescht_am IS NULL
                    AND v.genehmigt   = 1
                  ORDER BY v.datum ASC",
                [$von, $bis]
            );
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'fehler' => 'Datenbankfehler', 'detail' => $e->getMessage()]);
            return;
        }
        $statistikUrl = Settings::get('statistikportal_url', '');
        $termine = array_map(fn($r) => [
            'id'         => (int)$r['id'],
            'serie_id'   => (int)$r['serie_id'],
            'serie_name' => $r['serie_name'],
            'datum'      => $r['datum'],
            'ort'        => $r['ort'] ?? null,
        ], $rows);
        echo json_encode(['ok' => true, 'termine' => $termine, 'statistikportal_url' => $statistikUrl]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Endpoint nicht gefunden']);
}

// ============================================================
// handleWettkampfplanung – Wettkampfplanung pro Athlet/Jahr
// GET  /wettkampfplanung?jahr=YYYY   → alle Serien + Nutzerstatus
// PUT  /wettkampfplanung/{serie_id}  → Status setzen
// ============================================================
function handleWettkampfplanung(string $method, string $tail): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Login erforderlich']);
        return;
    }
    $userId  = (int)$user['id'];

    $tws = DB::tbl('veranstaltung_serien');
    $tvv = DB::tbl('veranstaltungen');
    $twp = DB::tbl('training_wettkampf_planung');
    $twa = DB::tbl('training_wettkampf_anmeldungen');
    $tst = DB::tbl('training_wettkampf_status');

    // ── GET /wettkampfplanung?jahr=YYYY ───────────────────────────
    if ($method === 'GET' && $tail === '') {
        $jahr = max(2020, min(2035, (int)($_GET['jahr'] ?? (int)date('Y'))));

        $serien = DB::fetchAll("
            SELECT
                vs.id, vs.name, vs.sortierindex, vs.url, vs.wettbewerbe,
                wp.naechstes_datum, COALESCE(wp.aktiv, 1) AS aktiv,
                MAX(vv.datum)                              AS letztes_datum_statistik,
                CASE
                    WHEN MAX(vv.datum) IS NULL AND vs.referenz_datum IS NULL THEN NULL
                    ELSE GREATEST(
                        COALESCE(MAX(vv.datum),      '1900-01-01'),
                        COALESCE(vs.referenz_datum,  '1900-01-01')
                    )
                END                                        AS letztes_datum,
                tst.status,
                (SELECT v2.ort FROM `{$tvv}` v2
                  WHERE v2.serie_id = vs.id AND v2.geloescht_am IS NULL
                  ORDER BY v2.datum DESC LIMIT 1)          AS ort
            FROM `{$tws}` vs
            LEFT JOIN `{$twp}` wp  ON wp.serie_id  = vs.id
            LEFT JOIN `{$tvv}` vv  ON vv.serie_id  = vs.id AND vv.geloescht_am IS NULL
            LEFT JOIN `{$tst}` tst ON tst.serie_id = vs.id
                                   AND tst.benutzer_id = ?
                                   AND tst.jahr        = ?
            GROUP BY vs.id, vs.name, vs.sortierindex, vs.url, vs.wettbewerbe,
                     vs.referenz_datum, wp.naechstes_datum, wp.aktiv, tst.status
            ORDER BY COALESCE(vs.sortierindex, 9999) ASC, vs.name ASC
        ", [$userId, $jahr]);

        // Discipline registrations per serie for this user (inkl. ID zum Löschen)
        $anmeldungen = DB::fetchAll("
            SELECT wp.serie_id, twa.id AS anm_id, twa.disziplin
            FROM `{$twa}` twa
            JOIN `{$twp}` wp ON wp.id = twa.planung_id
            WHERE twa.benutzer_id = ?
        ", [$userId]);

        $anmBySerie = [];
        foreach ($anmeldungen as $a) {
            $anmBySerie[(int)$a['serie_id']][] = [
                'id'        => (int)$a['anm_id'],
                'disziplin' => $a['disziplin'],
            ];
        }

        // ── Disziplinen aus dem Statistikportal (hat Vorrang vor CSV-wettbewerbe) ──────────
        // COALESCE(anzeige_name, e.disziplin) liefert den normierten Anzeigenamen;
        // Admin-Ausschlüsse (disziplinen_ausgeschlossen) und Extras (disziplinen_extra)
        // werden aus training_wettkampf_planung angewendet.
        $ter2 = DB::tbl('ergebnisse');
        $tdm2 = DB::tbl('disziplin_mapping');
        $rawDiszBySerie = [];
        try {
            $diszRows = DB::fetchAll("
                SELECT v.serie_id,
                       COALESCE(dm.anzeige_name, e.disziplin) AS disziplin,
                       COUNT(*)                                AS anz
                FROM `{$ter2}` e
                JOIN `{$tvv}` v  ON v.id  = e.veranstaltung_id
                LEFT JOIN `{$tdm2}` dm ON dm.id = e.disziplin_mapping_id
                WHERE e.geloescht_am IS NULL
                  AND v.geloescht_am IS NULL
                  AND v.genehmigt    = 1
                  AND e.disziplin    IS NOT NULL
                GROUP BY v.serie_id, COALESCE(dm.anzeige_name, e.disziplin)
                ORDER BY v.serie_id, COUNT(*) DESC
            ");
            $seenD = [];
            foreach ($diszRows as $d) {
                $sid = (int)$d['serie_id'];
                if (!isset($seenD[$sid])) $seenD[$sid] = [];
                if (!in_array($d['disziplin'], $seenD[$sid], true)) {
                    $seenD[$sid][]        = $d['disziplin'];
                    $rawDiszBySerie[$sid][] = $d['disziplin'];
                }
            }
        } catch (\Throwable $ignored) {}

        // Admin-Planung (Ausschlüsse + Extras) pro Serie
        $planungBySerie = [];
        try {
            $pRows = DB::fetchAll(
                "SELECT serie_id, disziplinen_ausgeschlossen, disziplinen_extra FROM `{$twp}`"
            );
            foreach ($pRows as $p) {
                $planungBySerie[(int)$p['serie_id']] = $p;
            }
        } catch (\Throwable $ignored) {}

        // Serien mit Ergebnissen im Statistikportal ermitteln (auto-absolviert)
        $serien_absolviert = [];
        $bRow = DB::fetchOne("SELECT athlet_id FROM `" . DB::tbl('benutzer') . "` WHERE id = ?", [$userId]);
        $athletId = $bRow && !empty($bRow['athlet_id']) ? (int)$bRow['athlet_id'] : 0;
        if ($athletId > 0) {
            $ter = DB::tbl('ergebnisse');
            $erg = DB::fetchAll("
                SELECT DISTINCT vv.serie_id
                FROM `{$ter}` e
                JOIN `{$tvv}` vv ON vv.id = e.veranstaltung_id
                WHERE e.athlet_id = ?
                  AND YEAR(vv.datum) = ?
                  AND e.geloescht_am IS NULL
                  AND vv.geloescht_am IS NULL
                  AND vv.serie_id IS NOT NULL
            ", [$athletId, $jahr]);
            foreach ($erg as $row) {
                $serien_absolviert[(int)$row['serie_id']] = true;
            }
        }

        // Finale Status-Zuordnung und auto-persistieren
        $final_nicht_setzen = ['absolviert', 'nicht_angetreten', 'findet_nicht_statt'];
        $result = [];
        foreach ($serien as $s) {
            $sid  = (int)$s['id'];
            $anm  = $anmBySerie[$sid] ?? [];
            $st   = $s['status'] ?? null;

            // Auto-absolviert: Ergebnisse im Statistikportal gefunden, Status noch nicht final
            if (isset($serien_absolviert[$sid]) && !in_array($st, $final_nicht_setzen, true)) {
                $st = 'absolviert';
                // Persistent speichern damit der User es ggf. manuell überschreiben kann
                DB::query(
                    "INSERT INTO `{$tst}` (serie_id, benutzer_id, jahr, status) VALUES (?,?,?,?)
                     ON DUPLICATE KEY UPDATE status=VALUES(status), geaendert_am=CURRENT_TIMESTAMP",
                    [$sid, $userId, $jahr, 'absolviert']
                );
            }

            // Standard: zukünftige Events → offen, vergangene ohne Status → passt_nicht
            if ($st === null) {
                $y = (string)$jahr;
                $effDatum = null;
                if (!empty($s['naechstes_datum']) && str_starts_with((string)$s['naechstes_datum'], $y)) {
                    // Admin-bestätigter Termin für dieses Jahr
                    $effDatum = $s['naechstes_datum'];
                } elseif (!empty($s['letztes_datum_statistik']) && str_starts_with((string)$s['letztes_datum_statistik'], $y)) {
                    // Statistikportal hat einen Termin für dieses Jahr → definitiv
                    $effDatum = $s['letztes_datum_statistik'];
                } elseif (!empty($s['letztes_datum'])) {
                    // letztes_datum = GREATEST(Statistikportal, referenz_datum) → Prognose
                    // Prognose: gleicher N-ter Wochentag im gleichen Monat des Zieljahres
                    // (identisch zu predictNextDate in 16_admin_wettkampf.js)
                    $last    = new DateTime($s['letztes_datum'] . 'T00:00:00');
                    $month   = (int)$last->format('n');   // 1–12
                    $dow     = (int)$last->format('w');   // 0=So
                    $dom     = (int)$last->format('j');
                    $nth     = (int)(($dom - 1) / 7);
                    $first   = new DateTime(sprintf('%04d-%02d-01', $jahr, $month));
                    $firstDow = (int)$first->format('w');
                    $diff    = ($dow - $firstDow + 7) % 7;
                    $tag     = 1 + $diff + $nth * 7;
                    $tage    = (int)$first->format('t');
                    if ($tag > $tage) $tag -= 7;
                    $effDatum = sprintf('%04d-%02d-%02d', $jahr, $month, $tag);
                }
                $st = ($effDatum !== null && $effDatum < date('Y-m-d')) ? 'passt_nicht' : 'offen';
            }
            // Vorhandene Anmeldungen überschreiben den Standard-Status
            if (!empty($anm) && in_array($st, ['passt_nicht', 'offen'], true)) $st = 'angemeldet';

            // Effektive Disziplinliste: Statistikportal-Daten (sortiert nach Häufigkeit)
            // minus Admin-Ausschlüsse plus Admin-Extras.  wettbewerbe (CSV) bleibt als
            // Fallback für Serien ohne Statistikportal-Ergebnisse.
            $rawDisz    = $rawDiszBySerie[$sid] ?? [];
            $pl         = $planungBySerie[$sid] ?? null;
            $ausgescbl  = ($pl && $pl['disziplinen_ausgeschlossen'])
                          ? (json_decode((string)$pl['disziplinen_ausgeschlossen'], true) ?? []) : [];
            $extras     = ($pl && $pl['disziplinen_extra'])
                          ? (json_decode((string)$pl['disziplinen_extra'], true) ?? []) : [];
            $disziplinen = array_values(array_unique(array_merge(
                array_filter($rawDisz, fn($d) => !in_array($d, $ausgescbl, true)),
                $extras
            )));

            $result[] = [
                'id'                    => $sid,
                'name'                  => $s['name'],
                'ort'                   => $s['ort'] ?: null,
                'sortierindex'          => $s['sortierindex'] !== null ? (int)$s['sortierindex'] : null,
                'url'                   => $s['url'],
                // Statistikportal-Disziplinen (angereichert durch Admin); leer = kein Eintrag im Statistikportal
                'disziplinen'           => $disziplinen,
                // CSV-Metadaten (Fallback wenn keine Statistikportal-Ergebnisse vorhanden)
                'wettbewerbe'           => $s['wettbewerbe'] ? json_decode((string)$s['wettbewerbe'], true) : [],
                'aktiv'                 => (int)$s['aktiv'],
                'letztes_datum'           => $s['letztes_datum'],
                'letztes_datum_statistik' => $s['letztes_datum_statistik'],
                'naechstes_datum'         => $s['naechstes_datum'],
                'status'                => $st,
                // [{id, disziplin}] – für An-/Abmelde-Buttons im Frontend
                'meine_anmeldungen'      => $anm,
                // Nur Disziplinnamen (Abwärtskompatibilität + einfache Checks)
                'angemeldet_disziplinen' => array_column($anm, 'disziplin'),
            ];
        }

        echo json_encode(['ok' => true, 'serien' => $result, 'jahr' => $jahr]);
        return;
    }

    // ── PUT /wettkampfplanung/{serie_id} ──────────────────────────
    if (preg_match('/^(\d+)$/', $tail, $m) && $method === 'PUT') {
        $serieId = (int)$m[1];
        $in      = readJsonBody();
        $jahr    = max(2020, min(2035, (int)($in['jahr'] ?? (int)date('Y'))));
        $status  = (string)($in['status'] ?? 'passt_nicht');

        $valid = ['offen','in_klaerung','anmeldung_erforderlich','angemeldet',
                  'absolviert','findet_nicht_statt','passt_nicht','nicht_angetreten'];
        if (!in_array($status, $valid, true)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Ungültiger Status']);
            return;
        }

        DB::query(
            "INSERT INTO `{$tst}` (serie_id, benutzer_id, jahr, status) VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE status=VALUES(status), geaendert_am=CURRENT_TIMESTAMP",
            [$serieId, $userId, $jahr, $status]
        );
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Endpoint nicht gefunden']);
}


// ============================================================
// Share-Token API
//   GET  share/resolve/{token}      → Token-Info ohne Auth (für Gastansicht)
//   GET  share/tokens               → Tokens auflisten (auth + trainer)
//   POST share/tokens               → neuen Token erzeugen (auth + trainer)
//   DELETE share/tokens/{token}     → Token widerrufen (auth + trainer)
// ============================================================
// Ansicht ('kalender'|'liste') + Zeitraum normalisieren/validieren.
// Liefert [ansicht, zeitraum|null]. Zeitraum-Format hängt von der Ansicht ab:
//   kalender → YYYY-MM, liste → YYYY-QN. Ungültiges/leeres Zeitraum → null.
function _shareNormViewPeriod($ansichtRaw, $zeitraumRaw): array
{
    $ansicht  = ($ansichtRaw === 'liste') ? 'liste' : 'kalender';
    $zeitraum = trim((string)($zeitraumRaw ?? ''));
    if ($ansicht === 'liste') {
        if (!preg_match('/^\d{4}-Q[1-4]$/', $zeitraum)) $zeitraum = null;
    } else {
        if (!preg_match('/^\d{4}-\d{2}$/', $zeitraum)) $zeitraum = null;
    }
    return [$ansicht, $zeitraum];
}

function handleShare(string $method, string $sub): void
{
    runPendingMigrations();
    $tst = DB::tbl('training_share_tokens');

    // ── Öffentlich: Token auflösen (kein Login nötig) ──
    if ($method === 'GET' && str_starts_with($sub, 'resolve/')) {
        $token = substr($sub, 8);
        if (!preg_match('/^[a-f0-9]{32}$/', $token)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Ungültiger Token']);
            return;
        }
        $row = null;
        try {
            $row = DB::fetchOne(
                "SELECT t.token, t.gruppe_id, t.name, t.ansicht, t.zeitraum, g.name AS gruppe_name
                   FROM $tst t
                   LEFT JOIN " . DB::tbl('gruppen') . " g ON g.id = t.gruppe_id
                  WHERE t.token = ?",
                [$token]
            );
        } catch (Throwable $e) {}
        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Token nicht gefunden']);
            return;
        }
        echo json_encode(['ok' => true, 'token' => [
            'token'       => $row['token'],
            'gruppe_id'   => (int)$row['gruppe_id'],
            'name'        => $row['name'],
            'gruppe_name' => $row['gruppe_name'] ?? $row['name'],
            'ansicht'     => $row['ansicht']  ?? 'kalender',
            'zeitraum'    => $row['zeitraum'] ?? null,
        ]]);
        return;
    }

    // Ab hier: Login erforderlich
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }
    if (!Auth::hasRecht('training_bearbeiten') && ($user['rolle'] ?? '') !== 'admin') {
        http_response_code(403);
        echo json_encode(['ok' => false, 'fehler' => 'Keine Berechtigung (Trainer/Admin)']);
        return;
    }

    // GET /share/tokens – alle Tokens auflisten
    if ($sub === 'tokens' && $method === 'GET') {
        $rows = [];
        try {
            $rows = DB::fetchAll(
                "SELECT t.token, t.gruppe_id, t.name, t.ansicht, t.zeitraum, t.erstellt_am, g.name AS gruppe_name
                   FROM $tst t
                   LEFT JOIN " . DB::tbl('gruppen') . " g ON g.id = t.gruppe_id
                 ORDER BY t.erstellt_am DESC",
                []
            );
        } catch (Throwable $e) {}
        $tokens = array_map(fn($r) => [
            'token'       => $r['token'],
            'gruppe_id'   => (int)$r['gruppe_id'],
            'name'        => $r['name'],
            'gruppe_name' => $r['gruppe_name'] ?? $r['name'],
            'ansicht'     => $r['ansicht']  ?? 'kalender',
            'zeitraum'    => $r['zeitraum'] ?? null,
            'erstellt_am' => $r['erstellt_am'],
        ], $rows);
        echo json_encode(['ok' => true, 'tokens' => $tokens]);
        return;
    }

    // POST /share/tokens – neuen Token erzeugen
    if ($sub === 'tokens' && $method === 'POST') {
        $in       = json_decode(file_get_contents('php://input'), true) ?: [];
        $gruppeId = isset($in['gruppe_id']) && ctype_digit((string)$in['gruppe_id'])
            ? (int)$in['gruppe_id'] : null;
        $name     = trim($in['name'] ?? '');
        if (!$gruppeId || $name === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'gruppe_id und name erforderlich']);
            return;
        }
        $gruppe = null;
        try {
            $gruppe = DB::fetchOne("SELECT name FROM " . DB::tbl('gruppen') . " WHERE id = ?", [$gruppeId]);
        } catch (Throwable $e) {}
        if (!$gruppe) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Gruppe nicht gefunden']);
            return;
        }
        [$ansicht, $zeitraum] = _shareNormViewPeriod($in['ansicht'] ?? null, $in['zeitraum'] ?? null);
        $token = bin2hex(random_bytes(16));
        DB::query("INSERT INTO $tst (token, gruppe_id, name, ansicht, zeitraum) VALUES (?,?,?,?,?)",
            [$token, $gruppeId, $name, $ansicht, $zeitraum]);
        echo json_encode(['ok' => true, 'token' => [
            'token'       => $token,
            'gruppe_id'   => $gruppeId,
            'name'        => $name,
            'gruppe_name' => $gruppe['name'],
            'ansicht'     => $ansicht,
            'zeitraum'    => $zeitraum,
        ]]);
        return;
    }

    // PUT /share/tokens/{token} – Ansicht/Zeitraum/Gruppe nachträglich ändern
    if (str_starts_with($sub, 'tokens/') && $method === 'PUT') {
        $token = substr($sub, 7);
        if (!preg_match('/^[a-f0-9]{32}$/', $token)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Ungültiger Token']);
            return;
        }
        $existing = null;
        try { $existing = DB::fetchOne("SELECT gruppe_id, name FROM $tst WHERE token = ?", [$token]); } catch (Throwable $e) {}
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'fehler' => 'Token nicht gefunden']);
            return;
        }
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        [$ansicht, $zeitraum] = _shareNormViewPeriod($in['ansicht'] ?? null, $in['zeitraum'] ?? null);

        // Gruppe optional ändern (Name folgt der Gruppe nach, sofern angegeben)
        $gruppeId = $existing['gruppe_id'];
        $name     = $existing['name'];
        if (isset($in['gruppe_id']) && ctype_digit((string)$in['gruppe_id'])) {
            $gId = (int)$in['gruppe_id'];
            $gruppe = null;
            try { $gruppe = DB::fetchOne("SELECT name FROM " . DB::tbl('gruppen') . " WHERE id = ?", [$gId]); } catch (Throwable $e) {}
            if (!$gruppe) {
                http_response_code(404);
                echo json_encode(['ok' => false, 'fehler' => 'Gruppe nicht gefunden']);
                return;
            }
            $gruppeId = $gId;
            $name     = $gruppe['name'];
        }

        DB::query("UPDATE $tst SET gruppe_id=?, name=?, ansicht=?, zeitraum=? WHERE token=?",
            [$gruppeId, $name, $ansicht, $zeitraum, $token]);
        echo json_encode(['ok' => true, 'token' => [
            'token'     => $token,
            'gruppe_id' => (int)$gruppeId,
            'name'      => $name,
            'ansicht'   => $ansicht,
            'zeitraum'  => $zeitraum,
        ]]);
        return;
    }

    // DELETE /share/tokens/{token} – Token widerrufen
    if (str_starts_with($sub, 'tokens/') && $method === 'DELETE') {
        $token = substr($sub, 7);
        if (!preg_match('/^[a-f0-9]{32}$/', $token)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'Ungültiger Token']);
            return;
        }
        try { DB::query("DELETE FROM $tst WHERE token = ?", [$token]); } catch (Throwable $e) {}
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(404);
    echo json_encode(['ok' => false, 'fehler' => 'Share-Endpoint nicht gefunden']);
}

// ── GET/PUT /wochenziele ────────────────────────────────────────────────────
// GET  /wochenziele?von=&bis=[&fuer=benutzer_id]  → {ziele: {"2025-01-06": 50, ...}}
// PUT  /wochenziele/{woche_datum}                  → Body: {km_ziel, fuer?}
function handleWochenziele(string $method, string $sub = ''): void
{
    $user = Auth::check();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'fehler' => 'Nicht angemeldet']);
        return;
    }

    $tbl       = DB::tbl('training_wochenziele');
    $istTrainer = in_array($user['rolle'] ?? '', ['admin', 'trainer']);

    // ── GET /wochenziele ────────────────────────────────────────────────────
    if ($method === 'GET' && $sub === '') {
        $fuerParam = isset($_GET['fuer']) ? (int)$_GET['fuer'] : (int)$user['id'];
        if ($fuerParam !== (int)$user['id'] && !$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Kein Zugriff']);
            return;
        }
        $von = $_GET['von'] ?? date('Y-m-01');
        $bis = $_GET['bis'] ?? date('Y-m-t');
        $rows = DB::fetchAll(
            "SELECT woche_datum, km_ziel FROM $tbl WHERE benutzer_id = ? AND woche_datum BETWEEN ? AND ? ORDER BY woche_datum",
            [$fuerParam, $von, $bis]
        );
        $ziele = [];
        foreach ($rows as $r) {
            $ziele[$r['woche_datum']] = (float)$r['km_ziel'];
        }
        echo json_encode(['ok' => true, 'ziele' => $ziele]);
        return;
    }

    // ── PUT /wochenziele/{woche_datum} ──────────────────────────────────────
    if ($method === 'PUT' && preg_match('/^(\d{4}-\d{2}-\d{2})$/', $sub, $m)) {
        $wocheDatum = $m[1];
        $in         = json_decode(file_get_contents('php://input'), true) ?? [];
        $kmZiel     = isset($in['km_ziel']) ? (float)$in['km_ziel'] : null;
        $fuer       = isset($in['fuer']) ? (int)$in['fuer'] : (int)$user['id'];
        if ($fuer !== (int)$user['id'] && !$istTrainer) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'fehler' => 'Kein Zugriff']);
            return;
        }
        if ($kmZiel === null || $kmZiel <= 0) {
            DB::query("DELETE FROM $tbl WHERE benutzer_id = ? AND woche_datum = ?", [$fuer, $wocheDatum]);
        } else {
            DB::query(
                "INSERT INTO $tbl (benutzer_id, woche_datum, km_ziel) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE km_ziel = VALUES(km_ziel)",
                [$fuer, $wocheDatum, $kmZiel]
            );
        }
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'fehler' => 'Methode nicht erlaubt']);
}
