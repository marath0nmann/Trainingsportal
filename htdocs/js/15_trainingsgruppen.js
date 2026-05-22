// ============================================================
// Trainingsportal – Trainingsgruppen
// ============================================================
// Lädt und cached alle Gruppen inkl. eigener Mitgliedschaft.
// Datenquelle: GET /gruppen (training_gruppen + training_gruppen_mitglieder)
//
// Wird von 02_app.js (Warnhinweis), 09_profil.js (Profil-Modal),
// 08_bloecke.js (Block-Editor) und 10_planung.js (Planungskalender) genutzt.
// ============================================================

const GRUPPEN = (() => {
  let _all = null; // Promise → [{id, name, farbe, ist_mitglied}]

  // Intern: gemeinsamer gecachter Fetch
  function _load() {
    if (!_all) {
      _all = apiGet('gruppen', { silent: true })
        .then(d => d.gruppen || [])
        .catch(() => []);
    }
    return _all;
  }

  // Alle verfügbaren Gruppen laden (gecacht).
  // Gibt [{id, name, farbe}] zurück (ist_mitglied-Flag entfernt).
  function laden() {
    return _load().then(gs => gs.map(g => ({ id: g.id, name: g.name, farbe: g.farbe || null })));
  }

  // Eigene Gruppen laden (gecacht).
  // Gibt { gruppen_ids: [...], stat_ids: [] } zurück –
  //   gruppen_ids = IDs der Gruppen, in denen der Nutzer Mitglied ist
  //   stat_ids    = leer (Legacy-Kompatibilität; früher aus Statistikportal)
  function ladeMeine() {
    if (!state.user) return Promise.resolve({ gruppen_ids: [], stat_ids: [] });
    return _load().then(gs => ({
      gruppen_ids: gs.filter(g => g.ist_mitglied).map(g => g.id),
      stat_ids:    [],
    }));
  }

  // Cache leeren (nach Admin-Änderungen)
  function invalidate() {
    _all = null;
  }

  // Gruppenname anhand ID (aus gecachter Liste)
  async function nameById(id) {
    const gs = await _load();
    const g  = gs.find(g => g.id === id);
    return g ? g.name : String(id);
  }

  return { laden, ladeMeine, invalidate, nameById };
})();
