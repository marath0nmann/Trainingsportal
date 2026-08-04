<?php
// ============================================================
// Trainingsportal – Segment-Baum (serverseitig)
// ============================================================
// Gegenstück zu htdocs/js/20_segmente.js: baut aus den flachen
// Segmentzeilen (training_segmente / training_block_segmente)
// den verschachtelten Baum und liefert daraus Distanzen, Text
// und Export-Blöcke für Uhren.
//
// Knotenarten:
//   ['typ' => 'gruppe', 'wiederholungen' => 3, 'kinder' => [...]]
//   ['typ' => 'work',   'distanz_m' => 400, 'pace_referenz' => '5000']
//   ['typ' => 'pause',  'distanz_m' => 100, 'pause_typ' => 'TP']
//
// Zeilen ohne knoten_id stammen aus der Zeit vor den verschachtelten
// Blöcken (Gruppierung über gruppen_id/block_id, Pause in pause_m)
// und werden transparent umgesetzt.
// ============================================================

class Segbaum {

    const PAUSE_LBL = ['TP' => 'Trabpause', 'GP' => 'Gehpause', 'BP' => 'Blockpause', 'frei' => 'Pause'];

    /** Flache Zeilen → Baum */
    public static function ausRows(array $rows): array
    {
        if (!$rows) return [];
        foreach ($rows as $r) {
            if (isset($r['knoten_id']) && $r['knoten_id'] !== null) return self::ausRowsNeu($rows);
        }
        return self::ausRowsAlt($rows);
    }

    private static function ausRowsNeu(array $rows): array
    {
        usort($rows, fn($a, $b) => ((int)($a['reihenfolge'] ?? 0)) <=> ((int)($b['reihenfolge'] ?? 0)));
        $knoten = [];
        foreach ($rows as $r) {
            $knoten[(int)$r['knoten_id']] = self::knotenAusRow($r);
        }
        $wurzel = [];
        foreach ($rows as $r) {
            $id = (int)$r['knoten_id'];
            $eid = isset($r['eltern_id']) && $r['eltern_id'] !== null ? (int)$r['eltern_id'] : null;
            if ($eid !== null && isset($knoten[$eid]) && $knoten[$eid]['typ'] === 'gruppe') {
                $knoten[$eid]['kinder'][] =& $knoten[$id];
            } else {
                $wurzel[] =& $knoten[$id];
            }
        }
        // Referenzen auflösen (tiefe Kopie)
        return json_decode(json_encode($wurzel), true) ?: [];
    }

    private static function knotenAusRow(array $r): array
    {
        $typ = $r['abschnitt_typ'] ?? 'work';
        if ($typ === 'gruppe') {
            return ['typ' => 'gruppe', 'wiederholungen' => max(1, (int)($r['wiederholungen'] ?? 1)), 'kinder' => []];
        }
        if ($typ === 'pause') {
            return ['typ' => 'pause', 'distanz_m' => (int)($r['distanz_m'] ?? 0), 'pause_typ' => $r['pause_typ'] ?? 'TP'];
        }
        return [
            'typ'           => 'work',
            'distanz_m'     => (int)($r['distanz_m'] ?? 0),
            'pace_referenz' => $r['pace_referenz'] ?? null,
            'notiz'         => $r['notiz'] ?? null,
        ];
    }

    /** Altbestand: Gruppierung über gruppen_id/block_id, Pause als pause_m */
    private static function ausRowsAlt(array $rows): array
    {
        $wurzel  = [];
        $gruppen = [];
        foreach ($rows as $s) {
            $gid = isset($s['gruppen_id']) && $s['gruppen_id'] !== null ? 'g' . $s['gruppen_id']
                 : (isset($s['block_id']) && $s['block_id'] !== null ? 'b' . $s['block_id'] : null);
            $wdh = max(1, (int)($s['wiederholungen'] ?? 1));

            $blaetter = [];
            if (($s['abschnitt_typ'] ?? 'work') === 'pause') {
                $blaetter[] = ['typ' => 'pause', 'distanz_m' => (int)$s['distanz_m'], 'pause_typ' => $s['pause_typ'] ?? 'TP'];
            } else {
                $blaetter[] = [
                    'typ' => 'work', 'distanz_m' => (int)$s['distanz_m'],
                    'pace_referenz' => $s['pace_referenz'] ?? null, 'notiz' => $s['notiz'] ?? null,
                ];
                if (!empty($s['pause_m'])) {
                    $blaetter[] = ['typ' => 'pause', 'distanz_m' => (int)$s['pause_m'], 'pause_typ' => $s['pause_typ'] ?? 'TP'];
                }
            }

            if ($gid !== null) {
                if (!isset($gruppen[$gid])) {
                    $gruppen[$gid] = count($wurzel);
                    $wurzel[] = ['typ' => 'gruppe', 'wiederholungen' => $wdh, 'kinder' => []];
                }
                $i = $gruppen[$gid];
                if ($wdh > $wurzel[$i]['wiederholungen']) $wurzel[$i]['wiederholungen'] = $wdh;
                foreach ($blaetter as $b) $wurzel[$i]['kinder'][] = $b;
            } elseif ($wdh > 1) {
                $wurzel[] = ['typ' => 'gruppe', 'wiederholungen' => $wdh, 'kinder' => $blaetter];
            } else {
                foreach ($blaetter as $b) $wurzel[] = $b;
            }
        }
        return $wurzel;
    }

    /** Gesamtdistanz in Metern (inkl. Pausen und verschachtelter Wiederholungen) */
    public static function gesamtDistanz(array $baum): int
    {
        $sum = 0;
        foreach ($baum as $n) {
            if (($n['typ'] ?? '') === 'gruppe') {
                $sum += max(1, (int)($n['wiederholungen'] ?? 1)) * self::gesamtDistanz($n['kinder'] ?? []);
            } else {
                $sum += (int)($n['distanz_m'] ?? 0);
            }
        }
        return $sum;
    }

    /** Alle Blätter in Trainingsreihenfolge (Wiederholungen ausgerollt) */
    public static function blaetter(array $baum): array
    {
        $out = [];
        foreach ($baum as $n) {
            if (($n['typ'] ?? '') === 'gruppe') {
                $wdh = max(1, (int)($n['wiederholungen'] ?? 1));
                for ($i = 0; $i < $wdh; $i++) {
                    foreach (self::blaetter($n['kinder'] ?? []) as $b) $out[] = $b;
                }
            } else {
                $out[] = $n;
            }
        }
        return $out;
    }

    /**
     * Export-Blöcke für Uhren: [['wiederholungen' => n, 'schritte' => [...]], …]
     * Uhren (FIT/Apple) können keine verschachtelten Wiederholungen – die
     * innerste Wiederholung bleibt kompakt, äußere werden ausgerollt.
     */
    public static function exportBloecke(array $baum): array
    {
        $out    = [];
        $puffer = [];
        $leeren = function () use (&$out, &$puffer) {
            if ($puffer) { $out[] = ['wiederholungen' => 1, 'schritte' => $puffer]; $puffer = []; }
        };
        foreach ($baum as $n) {
            if (($n['typ'] ?? '') !== 'gruppe') { $puffer[] = $n; continue; }
            $leeren();
            $wdh = max(1, (int)($n['wiederholungen'] ?? 1));
            $kinder = $n['kinder'] ?? [];
            $nurBlaetter = true;
            foreach ($kinder as $k) if (($k['typ'] ?? '') === 'gruppe') { $nurBlaetter = false; break; }
            if ($nurBlaetter) {
                $out[] = ['wiederholungen' => $wdh, 'schritte' => $kinder];
            } else {
                for ($i = 0; $i < $wdh; $i++) {
                    foreach (self::exportBloecke($kinder) as $b) $out[] = $b;
                }
            }
        }
        $leeren();
        return $out;
    }

    /** Kurzschrift: "3 × (4 × (400, 100 TP), 400 BP)" */
    public static function kurzschrift(array $baum): string
    {
        return implode(', ', self::kurzTeile($baum));
    }

    private static function kurzTeile(array $baum): array
    {
        $teile = [];
        foreach ($baum as $n) {
            if (($n['typ'] ?? '') === 'gruppe') {
                $inner = implode(', ', self::kurzTeile($n['kinder'] ?? []));
                if ($inner === '') continue;
                $wdh = max(1, (int)($n['wiederholungen'] ?? 1));
                $teile[] = $wdh > 1 ? $wdh . ' × (' . $inner . ')' : $inner;
            } elseif (($n['typ'] ?? '') === 'pause') {
                $k = ['TP' => 'TP', 'GP' => 'GP', 'BP' => 'BP'][$n['pause_typ'] ?? ''] ?? '';
                $teile[] = trim((int)$n['distanz_m'] . ' ' . $k);
            } else {
                $teile[] = (string)(int)$n['distanz_m'];
            }
        }
        return $teile;
    }

    /**
     * Mehrzeilige Beschreibung (ICS): eingerückte Struktur mit Splitzeiten.
     * $paceSekProKm: ['<pace_referenz>' => Sekunden pro km]
     */
    public static function textZeilen(array $baum, array $paceSekProKm = [], int $tiefe = 0): array
    {
        $zeilen = [];
        $ein = str_repeat('  ', $tiefe);
        foreach ($baum as $n) {
            if (($n['typ'] ?? '') === 'gruppe') {
                $wdh = max(1, (int)($n['wiederholungen'] ?? 1));
                if ($wdh > 1) {
                    $zeilen[] = $ein . $wdh . ' x:';
                    foreach (self::textZeilen($n['kinder'] ?? [], $paceSekProKm, $tiefe + 1) as $z) $zeilen[] = $z;
                } else {
                    foreach (self::textZeilen($n['kinder'] ?? [], $paceSekProKm, $tiefe) as $z) $zeilen[] = $z;
                }
                continue;
            }
            if (($n['typ'] ?? '') === 'pause') {
                $lbl = self::PAUSE_LBL[$n['pause_typ'] ?? ''] ?? 'Pause';
                $zeilen[] = $ein . self::distText((int)$n['distanz_m']) . ' ' . $lbl;
                continue;
            }
            $z = $ein . self::distText((int)$n['distanz_m']);
            $ref = $n['pace_referenz'] ?? null;
            if ($ref !== null && isset($paceSekProKm[$ref]) && $paceSekProKm[$ref] > 0) {
                $sekProKm = (float)$paceSekProKm[$ref];
                $split    = $sekProKm * ((int)$n['distanz_m'] / 1000);
                $z .= ' → ' . self::zeitText($split) . ' (' . self::zeitText($sekProKm) . '/km)';
            }
            $zeilen[] = $z;
        }
        return $zeilen;
    }

    public static function distText(int $m): string
    {
        if ($m >= 1000) {
            $km = $m / 1000;
            return rtrim(rtrim(number_format($km, 2, ',', ''), '0'), ',') . ' km';
        }
        return $m . ' m';
    }

    public static function zeitText(float $sek): string
    {
        $sek = (int)round($sek);
        $h = intdiv($sek, 3600);
        $m = intdiv($sek % 3600, 60);
        $s = $sek % 60;
        return $h > 0
            ? sprintf('%d:%02d:%02d', $h, $m, $s)
            : sprintf('%d:%02d', $m, $s);
    }
}
