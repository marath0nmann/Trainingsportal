<?php
/**
 * TOTP (RFC 6238) – komplett ohne externe Libraries
 * HMAC-SHA1, 6-stellig, 30s-Fenster
 */
class TOTP {

    // ---- Secret generieren (Base32, 20 Bytes = 160 Bit) ----
    public static function generateSecret(): string {
        $bytes = random_bytes(20);
        return self::base32Encode($bytes);
    }

    // ---- Code für aktuellen Zeitstempel prüfen (±1 Fenster Toleranz) ----
    public static function verify(string $secret, string $code, int $tolerance = 1): bool {
        $code = preg_replace('/\s+/', '', $code);
        if (!preg_match('/^\d{6}$/', $code)) return false;
        $time = (int)floor(time() / 30);
        for ($i = -$tolerance; $i <= $tolerance; $i++) {
            if (hash_equals(self::generateCode($secret, $time + $i), $code)) {
                return true;
            }
        }
        return false;
    }

    // ---- Code für Zeitfenster generieren ----
    public static function generateCode(string $secret, int $time): string {
        $key     = self::base32Decode($secret);
        $counter = pack('N*', 0) . pack('N*', $time);   // 8 Byte Big-Endian
        $hash    = hash_hmac('sha1', $counter, $key, true);
        $offset  = ord($hash[19]) & 0x0F;
        $value   = (
            ((ord($hash[$offset])     & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8)  |
            ((ord($hash[$offset + 3]) & 0xFF))
        );
        return str_pad((string)($value % 1000000), 6, '0', STR_PAD_LEFT);
    }

    // ---- OTPAuth-URI für QR-Code ----
    public static function getUri(string $secret, string $account, string $issuer = 'Statistikportal'): string {
        return 'otpauth://totp/' . rawurlencode($issuer) . ':' . rawurlencode($account)
            . '?secret=' . $secret
            . '&issuer=' . rawurlencode($issuer)
            . '&algorithm=SHA1&digits=6&period=30';
    }

    // ---- QR-Code-URL (via Google Charts API – kein JS-Lib nötig) ----
    public static function getQrUrl(string $uri): string {
        return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . rawurlencode($uri);
    }

    // ---- Backup-Codes generieren (8 Stück, je 8 Hex-Zeichen) ----
    public static function generateBackupCodes(): array {
        $codes = [];
        for ($i = 0; $i < 8; $i++) {
            $codes[] = strtoupper(bin2hex(random_bytes(4)));
        }
        return $codes;
    }

    // ---- Base32 Encode ----
    private static function base32Encode(string $input): string {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $output   = '';
        $v        = 0;
        $vbits    = 0;
        for ($i = 0, $len = strlen($input); $i < $len; $i++) {
            $v = ($v << 8) | ord($input[$i]);
            $vbits += 8;
            while ($vbits >= 5) {
                $vbits -= 5;
                $output .= $alphabet[($v >> $vbits) & 31];
            }
        }
        if ($vbits > 0) {
            $output .= $alphabet[($v << (5 - $vbits)) & 31];
        }
        // Kein Padding nötig für Authenticator-Apps
        return $output;
    }

    // ---- Base32 Decode ----
    private static function base32Decode(string $input): string {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $input    = strtoupper(rtrim($input, '='));
        $output   = '';
        $v        = 0;
        $vbits    = 0;
        for ($i = 0, $len = strlen($input); $i < $len; $i++) {
            $pos = strpos($alphabet, $input[$i]);
            if ($pos === false) continue;
            $v = ($v << 5) | $pos;
            $vbits += 5;
            if ($vbits >= 8) {
                $vbits -= 8;
                $output .= chr(($v >> $vbits) & 0xFF);
            }
        }
        return $output;
    }
}
