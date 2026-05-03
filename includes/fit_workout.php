<?php
// ============================================================
// Trainingsportal – Minimaler FIT-Workout-Encoder
// ============================================================
// Erzeugt eine .FIT-Datei nach Garmin-Spec (Profile-Version 21.x)
// für Lauf-Workouts mit Distanz-basierten Intervallen.
//
// Beschränkungen (bewusst, für robusten Garmin-Import):
//   - Sport: running
//   - Schritt-Dauer: nur "distance" (Meter)
//   - Schritt-Target: nur "open" (kein Pace-Target im FIT-File)
//     → Pace folgt aus der Workout-Beschreibung; das vermeidet
//       Probleme mit Geräten, die schmale Pace-Bereiche zickig finden
//   - Warmup/Cooldown nicht enthalten (User ergänzt in Connect)
//
// Quellen: FIT SDK Profile.xlsx (Workout, WorkoutStep, FileId)
// ============================================================

class FitWorkout {

    // Base-Type-IDs aus FIT SDK
    const TYPE_ENUM   = 0x00;
    const TYPE_UINT8  = 0x02;
    const TYPE_UINT16 = 0x84;
    const TYPE_UINT32 = 0x86;
    const TYPE_STRING = 0x07;

    /**
     * @param int $einheitId
     * @param string $name           Workout-Name (max 15 Zeichen + NUL)
     * @param array $segmente        Liste von Segmenten (s. training_segmente)
     * @return string Binärinhalt der .fit-Datei
     */
    public static function encode(int $einheitId, string $name, array $segmente): string {
        // Schritte aus Segmenten ableiten
        $steps = [];
        foreach ($segmente as $s) {
            $wdh   = max(1, (int)($s['wiederholungen'] ?? 1));
            $dist  = (int)($s['distanz_m'] ?? 0);
            $pause = (int)($s['pause_m']   ?? 0);
            if ($dist <= 0) continue;

            if ($wdh === 1) {
                $steps[] = ['type' => 'active', 'distanz_m' => $dist];
                if ($pause > 0) {
                    $steps[] = ['type' => 'recovery', 'distanz_m' => $pause];
                }
            } else {
                $aktivIndex = count($steps);
                $steps[] = ['type' => 'active',   'distanz_m' => $dist];
                if ($pause > 0) {
                    $steps[] = ['type' => 'recovery', 'distanz_m' => $pause];
                }
                $steps[] = ['type' => 'repeat', 'from_index' => $aktivIndex, 'wdh' => $wdh];
            }
        }

        if (empty($steps)) {
            // Leeres Workout → ein generischer offener Schritt
            $steps[] = ['type' => 'active', 'distanz_m' => 1000];
        }

        // ── Body assemblieren ───────────────────────────────────
        $body = '';

        // 1) FILE_ID Definition-Message (local_type 0, global #0)
        //    Felder: type(0), manufacturer(1), product(2), time_created(4), serial_number(3)
        $body .= self::defMsg(0, 0, [
            [0, 1, self::TYPE_ENUM],   // type
            [1, 2, self::TYPE_UINT16], // manufacturer
            [2, 2, self::TYPE_UINT16], // product
            [4, 4, self::TYPE_UINT32], // time_created (sec since 1989-12-31 UTC)
            [3, 4, self::TYPE_UINT32], // serial_number
        ]);
        $time = max(0, time() - 631065600); // FIT-Epoch
        $body .= chr(0)
              . chr(5)                                  // type=5 → workout
              . self::u16(255)                          // manufacturer=development
              . self::u16(0)                            // product
              . self::u32($time)
              . self::u32($einheitId & 0xFFFFFFFF);     // serial = einheit_id

        // 2) WORKOUT Definition-Message (local_type 1, global #26)
        $body .= self::defMsg(1, 26, [
            [4, 4, self::TYPE_UINT32], // capabilities
            [5, 1, self::TYPE_ENUM],   // sport
            [6, 2, self::TYPE_UINT16], // num_valid_steps
            [8, 16, self::TYPE_STRING],// wkt_name (16 Bytes inkl. NUL)
        ]);
        $body .= chr(1)
              . self::u32(32)                       // capabilities (FIT_WORKOUT_CAPABILITIES = 32 = INTERVAL)
              . chr(1)                              // sport = running
              . self::u16(count($steps))
              . self::strFix($name, 16);

        // 3) WORKOUT_STEP Definition-Message (local_type 2, global #27)
        //    Felder: message_index(254), duration_type(1), duration_value(2),
        //            target_type(3), target_value(4), intensity(7)
        $body .= self::defMsg(2, 27, [
            [254, 2, self::TYPE_UINT16], // message_index
            [1,   1, self::TYPE_ENUM],   // duration_type
            [2,   4, self::TYPE_UINT32], // duration_value
            [3,   1, self::TYPE_ENUM],   // target_type
            [4,   4, self::TYPE_UINT32], // target_value
            [7,   1, self::TYPE_ENUM],   // intensity
        ]);

        // 4) WORKOUT_STEP-Datenrecords
        foreach ($steps as $idx => $st) {
            if ($st['type'] === 'repeat') {
                // duration_type=6 (repeat_until_steps_cmplt), duration_value=from_index,
                // target_type=2 (open), target_value=wiederholungen, intensity=other (6)
                $body .= chr(2)
                      . self::u16($idx)
                      . chr(6)
                      . self::u32((int)$st['from_index'])
                      . chr(2)
                      . self::u32((int)$st['wdh'])
                      . chr(6);
            } else {
                $intensity = ($st['type'] === 'recovery') ? 4 : 5; // recovery / interval
                // duration_type=1 (distance), duration_value=Meter*100 (1cm-Auflösung),
                // target_type=2 (open), target_value=0
                $body .= chr(2)
                      . self::u16($idx)
                      . chr(1)
                      . self::u32(((int)$st['distanz_m']) * 100)
                      . chr(2)
                      . self::u32(0)
                      . chr($intensity);
            }
        }

        // ── Header (12 Bytes) ────────────────────────────────────
        $header = chr(12)            // header_size
                . chr(0x10)          // protocol_version 1.0
                . self::u16(2140)    // profile_version 21.40
                . self::u32(strlen($body))
                . '.FIT';

        // ── CRC über Header + Body ──────────────────────────────
        $crc = self::crc16($header . $body);

        return $header . $body . self::u16($crc);
    }

    // ── Helpers ─────────────────────────────────────────────────

    private static function defMsg(int $localType, int $globalMesgNum, array $felder): string {
        $s = chr(0x40 | ($localType & 0x0F))
           . chr(0)                  // reserved
           . chr(0)                  // architecture: little endian
           . self::u16($globalMesgNum)
           . chr(count($felder));
        foreach ($felder as $f) {
            $s .= chr($f[0]) . chr($f[1]) . chr($f[2]);
        }
        return $s;
    }

    private static function u16(int $v): string { return pack('v', $v & 0xFFFF); }
    private static function u32(int $v): string { return pack('V', $v & 0xFFFFFFFF); }

    private static function strFix(string $s, int $size): string {
        $s = substr($s, 0, $size - 1);
        return $s . str_repeat("\x00", $size - strlen($s));
    }

    /** FIT CRC-16 (Tabelle aus SDK) */
    private static function crc16(string $data): int {
        static $table = [
            0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
            0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
        ];
        $crc = 0;
        $len = strlen($data);
        for ($i = 0; $i < $len; $i++) {
            $byte = ord($data[$i]);
            $tmp = $table[$crc & 0xF];
            $crc = ($crc >> 4) & 0x0FFF;
            $crc = $crc ^ $tmp ^ $table[$byte & 0xF];
            $tmp = $table[$crc & 0xF];
            $crc = ($crc >> 4) & 0x0FFF;
            $crc = $crc ^ $tmp ^ $table[($byte >> 4) & 0xF];
        }
        return $crc & 0xFFFF;
    }
}
