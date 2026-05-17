// ============================================================
// Trainingsportal – Profil-Modal (Pace-Referenzen)
// ============================================================
// Öffnet sich per Klick auf den Avatar (oben rechts).
// Zeigt Pace-Referenzkonfiguration für frei wählbare Distanzen:
//   - Distanz in Metern (z.B. 5000 = alle 5-km-Ergebnisse)
//   - Bestzeit gesamt (aus Statistikportal, nur wenn vorhanden)
//   - Bestzeit letzte 12 Monate (aus Statistikportal, nur wenn vorhanden)
//   - Manuelle Eingabe
// ============================================================

const PROFIL = (() => {

  let _prefsData  = null;
  let _localPrefs = {}; // Arbeitskopie während der Bearbeitung

  async function open() {
    if (!state.user) return;
    const cont = document.getElementById('modal-container');
    cont.innerHTML =
      '<div class="modal-overlay" onclick="schliesseModal(event)">' +
        '<div class="modal-card">' +
          '<div class="modal-body" style="padding:32px;text-align:center">' +
            '<div style="color:var(--text2);font-size:14px">Lade…</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    try {
      _prefsData = await apiGet('pace/prefs', { silent: true });
    } catch (e) {
      cont.innerHTML =
        '<div class="modal-overlay" onclick="schliesseModal(event)">' +
          '<div class="modal-card"><div class="modal-body">Fehler: ' + escapeHtml(e.message || '') + '</div></div>' +
        '</div>';
      return;
    }
    _localPrefs = JSON.parse(JSON.stringify(_prefsData.prefs || {}));
    _renderModal(cont);
  }

  function fmtDatum(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}.${m}.${y}`;
  }

  function _buildRefRow(ref) {
    const distPb   = (_prefsData.distanzen && _prefsData.distanzen.pb)    || {};
    const dist12m  = (_prefsData.distanzen && _prefsData.distanzen['12m']) || {};
    const hatAthlet = !!_prefsData.hat_athlet;

    const p      = _localPrefs[ref] || { modus: 'pb', manual_sek: null };
    const pb     = distPb[ref];
    const m12    = dist12m[ref];
    const manSek = p.manual_sek || null;

    // Effektiven Modus bestimmen
    let selVal = 'manual';
    if      (p.modus === 'pb'  && pb)  selVal = 'pb';
    else if (p.modus === '12m' && m12) selVal = '12m';
    else if (p.modus === 'pb'  && m12) selVal = '12m'; // pb gewählt, aber nur 12m verfügbar
    else if (pb)                        selVal = 'pb';
    else if (m12)                       selVal = '12m';

    let opts = '';
    if (pb) {
      const pbInfo = `${escapeHtml(pb.resultat)} · ${fmtDatum(pb.datum)}${pb.wettkampf ? ' · ' + escapeHtml(pb.wettkampf) : ''}`;
      opts += `<option value="pb"${selVal === 'pb' ? ' selected' : ''}>Bestzeit gesamt – ${pbInfo}</option>`;
    }
    if (m12) {
      const m12Info = `${escapeHtml(m12.resultat)} · ${fmtDatum(m12.datum)}${m12.wettkampf ? ' · ' + escapeHtml(m12.wettkampf) : ''}`;
      opts += `<option value="12m"${selVal === '12m' ? ' selected' : ''}>Letzte 12 Monate – ${m12Info}</option>`;
    }
    opts += `<option value="manual"${selVal === 'manual' ? ' selected' : ''}>Manuelle Eingabe</option>`;

    const manVisible = selVal === 'manual';
    const manVal     = manSek ? PACE.formatTime(manSek) : '';

    const noDataHint = !hatAthlet
      ? '<div class="profil-hint">Kein Athletenprofil verknüpft – nur manuelle Eingabe möglich.</div>'
      : (!pb && !m12
          ? '<div class="profil-hint">Keine Ergebnisse für diese Distanz im Statistikportal gefunden.</div>'
          : '');

    const safeRef = escapeHtml(ref);
    return `
      <div class="profil-ref-row" id="profil-row-${safeRef}">
        <div class="profil-ref-label">${escapeHtml(PACE.fmtDistLabel(ref))}</div>
        <div class="profil-ref-controls">
          <select class="settings-input profil-modus-sel" data-ref="${safeRef}"
                  onchange="PROFIL._onModusChange('${safeRef}', this.value)">${opts}</select>
          <div class="profil-manual-wrap" id="profil-manual-${safeRef}"${manVisible ? '' : ' style="display:none"'}>
            <input type="text" id="profil-manual-input-${safeRef}"
                   class="settings-input profil-manual-input"
                   placeholder="MM:SS oder H:MM:SS"
                   value="${escapeHtml(manVal)}">
            <span class="profil-hint">z.&nbsp;B. &nbsp;20:30 &nbsp;oder &nbsp;1:45:00</span>
          </div>
          ${noDataHint}
        </div>
        <button class="btn-icon profil-ref-del" onclick="PROFIL._distanzEntfernen('${safeRef}')"
                title="Distanz entfernen">×</button>
      </div>`;
  }

  function _renderRefsList() {
    const listEl = document.getElementById('profil-refs-list');
    if (!listEl) return;
    const refs = Object.keys(_localPrefs).sort((a, b) => parseFloat(a) - parseFloat(b));
    listEl.innerHTML = refs.map(ref => _buildRefRow(ref)).join('');
  }

  function _renderModal(cont) {
    const refs = Object.keys(_localPrefs).sort((a, b) => parseFloat(a) - parseFloat(b));

    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Mein Profil</div>
              <div class="modal-title">${escapeHtml(state.user.name || state.user.benutzername || '')}</div>
              <div class="modal-sub">${escapeHtml(state.user.rolle || '')}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <div class="profil-section-title">Pace-Referenzen</div>
            <p class="profil-hint-global">
              Gib die Distanzen in Metern an, für die du Pace-Referenzen verwenden möchtest.
              Die Referenz findet automatisch alle Wettkampfergebnisse über die exakt gleiche Streckenlänge.
            </p>
            <div id="profil-refs-list">
              ${refs.map(ref => _buildRefRow(ref)).join('')}
            </div>
            <div class="profil-add-row">
              <input type="number" id="profil-new-dist" class="settings-input profil-new-dist-input"
                     placeholder="Distanz in Meter (z. B. 5000)" min="100" max="200000" step="1">
              <button class="btn btn-ghost btn-sm" onclick="PROFIL._distanzHinzufuegen()">+ Hinzufügen</button>
            </div>
            <div class="modal-actions">
              <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
              <button class="btn btn-primary" onclick="PROFIL.speichern()">Speichern</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function _onModusChange(ref, val) {
    const wrap = document.getElementById('profil-manual-' + ref);
    if (wrap) wrap.style.display = val === 'manual' ? '' : 'none';
  }

  function _distanzHinzufuegen() {
    const inp = document.getElementById('profil-new-dist');
    if (!inp) return;
    const v = parseInt(inp.value, 10);
    if (!v || v < 100 || v > 200000) {
      _notify('Ungültige Distanz (100 – 200.000 m)', 'err');
      return;
    }
    const ref = String(v);
    if (_localPrefs[ref]) {
      _notify('Diese Distanz ist bereits konfiguriert.', 'warn');
      return;
    }
    _localPrefs[ref] = { modus: 'pb', manual_sek: null };
    inp.value = '';
    _renderRefsList();
  }

  function _distanzEntfernen(ref) {
    delete _localPrefs[ref];
    const row = document.getElementById('profil-row-' + ref);
    if (row) row.remove();
  }

  function _parseZeit(s) {
    if (!s || !s.trim()) return null;
    const parts = s.trim().split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN) || parts.length < 2) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  async function speichern() {
    const newPrefs = {};
    for (const ref of Object.keys(_localPrefs)) {
      const sel = document.querySelector(`.profil-modus-sel[data-ref="${ref}"]`);
      if (!sel) continue;
      const modus = sel.value;
      let manualSek = null;
      if (modus === 'manual') {
        const inp = document.getElementById('profil-manual-input-' + ref);
        manualSek = inp ? _parseZeit(inp.value) : null;
      }
      newPrefs[ref] = { modus, manual_sek: manualSek };
    }
    try {
      await apiPut('pace/prefs', { prefs: newPrefs });
      PACE.invalidate();
      schliesseModal();
      _notify('Profil gespeichert.', 'ok');
    } catch (e) {
      _notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function _notify(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) return;
    const cls = art === 'err' ? 'notif-err' : (art === 'warn' ? 'notif-warn' : 'notif-ok');
    const div = document.createElement('div');
    div.className = 'notif ' + cls;
    div.textContent = text;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  }

  return { open, speichern, _onModusChange, _distanzHinzufuegen, _distanzEntfernen };
})();
