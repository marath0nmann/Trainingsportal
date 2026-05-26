// ============================================================
// Trainingsportal – Kurzschrift-Parser
// ============================================================
// Erkennt typische Notationen aus dem PDF-Trainingsplan und
// liefert eine Liste strukturierter Segmente.
//
// Unterstützte Schreibweisen:
//   - "8 x 600 m (100TP)"                    → 1 Segment, Wdh=8
//   - "6 x 800m (100GP)"
//   - "3 x 1.600 m (400TP)"                  → Tausenderpunkt
//   - "400 (200TP) / 600 (200TP) / 800"      → mehrere Segmente, gleicher block_id
//   - "1.000 (400TP) / 800 (400TP)"          → Pyramide
//   - "5(1)5(1)5 BP 6(2)6(2)6"               → Kurzschrift in 100m, BP=Blockpause
//   - "6 * 4(1)"                             → Kurzschrift, 6 Wdh × 400m, P=100m
//
// Klammerangabe ist immer Pause in Metern (Langform) bzw. 100m
// (Kurzschrift, erkannt am Wert). Heuristik: wenn die Distanzzahl
// und Pausenzahl beide ≤ 30 sind, ist es Kurzschrift in 100m.
//
// Pausentypen: TP=Trabpause, GP=Gehpause, BP=Blockpause, frei.
// Default-Pace-Referenz aus pause_typ:
//   GP → '10km', TP → '5km', BP → '5km', sonst null.
// ============================================================

const PARSER = (() => {

  function normDist(raw) {
    // "1.000" / "1,000" / "1000" → 1000
    return parseInt(String(raw).replace(/[.,]/g, ''), 10);
  }

  function defaultPaceRef(pauseTyp) {
    if (pauseTyp === 'GP') return '10000';
    if (pauseTyp === 'TP') return '5000';
    if (pauseTyp === 'BP') return '5000';
    return null;
  }

  // ── Langform: "[N x] DDDD [m] (PPP[TP|GP|BP])" ──────────────
  // Segment-Regex (greedy für Distanz, optionales 'x' davor)
  const RE_SEGMENT_LONG = /(?:(\d{1,3})\s*[x×*]\s*)?(\d{1,2}(?:[.,]\d{3})?|\d{2,4})\s*m?\s*\(\s*(\d{2,4})\s*(TP|GP|BP)?\s*\)/gi;

  function parseLong(text) {
    const segs = [];
    let m;
    RE_SEGMENT_LONG.lastIndex = 0;
    while ((m = RE_SEGMENT_LONG.exec(text)) !== null) {
      const wdh   = m[1] ? parseInt(m[1], 10) : 1;
      const dist  = normDist(m[2]);
      const pause = parseInt(m[3], 10);
      const ptyp  = (m[4] || '').toUpperCase() || null;
      // Plausibilitätsfilter
      if (dist < 50 || dist > 5000) continue;
      if (pause < 0 || pause > 2000) continue;
      segs.push({
        wiederholungen: wdh,
        distanz_m:      dist,
        pause_m:        pause,
        pause_typ:      ptyp || 'TP',
        pace_referenz:  defaultPaceRef(ptyp),
        notiz:          null,
      });
    }
    return segs;
  }

  // ── Kurzform "6*4(1)" oder "5(1)5(1)5 BP 6(2)6(2)6" ─────────
  // Erkennt Distanz/Pause in 100m-Einheiten (kleine Zahlen).
  const RE_SEGMENT_SHORT = /(?:(\d{1,3})\s*[x×*]\s*)?(\d{1,2})\s*\(\s*(\d{1,2})\s*\)/g;

  function parseShort(text) {
    const segs = [];
    let m;
    RE_SEGMENT_SHORT.lastIndex = 0;
    while ((m = RE_SEGMENT_SHORT.exec(text)) !== null) {
      const wdh   = m[1] ? parseInt(m[1], 10) : 1;
      const dist  = parseInt(m[2], 10) * 100;
      const pause = parseInt(m[3], 10) * 100;
      if (dist < 100 || dist > 3000) continue;
      segs.push({
        wiederholungen: wdh,
        distanz_m:      dist,
        pause_m:        pause,
        pause_typ:      'TP',
        pace_referenz:  '5km',
        notiz:          null,
      });
    }
    return segs;
  }

  // ── Haupt-Eintrittspunkt ────────────────────────────────────
  function parse(text) {
    if (!text || typeof text !== 'string') return [];

    const longHit = parseLong(text);
    if (longHit.length > 0) {
      // Block-ID: bei mehreren Segmenten gleiche ID
      const blockId = longHit.length > 1 ? 1 : null;
      longHit.forEach((s, i) => {
        s.reihenfolge = i;
        s.block_id    = blockId;
      });
      return longHit;
    }

    // Versuche Kurzform nur, wenn keine langen Treffer
    const shortHit = parseShort(text);
    const blockId = shortHit.length > 1 ? 1 : null;
    shortHit.forEach((s, i) => {
      s.reihenfolge = i;
      s.block_id    = blockId;
    });
    return shortHit;
  }

  // ── Hübsche Anzeige eines Segments ──────────────────────────
  function formatSegment(s) {
    const wdh = (s.wiederholungen && s.wiederholungen > 1) ? `${s.wiederholungen} × ` : '';
    const dist = formatDist(s.distanz_m);
    const pauseLbl = {
      TP: 'Trabpause',
      GP: 'Gehpause',
      BP: 'Blockpause',
    }[s.pause_typ] || 'Pause';
    const pause = s.pause_m != null
      ? ` · ${pauseLbl} ${formatDist(s.pause_m)}`
      : '';
    return `${wdh}${dist}${pause}`;
  }

  function formatDist(m) {
    if (m == null) return '';
    if (m >= 1000) {
      const km = m / 1000;
      const txt = Number.isInteger(km)
        ? String(km)
        : km.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
      return txt + 'km';
    }
    return m + 'm';
  }

  // Pace-Referenz Optionen für Editor-Dropdown (statischer Fallback; Editor nutzt PACE.getOptions())
  const PACE_OPTIONS = [
    { value: '',      label: '— frei —' },
    { value: '5000',  label: '5 km'     },
    { value: '10000', label: '10 km'    },
    { value: '21098', label: 'Halbmarathon' },
    { value: '42195', label: 'Marathon' },
    { value: 'DL',    label: 'Dauerlauf' },
  ];

  return { parse, formatSegment, formatDist, PACE_OPTIONS, defaultPaceRef };
})();
