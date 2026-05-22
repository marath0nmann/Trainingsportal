// ============================================================
// Trainingsportal – Trainingsgruppen
// ============================================================
// Lädt und cached:
//   – alle verfügbaren Gruppen (aus Statistikportal-DB)
//   – die eigenen Gruppen-Mitgliedschaften des angemeldeten Nutzers
//
// Wird von 02_app.js (Warnhinweis), 09_profil.js (Profil-Modal),
// 08_bloecke.js (Block-Editor) und 10_planung.js (Planungskalender) genutzt.
// ============================================================

const GRUPPEN = (() => {
  let _alle    = null; // Promise für alle Gruppen
  let _meine   = null; // Promise für eigene Mitgliedschaften

  // Alle verfügbaren Gruppen laden (gecacht)
  function laden() {
    if (!_alle) {
      _alle = apiGet('trainingsgruppen', { silent: true })
        .then(d => d.gruppen || [])
        .catch(() => []);
    }
    return _alle;
  }

  // Eigene Gruppen laden (gecacht).
  // Gibt { gruppen_ids: [...], stat_ids: [...] } zurück:
  //   gruppen_ids = Vereinigung aus Statistikportal (athlet_gruppen) + Trainingsportal (training_benutzer_gruppen)
  //   stat_ids    = nur die Gruppen aus dem Statistikportal (für read-only-Anzeige im Profil)
  function ladeMeine() {
    if (!state.user) return Promise.resolve({ gruppen_ids: [], stat_ids: [] });
    if (!_meine) {
      _meine = apiGet('profil/gruppen', { silent: true })
        .then(d => ({
          gruppen_ids: d.gruppen_ids || [],
          stat_ids:    d.stat_ids    || [],
        }))
        .catch(() => ({ gruppen_ids: [], stat_ids: [] }));
    }
    return _meine;
  }

  // Cache leeren (nach Speichern)
  function invalidate() {
    _alle  = null;
    _meine = null;
  }

  // Gruppenname anhand ID (aus gecachter Liste)
  async function nameById(id) {
    const alle = await laden();
    const g = alle.find(g => g.id === id);
    return g ? g.name : String(id);
  }

  return { laden, ladeMeine, invalidate, nameById };
})();
