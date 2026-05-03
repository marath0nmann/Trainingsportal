<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/totp.php';
if (file_exists(__DIR__ . '/passkey.php')) {
    require_once __DIR__ . '/passkey.php';
} else {
    // Passkey-Klasse als Stub falls Datei fehlt
    class Passkey {
        public static function migrate(): void {}
        public static function userHasPasskey(int $uid): bool { return false; }
        public static function authChallenge(int $uid): array { return []; }
        public static function authVerify(array $c): array { return ['ok'=>false,'fehler'=>'Passkeys nicht verfügbar']; }
        public static function registrationChallenge(int $uid): array { return []; }
        public static function registrationVerify(array $c, string $n): array { return ['ok'=>false,'fehler'=>'Passkeys nicht verfügbar']; }
        public static function listForUser(int $uid): array { return []; }
        public static function delete(int $id, int $uid): bool { return false; }
    }
}

class Auth {

    // ============================================================
    // Session
    // ============================================================
    public static function startSession(): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_name(SESSION_NAME);
            ini_set('session.gc_maxlifetime', SESSION_LIFETIME);
            $cookieParams = [
                'lifetime' => SESSION_LIFETIME,
                'path'     => '/',
                'secure'   => isset($_SERVER['HTTPS']),
                'httponly' => true,
                'samesite' => 'Lax',
            ];
            // Cross-Domain: Cookie für alle Subdomains setzen
            if (defined('COOKIE_DOMAIN') && COOKIE_DOMAIN !== '') {
                $cookieParams['domain'] = COOKIE_DOMAIN;
            }
            session_set_cookie_params($cookieParams);
            session_start();
        }
    }

    // Session für Schreibzugriff öffnen (nach globalem session_write_close())
    public static function sessionWriteStart(): void {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }

    // ============================================================
    // Login Schritt 1: Passwort prüfen
    // Gibt zurück:
    //   ['ok'=>false, 'fehler'=>'...']
    //   ['ok'=>true,  'totp_required'=>false, 'rolle'=>'...', 'name'=>'...']  // kein 2FA
    //   ['ok'=>true,  'totp_required'=>true,  'totp_setup'=>false]            // Code eingeben
    //   ['ok'=>true,  'totp_required'=>true,  'totp_setup'=>true]             // Setup nötig
    // ============================================================
    public static function loginStep1(string $benutzername, string $passwort): array {
        // Brute-Force: max 10 Versuche in 15 min pro IP
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $versuche = DB::fetchOne(
            "SELECT COUNT(*) AS n FROM " . DB::tbl('login_versuche') . "
             WHERE ip = ? AND erfolg = 0 AND erstellt_am > DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
            [$ip]
        );
        if (($versuche['n'] ?? 0) >= 10) {
            return ['ok' => false, 'fehler' => 'Zu viele Fehlversuche. Bitte 15 Minuten warten.'];
        }

        $user = DB::fetchOne(
            'SELECT * FROM ' . DB::tbl('benutzer') . ' WHERE (benutzername = ? OR email = ?) AND aktiv = 1',
            [$benutzername, $benutzername]
        );

        if (!$user || !password_verify($passwort, $user['passwort'])) {
            DB::query('INSERT INTO ' . DB::tbl('login_versuche') . ' (benutzername, ip, erfolg) VALUES (?, ?, 0)',
                [$benutzername, $ip]);
            return ['ok' => false, 'fehler' => 'Benutzername oder Passwort falsch.'];
        }

        // Erfolgreicher Passwort-Check – Versuch loggen
        // Login-Versuch wird NACH 2FA geloggt (in finalizeLogin)

        // 2FA für alle User: TOTP oder Passkey
        $hasTotp    = !empty($user['totp_aktiv']);
        try { Passkey::migrate(); } catch (\Exception $e) {}
        $hasPasskey = Passkey::userHasPasskey($user['id']);
        $emailLoginBevorzugt = !empty($user['email_login_bevorzugt']);

        if ($hasTotp || $hasPasskey) {
            $_SESSION['totp_pending_user'] = $user['id'];
            session_regenerate_id(true);
            return [
                'ok'                   => true,
                'totp_required'        => true,
                'totp_setup'           => false,
                'has_totp'             => $hasTotp,
                'has_passkey'          => $hasPasskey,
                'email_login_bevorzugt'=> $emailLoginBevorzugt,
            ];
        } elseif ($emailLoginBevorzugt) {
            // User bevorzugt E-Mail-Code statt TOTP
            $_SESSION['totp_pending_user'] = $user['id'];
            session_regenerate_id(true);
            return [
                'ok'                   => true,
                'totp_required'        => true,
                'totp_setup'           => false,
                'has_totp'             => false,
                'has_passkey'          => false,
                'email_login_bevorzugt'=> true,
            ];
        } else {
            // Kein 2FA eingerichtet → Setup erzwingen
            $_SESSION['totp_pending_user'] = $user['id'];
            session_regenerate_id(true);
            return [
                'ok'           => true,
                'totp_required'=> true,
                'totp_setup'   => true,
                'has_totp'     => false,
                'has_passkey'  => false,
            ];
        }
    }

    // ============================================================
    // Login Schritt 2a: TOTP-Code prüfen (nach Passwort-OK)
    // ============================================================
    public static function loginStep2(string $code): array {
        if (empty($_SESSION['totp_pending_user'])) {
            return ['ok' => false, 'fehler' => 'Keine ausstehende Anmeldung.'];
        }
        $uid  = (int)$_SESSION['totp_pending_user'];
        $user = DB::fetchOne('SELECT * FROM ' . DB::tbl('benutzer') . ' WHERE id = ? AND aktiv = 1', [$uid]);
        if (!$user) return ['ok' => false, 'fehler' => 'Benutzer nicht gefunden.'];

        // Backup-Code prüfen
        $code = trim($code);
        if (strlen($code) === 8 && preg_match('/^[A-Fa-f0-9]{8}$/', $code)) {
            if (self::useBackupCode($user, strtoupper($code))) {
                unset($_SESSION['totp_pending_user']);
                return self::finalizeLogin($user);
            }
            return ['ok' => false, 'fehler' => 'Ungültiger Backup-Code.'];
        }

        // TOTP prüfen (nur wenn Secret vorhanden)
        if (empty($user['totp_secret']) || !$user['totp_aktiv']) {
            return ['ok' => false, 'fehler' => 'TOTP ist nicht aktiv. Bitte Passkey verwenden.'];
        }
        if (!TOTP::verify($user['totp_secret'], $code)) {
            return ['ok' => false, 'fehler' => 'Ungültiger Code. Bitte erneut versuchen.'];
        }
        $ip2 = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        try { \DB::query('INSERT INTO ' . \DB::tbl('login_versuche') . ' (benutzername, ip, erfolg, methode) VALUES (?, ?, 1, ?)', [$user['email'], $ip2, 'totp']); } catch (\Exception $e) {}
        unset($_SESSION['totp_pending_user']);
        return self::finalizeLogin($user);
    }

    // ============================================================
    // Setup Schritt 1: Neuen Secret erzeugen, QR zurückgeben
    // ============================================================
    public static function totpSetupInit(): array {
        if (empty($_SESSION['totp_pending_user'])) {
            return ['ok' => false, 'fehler' => 'Nicht autorisiert.'];
        }
        $uid  = (int)$_SESSION['totp_pending_user'];
        $user = DB::fetchOne('SELECT benutzername, email FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$uid]);
        if (!$user) return ['ok' => false, 'fehler' => 'Benutzer nicht gefunden.'];

        $secret = TOTP::generateSecret();
        // Pending speichern (noch nicht aktiv)
        DB::query('UPDATE ' . DB::tbl('benutzer') . ' SET totp_pending = ? WHERE id = ?', [$secret, $uid]);

        $account = $user['email'] ?: $user['benutzername'];
        $uri     = TOTP::getUri($secret, $account);
        $qrUrl   = TOTP::getQrUrl($uri);

        return [
            'ok'     => true,
            'secret' => $secret,
            'qr_url' => $qrUrl,
            'uri'    => $uri,
        ];
    }

    // ============================================================
    // Setup Schritt 2: Code bestätigen, 2FA aktivieren
    // ============================================================
    public static function totpSetupConfirm(string $code): array {
        if (empty($_SESSION['totp_pending_user'])) {
            return ['ok' => false, 'fehler' => 'Nicht autorisiert.'];
        }
        $uid  = (int)$_SESSION['totp_pending_user'];
        $user = DB::fetchOne('SELECT * FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$uid]);
        if (!$user || empty($user['totp_pending'])) {
            return ['ok' => false, 'fehler' => 'Setup nicht initialisiert.'];
        }

        if (!TOTP::verify($user['totp_pending'], $code)) {
            return ['ok' => false, 'fehler' => 'Code falsch. Bitte erneut versuchen.'];
        }

        // Backup-Codes generieren + hashen
        $plain   = TOTP::generateBackupCodes();
        $hashed  = array_map(function($c) { return password_hash($c, PASSWORD_BCRYPT, ['cost' => 10]); }, $plain);

        DB::query(
            'UPDATE ' . DB::tbl('benutzer') . ' SET totp_secret = ?, totp_aktiv = 1, totp_pending = NULL, totp_backup = ? WHERE id = ?',
            [$user['totp_pending'], json_encode($hashed), $uid]
        );

        // Jetzt einloggen
        $user = DB::fetchOne('SELECT * FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$uid]);
        unset($_SESSION['totp_pending_user']);
        $result = self::finalizeLogin($user);
        $result['backup_codes'] = $plain; // einmalig zurückgeben
        return $result;
    }

    // ============================================================
    // 2FA deaktivieren (nur eingeloggter Admin für sich selbst)
    // ============================================================
    public static function totpDisable(int $userId): void {
        DB::query(
            'UPDATE ' . DB::tbl('benutzer') . ' SET totp_secret = NULL, totp_aktiv = 0, totp_pending = NULL, totp_backup = NULL WHERE id = ?',
            [$userId]
        );
    }

    // ============================================================
    // Backup-Code einlösen
    // ============================================================
    private static function useBackupCode(array $user, string $code): bool {
        if (empty($user['totp_backup'])) return false;
        $codes = json_decode($user['totp_backup'], true);
        if (!is_array($codes)) return false;
        foreach ($codes as $i => $hash) {
            if (password_verify($code, $hash)) {
                // Code verbraucht
                array_splice($codes, $i, 1);
                DB::query('UPDATE ' . DB::tbl('benutzer') . ' SET totp_backup = ? WHERE id = ?',
                    [json_encode($codes), $user['id']]);
                return true;
            }
        }
        return false;
    }

    // ============================================================
    // Session setzen nach erfolgreichem Login
    // ============================================================
    public static function finalizeLoginPublic(array $user): array { return self::finalizeLogin($user); }
    public static function finalizeLogin(array $user): array {
        // Wartungsmodus: Logins für Nicht-Admins ohne Sonderrecht blockieren
        try {
            if (\Settings::get('wartung_aktiv') === '1' && $user['rolle'] !== 'admin') {
                $row = DB::fetchOne('SELECT rechte FROM ' . DB::tbl('rollen') . ' WHERE name = ?', [$user['rolle']]);
                $rechte = json_decode($row['rechte'] ?? '[]', true) ?: [];
                if (!in_array('wartung_login', $rechte)) {
                    $msg = \Settings::get('wartung_nachricht') ?: 'Das Portal befindet sich derzeit in Wartung.';
                    http_response_code(503);
                    echo json_encode(['ok' => false, 'fehler' => $msg, 'wartung' => true]);
                    exit;
                }
            }
        } catch (\Throwable $_e) {}
        DB::query('UPDATE ' . DB::tbl('benutzer') . ' SET letzter_login = NOW() WHERE id = ?', [$user['id']]);
        // Vorname aus verknüpftem Athletenprofil laden
        $vorname = '';
        if (!empty($user['athlet_id'])) {
            $ath = \DB::fetchOne('SELECT vorname FROM ' . \DB::tbl('athleten') . ' WHERE id = ?', [$user['athlet_id']]);
            if ($ath) $vorname = $ath['vorname'] ?? '';
        }
        $_SESSION['user_id']    = $user['id'];
        $_SESSION['user_name']  = $user['email']; // E-Mail als primäre Kennung
        $_SESSION['user_rolle'] = $user['rolle'];
        session_regenerate_id(true);
        return ['ok' => true, 'totp_required' => false, 'rolle' => $user['rolle'],
                'name' => $user['email'], 'email' => $user['email'], 'vorname' => $vorname];
    }

    // ============================================================
    // Logout
    // ============================================================
    public static function logout(): void {
        session_unset();
        session_destroy();
    }

    // ============================================================
    // Session prüfen
    // ============================================================
    public static function check(): ?array {
        if (empty($_SESSION['user_id'])) return null;
        $uid = (int)$_SESSION['user_id'];
        // Aktivität aktualisieren (max. alle 60s um DB-Last zu reduzieren)
        $lastPing = $_SESSION['_last_ping'] ?? 0;
        if (time() - $lastPing > 60) {
            try {
                DB::query('UPDATE ' . DB::tbl('benutzer') . ' SET letzter_aktivitaet = NOW() WHERE id = ?', [$uid]);
                $_SESSION['_last_ping'] = time();
            } catch (\Exception $e) {}
        }
        // avatar_pfad frisch aus DB (Spalte existiert ggf. erst nach Migration)
        $avatar = null;
        try {
            $row = DB::fetchOne('SELECT avatar_pfad FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$_SESSION['user_id']]);
            $avatar = $row['avatar_pfad'] ?? null;
        } catch (\Exception $e) {}
        return [
            'id'     => $_SESSION['user_id'],
            'name'   => $_SESSION['user_name'],
            'rolle'  => $_SESSION['user_rolle'],
            'avatar' => $avatar,
        ];
    }

    public static function requireLogin(): array {
        $user = self::check();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['fehler' => 'Nicht eingeloggt.']);
            exit;
        }
        return $user;
    }

    public static function requireAdmin(): array {
        $user = self::requireLogin();
        if ($user['rolle'] !== 'admin') {
            http_response_code(403);
            echo json_encode(['fehler' => 'Keine Berechtigung.']);
            exit;
        }
        return $user;
    }

    // Rollen-Schema:
    //   admin  – Vollzugriff, Benutzer verwalten, Einstellungen
    //   editor – Ergebnisse eintragen/bearbeiten/löschen (alle, sofort)
    //   athlet – eigene Ergebnisse eintragen; Änderungen/Löschungen mit Genehmigung
    //   leser  – nur Ansicht, keine Bearbeitung

    // Mindest-Rolle: editor (nicht athlet/leser)
    public static function requireEditor(): array {
        $user = self::requireLogin();
        if (!in_array($user['rolle'], ['admin','editor'])) {
            http_response_code(403);
            echo json_encode(['fehler' => 'Keine Berechtigung.']);
            exit;
        }
        return $user;
    }

    // Mindest-Rolle: athlet (darf eigene Ergebnisse eintragen)
    public static function requireAthlet(): array {
        $user = self::requireLogin();
        if (!in_array($user['rolle'], ['admin','editor','athlet'])) {
            http_response_code(403);
            echo json_encode(['fehler' => 'Keine Berechtigung. Nur Athleten, Editoren und Admins dürfen Ergebnisse eintragen.']);
            exit;
        }
        return $user;
    }

    public static function isAdmin(): bool {
        return ($_SESSION['user_rolle'] ?? '') === 'admin';
    }

    public static function isEditor(): bool {
        return in_array($_SESSION['user_rolle'] ?? '', ['admin','editor']);
    }

    // Darf dieser User SOFORT (ohne Genehmigung) bearbeiten/löschen?
    // admin und editor: ja (alle); athlet: nur mit Genehmigung; leser: nein
    public static function canEditAll(): bool {
        return in_array($_SESSION['user_rolle'] ?? '', ['admin','editor']);
    }

    // Ist der User ein Athlet?
    public static function isAthlet(): bool {
        return ($_SESSION['user_rolle'] ?? '') === 'athlet';
    }

    // Prüft ein einzelnes Recht (aus rollen-Tabelle) – benötigt aktive Session
    public static function hasRecht(string $recht): bool {
        $rolle = $_SESSION['user_rolle'] ?? '';
        if (!$rolle) return false;
        if ($rolle === 'admin') return true; // admin hat immer alle Rechte
        try {
            global $db;
            $row = \DB::fetchOne('SELECT rechte FROM ' . \DB::tbl('rollen') . ' WHERE name = ?', [$rolle]);
            $rechte = json_decode($row['rechte'] ?? '[]', true) ?: [];
            return in_array('vollzugriff', $rechte) || in_array($recht, $rechte);
        } catch (\Exception $e) { return false; }
    }
    public static function requireRecht(string $recht): array {
        $user = self::requireLogin();
        if (!self::hasRecht($recht)) {
            http_response_code(403);
            echo json_encode(['fehler' => 'Keine Berechtigung.']);
            exit;
        }
        return $user;
    }

    public static function hashPasswort(string $pw): string {
        return password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12]);
    }
}
