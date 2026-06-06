// ============================================================
// Trainingsportal – Wettkampfplanung (pro Athlet, pro Jahr)
// Zeigt alle Veranstaltungsserien mit Nutzerstatus und erlaubt
// die persönliche Planung / Jahresübersicht.
// ============================================================

const WETTKAMPFPLANUNG = (() => {

  let _serien       = [];
  let _jahr         = new Date().getFullYear();
  let _container    = null;
  let _popper       = null;
  let _filterPopper = null;
  let _bulkPopper   = null;

  // Filter / Sort / Select state
  let _filterText      = '';
  let _filterStatus    = new Set();   // leer = alle Status anzeigen
  let _sortKey         = 'datum';     // 'name' | 'datum' | 'status'
  let _sortDir         = 'asc';
  let _selected        = new Set();   // ausgewählte Serie-IDs
  let _hideVergangen   = false;       // vergangene Veranstaltungen ausblenden
  let _hidePasstNicht  = false;       // "passt nicht"-Einträge ausblenden

  // ── Einstellungen (localStorage) ─────────────────────────────
  function _loadPrefs() {
    try {
      _hideVergangen  = localStorage.getItem('wkp_hide_vergangen')   === '1';
      _hidePasstNicht = localStorage.getItem('wkp_hide_passt_nicht') === '1';
    } catch (e) { /* kein localStorage */ }
  }
  function _savePrefs() {
    try {
      localStorage.setItem('wkp_hide_vergangen',   _hideVergangen   ? '1' : '0');
      localStorage.setItem('wkp_hide_passt_nicht', _hidePasstNicht  ? '1' : '0');
    } catch (e) { /* kein localStorage */ }
  }

  // ── Statuskonfiguration ──────────────────────────────────────
  const ST = {
    passt_nicht:            { label: 'passt nicht',            bg: '#c0392b', text: '#fff', kat: 3 },
    offen:                  { label: 'offen',                  bg: '#7f8c8d', text: '#fff', kat: 1 },
    in_klaerung:            { label: 'in Klärung',             bg: '#e67e22', text: '#fff', kat: 1 },
    anmeldung_erforderlich: { label: 'Anmeldung erforderlich', bg: '#2980b9', text: '#fff', kat: 2 },
    angemeldet:             { label: 'Angemeldet',             bg: '#27ae60', text: '#fff', kat: 3 },
    absolviert:             { label: 'Absolviert',             bg: '#1abc9c', text: '#fff', kat: 3 },
    findet_nicht_statt:     { label: 'findet nicht statt',     bg: '#7f8c8d', text: '#fff', kat: 3 },
    nicht_angetreten:       { label: 'nicht angetreten',       bg: '#7f8c8d', text: '#fff', kat: 3 },
  };

  // Status-Gruppen für Dropdown
  const ST_GRUPPEN = [
    { titel: 'To-Do',          keys: ['offen','in_klaerung'] },
    { titel: 'In Bearbeitung', keys: ['anmeldung_erforderlich'] },
    { titel: 'Abgeschlossen',  keys: ['angemeldet','absolviert','findet_nicht_statt','passt_nicht','nicht_angetreten'] },
  ];

  // ── Haupteinstieg ────────────────────────────────────────────
  async function render(el) {
    _container = el;
    if (!_container) return;
    _loadPrefs();
    _container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Wettkampfplanung&hellip;</div>';
    try {
      await _lade();
      _renderListe();
    } catch (e) {
      if (_container) {
        _container.innerHTML =
          '<div style="padding:20px;color:var(--primary)">Fehler beim Laden: ' +
          escapeHtml(e.message || String(e)) + '</div>';
      }
    }
  }

  async function _lade() {
    const resp = await apiGet('wettkampfplanung?jahr=' + _jahr, { silent: true });
    _serien = resp.serien || [];
  }

  // ── Gefilterte + sortierte Serien ────────────────────────────
  function _gefilterteSerien() {
    let arr = _serien.filter(s => s.aktiv !== 0);

    if (_filterText.trim()) {
      const q = _filterText.trim().toLowerCase();
      arr = arr.filter(s => s.name.toLowerCase().includes(q) ||
                            (s.ort && s.ort.toLowerCase().includes(q)));
    }

    if (_filterStatus.size > 0) {
      arr = arr.filter(s => _filterStatus.has(s.status));
    }

    if (_hidePasstNicht) {
      arr = arr.filter(s => s.status !== 'passt_nicht');
    }

    if (_hideVergangen) {
      const heute = (new Date()).toISOString().slice(0, 10);
      arr = arr.filter(s => {
        const datum = _datumFuerJahr(s, _jahr);
        return !datum || datum >= heute;
      });
    }

    if (_sortKey) {
      arr.sort((a, b) => {
        let av, bv;
        if (_sortKey === 'name') {
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
        } else if (_sortKey === 'datum') {
          av = _datumFuerJahr(a, _jahr) || '9999-99-99';
          bv = _datumFuerJahr(b, _jahr) || '9999-99-99';
        } else if (_sortKey === 'status') {
          av = a.status || 'z';
          bv = b.status || 'z';
        }
        if (av < bv) return _sortDir === 'asc' ? -1 : 1;
        if (av > bv) return _sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return arr;
  }

  // ── Liste rendern ────────────────────────────────────────────
  function _renderListe() {
    if (!_container) return;
    _closePopper();

    // Fokus-ID merken damit Search-Input nach DOM-Rebuild refokussiert werden kann
    const prevFocusId = document.activeElement?.id;

    const sichtbar = _gefilterteSerien();

    // Statistiken über alle Serien (nicht nur gefilterte)
    const stati = {};
    _serien.forEach(s => { stati[s.status] = (stati[s.status] || 0) + 1; });
    const angemeldet  = (stati['angemeldet']  || 0);
    const offen       = (stati['offen']       || 0) + (stati['in_klaerung'] || 0) + (stati['anmeldung_erforderlich'] || 0);
    const absolviert  = (stati['absolviert']  || 0);

    const sichtbareIds = sichtbar.map(s => s.id);
    const alleSelected = sichtbareIds.length > 0 && sichtbareIds.every(id => _selected.has(id));
    const someSelected = sichtbareIds.some(id => _selected.has(id));

    // Filter-Button-Label
    let filterLabel = 'Alle Status';
    if (_filterStatus.size === 1) filterLabel = ST[[..._filterStatus][0]]?.label || 'Filter';
    else if (_filterStatus.size > 1) filterLabel = `${_filterStatus.size} Status`;

    // Sort-Icon helper
    const si = key => {
      if (_sortKey !== key) return '<span style="color:var(--border);font-size:10px;margin-left:3px">↕</span>';
      return `<span style="font-size:10px;margin-left:3px">${_sortDir === 'asc' ? '↑' : '↓'}</span>`;
    };

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;
                  margin-bottom:16px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="margin:0 0 2px;font-size:1.2rem;font-weight:700">Wettkampfplanung</h2>
          <div style="font-size:12px;color:var(--text2)">
            ${_serien.length} Veranstaltungen
            ${angemeldet  ? ` &bull; <strong style="color:#27ae60">${angemeldet} angemeldet</strong>` : ''}
            ${absolviert  ? ` &bull; ${absolviert} absolviert` : ''}
            ${offen       ? ` &bull; ${offen} offen` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-ghost btn-sm"
            onclick="WETTKAMPFPLANUNG.setJahr(${_jahr - 1})">‹ ${_jahr - 1}</button>
          <strong style="min-width:44px;text-align:center;font-size:1rem">${_jahr}</strong>
          <button class="btn btn-ghost btn-sm"
            onclick="WETTKAMPFPLANUNG.setJahr(${_jahr + 1})">${_jahr + 1} ›</button>
        </div>
      </div>

      <!-- Toolbar: Suche + Filter -->
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <input type="search" id="wkp-search"
          placeholder="Veranstaltung suchen…"
          value="${escapeHtml(_filterText)}"
          oninput="WETTKAMPFPLANUNG._setFilter(this.value)"
          style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;
                 background:var(--bg2);color:var(--text);font-size:13px;
                 width:200px;outline:none;box-sizing:border-box">
        <button id="wkp-filter-btn"
          onclick="WETTKAMPFPLANUNG._openFilterPopper(this)"
          style="padding:6px 12px;border:1px solid ${_filterStatus.size ? 'var(--primary)' : 'var(--border)'};
                 border-radius:8px;background:${_filterStatus.size ? 'color-mix(in srgb,var(--primary) 15%,transparent)' : 'var(--bg2)'};
                 color:${_filterStatus.size ? 'var(--primary)' : 'var(--text)'};
                 font-size:12px;cursor:pointer;white-space:nowrap">
          ${escapeHtml(filterLabel)} ▾
        </button>
        ${(_filterText || _filterStatus.size) ? `
          <button onclick="WETTKAMPFPLANUNG._resetFilter()"
            style="padding:4px 8px;border:none;background:none;color:var(--text2);
                   font-size:12px;cursor:pointer">✕ zurücksetzen</button>` : ''}
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;
                       color:${_hideVergangen ? 'var(--primary)' : 'var(--text2)'};
                       cursor:pointer;white-space:nowrap;user-select:none">
          <input type="checkbox" ${_hideVergangen ? 'checked' : ''}
            onchange="WETTKAMPFPLANUNG._toggleHideVergangen(this.checked)"
            style="accent-color:var(--primary);width:13px;height:13px;cursor:pointer">
          Vergangene ausblenden
        </label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;
                       color:${_hidePasstNicht ? 'var(--primary)' : 'var(--text2)'};
                       cursor:pointer;white-space:nowrap;user-select:none">
          <input type="checkbox" ${_hidePasstNicht ? 'checked' : ''}
            onchange="WETTKAMPFPLANUNG._toggleHidePasstNicht(this.checked)"
            style="accent-color:var(--primary);width:13px;height:13px;cursor:pointer">
          „passt nicht" ausblenden
        </label>
        ${sichtbar.length !== _serien.length
          ? `<span style="font-size:12px;color:var(--text2)">${sichtbar.length} von ${_serien.length}</span>`
          : ''}
      </div>`;

    if (!sichtbar.length) {
      html += '<div style="padding:40px;text-align:center;color:var(--text2)">Keine Veranstaltungen gefunden.</div>';
      _container.innerHTML = html;
      return;
    }

    html += `<div class="panel"><div class="table-scroll">
      <table class="wkp-table">
        <thead>
          <tr>
            <th class="wkp-th-cb">
              <input type="checkbox" class="wkp-check-all"
                onchange="WETTKAMPFPLANUNG._toggleAll(this.checked)"
                style="cursor:pointer;width:15px;height:15px;accent-color:var(--primary)">
            </th>
            <th onclick="WETTKAMPFPLANUNG._toggleSort('name')" class="${_sortKey==='name'?'sorted':''}">
              Veranstaltung${si('name')}
            </th>
            <th onclick="WETTKAMPFPLANUNG._toggleSort('datum')" class="${_sortKey==='datum'?'sorted':''}">
              Datum ${_jahr}${si('datum')}
            </th>
            <th>Disziplinen</th>
            <th onclick="WETTKAMPFPLANUNG._toggleSort('status')" class="${_sortKey==='status'?'sorted':''}">
              Status${si('status')}
            </th>
          </tr>
        </thead>
        <tbody>`;

    sichtbar.forEach(s => {
      const st      = ST[s.status] || ST['offen'];
      const datum   = _datumFuerJahr(s, _jahr);
      const heute   = (new Date()).toISOString().slice(0, 10);
      const vergangen   = datum && datum < heute;
      const isSelected  = _selected.has(s.id);

      // Disziplinen: wettbewerbe als klickbare An-/Abmelde-Buttons
      const wb          = Array.isArray(s.wettbewerbe) ? s.wettbewerbe : [];
      const meineAnm    = s.meine_anmeldungen || [];      // [{id, disziplin}]
      const liste       = wb.length ? wb : [null];        // null = allgemeine Teilnahme

      const stBg   = st.bg;
      const stText2 = st.text;
      let wbHtml = '';
      liste.forEach(w => {
        const key   = w === null ? '' : w;
        const label = w === null ? 'Teilnahme eintragen' : w;
        const anm   = meineAnm.find(a => (a.disziplin || '') === key) || null;
        const baseStyle = `font-size:11px;padding:2px 8px;margin:1px 2px;border-color:${stBg}`;
        if (anm) {
          wbHtml += `<button class="wk-pop-btn"
            onclick="WETTKAMPFPLANUNG._abDisziplin(${s.id},${anm.id})"
            style="${baseStyle};background:${stBg};color:${stText2}">✓ ${escapeHtml(label)}</button>`;
        } else {
          wbHtml += `<button class="wk-pop-btn"
            onclick="WETTKAMPFPLANUNG._anDisziplin(${s.id},${escapeHtml(JSON.stringify(key))})"
            style="${baseStyle};background:color-mix(in srgb,${stBg} 15%,transparent)">${escapeHtml(label)}</button>`;
        }
      });
      const anmHtml = '';

      const y = String(_jahr);
      // Prognose = kein naechstes_datum für dieses Jahr UND Statistikportal
      // hat kein Datum für dieses Jahr (referenz_datum allein = immer Prognose)
      const istPrognose = datum && !(
        (s.naechstes_datum           && s.naechstes_datum.startsWith(y)) ||
        (s.letztes_datum_statistik   && s.letztes_datum_statistik.startsWith(y))
      );

      let datumHtml = '<span style="color:var(--text2);font-size:13px">–</span>';
      if (datum) {
        const d = new Date(datum + 'T00:00:00');
        const WT = ['So','Mo','Di','Mi','Do','Fr','Sa'];
        const fmt = `${WT[d.getDay()]}, ${d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' })}`;
        if (istPrognose) {
          const wt = fmt.split(',')[0];
          datumHtml = `<span style="font-size:13px;color:var(--text2);font-style:italic"
            title="Prognose – gleicher ${wt} im gleichen Monat wie letztes Jahr">~ ${fmt}</span>`;
        } else {
          datumHtml = `<span style="font-size:13px${vergangen ? ';color:var(--text2)' : ';font-weight:600'}">${fmt}</span>`;
        }
      }

      const rowOp  = vergangen && s.status === 'passt_nicht' ? 'opacity:.55;' : '';
      const rowBg  = isSelected ? 'background:color-mix(in srgb,var(--primary) 8%,transparent);' : '';

      html += `
        <tr${rowOp || rowBg ? ` style="${rowOp}${rowBg}"` : ''}>
          <td class="wkp-td-cb">
            <input type="checkbox" class="wkp-check" data-id="${s.id}"
              ${isSelected ? 'checked' : ''}
              onchange="WETTKAMPFPLANUNG._toggleSelect(${s.id}, this.checked)"
              style="cursor:pointer;width:15px;height:15px;accent-color:var(--primary)">
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <strong>${escapeHtml(s.name)}</strong>
              ${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener"
                  class="wkp-url-link" title="${escapeHtml(s.url)}">↗</a>` : ''}
            </div>
            ${s.ort ? `<div class="wkp-ort">${escapeHtml(s.ort)}</div>` : ''}
            ${anmHtml}
          </td>
          <td style="white-space:nowrap">${datumHtml}</td>
          <td><div style="display:flex;flex-wrap:wrap;gap:2px">${wbHtml}</div></td>
          <td style="white-space:nowrap">
            <button class="wkp-status-btn"
              onclick="WETTKAMPFPLANUNG._openPopper(${s.id}, this)"
              style="background:${st.bg};color:${st.text};border:none;border-radius:12px;
                     padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">
              ${escapeHtml(st.label)}
            </button>
          </td>
        </tr>`;
    });

    html += `</tbody></table></div></div>`;

    // Bulk-Action-Bar (sticky, erscheint wenn etwas ausgewählt)
    if (_selected.size > 0) {
      html += `
        <div id="wkp-bulk-bar" style="
          position:sticky;bottom:0;margin-top:8px;
          background:var(--bg);border-top:2px solid var(--primary);
          padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
          box-shadow:0 -4px 16px rgba(0,0,0,.12);border-radius:0 0 10px 10px">
          <strong style="font-size:13px;color:var(--primary)">${_selected.size} ausgewählt</strong>
          <button id="wkp-bulk-btn"
            onclick="WETTKAMPFPLANUNG._openBulkPopper(this)"
            style="padding:6px 14px;border:1px solid var(--border);border-radius:8px;
                   background:var(--bg2);color:var(--text);font-size:12px;cursor:pointer">
            Status setzen ▾
          </button>
          <button onclick="WETTKAMPFPLANUNG._clearSelection()"
            style="padding:6px 10px;border:none;background:none;color:var(--text2);
                   font-size:12px;cursor:pointer">Abbrechen</button>
        </div>`;
    }

    _container.innerHTML = html;

    // Indeterminate-Zustand für "Alle auswählen"-Checkbox
    const chkAll = _container.querySelector('.wkp-check-all');
    if (chkAll) {
      chkAll.checked       = alleSelected;
      chkAll.indeterminate = !alleSelected && someSelected;
    }

    // Fokus nach DOM-Rebuild wiederherstellen (z. B. Search-Input)
    if (prevFocusId) {
      const el = _container.querySelector('#' + prevFocusId);
      if (el) {
        el.focus();
        // Cursor ans Ende setzen
        if (typeof el.selectionStart === 'number') {
          const len = el.value.length;
          el.selectionStart = el.selectionEnd = len;
        }
      }
    }
  }


  // ── Sort ─────────────────────────────────────────────────────
  function _toggleSort(key) {
    if (_sortKey === key) {
      _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      _sortKey = key;
      _sortDir = 'asc';
    }
    _renderListe();
  }

  // ── Filter ───────────────────────────────────────────────────
  function _setFilter(text) {
    _filterText = text;
    _selected.clear();
    _renderListe();
  }

  function _resetFilter() {
    _filterText = '';
    _filterStatus.clear();
    _selected.clear();
    _renderListe();
  }

  function _openFilterPopper(btn) {
    if (!_filterPopper || !_filterPopper.isConnected) {
      _filterPopper = document.createElement('div');
      _filterPopper.style.cssText =
        'position:fixed;z-index:9900;background:var(--bg);border:1px solid var(--border);' +
        'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:6px;' +
        'min-width:220px;display:none;';
      document.body.appendChild(_filterPopper);
      document.addEventListener('mousedown', e => {
        const b = document.getElementById('wkp-filter-btn');
        if (_filterPopper.style.display !== 'none' &&
            !_filterPopper.contains(e.target) && !b?.contains(e.target)) {
          _filterPopper.style.display = 'none';
        }
      });
    }

    let html = `<div style="padding:4px 10px 6px;font-size:10px;font-weight:700;
      text-transform:uppercase;letter-spacing:.4px;color:var(--text2)">Status filtern</div>`;
    ST_GRUPPEN.forEach(g => {
      html += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;
        letter-spacing:.4px;color:var(--text2);padding:4px 10px 2px;margin-top:4px">${escapeHtml(g.titel)}</div>`;
      g.keys.forEach(key => {
        const cfg   = ST[key];
        const aktiv = _filterStatus.has(key);
        html += `<div onclick="WETTKAMPFPLANUNG._toggleFilterStatus('${key}')"
          style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;
                 background:${aktiv ? 'var(--border)' : 'transparent'}"
          onmouseover="this.style.background='var(--border)'"
          onmouseout="this.style.background='${aktiv ? 'var(--border)' : 'transparent'}'">
          <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${escapeHtml(cfg.bg)}"></span>
          <span style="font-size:13px;flex:1">${escapeHtml(cfg.label)}</span>
          ${aktiv ? '<span style="font-size:11px;color:var(--text2)">✓</span>' : ''}
        </div>`;
      });
    });
    html += `<div style="padding:6px 10px;border-top:1px solid var(--border);margin-top:4px">
      <button onclick="WETTKAMPFPLANUNG._resetStatusFilter()"
        style="font-size:12px;color:var(--text2);background:none;border:none;cursor:pointer;padding:0">
        Alle anzeigen
      </button>
    </div>`;

    _filterPopper.innerHTML = html;
    _filterPopper.style.display = 'block';
    _positionPopper(_filterPopper, btn, 220);
  }

  function _toggleFilterStatus(key) {
    if (_filterStatus.has(key)) _filterStatus.delete(key);
    else _filterStatus.add(key);
    _selected.clear();
    _renderListe();
    const btn = document.getElementById('wkp-filter-btn');
    if (btn) _openFilterPopper(btn);
  }

  function _resetStatusFilter() {
    _filterStatus.clear();
    if (_filterPopper) _filterPopper.style.display = 'none';
    _selected.clear();
    _renderListe();
  }

  function _toggleHideVergangen(val) {
    _hideVergangen = !!val;
    _savePrefs();
    _selected.clear();
    _renderListe();
  }

  function _toggleHidePasstNicht(val) {
    _hidePasstNicht = !!val;
    _savePrefs();
    _selected.clear();
    _renderListe();
  }

  // ── Auswahl ──────────────────────────────────────────────────
  function _toggleSelect(serieId, checked) {
    if (checked) _selected.add(serieId);
    else         _selected.delete(serieId);
    _renderListe();
  }

  function _toggleAll(checked) {
    _gefilterteSerien().forEach(s => {
      if (checked) _selected.add(s.id);
      else         _selected.delete(s.id);
    });
    _renderListe();
  }

  function _clearSelection() {
    _selected.clear();
    _renderListe();
  }

  // ── Bulk-Status-Popper ────────────────────────────────────────
  function _openBulkPopper(btn) {
    if (!_bulkPopper || !_bulkPopper.isConnected) {
      _bulkPopper = document.createElement('div');
      _bulkPopper.style.cssText =
        'position:fixed;z-index:9901;background:var(--bg);border:1px solid var(--border);' +
        'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:6px;' +
        'min-width:200px;display:none;';
      document.body.appendChild(_bulkPopper);
      document.addEventListener('mousedown', e => {
        const b = document.getElementById('wkp-bulk-btn');
        if (_bulkPopper.style.display !== 'none' &&
            !_bulkPopper.contains(e.target) && !b?.contains(e.target)) {
          _bulkPopper.style.display = 'none';
        }
      });
    }

    let html = `<div style="padding:4px 10px 6px;font-size:10px;font-weight:700;
      text-transform:uppercase;letter-spacing:.4px;color:var(--text2)">
      Status für ${_selected.size} Einträge setzen</div>`;
    ST_GRUPPEN.forEach(g => {
      html += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;
        letter-spacing:.4px;color:var(--text2);padding:4px 10px 2px;margin-top:4px">${escapeHtml(g.titel)}</div>`;
      g.keys.forEach(key => {
        const cfg = ST[key];
        html += `<div onclick="WETTKAMPFPLANUNG._bulkSetStatus('${key}')"
          style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer"
          onmouseover="this.style.background='var(--border)'"
          onmouseout="this.style.background=''">
          <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${escapeHtml(cfg.bg)}"></span>
          <span style="font-size:13px">${escapeHtml(cfg.label)}</span>
        </div>`;
      });
    });

    _bulkPopper.innerHTML = html;
    _bulkPopper.style.display = 'block';
    _positionPopper(_bulkPopper, btn, 200);
  }

  async function _bulkSetStatus(status) {
    if (_bulkPopper) _bulkPopper.style.display = 'none';
    const ids = [..._selected];
    if (!ids.length) return;

    // Optimistisch updaten
    ids.forEach(id => {
      const s = _serien.find(x => x.id === id);
      if (s) s.status = status;
    });
    _selected.clear();
    _renderListe();

    // API-Calls parallel feuern
    await Promise.allSettled(
      ids.map(id => apiPut(`wettkampfplanung/${id}`, { jahr: _jahr, status }))
    );
  }

  // ── Popper positionieren (shared) ────────────────────────────
  function _positionPopper(el, anchor, minW) {
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = Math.max(el.offsetWidth || minW, minW);
    const ph = el.offsetHeight || 300;
    const left = Math.min(rect.left, vw - pw - 8);
    const top  = rect.bottom + ph > vh ? Math.max(4, rect.top - ph) : rect.bottom + 4;
    el.style.left = Math.max(4, left) + 'px';
    el.style.top  = top + 'px';
  }

  // ── Status-Popper (Einzelzeile) ───────────────────────────────
  function _ensurePopper() {
    if (_popper && _popper.isConnected) return _popper;
    _popper = document.createElement('div');
    _popper.style.cssText =
      'position:fixed;z-index:9900;background:var(--bg);border:1px solid var(--border);' +
      'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:6px;' +
      'min-width:200px;display:none;';
    document.body.appendChild(_popper);
    document.addEventListener('mousedown', e => {
      if (_popper && _popper.style.display !== 'none' &&
          !_popper.contains(e.target) && !e.target.closest('.wkp-status-btn')) {
        _closePopper();
      }
    });
    return _popper;
  }

  function _openPopper(serieId, btnEl) {
    const p = _ensurePopper();
    const s = _serien.find(x => x.id === serieId);
    if (!s) return;

    let html = '';
    ST_GRUPPEN.forEach(g => {
      html += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;
        letter-spacing:.4px;color:var(--text2);padding:4px 10px 2px;margin-top:4px">${escapeHtml(g.titel)}</div>`;
      g.keys.forEach(key => {
        const cfg   = ST[key];
        const aktiv = s.status === key;
        html += `<div onclick="WETTKAMPFPLANUNG._waehleStatus(${serieId},'${key}')"
          style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;
                 ${aktiv ? 'background:var(--border);font-weight:700;' : ''}"
          onmouseover="if(!${aktiv})this.style.background='var(--border)'"
          onmouseout="if(!${aktiv})this.style.background=''">
          <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${escapeHtml(cfg.bg)}"></span>
          <span style="font-size:13px">${escapeHtml(cfg.label)}</span>
          ${aktiv ? '<span style="margin-left:auto;font-size:11px;color:var(--text2)">✓</span>' : ''}
        </div>`;
      });
    });

    p.innerHTML = html;
    p.style.display = 'block';
    _positionPopper(p, btnEl, 200);
  }

  function _closePopper() {
    if (_popper) _popper.style.display = 'none';
  }

  async function _waehleStatus(serieId, status) {
    _closePopper();
    const s = _serien.find(x => x.id === serieId);
    if (!s) return;
    const alt = s.status;
    s.status = status;
    _renderListe();
    try {
      await apiPut(`wettkampfplanung/${serieId}`, { jahr: _jahr, status });
    } catch (e) {
      s.status = alt;
      _renderListe();
    }
  }

  // ── Disziplin-Anmeldung ──────────────────────────────────────
  async function _anDisziplin(serieId, disziplin) {
    const serie = _serien.find(s => s.id === serieId);
    if (!serie) return;
    const datum = _datumFuerJahr(serie, _jahr);

    try {
      // Formale Anmeldung (Teilnehmerliste)
      await apiPost(`wettkampf/${serieId}/anmeldungen`, { disziplin: disziplin || '' });

      // Kalender-Eintrag (Mein Plan)
      if (datum) {
        const name  = serie.name || serie.kuerzel || '';
        const titel = ('🏆 ' + name + (disziplin ? ` – ${disziplin}` : '')).slice(0, 200);
        try {
          await apiPost('mein-plan/einheiten', {
            datum,
            typ:        'wettkampf',
            titel,
            distanz_km: null,
            bemerkung:  disziplin || null,
          });
        } catch (_) { /* Plan-Eintrag ist optional */ }
      }

      await _lade();
      _renderListe();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function _abDisziplin(serieId, anmId) {
    try {
      await apiDel(`wettkampf/anmeldungen/${anmId}`);
      await _lade();
      _renderListe();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  // ── Datum für ein bestimmtes Jahr berechnen ──────────────────
  // Prognose: gleicher N-ter Wochentag im gleichen Monat des Zieljahres
  // (identische Logik zu predictNextDate in 16_admin_wettkampf.js)
  function _predictDatumFuerJahr(letztesDateStr, targetJahr) {
    const last  = new Date(letztesDateStr + 'T00:00:00');
    const month = last.getMonth();              // 0–11
    const dow   = last.getDay();               // 0=So … 6=Sa
    const nth   = Math.floor((last.getDate() - 1) / 7); // 0=erster, 1=zweiter …
    const erstDow = new Date(targetJahr, month, 1).getDay();
    let   tag     = 1 + (dow - erstDow + 7) % 7 + nth * 7;
    const tage    = new Date(targetJahr, month + 1, 0).getDate();
    if (tag > tage) tag -= 7;  // letztes Vorkommen als Fallback
    return `${targetJahr}-${String(month + 1).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
  }

  function _datumFuerJahr(serie, jahr) {
    const y = String(jahr);
    // 1. Manuell gesetzter Termin in diesem Jahr
    if (serie.naechstes_datum && serie.naechstes_datum.startsWith(y)) return serie.naechstes_datum;
    // 2. Bekannter Termin aus dem Statistikportal für dieses Jahr
    if (serie.letztes_datum   && serie.letztes_datum.startsWith(y))   return serie.letztes_datum;
    // 3. Prognose: N-ter Wochentag des letzten bekannten Termins im Zieljahr
    if (serie.letztes_datum) return _predictDatumFuerJahr(serie.letztes_datum, jahr);
    return null;
  }

  // ── Jahreswechsel ────────────────────────────────────────────
  async function setJahr(j) {
    _jahr = j;
    _selected.clear();
    if (_container) {
      _container.innerHTML =
        '<div class="loading"><div class="spinner"></div>Lade&hellip;</div>';
    }
    try {
      await _lade();
      _renderListe();
    } catch (e) {
      if (_container) {
        _container.innerHTML =
          '<div style="padding:20px;color:var(--primary)">Fehler: ' +
          escapeHtml(e.message || '') + '</div>';
      }
    }
  }

  // ── Öffentliche API ──────────────────────────────────────────
  return {
    render, setJahr,
    _openPopper, _waehleStatus,
    _toggleSort,
    _setFilter, _resetFilter, _openFilterPopper, _toggleFilterStatus, _resetStatusFilter,
    _toggleHideVergangen, _toggleHidePasstNicht,
    _toggleSelect, _toggleAll, _clearSelection,
    _openBulkPopper, _bulkSetStatus,
    _anDisziplin, _abDisziplin,
  };
})();
