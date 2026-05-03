// ============================================================
// Trainingsportal – Pace-Engine
// ============================================================
// Holt persönliche Bestzeiten je Referenzdistanz vom Backend
// (`pace/me`) und berechnet daraus Pace + Splitzeiten pro Segment.
//
// Modus:
//   'pb'  → persönliche Bestzeit (Standard)
//   '12m' → Bestzeit der letzten 12 Monate
//
// Modus wird im LocalStorage persistiert (pro Browser).
// ============================================================

const PACE = (() => {

  let cache = { modus: null, data: null };
  const LS_KEY = 'training_pace_modus';

  function getModus() {
    return localStorage.getItem(LS_KEY) || 'pb';
  }
  function setModus(m) {
    localStorage.setItem(LS_KEY, m);
    cache.data = null; // Invalidate
  }

  async function load(force) {
    const modus = getModus();
    if (!force && cache.modus === modus && cache.data) return cache.data;
    try {
      const r = await apiGet('pace/me?modus=' + encodeURIComponent(modus), { silent: true });
      cache = { modus, data: r };
      return r;
    } catch (e) {
      cache = { modus, data: null };
      return null;
    }
  }

  // Sekunden pro km für eine Referenzdistanz; null wenn keine Bestzeit
  function paceSekProKm(paceData, paceRef) {
    if (!paceData || !paceData.distanzen || !paceRef) return null;
    const d = paceData.distanzen[paceRef];
    if (!d || !d.sekunden || !d.distanz_m) return null;
    return d.sekunden / (d.distanz_m / 1000);
  }

  // Splitzeit für ein Segment (Sekunden) — wir nehmen die EINZEL-Distanz,
  // nicht wiederholungen × distanz, weil das einer Wiederholung entspricht.
  function splitzeit(seg, paceData) {
    if (!seg || !seg.pace_referenz) return null;
    const sekProKm = paceSekProKm(paceData, seg.pace_referenz);
    if (!sekProKm) return null;
    return sekProKm * (seg.distanz_m / 1000);
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

  return { load, getModus, setModus, paceSekProKm, splitzeit, formatTime, formatPace };
})();
