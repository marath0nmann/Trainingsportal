// ============================================================
// Trainingsportal – Admin: Papierkorb
// ============================================================
// Die API loescht fachlich nie hart: archiviereUndLoesche() legt jede
// geloeschte Zeile vollstaendig als JSON in `training_geloescht` ab.
// Diese Seite macht dieses Archiv sichtbar und erlaubt, einzelne
// Datensaetze zurueckzuholen – analog Admin → Papierkorb im
// Statistikportal.
//
// API:
//   GET  admin/papierkorb?tage=30   → [{id, tabelle_label, titel, …}]
//   POST admin/papierkorb/{id}      → Datensatz (inkl. Kindzeilen) zurueck
// ============================================================

const PAPIERKORB = (() => {

  let _container = null;
  let _eintraege = [];
  let _tage      = 30;

  const TF = 'tp-papierkorb';

  async function render(el) {
    _container = el;
    if (!_container) return;
    _container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Papierkorb&hellip;</div>';
    await _laden();
    _render();
  }

  async function _laden() {
    try {
      const r = await apiGet('admin/papierkorb?tage=' + _tage, { silent: true });
      _eintraege = r.eintraege || [];
    } catch (e) {
      _eintraege = [];
      if (_container) {
        _container.innerHTML = '<div style="padding:20px;color:var(--primary)">Fehler beim Laden: ' +
          escapeHtml(e.message || String(e)) + '</div>';
      }
      throw e;
    }
  }

  // Gemeinsame Filterleiste (Statistikportal-Modul, via shared.php)
  function _filterInit() {
    tfInit(TF, {
      platzhalter: 'Titel, Art, gelöscht von…',
      rows:   () => _eintraege,
      suche:  e => [e.titel, e.tabelle_label, e.benutzername, e.grund],
      spalten: [
        { key: 'art',     label: 'Art',           wert: e => e.tabelle_label || '' },
        { key: 'wer',     label: 'Gelöscht von',  wert: e => e.benutzername || '— unbekannt —' },
        { key: 'grund',   label: 'Grund',         wert: e => e.grund || '— ohne Angabe —' },
      ],
      onChange: () => _render(),
    });
  }

  function _fmtZeit(iso) {
    if (!iso) return '–';
    const d = new Date(String(iso).replace(' ', 'T'));
    if (isNaN(d)) return escapeHtml(String(iso));
    return d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function _zeitraumWahl() {
    return [7, 30, 90, 365].map(t =>
      `<button class="btn btn-sm ${t === _tage ? 'btn-primary' : 'btn-ghost'}"
        onclick="PAPIERKORB.zeitraum(${t})">${t === 365 ? '1 Jahr' : t + ' Tage'}</button>`
    ).join('');
  }

  function _render() {
    if (!_container) return;
    _filterInit();
    const sichtbar = tfFilter(TF, _eintraege);

    const zeilen = sichtbar.map(e => `
      <tr>
        <td style="white-space:nowrap"><span class="badge">${escapeHtml(e.tabelle_label)}</span></td>
        <td>${escapeHtml(e.titel)}</td>
        <td style="white-space:nowrap;color:var(--text2)">${_fmtZeit(e.geloescht_am)}</td>
        <td style="color:var(--text2)">${escapeHtml(e.benutzername || '–')}</td>
        <td style="color:var(--text2)">${escapeHtml(e.grund || '–')}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-ghost btn-sm" onclick="PAPIERKORB.wiederherstellen(${e.id})"
            title="Datensatz zurück in den Bestand holen">&#x21BA; Wiederherstellen</button>
        </td>
      </tr>`).join('');

    const leer = !_eintraege.length
      ? `<div class="empty" style="padding:28px;text-align:center;color:var(--text2)">
           In diesem Zeitraum wurde nichts gelöscht.
         </div>`
      : !sichtbar.length
      ? `<div class="empty" style="padding:28px;text-align:center;color:var(--text2)">
           Kein Eintrag passt zum Filter.
         </div>`
      : '';

    _container.innerHTML = `
      <div style="margin:0 auto;display:flex;flex-direction:column;gap:16px">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">&#x1F5D1;&#xFE0F; Papierkorb</div>
            <span class="panel-count">${sichtbar.length} von ${_eintraege.length}</span>
          </div>
          <div class="settings-panel-body">
            <div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:14px">
              Gelöschte Trainings, Blöcke, Treffpunkte, Strecken und Anmeldungen werden vollständig
              archiviert, nicht entfernt. Beim Wiederherstellen kommen zusammengehörige Teile mit –
              die Segmente einer Einheit ebenso wie die Segmente und Gruppen eines Blocks.
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${_zeitraumWahl()}</div>
            ${tfBarHtml(TF)}
            ${leer || `
            <div class="table-scroll" style="margin-top:12px">
              <table class="data-table" style="width:100%;border-collapse:collapse">
                <thead><tr>
                  <th style="text-align:left">Art</th>
                  <th style="text-align:left">Eintrag</th>
                  <th style="text-align:left">Gelöscht am</th>
                  <th style="text-align:left">Von</th>
                  <th style="text-align:left">Grund</th>
                  <th></th>
                </tr></thead>
                <tbody>${zeilen}</tbody>
              </table>
            </div>`}
          </div>
        </div>
      </div>`;

    tfRefresh(TF);
  }

  async function zeitraum(tage) {
    _tage = tage;
    tfLeeren(TF);
    if (_container) _container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Papierkorb&hellip;</div>';
    try { await _laden(); } catch (_) { return; }
    _render();
  }

  async function wiederherstellen(id) {
    const e = _eintraege.find(x => x.id === id);
    const was = e ? `${e.tabelle_label} „${e.titel}“` : 'diesen Eintrag';
    const ok = await confirmModal(`${was} wiederherstellen?`);
    if (!ok) return;
    try {
      const r = await apiPost('admin/papierkorb/' + id, {});
      const n = (r && r.wiederhergestellt) || 1;
      notify(n > 1 ? `Wiederhergestellt (${n} Datensätze).` : 'Wiederhergestellt.', 'ok');
      _eintraege = _eintraege.filter(x => x.id !== id);
      _render();
      // Nav-Badge nachziehen – der Papierkorb ist einer seiner Summanden
      if (typeof ladeNavBadges === 'function') ladeNavBadges(true);
    } catch (err) {
      notify('Fehler: ' + (err.message || ''), 'err');
    }
  }

  return { render, zeitraum, wiederherstellen };
})();
