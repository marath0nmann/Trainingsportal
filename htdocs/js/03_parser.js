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

  // ============================================================
  // Verschachtelte Kurzschrift → Segment-Baum (SEG-Format)
  // ============================================================
  // Erkennt zusätzlich zu den flachen Notationen die geklammerte
  // Trainer-Schreibweise mit Wiederholungsblöcken:
  //
  //   "3 x (4 x 400, 100 TP), BP 400 TP"
  //   → 3 × [ 4 × [400, 100 TP], 400 BP ]
  //
  // Regel für die Pausenzuordnung: folgt einer wiederholten Angabe
  // eine reine Pause, gehört sie in die Wiederholung hinein – genau
  // so, wie Trainer die Kurzschrift lesen.
  // ============================================================


  function tokenize(text) {
    const tokens = [];
    const re = /(\d+(?:[.,]\d{3})?)|([x×*])|(\()|(\))|([,/+])|(TP|GP|BP)|(m\b)|(\s+)|(.)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) tokens.push({ t: 'num', v: normDist(m[1]) });
      else if (m[2]) tokens.push({ t: 'x' });
      else if (m[3]) tokens.push({ t: '(' });
      else if (m[4]) tokens.push({ t: ')' });
      else if (m[5]) tokens.push({ t: 'sep' });
      else if (m[6]) tokens.push({ t: 'ptyp', v: m[6].toUpperCase() });
      // 'm', Leerzeichen und unbekannte Zeichen werden verworfen
    }
    return tokens;
  }

  function parseBaum(text) {
    if (!text || typeof text !== 'string') return [];
    const tokens = tokenize(text);
    if (!tokens.some(t => t.t === 'num')) return [];
    const pos = { i: 0 };
    const baum = parseSequenz(tokens, pos);
    if (!baum.length) return [];
    kurzschriftSkalieren(baum);
    return baum;
  }

  // Sequenz von Termen bis ')' oder Textende
  function parseSequenz(tokens, pos) {
    const teile = [];
    let schutz = 0;
    while (pos.i < tokens.length && tokens[pos.i].t !== ')' && schutz++ < 500) {
      if (tokens[pos.i].t === 'sep') { pos.i++; continue; }
      const teil = parseTerm(tokens, pos);
      if (!teil) { pos.i++; continue; }
      teile.push(teil);
    }
    if (pos.i < tokens.length && tokens[pos.i].t === ')') pos.i++;
    return pausenEinsortieren(teile);
  }

  // Term: [Zahl ×] ( Gruppe | Distanzangabe )
  function parseTerm(tokens, pos) {
    let faktor = 1;
    if (tokens[pos.i] && tokens[pos.i].t === 'num'
        && tokens[pos.i + 1] && tokens[pos.i + 1].t === 'x') {
      faktor = tokens[pos.i].v;
      pos.i += 2;
    }
    if (tokens[pos.i] && tokens[pos.i].t === '(') {
      pos.i++;
      const kinder = parseSequenz(tokens, pos);
      if (!kinder.length) return null;
      return { faktor, knoten: kinder };
    }
    const knoten = parseDistanz(tokens, pos);
    return knoten ? { faktor, knoten } : null;
  }

  // Distanzangabe: [Pausentyp] Zahl [Pausentyp] [ "(" Zahl [Pausentyp] ")" ]
  function parseDistanz(tokens, pos) {
    let ptyp = null;
    while (tokens[pos.i] && tokens[pos.i].t === 'ptyp') {
      // Pausenmarker ohne folgende Zahl ist nur ein Trenner
      if (!tokens[pos.i + 1] || tokens[pos.i + 1].t !== 'num') { pos.i++; continue; }
      ptyp = tokens[pos.i].v;
      pos.i++;
    }
    if (!tokens[pos.i] || tokens[pos.i].t !== 'num') return null;
    const dist = tokens[pos.i].v;
    pos.i++;
    // Wiederholungszeichen direkt hinter der Zahl → gehört zum nächsten Term
    if (tokens[pos.i] && tokens[pos.i].t === 'x') { pos.i--; return null; }
    // Nachgestellter Pausentyp gehört zur Zahl davor – außer es folgt
    // gleich die nächste Zahl ("5 BP 6(2)"): dann ist er nur ein Trenner.
    if (tokens[pos.i] && tokens[pos.i].t === 'ptyp'
        && (!tokens[pos.i + 1] || tokens[pos.i + 1].t !== 'num')) {
      if (ptyp !== 'BP') ptyp = tokens[pos.i].v;
      pos.i++;
    }

    // Klammerpause direkt hinter der Distanz: "400 (100 TP)"
    let klammerPause = null;
    if (tokens[pos.i] && tokens[pos.i].t === '('
        && tokens[pos.i + 1] && tokens[pos.i + 1].t === 'num') {
      const merk = pos.i;
      pos.i++;
      const pDist = tokens[pos.i].v; pos.i++;
      let pTyp = 'TP';
      if (tokens[pos.i] && tokens[pos.i].t === 'ptyp') { pTyp = tokens[pos.i].v; pos.i++; }
      if (tokens[pos.i] && tokens[pos.i].t === ')') {
        pos.i++;
        klammerPause = { typ: 'pause', distanz_m: pDist, pause_typ: pTyp };
      } else {
        pos.i = merk; // keine schließende Klammer → doch eine Gruppe
      }
    }

    const knoten = [];
    // Mit eigener Klammerpause ist die Distanz immer eine Tempoangabe;
    // ein vorangestellter Marker war dann nur ein Trenner ("… BP 6(2)…").
    if (ptyp && !klammerPause) {
      knoten.push({ typ: 'pause', distanz_m: dist, pause_typ: ptyp });
    } else {
      knoten.push({ typ: 'work', distanz_m: dist, pace_referenz: null, notiz: null });
    }
    if (klammerPause) knoten.push(klammerPause);
    return knoten;
  }

  // Wiederholte Terme werden zu Gruppen; direkt folgende reine Pausen
  // wandern in die Wiederholung hinein.
  function pausenEinsortieren(teile) {
    const out = [];
    for (let i = 0; i < teile.length; i++) {
      const t = teile[i];
      if (t.faktor > 1) {
        const gruppe = { typ: 'gruppe', wiederholungen: t.faktor, kinder: [...t.knoten] };
        while (i + 1 < teile.length
               && teile[i + 1].faktor === 1
               && teile[i + 1].knoten.every(k => k.typ === 'pause')) {
          gruppe.kinder.push(...teile[i + 1].knoten);
          i++;
        }
        out.push(gruppe);
      } else {
        out.push(...t.knoten);
      }
    }
    return out;
  }

  // Kurzschrift in 100-m-Einheiten ("5(1)5(1)5"): alle Distanzen klein → ×100
  function kurzschriftSkalieren(baum) {
    const werte = [];
    (function sammeln(nodes) {
      nodes.forEach(n => {
        if (n.typ === 'gruppe') sammeln(n.kinder);
        else if (n.distanz_m != null) werte.push(n.distanz_m);
      });
    })(baum);
    if (!werte.length || Math.max(...werte) > 30) return;
    (function skalieren(nodes) {
      nodes.forEach(n => {
        if (n.typ === 'gruppe') skalieren(n.kinder);
        else if (n.distanz_m != null) n.distanz_m *= 100;
      });
    })(baum);
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

  return { parse, parseBaum, formatSegment, formatDist, PACE_OPTIONS, defaultPaceRef };
})();
