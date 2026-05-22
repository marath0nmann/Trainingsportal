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

  // Eigene Gruppen-IDs laden (gecacht)
  function ladeMeine() {
    if (!state.user) return Promise.resolve([]);
    if (!_meine) {
      _meine = apiGet('profil/gruppen', { silent: true })
        .then(d => d.gruppen_ids || [])
        .catch(() => []);
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
