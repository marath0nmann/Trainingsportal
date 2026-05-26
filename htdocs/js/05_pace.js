// ============================================================
// Trainingsportal – Pace-Engine
// ============================================================
// Lädt Pace-Präferenzen (pace/prefs) und löst daraus pro Distanz
// die effektive Referenzzeit auf:
//   modus='pb'     → Bestzeit gesamt aus dem Statistikportal
//   modus='12m'    → Bestzeit letzte 12 Monate
//   modus='manual' → manuell eingegebene Zeit
//
// Keys sind Distanzen in Metern als Strings (z.B. "5000", "10000").
// Alte benannte Keys (5km, 10km, HM, M) werden transparent gemappt.
// ============================================================

const PACE = (() => {

  let cache = { data: null };

  // Aus localStorage: für die ICS-Funktion und Rückwärtskompatibilität
  const LS_KEY = 'training_pace_modus';
  function getModus() { return localStorage.getItem(LS_KEY) || 'pb'; }
  function setModus(m) { localStorage.setItem(LS_KEY, m); cache.data = null; }
  function invalidate() { cache.data = null; }

  // Segments stored with old named keys get mapped to meter strings
  const LEGACY_KEY_MAP = { '5km': '5000', '10km': '10000', 'HM': '21098', 'M': '42195' };

  // Nice display label for a meter-string key
  const KNOWN_LABELS = { '5000': '5 km', '10000': '10 km', '21098': 'Halbmarathon', '42195': 'Marathon' };
  function fmtDistLabel(ref) {
    if (KNOWN_LABELS[ref]) return KNOWN_LABELS[ref];
    const m = parseFloat(ref);
    if (!m) return ref;
    if (m >= 1000) {
      const km = m / 1000;
      const s  = Number.isInteger(km) ? String(km) : km.toFixed(1).replace('.', ',');
      return s + 'km';
    }
    return m + 'm';
  }

  async function load(force) {
    if (!force && cache.data !== null) return cache.data;
    try {
      const r = await apiGet('pace/prefs', { silent: true });
      if (!r || !r.ok) { cache.data = null; return null; }

      const prefs   = r.prefs    || {};
      const distPb  = (r.distanzen && r.distanzen.pb)    || {};
      const dist12m = (r.distanzen && r.distanzen['12m']) || {};

      // Pro Referenz die effektive Zeit auflösen
      const resolved = {};
      for (const ref of Object.keys(prefs)) {
        const distM = parseFloat(ref);
        if (!distM) continue;
        const p = prefs[ref] || { modus: 'pb' };
        if (p.modus === 'manual') {
          // Manuell: nur übernehmen wenn eine Zeit eingetragen ist – kein Fallback auf Bestzeiten
          if (p.manual_sek) {
            resolved[ref] = { distanz_m: distM, sekunden: p.manual_sek, resultat: null, datum: null };
          }
          // leeres Manual → kein Eintrag (Distanz bleibt ohne Referenz)
        } else if (p.modus === '12m' && dist12m[ref]) {
          resolved[ref] = dist12m[ref];
        } else if (p.modus === '12m' && distPb[ref]) {
          resolved[ref] = distPb[ref]; // Fallback pb wenn 12m fehlt
        } else if (distPb[ref]) {
          resolved[ref] = distPb[ref];
        } else if (dist12m[ref]) {
          resolved[ref] = dist12m[ref]; // Fallback: 12m wenn pb fehlt
        }
        // Kein Eintrag → kein Wert für diese Distanz
      }

      cache.data = { ok: true, distanzen: resolved };
      return cache.data;
    } catch (e) {
      cache.data = null;
      return null;
    }
  }

  // Sekunden pro km für eine Referenzdistanz; null wenn keine Bestzeit
  function paceSekProKm(paceData, paceRef) {
    if (!paceData || !paceData.distanzen || !paceRef) return null;
    const ref = LEGACY_KEY_MAP[paceRef] || paceRef;
    const d = paceData.distanzen[ref];
    if (!d || !d.sekunden || !d.distanz_m) return null;
    return d.sekunden / (d.distanz_m / 1000);
  }

  // Splitzeit für ein Segment (Sekunden)
  function splitzeit(seg, paceData) {
    if (!seg || !seg.pace_referenz) return null;
    const sekProKm = paceSekProKm(paceData, seg.pace_referenz);
    if (!sekProKm) return null;
    return sekProKm * (seg.distanz_m / 1000);
  }

  // Options für Editor-Dropdowns (nur konfigurierte Distanzen, kein Fallback)
  function getOptions() {
    const distKeys = (cache.data && cache.data.distanzen)
      ? Object.keys(cache.data.distanzen).sort((a, b) => parseFloat(a) - parseFloat(b))
      : [];
    return [
      { value: '',   label: '— frei —' },
      ...distKeys.map(ref => ({ value: ref, label: fmtDistLabel(ref) })),
      { value: 'DL', label: 'Dauerlauf' },
    ];
  }

  // Format: 1234 sek → "20:34"  bzw. "1:23:45"
  function formatTime(sek) {
    if (sek == null || !isFinite(sek)) return '–';
    sek = Math.round(sek);
    const h = Math.floor(sek / 3600);
    const m = Math.floor((sek % 3600) / 60);
    const s = sek % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  // Format: 285 sek/km → "4:45 /km"
  function formatPace(sekProKm) {
    if (sekProKm == null || !isFinite(sekProKm)) return '–';
    const m = Math.floor(sekProKm / 60);
    const s = Math.round(sekProKm % 60);
    return `${m}:${String(s).padStart(2,'0')} /km`;
  }

  return { load, getModus, setModus, invalidate, paceSekProKm, splitzeit, getOptions, fmtDistLabel, formatTime, formatPace };
})();
