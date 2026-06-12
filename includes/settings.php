<?php
require_once __DIR__ . '/db.php';

class Settings {

    private static ?array $cache = null;

    // ── Kanonische Defaults ─────────────────────────────────────────────────
    // Jeder Eintrag: [wert, bezeichnung, gruppe]
    // Neue Optionen hier eintragen – beim ersten Aufruf automatisch in die DB.
    private static array $defaults = [
        'verein_name'                => ['Mein Verein e.V.',                                    'Vereinsname',                                    'verein'],
        'verein_kuerzel'             => ['Mein Verein',                                         'Kurzbezeichnung (Header)',                        'verein'],
        'app_untertitel'             => ['Leichtathletik-Statistik',                            'App-Untertitel',                                 'verein'],
        'logo_datei'                 => ['uploads/logo_default.png',                           'Logo (hochgeladene Datei)',                       'verein'],
        'email_domain'               => [        '',                                             'Zugelassene E-Mail-Domain (Registrierung)',       'registrierung'],
        'noreply_email'              => [        '',                                     'Absender-E-Mail (System-Mails)',                  'registrierung'],
        'farbe_primary'              => ['#cc0000',                                             'Hauptfarbe (Primär)',                             'farben'],
        'farbe_accent'               => ['#003087',                                             'Akzentfarbe',                                    'farben'],
        'dashboard_timeline_limit'   => ['20',                                                  'Dashboard – Neueste Bestleistungen (Anzahl)',     'darstellung'],
        'version_nur_admins'         => ['1',                                                   'Versionsstand im Header nur für Admins anzeigen', 'darstellung'],
        'wartung_aktiv'              => ['0',                                                   'Wartungsmodus aktiv',                             'system'],
        'wartung_nachricht'          => ['Das Portal befindet sich derzeit in Wartung. Bitte später erneut versuchen.', 'Wartungsmodus – Nachricht für Besucher', 'system'],
        'adressleiste_farbe'         => ['aus',                                                 'Safari-Adressleiste einfärben',                   'darstellung'],
        'dashboard_layout'           => ['[{"cols":[{"widget":"stat-ergebnisse"},{"widget":"stat-athleten"},{"widget":"stat-rekorde"}]},{"cols":[{"widget":"timeline","w":340},{"widget":"veranstaltungen"}]}]', 'Dashboard-Layout', 'darstellung'],
        'meisterschaften_liste'      => ['[{"id":1,"label":"Olympia"},{"id":2,"label":"WM"},{"id":3,"label":"EM"},{"id":4,"label":"DM"},{"id":5,"label":"NRW"},{"id":6,"label":"NR"},{"id":7,"label":"Regio"}]', 'Meisterschaftsarten (JSON)', 'meisterschaften'],
        'login_portal_aktiv'         => ['0',                                                   'Zentrales Login-Portal aktivieren',               'login_portal'],
        'login_portal_url'           => ['',                                                    'URL des Login-Portals (z.B. https://login.tus-oedt.de)', 'login_portal'],
        'login_portal_apps'          => ['[]',                                                  'Registrierte Apps (JSON)',                         'login_portal'],
    ];

    // ── Alle Einstellungen als key→value laden, fehlende Defaults einmalig schreiben
    public static function all(): array {
        if (self::$cache !== null) return self::$cache;
        try {
            $rows = DB::fetchAll('SELECT schluessel, wert FROM ' . DB::tbl('einstellungen') . '');
            self::$cache = [];
            foreach ($rows as $r) {
                self::$cache[$r['schluessel']] = $r['wert'];
            }
            // Fehlende Defaults einmalig in die DB schreiben (INSERT IGNORE)
            $missing = array_diff_key(self::$defaults, self::$cache);
            if ($missing) {
                foreach ($missing as $key => [$wert, $bezeichnung, $gruppe]) {
                    DB::query(
                        'INSERT IGNORE INTO ' . DB::tbl('einstellungen') . ' (schluessel, wert, bezeichnung, gruppe)
                         VALUES (?, ?, ?, ?)',
                        [$key, $wert, $bezeichnung, $gruppe]
                    );
                    self::$cache[$key] = $wert;
                }
            }
        } catch (Throwable $e) {
            // Tabelle existiert noch nicht o.ä. – Defaults aus Array zurückgeben
            self::$cache = array_map(fn($d) => $d[0], self::$defaults);
        }
        return self::$cache;
    }

    // ── Einzelnen Wert lesen, mit Fallback
    public static function get(string $key, string $default = ''): string {
        $all = self::all();
        return $all[$key] ?? $default;
    }

    // ── Einzelnen Wert speichern
    public static function set(string $key, string $value): void {
        DB::query(
            'INSERT INTO ' . DB::tbl('einstellungen') . ' (schluessel, wert) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE wert = VALUES(wert)',
            [$key, $value]
        );
        if (self::$cache !== null) self::$cache[$key] = $value;
    }

    // ── Mehrere Werte auf einmal speichern
    public static function setMany(array $kvPairs): void {
        foreach ($kvPairs as $k => $v) {
            self::set((string)$k, (string)$v);
        }
    }

    // ── Alle Einstellungen mit Metadaten (für Admin-UI)
    public static function allWithMeta(): array {
        try {
            return DB::fetchAll(
                'SELECT schluessel, wert, bezeichnung, gruppe
                 FROM ' . DB::tbl('einstellungen') . ' ORDER BY gruppe, schluessel'
            );
        } catch (Throwable $e) {
            return [];
        }
    }
}
