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
  let _filterStatus    = new Set();   // leer = alle Status anzeigen
  let _sortKey         = 'datum';     // 'name' | 'datum' | 'status'
  let _sortDir         = 'asc';
  let _selected        = new Set();   // ausgewählte Serie-IDs
  let _hideVergangen   = false;       // vergangene Veranstaltungen ausblenden
  let _hidePasstNicht  = false;       // "passt nicht"-Einträge ausblenden

  // Kategorien (Statistikportal: disziplin_kategorien) für Filter + Spalte
  let _kategorien = [];               // [{tbl_key, name}]
  let _statistikUrl = 'https://statistik.tus-oedt.de';  // Basis-URL Statistikportal

  // Karte (Leaflet) unter der Tabelle
  let _listEl        = null;          // Tabellen-Container (wird bei Filter/Sort neu gerendert)
  let _mapSectionEl  = null;          // Karten-Container (persistent)
  let _map           = null;
  let _markerLayer   = null;
  let _leafletLoading = false;

  // Vorschlag-Modal: Disziplin-Picker
  let _vorschlagAlleDisz   = null;    // null = noch nicht geladen
  let _vorschlagDiszFilter = '';
  let _vorschlagDisz       = [];      // ausgewählte Disziplinen

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
      if (!_kategorien.length) {
        try {
          const r = await apiGet('wettkampf/kategorien', { silent: true });
          _kategorien = r.kategorien || [];
        } catch (_) { /* Kategorien optional */ }
      }
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

  // Zwei persistente Container: Tabelle (#wkp-list) + Karte (#wkp-map-section).
  // So bleibt die Karte beim Neu-Rendern der Tabelle (Filter/Sort/Suche) erhalten.
  function _ensureLayout() {
    if (!_container) return;
    if (!_container.querySelector('#wkp-list')) {
      try { if (_map) _map.remove(); } catch (_) {}
      _map = null; _markerLayer = null;
      _container.innerHTML =
        '<div id="wkp-list"></div><div id="wkp-map-section" style="margin-top:16px"></div>';
    }
    _listEl       = _container.querySelector('#wkp-list');
    _mapSectionEl = _container.querySelector('#wkp-map-section');
  }

  // ── Kategorie-Label (Statistikportal) ────────────────────────
  function _katLabel(key) {
    if (!key) return '';
    const k = _kategorien.find(x => x.tbl_key === key);
    return k ? k.name : key;
  }

  async function _lade() {
    const resp = await apiGet('wettkampfplanung?jahr=' + _jahr, { silent: true });
    _serien = resp.serien || [];
    _statistikUrl = (resp.statistikportal_url || 'https://statistik.tus-oedt.de').replace(/\/+$/, '');
  }

  // ── Gemeinsame Filterleiste (Statistikportal-Modul, via shared.php) ──
  const TF = 'tp-wkplanung';
  const WKP_MONATE = ['Januar','Februar','März','April','Mai','Juni',
                      'Juli','August','September','Oktober','November','Dezember'];

  function _filterInit() {
    tfInit(TF, {
      platzhalter: 'Veranstaltung, Ort, Disziplin…',
      rows: () => _serien.filter(s => s.aktiv !== 0),
      suche: s => [s.name, s.ort].concat(Array.isArray(s.wettbewerbe) ? s.wettbewerbe : []),
      spalten: [
        // Mehrfachzuordnung: jede Disziplin der Veranstaltung zählt einzeln
        { key: 'disziplin', label: 'Disziplin',
          wert: s => Array.isArray(s.wettbewerbe) ? s.wettbewerbe : [] },
        { key: 'kategorie', label: 'Kategorie',
          wert: s => s.import_kategorie ? _katLabel(s.import_kategorie) : '— ohne Kategorie —' },
        { key: 'ort',   label: 'Ort',   wert: s => s.ort || '' },
        { key: 'monat', label: 'Monat', wert: s => (_datumFuerJahr(s, _jahr) || '').slice(5, 7),
          anzeige: w => WKP_MONATE[parseInt(w, 10) - 1] || w },
        { key: 'teilnehmer', label: 'Teilnehmende',
          wert: s => (s.teilnehmer || []).length > 0 ? 'vorhanden' : 'keine' },
      ],
      onChange: () => { _selected.clear(); _renderListe(); },
    });
  }

  // ── Gefilterte + sortierte Serien ────────────────────────────
  function _gefilterteSerien() {
    _filterInit();
    let arr = tfFilter(TF, _serien.filter(s => s.aktiv !== 0));

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
        } else if (_sortKey === 'teilnehmer') {
          av = (a.teilnehmer || []).length;
          bv = (b.teilnehmer || []).length;
        } else if (_sortKey === 'kategorie') {
          av = _katLabel(a.import_kategorie) || 'zzz';
          bv = _katLabel(b.import_kategorie) || 'zzz';
        } else if (_sortKey === 'ergebnisse') {
          av = a.anz_ergebnisse || 0;
          bv = b.anz_ergebnisse || 0;
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
    _ensureLayout();

    // Fokus-ID merken damit Search-Input nach DOM-Rebuild refokussiert werden kann
    const prevFocusId = document.activeElement?.id;

    const sichtbar = _gefilterteSerien();
    _updateMap(sichtbar);

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
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm"
            onclick="WETTKAMPFPLANUNG._openVorschlagModal()"
            title="Einen bisher unbekannten Wettkampf zur Planungsliste hinzufügen">
            + Wettkampf vorschlagen</button>
          <button class="btn btn-ghost btn-sm"
            onclick="WETTKAMPFPLANUNG._exportPDF()"
            title="Aktuelle Ansicht als neutrales PDF exportieren (ohne persönlichen Status)">
            📄 PDF</button>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-ghost btn-sm"
              onclick="WETTKAMPFPLANUNG.setJahr(${_jahr - 1})">‹ ${_jahr - 1}</button>
            <strong style="min-width:44px;text-align:center;font-size:1rem">${_jahr}</strong>
            <button class="btn btn-ghost btn-sm"
              onclick="WETTKAMPFPLANUNG.setJahr(${_jahr + 1})">${_jahr + 1} ›</button>
          </div>
        </div>
      </div>

      <!-- Toolbar: gemeinsame Filterleiste + Status/Sichtbarkeits-Schalter -->
      ${tfBarHtml(TF, { suchbreite: '0 1 220px', extra: `
        <button id="wkp-filter-btn"
          onclick="WETTKAMPFPLANUNG._openFilterPopper(this)"
          style="padding:6px 12px;border:1px solid ${_filterStatus.size ? 'var(--primary)' : 'var(--border)'};
                 border-radius:8px;background:${_filterStatus.size ? 'color-mix(in srgb,var(--primary) 15%,transparent)' : 'var(--bg2)'};
                 color:${_filterStatus.size ? 'var(--primary)' : 'var(--text)'};
                 font-size:12px;cursor:pointer;white-space:nowrap;align-self:flex-end">
          ${escapeHtml(filterLabel)} ▾
        </button>
        ${(tfAktiv(TF) || _filterStatus.size) ? `
          <button onclick="WETTKAMPFPLANUNG._resetFilter()"
            style="padding:4px 8px;border:none;background:none;color:var(--text2);
                   font-size:12px;cursor:pointer;align-self:flex-end">✕ zurücksetzen</button>` : ''}
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;
                       color:${_hideVergangen ? 'var(--primary)' : 'var(--text2)'};
                       cursor:pointer;white-space:nowrap;user-select:none;align-self:flex-end;padding-bottom:8px">
          <input type="checkbox" ${_hideVergangen ? 'checked' : ''}
            onchange="WETTKAMPFPLANUNG._toggleHideVergangen(this.checked)"
            style="accent-color:var(--primary);width:13px;height:13px;cursor:pointer">
          Vergangene ausblenden
        </label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;
                       color:${_hidePasstNicht ? 'var(--primary)' : 'var(--text2)'};
                       cursor:pointer;white-space:nowrap;user-select:none;align-self:flex-end;padding-bottom:8px">
          <input type="checkbox" ${_hidePasstNicht ? 'checked' : ''}
            onchange="WETTKAMPFPLANUNG._toggleHidePasstNicht(this.checked)"
            style="accent-color:var(--primary);width:13px;height:13px;cursor:pointer">
          „passt nicht" ausblenden
        </label>` })}
      <div style="margin:-8px 0 12px">
        ${sichtbar.length !== _serien.length
          ? `<span style="font-size:12px;color:var(--text2)">${sichtbar.length} von ${_serien.length}</span>`
          : ''}
      </div>`;

    if (!sichtbar.length) {
      html += '<div style="padding:40px;text-align:center;color:var(--text2)">Keine Veranstaltungen gefunden.</div>';
      _listEl.innerHTML = html;
      return;
    }

    html += `<div class="panel"><div class="table-scroll">
      <table class="wkp-table karten-tabelle">
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
            <th onclick="WETTKAMPFPLANUNG._toggleSort('kategorie')" class="${_sortKey==='kategorie'?'sorted':''}">
              Kategorie${si('kategorie')}
            </th>
            <th onclick="WETTKAMPFPLANUNG._toggleSort('teilnehmer')" class="${_sortKey==='teilnehmer'?'sorted':''}"
                style="text-align:center;white-space:nowrap" title="Angemeldete Teilnehmer">
              👥${si('teilnehmer')}
            </th>
            <th onclick="WETTKAMPFPLANUNG._toggleSort('ergebnisse')" class="${_sortKey==='ergebnisse'?'sorted':''}"
                style="text-align:center;white-space:nowrap"
                title="Anzahl bereits im Statistikportal vorliegender Ergebnisse">
              📊${si('ergebnisse')}
            </th>
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
      // Absage betrifft die Ausgabe des angezeigten Jahres
      const abgesagt    = !!(s.abgesagt_datum && s.abgesagt_datum.startsWith(String(_jahr)));

      // Disziplinen: wettbewerbe als klickbare An-/Abmelde-Buttons,
      // sortiert nach Distanz aufsteigend (unbekannte Distanz ans Ende)
      const _km = (typeof _disziplinKm === 'function') ? _disziplinKm : () => null;
      const wb          = (Array.isArray(s.wettbewerbe) ? [...s.wettbewerbe] : [])
        .sort((a, b) => {
          const ka = _km(a), kb = _km(b);
          if (ka == null && kb == null) return 0;
          if (ka == null) return 1;
          if (kb == null) return -1;
          return ka - kb;
        });
      const meineAnm    = s.meine_anmeldungen || [];      // [{id, disziplin}]
      const liste       = wb.length ? wb : [null];        // null = allgemeine Teilnahme

      const stBg   = st.bg;
      const stText2 = st.text;
      let wbHtml = '';
      if (abgesagt) {
        wbHtml = `<span style="font-size:11px;color:var(--text2);font-style:italic">Keine Anmeldung möglich</span>`;
      } else {
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
      }
      // Angemeldete Teilnehmer (alle Nutzer) – eigene Spalte mit Anzahl + Mouseover
      const teiln = Array.isArray(s.teilnehmer) ? s.teilnehmer : [];
      const myId  = (typeof state !== 'undefined' && state.user) ? (state.user.id || 0) : 0;
      const teilnTitle = teiln.length
        ? teiln.map(t => {
            const nm = t.name || 'Unbekannt';
            const me = (myId && t.benutzer_id === myId) ? ' (ich)' : '';
            return (t.disziplin ? `${nm} · ${t.disziplin}` : nm) + me;
          }).join('\n')
        : '';
      const binIchDabei = myId && teiln.some(t => t.benutzer_id === myId);
      const teilnHtml = teiln.length
        ? `<span title="${escapeHtml(teilnTitle)}"
             style="display:inline-block;min-width:22px;padding:1px 8px;border-radius:10px;
                    font-size:12px;font-weight:600;cursor:help;
                    background:${binIchDabei ? '#27ae6022' : 'var(--border)'};
                    color:${binIchDabei ? '#27ae60' : 'var(--text)'}">👥 ${teiln.length}</span>`
        : '<span style="color:var(--text2);font-size:13px">–</span>';

      const y = String(_jahr);
      // Prognose = kein naechstes_datum für dieses Jahr UND Statistikportal
      // hat kein Datum für dieses Jahr (referenz_datum allein = immer Prognose)
      const istPrognose = datum && !(
        (s.naechstes_datum           && s.naechstes_datum.startsWith(y)) ||
        (s.letztes_datum_statistik   && s.letztes_datum_statistik.startsWith(y))
      );

      let datumHtml = '<span style="color:var(--text2);font-size:13px">–</span>';
      if (datum) {
        const d   = new Date(datum + 'T00:00:00');
        const WT  = ['So','Mo','Di','Mi','Do','Fr','Sa'];
        const fmt = `${WT[d.getDay()]}, ${d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' })}`;
        // ISO-Kalenderwoche
        const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
        const kw  = Math.ceil(((tmp - new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
        const kwHtml = `<span style="font-size:11px;color:var(--text2);display:block;margin-top:1px">KW ${kw}</span>`;
        if (abgesagt) {
          datumHtml = `<span style="font-size:13px;text-decoration:line-through;color:var(--text2)">${fmt}</span>${kwHtml}`;
        } else if (istPrognose) {
          const wt = fmt.split(',')[0];
          datumHtml = `<span style="font-size:13px;color:var(--text2);font-style:italic"
            title="Prognose – gleicher ${wt} im gleichen Monat wie letztes Jahr">~ ${fmt}</span>${kwHtml}`;
        } else {
          datumHtml = `<span style="font-size:13px${vergangen ? ';color:var(--text2)' : ';font-weight:600'}">${fmt}</span>${kwHtml}`;
        }
      }

      const rowOp  = vergangen && s.status === 'passt_nicht' ? 'opacity:.55;' : '';
      const rowBg  = isSelected ? 'background:color-mix(in srgb,var(--primary) 8%,transparent);' : '';

      html += `
        <tr${rowOp || rowBg ? ` style="${rowOp}${rowBg}"` : ''}>
          <td class="wkp-td-cb karte-cb">
            <input type="checkbox" class="wkp-check" data-id="${s.id}"
              ${isSelected ? 'checked' : ''}
              onchange="WETTKAMPFPLANUNG._toggleSelect(${s.id}, this.checked)"
              style="cursor:pointer;width:15px;height:15px;accent-color:var(--primary)">
          </td>
          <td class="karte-titel">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <strong style="${abgesagt ? 'text-decoration:line-through' : ''}">${escapeHtml(stripOrtFromName(s.name, s.ort))}</strong>
              ${abgesagt ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#cc000022;color:var(--primary);font-weight:700">Abgesagt</span>' : ''}
              ${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener"
                  class="wkp-url-link" title="${escapeHtml(s.url)}">↗</a>` : ''}
              ${(s.ergebnis_url && vergangen) ? `<a href="${escapeHtml(s.ergebnis_url)}" target="_blank" rel="noopener"
                  title="Ergebnisliste öffnen"
                  style="font-size:11px;font-weight:600;text-decoration:none;
                         padding:2px 8px;border-radius:10px;white-space:nowrap;
                         border:1px solid var(--border);color:var(--text2)">🏁 Ergebnisse ↗</a>`
                : (s.ergebnis_url && !abgesagt) ? `<a href="${escapeHtml(s.ergebnis_url)}" target="_blank" rel="noopener"
                  title="Externe Anmeldeseite öffnen"
                  style="font-size:11px;font-weight:600;text-decoration:none;
                         padding:2px 8px;border-radius:10px;white-space:nowrap;
                         background:var(--primary);color:#fff">Jetzt anmelden ↗</a>` : ''}
            </div>
            ${s.ort ? `<div class="wkp-ort">${escapeHtml(s.ort)}</div>` : ''}
          </td>
          <td data-label="Datum" style="white-space:nowrap">${datumHtml}</td>
          <td data-label="Disziplinen"><div style="display:flex;flex-wrap:wrap;gap:2px">${wbHtml}</div></td>
          <td data-label="Kategorie" style="white-space:nowrap">${s.import_kategorie
            ? `<span style="font-size:11px;padding:2px 9px;border-radius:10px;
                 background:var(--border);color:var(--text)">${escapeHtml(_katLabel(s.import_kategorie))}</span>`
            : '<span style="color:var(--text2);font-size:13px">–</span>'}</td>
          <td data-label="Teilnehmer" style="text-align:center;white-space:nowrap">${teilnHtml}</td>
          <td data-label="Ergebnisse" style="text-align:center;white-space:nowrap">${(() => {
            const n = s.anz_ergebnisse || 0;
            if (!n) return '<span style="color:var(--text2);font-size:13px">–</span>';
            return `<a href="${escapeHtml(_statistikUrl)}/#veranstaltungen/serie/${s.id}"
              target="_blank" rel="noopener"
              title="${n} Ergebnis${n === 1 ? '' : 'se'} im Statistikportal ansehen"
              style="display:inline-block;min-width:22px;padding:1px 8px;border-radius:10px;
                     font-size:12px;font-weight:600;text-decoration:none;
                     background:var(--border);color:var(--text)">${n} ↗</a>`;
          })()}</td>
          <td data-label="Status" style="white-space:nowrap">
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

    _listEl.innerHTML = html;

    // Indeterminate-Zustand für "Alle auswählen"-Checkbox
    const chkAll = _listEl.querySelector('.wkp-check-all');
    if (chkAll) {
      chkAll.checked       = alleSelected;
      chkAll.indeterminate = !alleSelected && someSelected;
    }

    // Fokus nach DOM-Rebuild wiederherstellen (z. B. Search-Input)
    if (prevFocusId) {
      const el = _listEl.querySelector('#' + prevFocusId);
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
  function _resetFilter() {
    tfLeeren(TF);
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
  function _fmtKurz(iso) {
    const d  = new Date(iso + 'T00:00:00');
    const WT = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    return `${WT[d.getDay()]}, ${d.toLocaleDateString('de-DE')}`;
  }

  async function _anDisziplin(serieId, disziplin) {
    const serie = _serien.find(s => s.id === serieId);
    if (!serie) return;
    let jahr  = _jahr;
    let datum = _datumFuerJahr(serie, jahr);

    // Termin des angezeigten Jahres liegt in der Vergangenheit → die Anmeldung würde
    // für eine bereits gelaufene Ausgabe gelten und im Statistikportal als
    // „Ergebnis ausstehend" auftauchen. Nächste Ausgabe anbieten.
    const heute = (new Date()).toISOString().slice(0, 10);
    if (datum && datum < heute) {
      const naechstesJahr  = jahr + 1;
      const naechstesDatum = _datumFuerJahr(serie, naechstesJahr);
      if (naechstesDatum) {
        const frage =
          `„${serie.name}" fand am ${_fmtKurz(datum)} bereits statt.\n\n` +
          `OK\t\t= für ${naechstesJahr} anmelden (${_fmtKurz(naechstesDatum)})\n` +
          `Abbrechen\t= trotzdem für ${jahr} eintragen`;
        if (confirm(frage)) { jahr = naechstesJahr; datum = naechstesDatum; }
      }
    }

    try {
      // Formale Anmeldung (Teilnehmerliste) – für die gewählte Ausgabe
      await apiPost(`wettkampf/${serieId}/anmeldungen`, { disziplin: disziplin || '', jahr });

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

      // Auf das Jahr umschalten, für das tatsächlich angemeldet wurde
      if (jahr !== _jahr) { await setJahr(jahr); return; }

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

  // ── Wettkampf vorschlagen ────────────────────────────────────
  function _openVorschlagModal() {
    const cont = document.getElementById('modal-container');
    if (!cont) return;

    // Picker-Zustand zurücksetzen
    _vorschlagDisz       = [];
    _vorschlagDiszFilter = '';
    if (_vorschlagAlleDisz !== null && _vorschlagAlleDisz.length === 0) _vorschlagAlleDisz = null;

    const lblStyle = `font-size:11px;font-weight:700;text-transform:uppercase;
                      letter-spacing:.5px;color:var(--text2);display:block;margin-bottom:6px`;
    const inpStyle = `width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;
                      padding:7px 9px;font-size:14px;background:var(--bg);color:var(--text)`;

    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width:480px;max-height:90vh;overflow-y:auto">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Wettkampfplanung</div>
              <div class="modal-title">Wettkampf vorschlagen</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()">&times;</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
            <div style="font-size:12px;color:var(--text2)">
              Schlage einen bisher nicht gelisteten Wettkampf vor. Er erscheint sofort in deiner
              Planung und läuft unter <strong>Admin&nbsp;→&nbsp;Wettkämpfe</strong> zur Prüfung auf.
              Alle Felder sind erforderlich.
            </div>
            <div>
              <label style="${lblStyle}">Name *</label>
              <input type="text" id="wkv-name" placeholder="z. B. Stadtlauf Musterstadt" style="${inpStyle}">
            </div>
            <div>
              <label style="${lblStyle}">Datum *</label>
              <input type="date" id="wkv-datum" max="2035-12-31" style="${inpStyle}">
            </div>
            <div>
              <label style="${lblStyle}">Website *</label>
              <input type="url" id="wkv-url" placeholder="https://…" style="${inpStyle}">
            </div>
            <div>
              <label style="${lblStyle}">Disziplinen *</label>
              <div id="wkv-disz-area"></div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
            <button class="btn btn-primary" id="wkv-save"
              onclick="WETTKAMPFPLANUNG._submitVorschlag()">Vorschlagen</button>
          </div>
        </div>
      </div>`;

    _renderVorschlagDiszArea();
    setTimeout(() => document.getElementById('wkv-name')?.focus(), 50);

    // Disziplinliste nachladen
    if (_vorschlagAlleDisz === null) {
      apiGet('wettkampf/disziplinen', { silent: true })
        .then(resp => { _vorschlagAlleDisz = resp.disziplinen || []; })
        .catch(()  => { _vorschlagAlleDisz = []; })
        .then(()   => _renderVorschlagDiszArea());
    }
  }

  // Disziplin-Picker im Vorschlag-Modal (analog Admin → Wettkämpfe)
  function _renderVorschlagDiszArea() {
    const area = document.getElementById('wkv-disz-area');
    if (!area) return;

    let html = '';

    // Ausgewählte Disziplinen als Chips (× zum Entfernen)
    if (_vorschlagDisz.length) {
      html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">`;
      _vorschlagDisz.forEach(d => {
        const dJ = escapeHtml(JSON.stringify(d));
        html += `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;
          border-radius:12px;font-size:13px;background:var(--border);color:var(--text)">
          ${escapeHtml(d)}
          <button onclick="WETTKAMPFPLANUNG._removeVorschlagDisz(${dJ})"
            style="border:none;background:none;cursor:pointer;color:var(--text2);
                   font-size:16px;line-height:1;padding:0 0 0 2px;margin:0"
            title="Entfernen">&times;</button>
        </span>`;
      });
      html += `</div>`;
    }

    if (_vorschlagAlleDisz === null) {
      html += `<div style="font-size:13px;color:var(--text2)">
        <span style="display:inline-block;width:12px;height:12px;border:2px solid var(--border);
          border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;
          vertical-align:middle;margin-right:6px"></span>Lade Disziplinen&hellip;</div>`;
    } else {
      const bereits   = new Set(_vorschlagDisz);
      const suchterm  = _vorschlagDiszFilter.trim().toLowerCase();
      const gefiltert = _vorschlagAlleDisz.filter(d => !suchterm || d.toLowerCase().includes(suchterm));
      const MAX_LIST  = 40;

      html += `<input type="text" id="wkv-disz-filter"
        placeholder="Disziplin suchen…"
        value="${escapeHtml(_vorschlagDiszFilter)}"
        oninput="WETTKAMPFPLANUNG._setVorschlagDiszFilter(this.value)"
        style="width:100%;box-sizing:border-box;border:1px solid var(--border);
               border-radius:6px;padding:5px 8px;font-size:13px;
               background:var(--bg);color:var(--text);margin-bottom:6px">`;

      if (_vorschlagAlleDisz.length === 0) {
        html += `<div style="font-size:13px;color:var(--text2);padding:4px 0">
          Keine Disziplinen verfügbar.</div>`;
      } else if (gefiltert.length === 0) {
        html += `<div style="font-size:13px;color:var(--text2);padding:4px 0">
          Keine passenden Disziplinen gefunden.</div>`;
      } else {
        html += `<div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);
          border-radius:6px;padding:3px">`;
        gefiltert.slice(0, MAX_LIST).forEach(d => {
          const dJ = escapeHtml(JSON.stringify(d));
          if (bereits.has(d)) {
            html += `<div style="padding:5px 10px;font-size:13px;color:var(--text2);
              display:flex;align-items:center;gap:6px">
              <span style="color:#27ae60;font-size:11px">✓</span>${escapeHtml(d)}</div>`;
          } else {
            html += `<div onclick="WETTKAMPFPLANUNG._addVorschlagDisz(${dJ})"
              style="padding:5px 10px;font-size:13px;cursor:pointer;border-radius:4px"
              onmouseover="this.style.background='var(--border)'"
              onmouseout="this.style.background=''">
              ${escapeHtml(d)}
            </div>`;
          }
        });
        if (gefiltert.length > MAX_LIST) {
          html += `<div style="padding:5px 10px;font-size:11px;color:var(--text2)">
            + ${gefiltert.length - MAX_LIST} weitere &ndash; Suche verfeinern</div>`;
        }
        html += `</div>`;
      }
    }

    area.innerHTML = html;
  }

  function _addVorschlagDisz(d) {
    if (!_vorschlagDisz.includes(d)) _vorschlagDisz.push(d);
    _vorschlagDiszFilter = '';
    _renderVorschlagDiszArea();
    setTimeout(() => document.getElementById('wkv-disz-filter')?.focus(), 0);
  }

  function _removeVorschlagDisz(d) {
    _vorschlagDisz = _vorschlagDisz.filter(x => x !== d);
    _renderVorschlagDiszArea();
  }

  function _setVorschlagDiszFilter(val) {
    _vorschlagDiszFilter = val;
    _renderVorschlagDiszArea();
    const inp = document.getElementById('wkv-disz-filter');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  async function _submitVorschlag() {
    const name  = (document.getElementById('wkv-name')?.value  || '').trim();
    const datum = (document.getElementById('wkv-datum')?.value || '').trim();
    const url   = (document.getElementById('wkv-url')?.value   || '').trim();

    // Alle Felder sind Pflicht
    if (!name) {
      benachrichtigen('Bitte einen Namen angeben.', 'err');
      document.getElementById('wkv-name')?.focus();
      return;
    }
    if (!datum) {
      benachrichtigen('Bitte ein Datum angeben.', 'err');
      document.getElementById('wkv-datum')?.focus();
      return;
    }
    if (!url) {
      benachrichtigen('Bitte eine Website angeben.', 'err');
      document.getElementById('wkv-url')?.focus();
      return;
    }
    if (!_vorschlagDisz.length) {
      benachrichtigen('Bitte mindestens eine Disziplin auswählen.', 'err');
      return;
    }

    const btn = document.getElementById('wkv-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Speichern…'; }

    try {
      await apiPost('wettkampf/vorschlag', { name, datum, url, wettbewerbe: _vorschlagDisz });
      schliesseModal();
      benachrichtigen('Wettkampf vorgeschlagen – danke!', 'ok');
      if (typeof _wettkampfCache !== 'undefined') _wettkampfCache = null;
      await _lade();
      _renderListe();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Vorschlagen'; }
    }
  }

  // ── Karte (Leaflet) ──────────────────────────────────────────
  function _loadLeaflet() {
    return new Promise((resolve) => {
      if (window.L) { resolve(); return; }
      if (_leafletLoading) {
        const poll = setInterval(() => { if (window.L) { clearInterval(poll); resolve(); } }, 100);
        return;
      }
      _leafletLoading = true;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const sc = document.createElement('script');
      sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      sc.onload  = () => { _leafletLoading = false; resolve(); };
      sc.onerror = () => { _leafletLoading = false; resolve(); };
      document.head.appendChild(sc);
    });
  }

  async function _updateMap(serien) {
    const sec = _mapSectionEl;
    if (!sec) return;

    const geo = (serien || []).filter(s => s.lat != null && s.lon != null);

    // Grundgerüst der Karten-Sektion nur einmal aufbauen (bleibt bei Filter/Sort erhalten)
    if (!sec.querySelector('#wkp-map')) {
      sec.innerHTML = `
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;
                    color:var(--text2);margin:0 0 8px">Karte der Wettkämpfe</div>
        <div id="wkp-map" style="width:100%;height:380px;border-radius:10px;
             border:1px solid var(--border);background:var(--bg2)"></div>
        <div id="wkp-map-hint" style="font-size:12px;color:var(--text2);margin-top:6px"></div>`;
      _map = null; _markerLayer = null;
    }

    const hint = sec.querySelector('#wkp-map-hint');
    if (hint) {
      hint.textContent = geo.length
        ? `${geo.length} von ${(serien || []).length} angezeigten Wettkämpfen mit hinterlegtem Standort`
        : 'Keine georeferenzierten Wettkämpfe in der aktuellen Auswahl.';
    }

    await _loadLeaflet();
    if (!window.L) return;
    const mapEl = sec.querySelector('#wkp-map');
    if (!mapEl) return;

    if (!_map) {
      _map = L.map(mapEl, { scrollWheelZoom: false }).setView([51.3, 6.7], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(_map);
      _markerLayer = L.layerGroup().addTo(_map);
    }

    _markerLayer.clearLayers();
    const pts = [];
    geo.forEach(s => {
      const datum = _datumFuerJahr(s, _jahr);
      const dtxt  = datum
        ? new Date(datum + 'T00:00:00').toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
        : '';
      const kat = s.import_kategorie ? _katLabel(s.import_kategorie) : '';
      const popup = `<strong>${escapeHtml(stripOrtFromName(s.name, s.ort))}</strong>`
        + (dtxt ? `<br>${escapeHtml(dtxt)}` : '')
        + (s.ort ? `<br>${escapeHtml(s.ort)}` : '')
        + (kat ? `<br><span style="color:#666">${escapeHtml(kat)}</span>` : '')
        + (s.url ? `<br><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">Website ↗</a>` : '');
      L.marker([s.lat, s.lon]).bindPopup(popup).addTo(_markerLayer);
      pts.push([s.lat, s.lon]);
    });

    if (pts.length === 1) {
      _map.setView(pts[0], 11);
    } else if (pts.length > 1) {
      try { _map.fitBounds(pts, { padding: [30, 30] }); } catch (_) {}
    }
    // Kartengröße neu berechnen (Sichtbarkeit/Layout kann sich geändert haben)
    setTimeout(() => { try { _map.invalidateSize(); } catch (_) {} }, 60);
  }

  // ── Disziplinen einer Serie nach Distanz sortiert ────────────
  function _diszSortiert(s) {
    const _km = (typeof _disziplinKm === 'function') ? _disziplinKm : () => null;
    return (Array.isArray(s.wettbewerbe) ? [...s.wettbewerbe] : [])
      .sort((a, b) => {
        const ka = _km(a), kb = _km(b);
        if (ka == null && kb == null) return 0;
        if (ka == null) return 1;
        if (kb == null) return -1;
        return ka - kb;
      });
  }

  // ── PDF-Export der aktuellen Ansicht (neutral, ohne eigenen Status) ──
  function _exportPDF() {
    const serien = _gefilterteSerien();
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (x => String(x));

    const WT = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const fmtDatum = (iso) => {
      if (!iso) return '–';
      const d = new Date(iso + 'T00:00:00');
      return `${WT[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
    };
    const kwOf = (iso) => {
      if (!iso) return '';
      const d = new Date(iso + 'T00:00:00');
      const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
      return Math.ceil(((tmp - new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
    };

    const bodyRows = serien.map(s => {
      const datum   = _datumFuerJahr(s, _jahr);
      const abgesagt = !!(s.abgesagt_datum && s.abgesagt_datum.startsWith(String(_jahr)));
      const y = String(_jahr);
      const istPrognose = datum && !(
        (s.naechstes_datum         && s.naechstes_datum.startsWith(y)) ||
        (s.letztes_datum_statistik && s.letztes_datum_statistik.startsWith(y))
      );
      const datumTxt = datum
        ? (istPrognose ? '~ ' : '') + fmtDatum(datum) + (datum ? ` (KW ${kwOf(datum)})` : '')
        : '–';
      const disz  = _diszSortiert(s).join(', ');
      const nameCell = `<strong${abgesagt ? ' style="text-decoration:line-through"' : ''}>${esc(stripOrtFromName(s.name, s.ort))}</strong>`
        + (abgesagt ? ' <span style="color:#b00">(abgesagt)</span>' : '')
        + (s.ort ? `<div class="ort">${esc(s.ort)}</div>` : '');
      return `<tr>
        <td class="c-datum">${esc(datumTxt)}</td>
        <td>${nameCell}</td>
        <td>${esc(disz) || '–'}</td>
      </tr>`;
    }).join('');

    const leer = bodyRows ? '' : `<tr><td colspan="3" style="text-align:center;color:#666">Keine Veranstaltungen im aktuellen Filter.</td></tr>`;
    const titel = `Wettkampfplanung ${_jahr}`;

    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
      <title>${esc(titel)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color:#000; margin:0; padding:18px; font-size:11px; }
        h1 { font-size:14px; text-align:center; margin:0 0 12px; font-weight:bold; }
        table { width:100%; border-collapse:collapse; }
        th, td { border:1px solid #000; padding:4px 6px; vertical-align:top; text-align:left; }
        th { background:#d9d9d9; font-weight:bold; }
        td.c-datum { white-space:nowrap; }
        .ort { font-size:10px; color:#444; margin-top:1px; }
        @page { size:A4 portrait; margin:14mm; }
      </style></head>
      <body>
        <h1>${esc(titel)}</h1>
        <table>
          <thead><tr>
            <th style="width:150px">Datum</th>
            <th style="width:40%">Veranstaltung</th>
            <th>Disziplinen</th>
          </tr></thead>
          <tbody>${bodyRows}${leer}</tbody>
        </table>
      </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { benachrichtigen('Bitte Popups für diese Seite erlauben, um das PDF zu erstellen.', 'warn'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch (_) {} }, 350);
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
    _resetFilter, _openFilterPopper, _toggleFilterStatus, _resetStatusFilter,
    _toggleHideVergangen, _toggleHidePasstNicht,
    _toggleSelect, _toggleAll, _clearSelection,
    _openBulkPopper, _bulkSetStatus,
    _anDisziplin, _abDisziplin,
    _openVorschlagModal, _submitVorschlag,
    _addVorschlagDisz, _removeVorschlagDisz, _setVorschlagDiszFilter,
    _exportPDF,
  };
})();
