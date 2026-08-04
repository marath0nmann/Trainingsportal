<?php
// ============================================================
// Trainingsportal – Apple-Workout-Encoder (.workout)
// ============================================================
// Erzeugt eine .workout-Datei, wie sie die iOS-Fitness-App beim
// Teilen eines eigenen Trainings ausgibt (WorkoutKit, iOS 17+).
// Ein Tippen auf die Datei am iPhone importiert das Training und
// stellt es auf der Apple Watch bereit.
//
// Format: Protobuf ohne Schema-Datei. Die Feldnummern stammen aus
// der Analyse einer von iOS exportierten Referenzdatei; der Encoder
// reproduziert diese Referenz byte-identisch.
//
//   Top-Level
//     9   string   UUID des Workouts
//     11  message  Workout
//     1000/1002    Formatmarker (konstant 1 bzw. 5)
//
//   Workout
//     1   varint   HKWorkoutActivityType (37 = Laufen)
//     2   varint   Location (3 = wie von iOS exportiert)
//     3   string   Name
//     5   message  Block (wiederholt)
//
//   Block
//     1   message  Schritt (wiederholt)
//     2   varint   Anzahl Wiederholungen
//
//   Schritt
//     1   varint   Zweck (1 = Training, 2 = Erholung)
//     2   message  Detail { 1 Ziel, 2 Vorgabe, 3 Anzeigename }
//
//   Ziel:    1 = Typ (3 = Distanz, 4 = offen), 4 = Menge
//   Menge:   1 = Einheit (1 = Meter/Sekunden, 2 = Kilometer), 2 = double
//   Vorgabe: 1 = Typ (1 = Pace), 2 = Metrik, 4 → 2 → {1 min, 2 max}
//            Geschwindigkeit als Verhältnis Meter/Sekunde
// ============================================================

class AppleWorkout {

    const ACTIVITY_RUNNING = 37;

    // Pace-Korridor um die Zielpace (Sekunden pro km)
    const PACE_TOLERANZ_SEK = 5;

    /**
     * @param string $name        Workout-Name (in der Fitness-App sichtbar)
     * @param array  $segmente    Segmente (s. training_segmente)
     * @param array  $paceSekProKm  ['<pace_referenz>' => Sekunden pro km]
     * @return string Binärinhalt der .workout-Datei
     */
    public static function encode(string $name, array $segmente, array $paceSekProKm = []): string
    {
        $bloecke = '';
        foreach ($segmente as $s) {
            $dist = (int)($s['distanz_m'] ?? 0);
            if ($dist <= 0) continue;
            $wdh   = max(1, (int)($s['wiederholungen'] ?? 1));
            $pause = (int)($s['pause_m'] ?? 0);

            // Zielpace für dieses Segment (nur wenn Referenzzeit vorhanden)
            $ref     = $s['pace_referenz'] ?? null;
            $sekProKm = ($ref !== null && isset($paceSekProKm[$ref])) ? (float)$paceSekProKm[$ref] : null;

            $steps = self::step(1, $dist, $sekProKm, $s['notiz'] ?? null);
            if ($pause > 0) {
                $steps .= self::step(2, $pause, null, self::pausenName($s, $pause));
            }
            $bloecke .= self::fLen(5, $steps . self::fVar(2, $wdh));
        }

        // Ohne verwertbare Segmente: ein einzelner offener Kilometer
        if ($bloecke === '') {
            $bloecke = self::fLen(5, self::step(1, 1000, null, null) . self::fVar(2, 1));
        }

        $workout = self::fVar(1, self::ACTIVITY_RUNNING)
                 . self::fVar(2, 3)
                 . self::fStr(3, $name)
                 . $bloecke;

        return self::fStr(9, self::uuid())
             . self::fLen(11, $workout)
             . self::fVar(1000, 1)
             . self::fVar(1002, 5);
    }

    // ── Ein Schritt (Training oder Erholung) ────────────────────
    private static function step(int $zweck, int $distanzM, ?float $sekProKm, ?string $anzeigeName): string
    {
        // Ziel: Distanz in Kilometern
        $ziel = self::fVar(1, 3) . self::fLen(4, self::menge(2, $distanzM / 1000));

        $detail = self::fLen(1, $ziel);

        // Pace-Vorgabe als Geschwindigkeitskorridor
        if ($sekProKm !== null && $sekProKm > 0) {
            $langsam = 1000.0 / ($sekProKm + self::PACE_TOLERANZ_SEK);
            $schnell = 1000.0 / max(1.0, $sekProKm - self::PACE_TOLERANZ_SEK);
            $bereich = self::fLen(1, self::tempo($langsam)) . self::fLen(2, self::tempo($schnell));
            $detail .= self::fLen(2, self::fVar(1, 1) . self::fVar(2, 2) . self::fLen(4, self::fLen(2, $bereich)));
        }

        if ($anzeigeName !== null && $anzeigeName !== '') {
            $detail .= self::fStr(3, mb_substr($anzeigeName, 0, 60));
        }

        return self::fLen(1, self::fVar(1, $zweck) . self::fLen(2, $detail));
    }

    private static function pausenName(array $s, int $pause): string
    {
        $label = [
            'TP' => 'Trabpause',
            'GP' => 'Gehpause',
            'BP' => 'Blockpause',
        ][$s['pause_typ'] ?? ''] ?? 'Pause';
        return $label . ' ' . $pause . 'm';
    }

    // Menge {1: Einheit, 2: double}
    private static function menge(int $einheit, float $wert): string
    {
        return self::fVar(1, $einheit) . self::fDbl(2, $wert);
    }

    // Geschwindigkeit als Verhältnis: x Meter je 1 Sekunde
    private static function tempo(float $meterProSek): string
    {
        return self::fLen(1, self::menge(1, $meterProSek)) . self::fLen(2, self::menge(1, 1.0));
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return strtoupper(vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4)));
    }

    // ── Protobuf-Primitive ──────────────────────────────────────
    private static function varint(int $n): string
    {
        $out = '';
        while ($n > 127) {
            $out .= chr(($n & 127) | 128);
            $n >>= 7;
        }
        return $out . chr($n);
    }

    private static function key(int $feld, int $typ): string
    {
        return self::varint($feld * 8 + $typ);
    }

    private static function fVar(int $feld, int $wert): string
    {
        return self::key($feld, 0) . self::varint($wert);
    }

    private static function fLen(int $feld, string $bytes): string
    {
        return self::key($feld, 2) . self::varint(strlen($bytes)) . $bytes;
    }

    private static function fStr(int $feld, string $s): string
    {
        return self::fLen($feld, $s);
    }

    private static function fDbl(int $feld, float $wert): string
    {
        return self::key($feld, 1) . pack('e', $wert);
    }
}
