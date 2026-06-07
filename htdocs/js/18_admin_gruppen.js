// ============================================================
// Trainingsportal – Admin: Trainingsgruppen konfigurieren
// ============================================================
// Erlaubt Admins das Anlegen und Umbenennen von Trainingsgruppen
// (direkt in der gemeinsamen `gruppen`-Tabelle des Statistikportals).
//
// API:
//   GET  /trainingsgruppen         → Liste aller Gruppen
//   POST /trainingsgruppen         → Neue Gruppe anlegen  { name }
//   PUT  /trainingsgruppen/{id}    → Gruppe umbenennen    { name }
// ============================================================

const ADMIN_GRUPPEN = (() => {
  let _container = null;
  let _gruppen   = [];
  let _editId    = null;  // ID der Gruppe, die gerade bearbeitet wird (null = keine)
  let _saving    = false;

  // ── Einstieg ────────────────────────────────────────────────
  async function render(el) {
    _container = el;
    if (!_container) return;
    _container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Gruppen…</div>';
    await _laden();
    _render();
  }

  // ── Daten laden ─────────────────────────────────────────────
  async function _laden() {
    try {
      const r = await apiGet('trainingsgruppen', { silent: true });
      _gruppen = r.gruppen || [];
    } catch (_) {
      _gruppen = [];
    }
  }

  // ── Haupt-Render ────────────────────────────────────────────
  function _render() {
    if (!_container || !_container.isConnected) return;

    const rows = _gruppen.map(g => {
      if (_editId === g.id) {
        return `<tr id="gruppen-row-${g.id}">
          <td colspan="2">
            <div style="display:flex;gap:8px;align-items:center;padding:4px 0">
              <input id="gruppen-edit-input" class="settings-input" type="text"
                value="${escapeHtml(g.name)}" maxlength="120"
                style="flex:1;height:32px;font-size:14px"
                onkeydown="ADMIN_GRUPPEN.editKeyDown(event,${g.id})">
              <button class="btn btn-primary btn-sm" onclick="ADMIN_GRUPPEN.speichernUmbenennen(${g.id})">Speichern</button>
              <button class="btn btn-ghost btn-sm" onclick="ADMIN_GRUPPEN.abbrechenEdit()">Abbrechen</button>
            </div>
          </td>
        </tr>`;
      }
      return `<tr>
        <td style="font-size:14px">${escapeHtml(g.name)}</td>
        <td style="width:120px;text-align:right">
          <button class="btn btn-ghost btn-sm" onclick="ADMIN_GRUPPEN.startEdit(${g.id})">Umbenennen</button>
        </td>
      </tr>`;
    }).join('');

    _container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Trainingsgruppen (${_gruppen.length})</span>
        </div>
        <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
          <p style="margin:0 0 12px;font-size:14px;color:var(--text2)">
            Trainingsgruppen werden gemeinsam mit dem Statistikportal genutzt.
            Hier kannst du Gruppen anlegen und umbenennen.
          </p>
          <div id="gruppen-neu-form" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="gruppen-neu-name" class="settings-input" type="text"
              placeholder="Neuer Gruppenname…" maxlength="120"
              style="height:36px;font-size:14px;flex:1;min-width:200px;max-width:360px"
              onkeydown="ADMIN_GRUPPEN.neuKeyDown(event)">
            <button class="btn btn-primary btn-sm" onclick="ADMIN_GRUPPEN.anlegen()" style="height:36px;padding:0 18px">
              + Gruppe anlegen
            </button>
          </div>
        </div>
        ${_gruppen.length > 0 ? `
        <div class="table-scroll">
          <table style="table-layout:fixed;width:100%">
            <colgroup>
              <col>
              <col style="width:130px">
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : `
        <div style="padding:32px;text-align:center;color:var(--text2);font-size:14px">
          Noch keine Trainingsgruppen vorhanden.
        </div>`}
      </div>`;

    // Fokus auf Edit-Input setzen, wenn offen
    if (_editId !== null) {
      const inp = document.getElementById('gruppen-edit-input');
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  // ── Neue Gruppe anlegen ─────────────────────────────────────
  async function anlegen() {
    if (_saving) return;
    const inp = document.getElementById('gruppen-neu-name');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) { _notify('Bitte einen Namen eingeben.', 'warn'); inp.focus(); return; }

    _saving = true;
    _setInputDisabled(true);
    try {
      const r = await apiPost('trainingsgruppen', { name });
      if (r.ok) {
        _gruppen.push(r.gruppe);
        _gruppen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
        GRUPPEN.invalidate();
        _notify('Gruppe „' + r.gruppe.name + '" angelegt.', 'ok');
        inp.value = '';
        _render();
      } else {
        _notify('Fehler: ' + escapeHtml(r.fehler || 'Unbekannt'), 'err');
      }
    } catch (e) {
      _notify('Fehler: ' + escapeHtml(e.message || String(e)), 'err');
    } finally {
      _saving = false;
      _setInputDisabled(false);
    }
  }

  function neuKeyDown(e) {
    if (e.key === 'Enter') anlegen();
  }

  // ── Umbenennen ──────────────────────────────────────────────
  function startEdit(id) {
    _editId = id;
    _render();
  }

  function abbrechenEdit() {
    _editId = null;
    _render();
  }

  function editKeyDown(e, id) {
    if (e.key === 'Enter') speichernUmbenennen(id);
    if (e.key === 'Escape') abbrechenEdit();
  }

  async function speichernUmbenennen(id) {
    if (_saving) return;
    const inp = document.getElementById('gruppen-edit-input');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) { _notify('Name darf nicht leer sein.', 'warn'); inp.focus(); return; }

    const alte = _gruppen.find(g => g.id === id);
    if (alte && alte.name === name) { abbrechenEdit(); return; }

    _saving = true;
    try {
      const r = await apiPut('trainingsgruppen/' + id, { name });
      if (r.ok) {
        const g = _gruppen.find(g => g.id === id);
        if (g) g.name = r.gruppe.name;
        _gruppen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
        GRUPPEN.invalidate();
        _editId = null;
        _notify('Gruppe umbenannt in „' + r.gruppe.name + '".', 'ok');
        _render();
      } else {
        _notify('Fehler: ' + escapeHtml(r.fehler || 'Unbekannt'), 'err');
      }
    } catch (e) {
      _notify('Fehler: ' + escapeHtml(e.message || String(e)), 'err');
    } finally {
      _saving = false;
    }
  }

  // ── Hilfsfunktionen ─────────────────────────────────────────
  function _setInputDisabled(dis) {
    const inp = document.getElementById('gruppen-neu-name');
    if (inp) inp.disabled = dis;
  }

  function _notify(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) return;
    const d = document.createElement('div');
    d.className = 'notif ' + (art === 'err' ? 'notif-err' : art === 'warn' ? 'notif-warn' : 'notif-ok');
    d.textContent = text;
    cont.appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  return { render, anlegen, neuKeyDown, startEdit, abbrechenEdit, editKeyDown, speichernUmbenennen };
})();
