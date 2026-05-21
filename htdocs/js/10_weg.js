// ============================================================
// Trainingsportal – Weg-Modul (An-/Abreise-Kilometer)
// ============================================================
// Lädt die Weg-Präferenzen (weg/prefs) und berechnet daraus
// für eine gegebene Einheit die Anfahrt-km:
//   Kombination aus Trainingstyp + Treffpunkt → km (An-/Abreise gesamt)
// ============================================================

const WEG = (() => {

  let cache = null; // { prefs: [...], treffpunkte: [...] } | null

  async function load(force) {
    if (!force && cache !== null) return cache;
    try {
      const r = await apiGet('weg/prefs', { silent: true });
      cache = r && r.ok ? r : { prefs: [], treffpunkte: [] };
      return cache;
    } catch (e) {
      cache = { prefs: [], treffpunkte: [] };
      return cache;
    }
  }

  function invalidate() { cache = null; }

  // Anfahrt-km für eine gegebene Einheit ermitteln (null = kein Eintrag)
  // Matching: typ muss übereinstimmen; treffpunkt_id muss übereinstimmen
  // (null in prefs = passt auf jede Einheit ohne Treffpunkt)
  function wegKm(einheit) {
    if (!cache || !Array.isArray(cache.prefs) || !cache.prefs.length) return null;
    const tpId = einheit.treffpunkt ? (einheit.treffpunkt.id || null) : null;
    const match = cache.prefs.find(p => {
      if (p.typ !== einheit.typ) return false;
      if (p.treffpunkt_id == null) return tpId == null; // null passt nur auf "kein Treffpunkt"
      return p.treffpunkt_id === tpId;
    });
    return match ? match.km : null;
  }

  // km-Zahl formatieren: 5.5 → "5,5 km"
  function fmtKm(km) {
    if (km == null || !isFinite(km)) return '–';
    return km.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' km';
  }

  return { load, invalidate, wegKm, fmtKm };
})();
