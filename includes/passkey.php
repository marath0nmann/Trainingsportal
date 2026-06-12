<?php
/**
 * WebAuthn / Passkey – komplett ohne externe Libraries
 * Unterstützt: Registrierung + Authentifizierung (FIDO2/WebAuthn Level 2)
 * Algorithmen: ES256 (COSE -7), RS256 (COSE -257)
 */
class Passkey {

    // ── RP-Konfiguration aus Umgebung ──────────────────────────
    public static function getRpId(): string {
        if (defined('PASSKEY_RP_ID') && PASSKEY_RP_ID !== '') {
            return PASSKEY_RP_ID;
        }
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return preg_replace('/:\d+$/', '', $host);
    }

    public static function getRpName(): string {
        return Settings::get('verein_name', 'Statistikportal') ?: 'Statistikportal';
    }

    public static function getOrigin(): string {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return $scheme . '://' . $host;
    }

    // Prüft ob origin zur rpId passt (erlaubt Subdomains bei shared rpId)
    // Spec: origin's effective domain must equal or be a subdomain of rpId
    public static function isValidOriginForRpId(string $origin, string $rpId): bool {
        $host = parse_url($origin, PHP_URL_HOST) ?? '';
        $host = preg_replace('/:\d+$/', '', $host);
        return $host === $rpId || str_ends_with($host, '.' . $rpId);
    }

    // ── Tabelle anlegen (Auto-Migration) ───────────────────────
    public static function migrate(): void {
        DB::query("CREATE TABLE IF NOT EXISTS " . DB::tbl('passkeys') . " (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            user_id       INT NOT NULL,
            credential_id VARCHAR(512) NOT NULL,
            public_key    TEXT NOT NULL,
            aaguid        VARCHAR(64) DEFAULT '',
            name          VARCHAR(80) DEFAULT 'Passkey',
            sign_count    INT NOT NULL DEFAULT 0,
            letzter_login DATETIME NULL,
            erstellt_am   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_cred (credential_id),
            FOREIGN KEY (user_id) REFERENCES " . DB::tbl('benutzer') . "(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }

    // ── Registrierung: Challenge erzeugen ──────────────────────
    public static function registrationChallenge(int $userId): array {
        $challenge = self::randomBytes(32);
        $_SESSION['passkey_reg_challenge'] = base64_encode($challenge);
        $_SESSION['passkey_reg_user_id']   = $userId;

        $user = DB::fetchOne('SELECT benutzername, email FROM ' . DB::tbl('benutzer') . ' WHERE id = ?', [$userId]);

        // Bereits registrierte Credentials ausschließen
        $existing = DB::fetchAll('SELECT credential_id FROM ' . DB::tbl('passkeys') . ' WHERE user_id = ?', [$userId]);
        $excludeCredentials = array_map(function($r) {
            return ['type' => 'public-key', 'id' => $r['credential_id']];
        }, $existing);

        return [
            'rp'   => ['id' => self::getRpId(), 'name' => self::getRpName()],
            'user' => [
                'id'          => base64_encode((string)$userId),
                'name'        => $user['benutzername'] ?? $user['email'] ?? 'user',
                'displayName' => $user['benutzername'] ?? $user['email'] ?? 'user',
            ],
            'challenge'              => base64_encode($challenge),
            'pubKeyCredParams'       => [
                ['type' => 'public-key', 'alg' => -7],   // ES256
                ['type' => 'public-key', 'alg' => -257],  // RS256
            ],
            'timeout'                => 60000,
            'excludeCredentials'     => $excludeCredentials,
            'authenticatorSelection' => [
                'residentKey'        => 'preferred',
                'userVerification'   => 'preferred',
            ],
            'attestation' => 'none',
        ];
    }

    // ── Registrierung: Response verifizieren ──────────────────
    public static function registrationVerify(array $credential, string $keyName): array {
        if (empty($_SESSION['passkey_reg_challenge']) || empty($_SESSION['passkey_reg_user_id'])) {
            return ['ok' => false, 'fehler' => 'Keine ausstehende Registrierung.'];
        }

        $expectedChallenge = base64_decode($_SESSION['passkey_reg_challenge']);
        $userId = (int)$_SESSION['passkey_reg_user_id'];

        try {
            // clientDataJSON dekodieren
            $clientData = json_decode(
                self::base64urlDecode($credential['response']['clientDataJSON'] ?? ''),
                true
            );
            if (!$clientData) throw new Exception('clientDataJSON ungültig.');

            // type prüfen
            if (($clientData['type'] ?? '') !== 'webauthn.create')
                throw new Exception('Falscher type: ' . ($clientData['type'] ?? ''));

            // challenge prüfen
            $gotChallenge = self::base64urlDecode($clientData['challenge'] ?? '');
            if (!hash_equals($expectedChallenge, $gotChallenge))
                throw new Exception('Challenge stimmt nicht überein.');

            // origin prüfen (erlaubt alle Subdomains der rpId bei shared-Domain-Konfiguration)
            if (!self::isValidOriginForRpId($clientData['origin'] ?? '', self::getRpId()))
                throw new Exception('Origin stimmt nicht: ' . ($clientData['origin'] ?? '') . ' vs rpId ' . self::getRpId());

            // attestationObject dekodieren
            $attObj = self::cborDecode(self::base64urlDecode($credential['response']['attestationObject'] ?? ''));
            if (!$attObj) throw new Exception('attestationObject ungültig.');

            // authData parsen
            $authData = $attObj['authData'] ?? '';
            if (strlen($authData) < 37) throw new Exception('authData zu kurz.');

            $rpIdHash  = substr($authData, 0, 32);
            $flags     = ord($authData[32]);
            // $signCount = unpack('N', substr($authData, 33, 4))[1];

            // rpId-Hash prüfen
            if (!hash_equals(hash('sha256', self::getRpId(), true), $rpIdHash))
                throw new Exception('rpId-Hash stimmt nicht.');

            // UP (User Present) prüfen
            if (!($flags & 0x01)) throw new Exception('User Present nicht gesetzt.');

            // AT (Attested Credential Data) prüfen
            if (!($flags & 0x40)) throw new Exception('Kein Attested Credential Data.');

            // Credential ID aus authData lesen
            $aaguid    = substr($authData, 37, 16);
            $credIdLen = unpack('n', substr($authData, 53, 2))[1];
            $credId    = substr($authData, 55, $credIdLen);
            $coseKey   = substr($authData, 55 + $credIdLen);

            // Credential ID als Base64URL
            $credIdB64 = self::base64urlEncode($credId);

            // COSE Public Key parsen
            $pubKeyData = self::cborDecode($coseKey);
            if (!is_array($pubKeyData)) {
                // Detailliertes Debug: authData Offsets prüfen
                $authLen   = strlen($authData);
                $coseStart = 55 + $credIdLen;
                throw new Exception(
                    'Public Key null. authData-Len=' . $authLen .
                    ' credIdLen=' . $credIdLen .
                    ' coseStart=' . $coseStart .
                    ' coseLen=' . strlen($coseKey) .
                    ' coseHex=' . bin2hex(substr($coseKey, 0, 16)) .
                    ' authHex55=' . bin2hex(substr($authData, 53, 6))
                );
            }

            // Public Key serialisieren: Byte-Strings base64-kodieren (JSON kann kein Binary)
            $pubKeyData = self::encodeKeyBytesForStorage($pubKeyData);
            $pubKeyJson = json_encode($pubKeyData);
            if ($pubKeyJson === null) throw new Exception('Public Key JSON-Encoding fehlgeschlagen.');

            // Duplikat-Check
            $dup = DB::fetchOne('SELECT id FROM ' . DB::tbl('passkeys') . ' WHERE credential_id = ?', [$credIdB64]);
            if ($dup) throw new Exception('Dieser Passkey ist bereits registriert.');

            // AAGUID als Hex
            $aaguidHex = bin2hex($aaguid);

            // Speichern
            DB::query(
                'INSERT INTO ' . DB::tbl('passkeys') . ' (user_id, credential_id, public_key, aaguid, name, sign_count) VALUES (?,?,?,?,?,?)',
                [$userId, $credIdB64, $pubKeyJson, $aaguidHex, $keyName ?: 'Passkey', 0]
            );

            unset($_SESSION['passkey_reg_challenge'], $_SESSION['passkey_reg_user_id']);
            return ['ok' => true, 'name' => $keyName ?: 'Passkey'];

        } catch (Exception $e) {
            return ['ok' => false, 'fehler' => 'Registrierung fehlgeschlagen: ' . $e->getMessage()];
        }
    }

    // Öffentlicher Accessor für rpId (für stateless Discover in api/index.php)
    public static function getRpIdPublic(): string { return self::getRpId(); }

    // ── Authentifizierung: Discoverable Challenge (ohne User-ID) ──
    // (Wird nicht mehr genutzt – stateless via HMAC-Token in api/index.php)
    public static function authChallengeDiscover(): array {
        $challenge = self::randomBytes(32);
        $_SESSION['passkey_auth_challenge']  = base64_encode($challenge);
        $_SESSION['passkey_auth_user_id']    = 0; // wird in verify per credential_id aufgelöst
        $_SESSION['passkey_auth_discoverable'] = true;
        return [
            'challenge'        => base64_encode($challenge),
            'timeout'          => 60000,
            'rpId'             => self::getRpId(),
            'userVerification' => 'preferred',
            'allowCredentials' => [], // leer = Browser zeigt alle verfügbaren Passkeys
        ];
    }

    // ── Authentifizierung: Challenge erzeugen ─────────────────
    public static function authChallenge(int $userId): array {
        $challenge = self::randomBytes(32);
        $_SESSION['passkey_auth_challenge'] = base64_encode($challenge);
        $_SESSION['passkey_auth_user_id']   = $userId;

        $credentials = DB::fetchAll(
            'SELECT credential_id FROM ' . DB::tbl('passkeys') . ' WHERE user_id = ?',
            [$userId]
        );

        return [
            'challenge'        => base64_encode($challenge),
            'timeout'          => 60000,
            'rpId'             => self::getRpId(),
            'userVerification' => 'preferred',
            'allowCredentials' => array_map(function($r) {
                return ['type' => 'public-key', 'id' => $r['credential_id']];
            }, $credentials),
        ];
    }

    // ── Authentifizierung: Stateless Verify (Discover-Flow, kein Session) ──
    public static function authVerifyStateless(array $credential, string $expectedChallenge): array {
        try {
            $credId = $credential['id'] ?? '';
            if (!$credId) throw new Exception('Keine Credential-ID.');

            $clientData = json_decode(self::base64urlDecode($credential['response']['clientDataJSON'] ?? ''), true);
            if (!$clientData) throw new Exception('clientDataJSON ungültig.');
            if (($clientData['type'] ?? '') !== 'webauthn.get') throw new Exception('Falscher type.');

            $gotChallenge = self::base64urlDecode($clientData['challenge'] ?? '');
            if (!hash_equals($expectedChallenge, $gotChallenge)) throw new Exception('Challenge stimmt nicht.');
            if (!self::isValidOriginForRpId($clientData['origin'] ?? '', self::getRpId())) throw new Exception('Origin stimmt nicht.');

            $authData = self::base64urlDecode($credential['response']['authenticatorData'] ?? '');
            if (strlen($authData) < 37) throw new Exception('authenticatorData zu kurz.');
            if (!hash_equals(hash('sha256', self::getRpId(), true), substr($authData, 0, 32))) throw new Exception('rpId-Hash stimmt nicht.');
            if (!(ord($authData[32]) & 0x01)) throw new Exception('User Present nicht gesetzt.');

            $pk = DB::fetchOne('SELECT * FROM ' . DB::tbl('passkeys') . ' WHERE credential_id = ?', [$credId]);
            if (!$pk) throw new Exception('Passkey nicht gefunden.');

            $signature      = self::base64urlDecode($credential['response']['signature'] ?? '');
            $clientDataHash = hash('sha256', self::base64urlDecode($credential['response']['clientDataJSON'] ?? ''), true);
            $verifyData     = $authData . $clientDataHash;

            $pubKeyData = json_decode($pk['public_key'], true);
            if (!is_array($pubKeyData)) throw new Exception('Public Key ungültig.');
            $pubKeyData = self::decodeKeyBytesFromStorage($pubKeyData);
            if (!self::verifySignature($verifyData, $signature, $pubKeyData))
                throw new Exception('Signatur ungültig.');

            $signCount = unpack('N', substr($authData, 33, 4))[1];
            if ($pk['sign_count'] > 0 && $signCount <= $pk['sign_count'])
                throw new Exception('Sign Count zu niedrig.');

            DB::query('UPDATE ' . DB::tbl('passkeys') . ' SET sign_count=?, letzter_login=NOW() WHERE id=?', [$signCount, $pk['id']]);
            return ['ok' => true];
        } catch (Exception $e) {
            return ['ok' => false, 'fehler' => 'Authentifizierung fehlgeschlagen: ' . $e->getMessage()];
        }
    }

    // ── Authentifizierung: Response verifizieren ──────────────
    public static function authVerify(array $credential): array {
        if (empty($_SESSION['passkey_auth_challenge'])) {
            return ['ok' => false, 'fehler' => 'Keine ausstehende Authentifizierung.'];
        }
        // Bei Discoverable-Flow ist passkey_auth_user_id === 0 → das ist OK
        $isDiscoverable = !empty($_SESSION['passkey_auth_discoverable']);
        if (!$isDiscoverable && empty($_SESSION['passkey_auth_user_id'])) {
            return ['ok' => false, 'fehler' => 'Keine ausstehende Authentifizierung.'];
        }

        $expectedChallenge = base64_decode($_SESSION['passkey_auth_challenge']);
        $userId = (int)($_SESSION['passkey_auth_user_id'] ?? 0);

        try {
            $credId = $credential['id'] ?? '';
            if (!$credId) throw new Exception('Keine Credential-ID.');

            // Passkey in DB suchen – bei Discoverable nur per credential_id
            if ($isDiscoverable || !$userId) {
                $pk = DB::fetchOne(
                    'SELECT * FROM ' . DB::tbl('passkeys') . ' WHERE credential_id = ?',
                    [$credId]
                );
            } else {
                $pk = DB::fetchOne(
                    'SELECT * FROM ' . DB::tbl('passkeys') . ' WHERE credential_id = ? AND user_id = ?',
                    [$credId, $userId]
                );
            }
            if (!$pk) throw new Exception('Passkey nicht gefunden.');

            // clientDataJSON
            $clientData = json_decode(
                self::base64urlDecode($credential['response']['clientDataJSON'] ?? ''),
                true
            );
            if (!$clientData) throw new Exception('clientDataJSON ungültig.');

            if (($clientData['type'] ?? '') !== 'webauthn.get')
                throw new Exception('Falscher type.');

            $gotChallenge = self::base64urlDecode($clientData['challenge'] ?? '');
            if (!hash_equals($expectedChallenge, $gotChallenge))
                throw new Exception('Challenge stimmt nicht.');

            if (!self::isValidOriginForRpId($clientData['origin'] ?? '', self::getRpId()))
                throw new Exception('Origin stimmt nicht.');

            // authenticatorData
            $authData = self::base64urlDecode($credential['response']['authenticatorData'] ?? '');
            if (strlen($authData) < 37) throw new Exception('authenticatorData zu kurz.');

            $rpIdHash = substr($authData, 0, 32);
            $flags    = ord($authData[32]);
            $signCount = unpack('N', substr($authData, 33, 4))[1];

            if (!hash_equals(hash('sha256', self::getRpId(), true), $rpIdHash))
                throw new Exception('rpId-Hash stimmt nicht.');

            if (!($flags & 0x01)) throw new Exception('User Present nicht gesetzt.');

            // Signatur prüfen
            $signature     = self::base64urlDecode($credential['response']['signature'] ?? '');
            $clientDataHash = hash('sha256', self::base64urlDecode($credential['response']['clientDataJSON'] ?? ''), true);
            $verifyData    = $authData . $clientDataHash;

            $pubKeyData = json_decode($pk['public_key'], true);
            if (!is_array($pubKeyData)) {
                // Kaputten Passkey löschen damit User neu registrieren kann
                DB::query('DELETE FROM ' . DB::tbl('passkeys') . ' WHERE id = ?', [$pk['id']]);
                throw new Exception('Passkey-Daten in der Datenbank ungültig. Bitte Passkey neu registrieren.');
            }
            $pubKeyData = self::decodeKeyBytesFromStorage($pubKeyData);
            if (!self::verifySignature($verifyData, $signature, $pubKeyData))
                throw new Exception('Signatur ungültig.');

            // Sign Count prüfen (Replay-Schutz, großzügig: nur wenn Server-Count > 0)
            if ($pk['sign_count'] > 0 && $signCount <= $pk['sign_count'])
                throw new Exception('Sign Count zu niedrig (möglicher Replay-Angriff).');

            // Count + letzter Login aktualisieren
            DB::query(
                'UPDATE ' . DB::tbl('passkeys') . ' SET sign_count = ?, letzter_login = NOW() WHERE id = ?',
                [$signCount, $pk['id']]
            );

            // Bei Discoverable-Flow: user_id aus dem gefundenen Passkey in Session schreiben
            // damit api/index.php den User nachschlagen kann
            if ($isDiscoverable || !$userId) {
                $_SESSION['passkey_auth_user_id'] = (int)$pk['user_id'];
            }
            unset($_SESSION['passkey_auth_challenge'], $_SESSION['passkey_auth_discoverable']);
            return ['ok' => true];

        } catch (Exception $e) {
            return ['ok' => false, 'fehler' => 'Authentifizierung fehlgeschlagen: ' . $e->getMessage()];
        }
    }

    // ── Passkeys eines Users laden ─────────────────────────────
    public static function listForUser(int $userId): array {
        return DB::fetchAll(
            'SELECT id, name, aaguid, letzter_login, erstellt_am FROM ' . DB::tbl('passkeys') .
            ' WHERE user_id = ? ORDER BY erstellt_am DESC',
            [$userId]
        );
    }

    // ── Prüfen ob User mindestens einen Passkey hat ────────────
    public static function userHasPasskey(int $userId): bool {
        try {
            $r = DB::fetchOne('SELECT COUNT(*) AS n FROM ' . DB::tbl('passkeys') . ' WHERE user_id = ?', [$userId]);
            return ($r['n'] ?? 0) > 0;
        } catch (\Exception $e) {
            return false;
        }
    }

    // ── Passkey löschen ────────────────────────────────────────
    public static function delete(int $passkeyId, int $userId): bool {
        $stmt = DB::query('DELETE FROM ' . DB::tbl('passkeys') . ' WHERE id = ? AND user_id = ?', [$passkeyId, $userId]);
        return $stmt->rowCount() > 0;
    }

    // ══════════════════════════════════════════════════════════
    // Interne Hilfsfunktionen
    // ══════════════════════════════════════════════════════════

    private static function randomBytes(int $n): string {
        return random_bytes($n);
    }

    public static function base64urlDecode(string $s): string {
        $s = strtr($s, '-_', '+/');
        $pad = strlen($s) % 4;
        if ($pad) $s .= str_repeat('=', 4 - $pad);
        return base64_decode($s);
    }

    public static function base64urlEncode(string $s): string {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    // ── Signatur prüfen (ES256 + RS256) ───────────────────────
    // Byte-Strings in COSE-Key base64-kodieren für JSON-Storage
    private static function encodeKeyBytesForStorage(array $key): array {
        $result = [];
        foreach ($key as $k => $v) {
            if (is_string($v) && !mb_detect_encoding($v, 'UTF-8', true)) {
                $result[$k] = ['__b64__' => base64_encode($v)];
            } else {
                $result[$k] = $v;
            }
        }
        return $result;
    }

    // base64-dekodierte Byte-Strings aus Storage wiederherstellen
    private static function decodeKeyBytesFromStorage(array $key): array {
        $result = [];
        foreach ($key as $k => $v) {
            if (is_array($v) && isset($v['__b64__'])) {
                $result[$k] = base64_decode($v['__b64__']);
            } else {
                $result[$k] = $v;
            }
        }
        return $result;
    }

    private static function verifySignature(string $data, string $sig, array $coseKey): bool {
        // CBOR Map Keys sind Strings (auch negative Integers → "-7", "3" etc.)
        $alg = (int)($coseKey['3'] ?? $coseKey[3] ?? -7);

        if ($alg === -7 || $alg === -35 || $alg === -36) {
            return self::verifyEs256($data, $sig, $coseKey);
        } elseif ($alg === -257) {
            return self::verifyRs256($data, $sig, $coseKey);
        }
        // Unbekannter Algorithmus
        throw new Exception('Unbekannter COSE-Algorithmus: ' . $alg);
    }

    private static function verifyEs256(string $data, string $sig, array $coseKey): bool {
        // x=Key -2, y=Key -3 (als String-Keys wegen CBOR-Decoder)
        $x = $coseKey['-2'] ?? $coseKey[-2] ?? '';
        $y = $coseKey['-3'] ?? $coseKey[-3] ?? '';
        if (!$x || !$y) return false;

        // PEM aus Raw-Koordinaten bauen
        $keyData = "\x04" . $x . $y; // uncompressed point
        $spki = "\x30\x59"                         // SEQUENCE
              . "\x30\x13"                         // SEQUENCE
              . "\x06\x07\x2a\x86\x48\xce\x3d\x02\x01"  // OID ecPublicKey
              . "\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07"  // OID P-256
              . "\x03\x42\x00" . $keyData;         // BIT STRING

        $pem = "-----BEGIN PUBLIC KEY-----\n"
             . chunk_split(base64_encode($spki), 64, "\n")
             . "-----END PUBLIC KEY-----";

        $pubKey = openssl_pkey_get_public($pem);
        if (!$pubKey) return false;

        // DER-Signatur (falls raw r||s, konvertieren)
        $derSig = self::ensureDerSignature($sig);

        return openssl_verify($data, $derSig, $pubKey, OPENSSL_ALGO_SHA256) === 1;
    }

    private static function verifyRs256(string $data, string $sig, array $coseKey): bool {
        $n = $coseKey['-1'] ?? $coseKey[-1] ?? '';
        $e = $coseKey['-2'] ?? $coseKey[-2] ?? '';
        if (!$n || !$e) return false;

        // RSA Public Key als PKCS#1 DER
        $nHex = bin2hex($n);
        $eHex = bin2hex($e);

        // DER-Encoding für RSA Public Key
        $nDer = self::derInteger($n);
        $eDer = self::derInteger($e);
        $rsaKey = self::derSequence($nDer . $eDer);
        $spki = self::derSequence(
            self::derSequence("\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00") .
            "\x03" . self::derLength(strlen($rsaKey) + 1) . "\x00" . $rsaKey
        );

        $pem = "-----BEGIN PUBLIC KEY-----\n"
             . chunk_split(base64_encode($spki), 64, "\n")
             . "-----END PUBLIC KEY-----";

        $pubKey = openssl_pkey_get_public($pem);
        if (!$pubKey) return false;

        return openssl_verify($data, $sig, $pubKey, OPENSSL_ALGO_SHA256) === 1;
    }

    // DER-Signatur sicherstellen (bei ECDSA: raw r||s → ASN.1 DER)
    private static function ensureDerSignature(string $sig): string {
        if (strlen($sig) !== 64) return $sig; // schon DER oder unbekannt
        $r = substr($sig, 0, 32);
        $s = substr($sig, 32, 32);
        return self::derSequence(self::derInteger($r) . self::derInteger($s));
    }

    private static function derInteger(string $bytes): string {
        $bytes = ltrim($bytes, "\x00");
        if (ord($bytes[0]) >= 0x80) $bytes = "\x00" . $bytes;
        return "\x02" . self::derLength(strlen($bytes)) . $bytes;
    }

    private static function derSequence(string $content): string {
        return "\x30" . self::derLength(strlen($content)) . $content;
    }

    private static function derLength(int $len): string {
        if ($len < 0x80) return chr($len);
        if ($len < 0x100) return "\x81" . chr($len);
        return "\x82" . chr(($len >> 8) & 0xFF) . chr($len & 0xFF);
    }

    // ── Minimal CBOR-Decoder (für WebAuthn-Responses) ─────────
    public static function cborDecode(string $data): mixed {
        $pos = 0;
        return self::cborDecodeItem($data, $pos);
    }

    private static function cborDecodeItem(string $data, int &$pos): mixed {
        if ($pos >= strlen($data)) return null;
        $byte      = ord($data[$pos++]);
        $majorType = ($byte >> 5) & 0x07;
        $addInfo   = $byte & 0x1F;

        switch ($majorType) {
            case 0: // unsigned int
                return self::cborReadLength($data, $pos, $addInfo);
            case 1: // negative int
                $v = self::cborReadLength($data, $pos, $addInfo);
                return -1 - $v;
            case 2: // bytes
                $len = self::cborReadLength($data, $pos, $addInfo);
                $bytes = substr($data, $pos, $len);
                $pos += $len;
                return $bytes;
            case 3: // text
                $len = self::cborReadLength($data, $pos, $addInfo);
                $text = substr($data, $pos, $len);
                $pos += $len;
                return $text;
            case 4: // array
                $count = self::cborReadLength($data, $pos, $addInfo);
                $arr = [];
                for ($i = 0; $i < $count; $i++) {
                    $arr[] = self::cborDecodeItem($data, $pos);
                }
                return $arr;
            case 5: // map — Keys als Strings speichern damit negative Integers funktionieren
                $count = self::cborReadLength($data, $pos, $addInfo);
                $map = [];
                for ($i = 0; $i < $count; $i++) {
                    $k = self::cborDecodeItem($data, $pos);
                    $v = self::cborDecodeItem($data, $pos);
                    // PHP-Array-Keys: Integer-Keys (auch negative) explizit als String
                    $map[(string)$k] = $v;
                }
                return $map;
            case 6: // tag — ignorieren, Wert lesen
                self::cborReadLength($data, $pos, $addInfo);
                return self::cborDecodeItem($data, $pos);
            case 7: // float/simple
                if ($addInfo === 20) return false;  // false
                if ($addInfo === 21) return true;   // true
                if ($addInfo === 22) return null;   // null
                if ($addInfo === 24) { $pos++; return null; } // simple value
                if ($addInfo === 25) { $pos += 2; return null; } // float16
                if ($addInfo === 26) { $pos += 4; return null; } // float32
                if ($addInfo === 27) { $pos += 8; return null; } // float64
                return null;
            default:
                return null;
        }
    }

    private static function cborReadLength(string $data, int &$pos, int $addInfo): int {
        if ($addInfo < 24) return $addInfo;
        if ($addInfo === 24) return ord($data[$pos++]);
        if ($addInfo === 25) {
            $v = unpack('n', substr($data, $pos, 2))[1]; $pos += 2; return $v;
        }
        if ($addInfo === 26) {
            $v = unpack('N', substr($data, $pos, 4))[1]; $pos += 4; return $v;
        }
        if ($addInfo === 27) {
            $v = unpack('J', substr($data, $pos, 8))[1]; $pos += 8; return (int)$v;
        }
        return 0;
    }
}
