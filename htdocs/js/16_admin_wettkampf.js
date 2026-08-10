// ============================================================
// Trainingsportal – Wettkämpfe (Admin-Ansicht)
// Zeigt alle regelmäßigen Veranstaltungsserien aus dem Statistikportal,
// extrahiert Disziplinen aus Ergebnissen, erlaubt Admin-Planung per Modal.
// ============================================================

const ADMIN_WETTKAMPF = (() => {
  let serien     = [];
  let container  = null;

  // Planungs-Modal-Zustand
  let _edit = null;
  // { serieId, wettbewerbe: [], url: '', ort_id: null, lat: null, lon: null }

  // Disziplin-Picker
  let _alleDisziplinen = null; // null = noch nicht geladen
  let _diszFilter      = '';

  // Ort-Picker
  let _alleOrte = null; // null = noch nicht geladen
  let _ortFilter = '';

  // Leaflet
  let _wkmMap    = null;
  let _wkmMarker = null;
  let _leafletLoading = false;

  // Ort-Refresh-Timer (Debounce beim Tippen)
  let _ortRefreshTimer = null;

  // Sortierzustand
  let _sortCol = 'naechster'; // 'name' | 'letzter' | 'naechster'
  let _sortDir = 'asc';

  const WT_KURZ = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const WT_LANG = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const MONATE  = ['Januar','Februar','März','April','Mai','Juni','Juli',
                   'August','September','Oktober','November','Dezember'];

  // Import-Kategorien fürs Statistikportal (tbl_key + name). Einzige gültige
  // Quelle ist die geteilte Tabelle `disziplin_kategorien`, geladen via
  // GET wettkampf/kategorien. Bewusst KEINE hartkodierte Ersatzliste: schlägt
  // der Abruf fehl, wird nur „— keine —" angeboten, statt evtl. ungültige
  // Kategorien (die es im Statistikportal gar nicht gibt) vorzuschlagen.
  const IMPORT_KATEGORIEN_FALLBACK = [];
  let _importKategorien = null; // null = noch nicht geladen

  // Kategorien einmalig laden (mit Fallback). Ergebnis wird gecacht.
  async function _ladeKategorien() {
    if (_importKategorien) return _importKategorien;
    try {
      const r = await apiGet('wettkampf/kategorien', { silent: true });
      _importKategorien = (r && Array.isArray(r.kategorien) && r.kategorien.length)
        ? r.kategorien : IMPORT_KATEGORIEN_FALLBACK;
    } catch (e) {
      _importKategorien = IMPORT_KATEGORIEN_FALLBACK;
    }
    return _importKategorien;
  }

  // <option>-Liste für das Import-Kategorie-Dropdown (inkl. Leer-Eintrag).
  function _katOptionsHtml(selected) {
    const liste = [{ tbl_key: '', name: '— keine —' }].concat(_importKategorien || IMPORT_KATEGORIEN_FALLBACK);
    return liste.map(k =>
      `<option value="${escapeHtml(k.tbl_key)}" ${selected === k.tbl_key ? 'selected' : ''}>${escapeHtml(k.name)}</option>`
    ).join('');
  }

  function decodeHtml(s) {
    if (!s) return '';
    const el = document.createElement('textarea');
    el.innerHTML = String(s);
    return el.value;
  }

  function safeHtml(s) {
    return escapeHtml(decodeHtml(s));
  }

  // ── Öffentliche API ──────────────────────────────────────────
  async function render(el) {
    container = el;
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Wettkämpfe&hellip;</div>';
    try {
      const resp = await apiGet('wettkampf', { silent: true });
      serien = resp.serien || [];
      renderTabelle();
    } catch (e) {
      if (container) {
        container.innerHTML =
          '<div style="padding:20px;color:var(--primary)">Fehler beim Laden: ' +
          escapeHtml(e.message || String(e)) + '</div>';
      }
    }
  }

  /**
   * Prognose: N. Wochentag des gleichen Monats im laufenden/nächsten Jahr.
   */
  function predictNextDate(letztesDateStr) {
    if (!letztesDateStr) return null;
    const last  = new Date(letztesDateStr + 'T00:00:00');
    const month = last.getMonth();
    const dow   = last.getDay();
    const dom   = last.getDate();
    const nth   = Math.floor((dom - 1) / 7);
    const heute = new Date(); heute.setHours(0, 0, 0, 0);
    for (let off = 0; off <= 2; off++) {
      const yr      = heute.getFullYear() + off;
      const erstDow = new Date(yr, month, 1).getDay();
      let   diff    = (dow - erstDow + 7) % 7;
      let   tag     = 1 + diff + nth * 7;
      const tage    = new Date(yr, month + 1, 0).getDate();
      if (tag > tage) tag -= 7;
      const kandidat = new Date(yr, month, tag);
      if (kandidat >= heute) {
        const yyyy = kandidat.getFullYear();
        const mm   = String(kandidat.getMonth() + 1).padStart(2, '0');
        const dd   = String(kandidat.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    return null;
  }

  function _heute() {
    const h = new Date(); h.setHours(0, 0, 0, 0);
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
  }

  function naechstesDatum(serie) {
    // Abgesagte (noch nicht vergangene) Ausgabe bleibt sichtbar (durchgestrichen)
    if (serie.abgesagt_datum && serie.abgesagt_datum >= _heute()) {
      return { datum: serie.abgesagt_datum, modus: 'abgesagt' };
    }
    if (serie.naechstes_datum && serie.naechstes_datum >= _heute()) {
      return { datum: serie.naechstes_datum, modus: 'manuell' };
    }
    // naechstes_datum gesetzt aber vergangen → als Prognose-Basis nutzen
    // (Admin hat damit dokumentiert, wann der Wettkampf stattfand)
    const basis = serie.naechstes_datum || serie.letztes_datum;
    const p = predictNextDate(basis);
    return p ? { datum: p, modus: 'prognose' } : null;
  }

  // Die „echte" kommende Ausgabe ohne Absage-Überlagerung (für das Absage-Datum)
  function echtesNaechstes(serie) {
    if (serie.naechstes_datum && serie.naechstes_datum >= _heute()) return serie.naechstes_datum;
    return predictNextDate(serie.naechstes_datum || serie.letztes_datum);
  }

  function istAbgesagt(serie) {
    return !!(serie.abgesagt_datum && serie.abgesagt_datum >= _heute());
  }

  // Anmeldungen der kommenden Ausgabe (nach Jahr des nächsten Termins gefiltert)
  function _anmeldungenFuer(serie) {
    const next = naechstesDatum(serie);
    const jahr = next ? Number(next.datum.slice(0, 4)) : new Date().getFullYear();
    return (Array.isArray(serie.anmeldungen) ? serie.anmeldungen : [])
      .filter(a => a.jahr == null || a.jahr === jahr);
  }
  function _anzAnmeldungen(serie) {
    return _anmeldungenFuer(serie).length;
  }

  function fmtDate(iso) {
    if (!iso) return '–';
    return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function istAdmin() {
    return typeof state !== 'undefined' && state.user &&
           ['admin', 'trainer'].includes(state.user.rolle);
  }

  function allesDisziplinen(serie) {
    return [...(serie.wettbewerbe || [])];
  }

  function benachrichtigen(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) return;
    const d = document.createElement('div');
    d.className = 'notif ' + (art === 'err' ? 'notif-err' : art === 'warn' ? 'notif-warn' : 'notif-ok');
    d.textContent = text;
    cont.appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  // ── Sortierung ────────────────────────────────────────────────
  function _sortiereSerien() {
    return [...serien].sort((a, b) => {
      let va, vb;
      if (_sortCol === 'name') {
        va = decodeHtml(a.name || a.kuerzel || '').toLowerCase();
        vb = decodeHtml(b.name || b.kuerzel || '').toLowerCase();
      } else if (_sortCol === 'letzter') {
        va = a.letztes_datum || '';
        vb = b.letztes_datum || '';
      } else if (_sortCol === 'anmeldungen') {
        va = _anzAnmeldungen(a);
        vb = _anzAnmeldungen(b);
      } else {
        const na = naechstesDatum(a);
        const nb = naechstesDatum(b);
        va = (na && (a.aktiv !== 0 || na.modus === 'manuell')) ? na.datum : '9999-99-99';
        vb = (nb && (b.aktiv !== 0 || nb.modus === 'manuell')) ? nb.datum : '9999-99-99';
      }
      if (va < vb) return _sortDir === 'asc' ? -1 : 1;
      if (va > vb) return _sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function sortiereNach(col) {
    if (_sortCol === col) {
      _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      _sortCol = col;
      _sortDir = 'asc';
    }
    renderTabelle();
  }

  function _arrow(col) {
    if (_sortCol !== col) return '<span style="opacity:.3;font-size:10px"> ⇅</span>';
    return _sortDir === 'asc'
      ? '<span style="font-size:10px"> ↑</span>'
      : '<span style="font-size:10px"> ↓</span>';
  }

  // ── Tabelle ───────────────────────────────────────────────────
  function renderTabelle() {
    if (!container) return;
    const admin = istAdmin();

    const anzVorschlaege = serien.filter(s => s.vorschlag_von).length;

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;
                  margin-bottom:16px;gap:12px;flex-wrap:wrap">
        <div>
          <h2 style="margin:0 0 2px;font-size:1.2rem;font-weight:700">Wettkämpfe</h2>
          <div style="font-size:12px;color:var(--text2)">
            Regelmäßige Veranstaltungen aus dem Statistikportal &bull;
            ${serien.length} Serien
            ${anzVorschlaege ? ` &bull; <strong style="color:#e67e22">${anzVorschlaege} Vorschlag${anzVorschlaege !== 1 ? '&auml;ge' : ''} zur Prüfung</strong>` : ''}
          </div>
        </div>
        ${admin ? `<button class="btn btn-primary btn-sm"
          onclick="ADMIN_WETTKAMPF.neuerWettkampf()">+ Neuer Wettkampf</button>` : ''}
      </div>`;

    if (!serien.length) {
      html += '<div style="padding:40px;text-align:center;color:var(--text2)">Keine Veranstaltungsserien vorhanden.</div>';
      container.innerHTML = html;
      return;
    }

    html += `<div class="panel"><div class="table-scroll">
    <table style="min-width:720px">
      <thead>
        <tr>
          <th class="${_sortCol==='name'?'sorted':''}" onclick="ADMIN_WETTKAMPF.sortiereNach('name')">
            Veranstaltung${_arrow('name')}</th>
          <th class="${_sortCol==='letzter'?'sorted':''}" onclick="ADMIN_WETTKAMPF.sortiereNach('letzter')">
            Letzter Wettkampf${_arrow('letzter')}</th>
          <th class="${_sortCol==='naechster'?'sorted':''}" onclick="ADMIN_WETTKAMPF.sortiereNach('naechster')">
            Nächster Termin${_arrow('naechster')}</th>
          <th>Disziplinen</th>
          <th class="${_sortCol==='anmeldungen'?'sorted':''}" style="text-align:center;white-space:nowrap"
              onclick="ADMIN_WETTKAMPF.sortiereNach('anmeldungen')">
            Anmeldungen${_arrow('anmeldungen')}</th>
          <th style="width:60px"></th>
        </tr>
      </thead>
      <tbody>`;

    _sortiereSerien().forEach(s => {
      const next     = naechstesDatum(s);
      const disz     = allesDisziplinen(s);
      const inaktiv  = s.aktiv === 0;
      const abgesagt = next && next.modus === 'abgesagt';
      // Nur Anmeldungen der kommenden Ausgabe (Jahr des nächsten Termins)
      const anmListe = _anmeldungenFuer(s);
      const anzAnm   = anmListe.length;
      // Tooltip: eine Zeile pro Angemeldetem (Name · Disziplin)
      const anmTitle = anzAnm
        ? anmListe.map(a => {
            const nm = decodeHtml(a.name || 'Unbekannt');
            return a.disziplin ? `${nm} · ${a.disziplin}` : nm;
          }).join('\n')
        : '';

      // Disziplin-Chips (max 4 + Überhang)
      const MAX = 4;
      let chips = '';
      disz.slice(0, MAX).forEach(d => {
        chips += `<span style="display:inline-block;padding:1px 7px;border-radius:10px;
          font-size:11px;background:var(--border);color:var(--text);margin:1px 2px">${escapeHtml(d)}</span>`;
      });
      if (disz.length > MAX)
        chips += `<span style="font-size:11px;color:var(--text2)">+${disz.length - MAX}</span>`;

      const letzterWt = s.letztes_datum
        ? WT_KURZ[new Date(s.letztes_datum + 'T00:00:00').getDay()] : '';

      let nextCell = '<span style="color:var(--text2);font-size:13px">–</span>';
      if (next && (!inaktiv || next.modus === 'manuell' || abgesagt)) {
        const nd = new Date(next.datum + 'T00:00:00');
        const wt = WT_KURZ[nd.getDay()];
        const badge = abgesagt
          ? '<span style="font-size:10px;padding:1px 5px;border-radius:8px;' +
            'background:#cc000022;color:var(--primary);font-weight:700;margin-left:4px">Abgesagt</span>'
          : next.modus === 'manuell'
          ? '<span style="font-size:10px;padding:1px 5px;border-radius:8px;' +
            'background:#2ecc7122;color:#27ae60;margin-left:4px">fest</span>'
          : '<span style="font-size:10px;padding:1px 5px;border-radius:8px;' +
            'background:var(--border);color:var(--text2);margin-left:4px">Prognose</span>';
        const strike = abgesagt ? 'text-decoration:line-through;color:var(--text2);' : '';
        nextCell = `<span style="font-weight:600;font-size:13px;${strike}">${wt}, ${fmtDate(next.datum)}</span>${badge}`;
      }

      const rowOpacity = inaktiv ? 'opacity:.45' : '';
      const nameStrike = abgesagt ? 'text-decoration:line-through;' : '';

      // URL-Link im Namen (nur wenn vorhanden)
      const urlLink = s.url
        ? ` <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer"
              onclick="event.stopPropagation()"
              title="${escapeHtml(s.url)}"
              style="font-size:12px;color:var(--primary);text-decoration:none;vertical-align:middle">↗</a>`
        : '';

      // Ort-Name ermitteln (ort_id → _alleOrte oder ort_letzter)
      const ortName = s.ort_letzter
        ? `<span style="font-size:12px;color:var(--text2);margin-left:6px">${safeHtml(s.ort_letzter)}</span>`
        : '';

      const rowClick = admin
        ? `onclick="ADMIN_WETTKAMPF.showPlanungModal(${s.id})"`
        : '';

      html += `
        <tr style="cursor:${admin ? 'pointer' : 'default'};${rowOpacity}" ${rowClick}>
          <td>
            <strong style="${nameStrike}">${safeHtml(s.name || s.kuerzel)}</strong>${urlLink}
            ${abgesagt ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#cc000022;color:var(--primary);font-weight:700;margin-left:6px">Abgesagt</span>' : ''}
            ${inaktiv ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--border);color:var(--text2);margin-left:6px">Inaktiv</span>' : ''}
            ${s.vorschlag_von ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#e67e2222;color:#e67e22;font-weight:700;margin-left:6px">Vorschlag</span>' : ''}
            ${ortName}
            <div style="font-size:11px;color:var(--text2);margin-top:1px">
              ${s.vorschlag_von
                ? 'Vorschlag von ' + safeHtml(s.vorschlag_von_name || 'unbekannt') +
                  (s.vorschlag_am ? ' &bull; ' + fmtDate(String(s.vorschlag_am).slice(0, 10)) : '')
                : `${s.anz_veranstaltungen} Ausgabe${s.anz_veranstaltungen !== 1 ? 'n' : ''}${s.erstes_datum ? ' &bull; seit ' + s.erstes_datum.slice(0, 4) : ''}`}
            </div>
          </td>
          <td style="white-space:nowrap">
            ${s.letztes_datum
              ? `<span title="Wochentag: ${letzterWt}">${fmtDate(s.letztes_datum)}</span>`
              : '<span style="color:var(--text2)">–</span>'}
          </td>
          <td style="white-space:nowrap">${nextCell}</td>
          <td>
            ${chips || '<span style="color:var(--text2)">–</span>'}
          </td>
          <td style="text-align:center;white-space:nowrap">
            ${anzAnm > 0
              ? `<span title="${escapeHtml(anmTitle)}"
                   style="display:inline-block;min-width:22px;padding:1px 7px;border-radius:10px;
                          font-size:12px;font-weight:600;background:var(--border);color:var(--text);cursor:help">👥 ${anzAnm}</span>`
              : '<span style="color:var(--text2);font-size:13px">–</span>'}
          </td>
          <td style="text-align:right;white-space:nowrap">
            ${admin ? `<button onclick="event.stopPropagation();ADMIN_WETTKAMPF.toggleAktiv(${s.id})"
              title="${inaktiv ? 'Aktivieren' : 'Deaktivieren'}"
              style="border:none;background:none;cursor:pointer;font-size:18px;
                     color:${inaktiv ? 'var(--text2)' : '#27ae60'};padding:0 4px;vertical-align:middle">
              ${inaktiv ? '◯' : '●'}</button>` : ''}
          </td>
        </tr>`;
    });

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
  }

  // ── Ort-Verwaltung ────────────────────────────────────────────
  async function _ladeOrte() {
    if (_alleOrte !== null) return;
    try {
      const resp = await apiGet('wettkampf/orte', { silent: true });
      _alleOrte = resp.orte || [];
    } catch (_) {
      _alleOrte = [];
    }
  }

  function _setOrtFilter(val) {
    _ortFilter = val;
    _renderOrtSektion(); // sofort mit gecachten Daten rendern

    // Nach 400 ms Tipp-Pause: Cache leeren und neu laden
    // (damit parallel im Statistikportal angelegte Orte erscheinen)
    clearTimeout(_ortRefreshTimer);
    _ortRefreshTimer = setTimeout(async () => {
      _alleOrte = null;
      await _ladeOrte();
      _renderOrtSektion();
      // Fokus & Cursor erhalten
      const inp = document.getElementById('ort-filter-inp');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 400);

    const inp = document.getElementById('ort-filter-inp');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  function _waehleOrt(id) {
    if (!_edit) return;
    const ort = (_alleOrte || []).find(o => o.id === id);
    if (!ort) return;
    _edit.ort_id = ort.id;
    // Koordinaten aus Ort übernehmen
    if (ort.lat != null && ort.lon != null) {
      _edit.lat = ort.lat;
      _edit.lon = ort.lon;
    }
    _ortFilter = '';
    _renderOrtSektion();
    // Karte updaten
    _updateMap();
  }

  function _clearOrt() {
    if (!_edit) return;
    _edit.ort_id = null;
    _renderOrtSektion();
  }

  function _renderOrtSektion() {
    const area = document.getElementById('ort-sektion');
    if (!area || !_edit) return;

    const orte  = _alleOrte || [];
    const aktOrt = orte.find(o => o.id === _edit.ort_id);

    let html = '';

    if (aktOrt) {
      // Gewählter Ort anzeigen – kein Suchfeld
      const label = aktOrt.display_name || [aktOrt.name, aktOrt.region, aktOrt.land].filter(Boolean).join(', ');
      html += `<div style="display:flex;align-items:center;gap:8px;
                           padding:6px 10px;background:var(--bg);border:1px solid var(--border);
                           border-radius:6px;font-size:13px">
        <span style="flex:1">${escapeHtml(label)}</span>
        <button onclick="ADMIN_WETTKAMPF._clearOrt()"
          style="border:none;background:none;cursor:pointer;color:var(--text2);
                 font-size:16px;line-height:1;padding:0"
          title="Ort entfernen">&times;</button>
      </div>`;
    } else if (_alleOrte === null) {
      // Noch am Laden
      html += `<div style="font-size:13px;color:var(--text2)">
        <span style="display:inline-block;width:12px;height:12px;border:2px solid var(--border);
          border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;
          vertical-align:middle;margin-right:6px"></span>Lade Orte&hellip;</div>`;
    } else {
      // Suchfeld + Liste (kein Ort gewählt)
      const term      = _ortFilter.trim().toLowerCase();
      const gefiltert = orte.filter(o =>
        !term || (o.name + ' ' + (o.region||'') + ' ' + (o.land||'')).toLowerCase().includes(term)
      );

      html += `<input type="text" id="ort-filter-inp"
        placeholder="Ort suchen…"
        value="${escapeHtml(_ortFilter)}"
        oninput="ADMIN_WETTKAMPF._setOrtFilter(this.value)"
        style="width:100%;box-sizing:border-box;border:1px solid var(--border);
               border-radius:6px;padding:5px 8px;font-size:13px;
               background:var(--bg);color:var(--text);margin-bottom:6px">`;

      if (orte.length === 0) {
        html += `<div style="font-size:13px;color:var(--text2)">Keine Orte im Statistikportal vorhanden.</div>`;
      } else if (gefiltert.length === 0 && term) {
        html += `<div style="font-size:13px;color:var(--text2)">Keine passenden Orte gefunden.</div>`;
      } else if (gefiltert.length > 0) {
        const MAX = 8;
        html += `<div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);
          border-radius:6px;padding:3px">`;
        gefiltert.slice(0, MAX).forEach(o => {
          html += `<div onclick="ADMIN_WETTKAMPF._waehleOrt(${o.id})"
            style="padding:5px 10px;font-size:13px;cursor:pointer;border-radius:4px"
            onmouseover="this.style.background='var(--border)'"
            onmouseout="this.style.background=''">
            <strong>${escapeHtml(o.name)}</strong>
            ${o.region ? `<span style="color:var(--text2);margin-left:4px">${escapeHtml(o.region)}</span>` : ''}
          </div>`;
        });
        if (gefiltert.length > MAX) {
          html += `<div style="padding:5px 10px;font-size:11px;color:var(--text2)">
            + ${gefiltert.length - MAX} weitere &ndash; Suche verfeinern</div>`;
        }
        html += `</div>`;
      }
    }

    area.innerHTML = html;
  }

  // ── Leaflet-Karte ─────────────────────────────────────────────
  function _loadLeaflet() {
    return new Promise((resolve) => {
      if (window.L) { resolve(); return; }
      if (_leafletLoading) {
        // Warten bis geladen
        const poll = setInterval(() => { if (window.L) { clearInterval(poll); resolve(); } }, 100);
        return;
      }
      _leafletLoading = true;
      // CSS
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      // JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => { _leafletLoading = false; resolve(); };
      script.onerror = () => { _leafletLoading = false; resolve(); };
      document.head.appendChild(script);
    });
  }

  async function _initMap(lat, lon) {
    const mapEl = document.getElementById('wkm-map');
    if (!mapEl) return;
    await _loadLeaflet();
    if (!window.L) return;

    if (_wkmMap) {
      _wkmMap.remove();
      _wkmMap = null;
      _wkmMarker = null;
    }

    const centerLat = lat ?? 51.5;
    const centerLon = lon ?? 8.0;
    const zoom      = (lat != null && lon != null) ? 13 : 6;

    _wkmMap = L.map(mapEl).setView([centerLat, centerLon], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_wkmMap);

    if (lat != null && lon != null) {
      _wkmMarker = L.marker([lat, lon], { draggable: true }).addTo(_wkmMap);
      _wkmMarker.on('dragend', () => {
        const pos = _wkmMarker.getLatLng();
        if (_edit) { _edit.lat = pos.lat; _edit.lon = pos.lng; }
        _updateCoordsDisplay();
      });
    }

    // Klick auf Karte setzt Marker
    _wkmMap.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (!_edit) return;
      _edit.lat = lat;
      _edit.lon = lng;
      if (_wkmMarker) {
        _wkmMarker.setLatLng([lat, lng]);
      } else {
        _wkmMarker = L.marker([lat, lng], { draggable: true }).addTo(_wkmMap);
        _wkmMarker.on('dragend', () => {
          const pos = _wkmMarker.getLatLng();
          if (_edit) { _edit.lat = pos.lat; _edit.lon = pos.lng; }
          _updateCoordsDisplay();
        });
      }
      _updateCoordsDisplay();
    });
  }

  function _updateMap() {
    if (!_wkmMap || !window.L || !_edit) return;
    const lat = _edit.lat;
    const lon = _edit.lon;
    if (lat == null || lon == null) return;
    if (_wkmMarker) {
      _wkmMarker.setLatLng([lat, lon]);
    } else {
      _wkmMarker = L.marker([lat, lon], { draggable: true }).addTo(_wkmMap);
      _wkmMarker.on('dragend', () => {
        const pos = _wkmMarker.getLatLng();
        if (_edit) { _edit.lat = pos.lat; _edit.lon = pos.lng; }
        _updateCoordsDisplay();
      });
    }
    _wkmMap.flyTo([lat, lon], 13);
    _updateCoordsDisplay();
  }

  function _updateCoordsDisplay() {
    const el = document.getElementById('wkm-coords');
    if (!el || !_edit) return;
    if (_edit.lat != null && _edit.lon != null) {
      el.textContent = `${_edit.lat.toFixed(5)}, ${_edit.lon.toFixed(5)}`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  // ── Modal: Planung bearbeiten / Wettkampf anlegen ─────────────
  // serieId === null/undefined → Anlage-Modus (neuer Wettkampf)
  async function showPlanungModal(serieId) {
    if (!istAdmin()) return;
    const create = (serieId === null || serieId === undefined);
    const serie  = create ? null : serien.find(s => s.id === serieId);
    if (!create && !serie) return;

    // „manuell" = neu angelegt ODER keine Statistikportal-Ausgaben →
    // Name & Datum (referenz_datum) sind dann frei editierbar.
    const isManual = create || ((serie.anz_veranstaltungen | 0) === 0);

    // State zurücksetzen
    _diszFilter = '';
    _ortFilter  = '';
    if (_alleDisziplinen !== null && _alleDisziplinen.length === 0) _alleDisziplinen = null;
    _wkmMap    = null;
    _wkmMarker = null;

    _ausgabeStash = {}; // ungespeicherte Ausgabe-URLs aus vorherigem Modal verwerfen

    // Import-Kategorien laden (gecacht) – füllt das Dropdown im Modal
    if (!create) await _ladeKategorien();

    // Prognose ermitteln (nur Edit-Modus)
    const prognose = create ? null : predictNextDate(serie.naechstes_datum || serie.letztes_datum);
    const datumVorschlag = create ? '' : (serie.naechstes_datum || prognose || '');

    let wtInfo = '';
    if (!create && serie.letztes_datum) {
      const ld  = new Date(serie.letztes_datum + 'T00:00:00');
      const nth = Math.floor((ld.getDate() - 1) / 7) + 1;
      const ord = ['', '1.', '2.', '3.', '4.', '5.'][Math.min(nth, 5)];
      wtInfo = `${ord} ${WT_LANG[ld.getDay()]} im ${MONATE[ld.getMonth()]}`;
    }

    const istPrognose = !create && !serie.naechstes_datum && !!prognose;

    // Jahr der bearbeiteten Ausgabe: kommender Termin (inkl. Prognose), sonst
    // Referenzdatum, sonst laufendes Jahr. Ergebnis-/Anmelde-URL hängen daran;
    // per Selektor auch auf eine vergangene Ausgabe umstellbar (Nachtragen).
    const ausgabeDatum = create
      ? _heute()
      : ((naechstesDatum(serie) || {}).datum || serie.referenz_datum || _heute());
    const ausgabeJahr = parseInt(String(ausgabeDatum).slice(0, 4), 10) || new Date().getFullYear();
    const ausgabe = (!create && serie.ergebnis_ausgaben)
      ? (serie.ergebnis_ausgaben[String(ausgabeJahr)] || {})
      : {};

    _edit = {
      serieId: create ? null : serieId,
      create,
      isManual,
      name:           create ? '' : decodeHtml(serie.name || ''),
      referenz_datum: create ? '' : (serie.referenz_datum || ''),
      wettbewerbe:    create ? [] : [...(serie.wettbewerbe || [])],
      url:            create ? '' : (serie.url || ''),
      ort_id:         create ? null : (serie.ort_id ?? null),
      lat:            create ? null : (serie.lat ?? null),
      lon:            create ? null : (serie.lon ?? null),
      abgesagt_datum: create ? null : (istAbgesagt(serie) ? serie.abgesagt_datum : null),
      // Import-Kategorie gilt serienweit (alle Ausgaben)
      import_kategorie: create ? '' : (serie.import_kategorie || ''),
      // Ausgaben-abhängig (per Jahr)
      ausgabe_jahr:     ausgabeJahr,
      ergebnis_url:     ausgabe.ergebnis_url || '',
      anmelde_url:      ausgabe.anmelde_url  || '',
    };

    // Auswählbare Ausgabe-Jahre: kommende Ausgabe + Vorjahr/laufendes/Folgejahr
    // + alle Jahre, für die schon URLs hinterlegt sind. So ist auch eine gerade
    // vergangene Ausgabe (Ergebnisse nachtragen) erreichbar.
    const _cy = new Date().getFullYear();
    const _jahre = new Set([_cy - 1, _cy, _cy + 1, ausgabeJahr]);
    if (!create && serie.ergebnis_ausgaben) {
      Object.keys(serie.ergebnis_ausgaben).forEach(y => {
        const n = parseInt(y, 10); if (n) _jahre.add(n);
      });
    }
    const ausgabeJahre = [..._jahre].filter(Boolean).sort((a, b) => a - b);
    const jahrOptionsHtml = ausgabeJahre.map(j =>
      `<option value="${j}" ${j === _edit.ausgabe_jahr ? 'selected' : ''}>${j}</option>`
    ).join('');

    const cont = document.getElementById('modal-container');
    if (!cont) return;

    const labelStyle = `font-size:11px;font-weight:700;text-transform:uppercase;
                        letter-spacing:.5px;color:var(--text2);margin-bottom:8px`;
    const inpStyle   = `width:100%;box-sizing:border-box;border:1px solid var(--border);
                        border-radius:6px;padding:6px 8px;font-size:13px;
                        background:var(--bg);color:var(--text)`;

    // Name-Feld (nur manuell/Anlage)
    const nameHtml = isManual ? `
      <div>
        <div style="${labelStyle}">Name${create ? ' *' : ''}</div>
        <input type="text" id="planung-name" placeholder="z. B. Alpener Stadtlauf"
          value="${escapeHtml(_edit.name)}" style="${inpStyle}">
      </div>` : '';

    // Datum-des-Wettkampfs-Feld (referenz_datum, nur manuell/Anlage)
    const refHtml = isManual ? `
      <div>
        <div style="${labelStyle}">Datum des Wettkampfs</div>
        <input type="date" id="planung-refdatum"
          value="${escapeHtml(_edit.referenz_datum || '')}" style="${inpStyle}">
        <div style="font-size:11px;color:var(--text2);margin-top:4px">
          Grundlage für die jährliche Termin-Prognose${create ? '' : ' &bull; bestimmt „Letzter Wettkampf"'}
        </div>
      </div>` : '';

    // Nächster-Termin-Feld (naechstes_datum, nur Edit-Modus)
    const naechsterHtml = create ? '' : `
      <!-- Nächster Termin -->
      <div>
        <div style="${labelStyle}">Nächster Termin${isManual ? ' (fest, optional)' : ''}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="date" id="planung-datum"
            style="flex:1;min-width:150px;border:1px solid var(--border);border-radius:6px;
                   padding:6px 8px;font-size:13px;background:var(--bg);color:var(--text)"
            value="${escapeHtml(datumVorschlag)}">
          ${serie.naechstes_datum
            ? `<button class="btn btn-sm btn-ghost" title="Manuelles Datum entfernen – Prognose wird wieder verwendet"
                onclick="ADMIN_WETTKAMPF._clearDatumModal()">↺ Datum löschen</button>`
            : ''}
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">
          ${istPrognose
            ? `Datum basiert auf Prognose (${escapeHtml(wtInfo)}) &ndash; Leer lassen = Prognose weiter verwenden`
            : prognose
              ? `Prognose: <strong>${WT_KURZ[new Date(prognose+'T00:00:00').getDay()]}, ${fmtDate(prognose)}</strong>${wtInfo ? ' &bull; ' + escapeHtml(wtInfo) : ''}`
              : 'Leer lassen = kein fester Termin'}
          &ndash; Vergangene Daten möglich (korrigiert die Prognose für das Folgejahr)
        </div>
      </div>`;

    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card" onclick="event.stopPropagation()"
             style="max-width:600px;max-height:90vh;overflow-y:auto">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">${create ? 'Wettkampf anlegen' : 'Planung bearbeiten'}</div>
              <div class="modal-title">${create ? 'Neuer Wettkampf' : safeHtml(serie.name || serie.kuerzel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()">&times;</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:20px">

            ${(!create && serie.vorschlag_von) ? `
            <!-- Vorschlags-Hinweis -->
            <div style="background:#e67e2218;border:1px solid #e67e2255;border-radius:8px;
                        padding:10px 12px;font-size:13px;color:var(--text)">
              <strong style="color:#e67e22">Nutzer-Vorschlag</strong> &ndash; eingereicht von
              ${safeHtml(serie.vorschlag_von_name || 'unbekannt')}${serie.vorschlag_am ? ' am ' + fmtDate(String(serie.vorschlag_am).slice(0, 10)) : ''}.
              <div style="font-size:12px;color:var(--text2);margin-top:3px">
                Mit „Speichern" wird der Vorschlag als geprüft markiert und das Hinweis-Badge entfernt.
              </div>
            </div>` : ''}

            ${nameHtml}
            ${refHtml}
            ${naechsterHtml}

            ${create ? '' : `
            <!-- Absage dieser Ausgabe -->
            <div>
              <div style="${labelStyle}">Absage</div>
              <div id="absage-sektion"></div>
            </div>`}

            <!-- URL -->
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text2);margin-bottom:8px">Website / Wettkampfseite</div>
              <input type="url" id="planung-url"
                placeholder="https://…"
                value="${escapeHtml(_edit.url)}"
                style="width:100%;box-sizing:border-box;border:1px solid var(--border);
                       border-radius:6px;padding:6px 8px;font-size:13px;
                       background:var(--bg);color:var(--text)">
            </div>

            ${create ? '' : `
            <!-- Import-Kategorie – serienweit (alle Ausgaben) -->
            <div>
              <div style="${labelStyle}">Import-Kategorie (optional)</div>
              <select id="planung-import-kat" style="${inpStyle}">
                ${_katOptionsHtml(_edit.import_kategorie)}
              </select>
              <div style="font-size:11px;color:var(--text2);margin-top:4px">
                Gilt für <strong>alle Ausgaben</strong> dieser Serie und ermöglicht dem
                Statistikportal den Ein-Klick-Import ohne Kategorie-Nachfrage.
              </div>
            </div>

            <!-- Ausgabe (pro Jahr): Anmelde- & Ergebnis-URL -->
            <div style="border:1px solid var(--border);border-radius:8px;padding:12px 12px 14px;
                        display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="${labelStyle};margin-bottom:0">Ausgabe</span>
                <select id="planung-ausgabe-jahr"
                  onchange="ADMIN_WETTKAMPF._setAusgabeJahr(this.value)"
                  style="border:1px solid var(--border);border-radius:6px;padding:4px 8px;
                         font-size:13px;font-weight:700;background:var(--bg);color:var(--text)">
                  ${jahrOptionsHtml}
                </select>
                <span style="font-weight:400;font-size:11px;color:var(--text2)">
                  &ndash; URLs gelten nur für die gewählte Austragung</span>
              </div>

              <div>
                <div style="${labelStyle}">Anmelde-URL (Jetzt-anmelden-Button)</div>
                <input type="url" id="planung-anmelde-url"
                  placeholder="https://… (externe Anmeldeseite)"
                  value="${escapeHtml(_edit.anmelde_url)}" style="${inpStyle}">
              </div>

              <div>
                <div style="${labelStyle}">Ergebnis-URL (fürs Statistikportal)</div>
                <input type="url" id="planung-ergebnis-url"
                  placeholder="https://… (Ergebnisliste nach dem Wettkampf)"
                  value="${escapeHtml(_edit.ergebnis_url)}" style="${inpStyle}">
                <div style="font-size:11px;color:var(--text2);margin-top:4px">
                  Das Statistikportal importiert die Ergebnisse nach dem Wettkampf von dieser Adresse.
                </div>
              </div>
            </div>`}

            <!-- Disziplinen -->
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text2);margin-bottom:8px">Disziplinen</div>
              <div id="planung-disz-area"></div>
            </div>

            <!-- Ort -->
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text2);margin-bottom:8px">Ort</div>
              <div id="ort-sektion">
                <div style="font-size:13px;color:var(--text2)">Lade Orte&hellip;</div>
              </div>
            </div>

            <!-- Karte -->
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text2);margin-bottom:6px">
                Exakter Ort auf der Karte
                <span style="font-size:10px;font-weight:400;text-transform:none;
                             letter-spacing:0;color:var(--text2)">
                  (Klick oder Marker ziehen zum Verfeinern)
                </span>
              </div>
              <div id="wkm-map" style="width:100%;height:260px;border-radius:8px;
                border:1px solid var(--border);background:var(--bg2)"></div>
              <div id="wkm-coords" style="font-size:11px;color:var(--text2);margin-top:4px;display:none"></div>
            </div>

          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
            <button class="btn btn-primary"
              onclick="ADMIN_WETTKAMPF.savePlanung()">${create ? 'Anlegen' : 'Speichern'}</button>
          </div>
        </div>
      </div>`;

    _renderDiszArea();
    _renderOrtSektion();
    if (!create) _renderAbsageSektion(serie);

    // Karte initialisieren
    _initMap(_edit.lat, _edit.lon).then(() => _updateCoordsDisplay());

    // Disziplinen & Orte nachladen
    const loadDisz = async () => {
      if (_alleDisziplinen === null) {
        try {
          const resp = await apiGet('wettkampf/disziplinen', { silent: true });
          _alleDisziplinen = resp.disziplinen || [];
        } catch (_) { _alleDisziplinen = []; }
        _renderDiszArea();
      }
    };
    const loadOrte = async () => {
      await _ladeOrte();
      _renderOrtSektion();
    };
    loadDisz();
    loadOrte();
  }

  // Datum im Modal löschen (zurück zur Prognose)
  function _clearDatumModal(serieId) {
    const inp = document.getElementById('planung-datum');
    if (inp) inp.value = ''; // leer → savePlanung schickt null → Prognose wird wieder verwendet
    if (_edit) delete _edit._clearDatum;
  }

  // Ausgabe-Jahr im Modal wechseln → Anmelde-/Ergebnis-URL des Jahres nachladen.
  // (Import-Kategorie ist serienweit und bleibt unberührt.)
  function _setAusgabeJahr(jahr) {
    if (!_edit) return;
    // Aktuelle Eingaben des bisherigen Jahres übernehmen, bevor umgeschaltet wird,
    // damit ein versehentlicher Wechsel nichts Ungespeichertes verwirft.
    const anEl = document.getElementById('planung-anmelde-url');
    const erEl = document.getElementById('planung-ergebnis-url');
    _edit.anmelde_url  = anEl ? anEl.value.trim() : _edit.anmelde_url;
    _edit.ergebnis_url = erEl ? erEl.value.trim() : _edit.ergebnis_url;
    _stashAusgabe(_edit.ausgabe_jahr, _edit.anmelde_url, _edit.ergebnis_url);

    _edit.ausgabe_jahr = parseInt(jahr, 10) || _edit.ausgabe_jahr;
    const a = _ausgabeFuer(_edit.serieId, _edit.ausgabe_jahr);
    _edit.anmelde_url  = a.anmelde_url  || '';
    _edit.ergebnis_url = a.ergebnis_url || '';
    if (anEl) anEl.value = _edit.anmelde_url;
    if (erEl) erEl.value = _edit.ergebnis_url;
  }

  // Merker für im Modal geänderte (noch nicht gespeicherte) Ausgabe-URLs,
  // damit ein Hin-und-Her zwischen Jahren die Eingaben nicht verliert.
  let _ausgabeStash = {};
  function _stashAusgabe(jahr, anmelde, ergebnis) {
    if (anmelde || ergebnis) _ausgabeStash[String(jahr)] = { anmelde_url: anmelde, ergebnis_url: ergebnis };
    else delete _ausgabeStash[String(jahr)];
  }
  function _ausgabeFuer(serieId, jahr) {
    const key = String(jahr);
    if (_ausgabeStash[key]) return _ausgabeStash[key];
    const serie = serien.find(s => s.id === serieId);
    return (serie && serie.ergebnis_ausgaben && serie.ergebnis_ausgaben[key]) || {};
  }

  // ── Absage-Sektion im Modal ───────────────────────────────────
  function _renderAbsageSektion(serie) {
    const area = document.getElementById('absage-sektion');
    if (!area || !_edit) return;

    if (_edit.abgesagt_datum) {
      const wt = WT_KURZ[new Date(_edit.abgesagt_datum + 'T00:00:00').getDay()];
      area.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;
                    background:#cc000012;border:1px solid #cc000033;border-radius:8px;padding:10px 12px">
          <div style="flex:1;font-size:13px;color:var(--text)">
            <strong style="color:var(--primary)">Abgesagt</strong> für ${wt}, ${fmtDate(_edit.abgesagt_datum)}
            <div style="font-size:11px;color:var(--text2);margin-top:2px">
              Wird durchgestrichen angezeigt und ist nicht buchbar. Nächstes Jahr findet der Wettkampf wieder statt.
            </div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="ADMIN_WETTKAMPF._toggleAbsage()">Absage aufheben</button>
        </div>`;
    } else {
      // Datum, das abgesagt würde = aktuell kommende Ausgabe
      const ziel = echtesNaechstes(serie);
      const zielTxt = ziel
        ? `${WT_KURZ[new Date(ziel + 'T00:00:00').getDay()]}, ${fmtDate(ziel)}`
        : '–';
      area.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="flex:1;font-size:12px;color:var(--text2)">
            Sagt die kommende Ausgabe (${zielTxt}) einmalig ab &ndash; der Wettkampf bleibt für die Folgejahre erhalten.
          </div>
          <button class="btn btn-sm btn-ghost" ${ziel ? '' : 'disabled'}
            onclick="ADMIN_WETTKAMPF._toggleAbsage()">Diese Ausgabe absagen</button>
        </div>`;
    }
  }

  function _toggleAbsage() {
    if (!_edit) return;
    const serie = serien.find(s => s.id === _edit.serieId);
    if (_edit.abgesagt_datum) {
      _edit.abgesagt_datum = null;
    } else {
      const ziel = serie ? echtesNaechstes(serie) : null;
      if (!ziel) { benachrichtigen('Kein Termin zum Absagen vorhanden.', 'warn'); return; }
      _edit.abgesagt_datum = ziel;
    }
    if (serie) _renderAbsageSektion(serie);
  }

  // ── Disziplin-Bereich ─────────────────────────────────────────
  function _renderDiszArea() {
    const area = document.getElementById('planung-disz-area');
    if (!area || !_edit) return;

    let html = '';

    if (_edit.wettbewerbe.length) {
      html += `<div style="font-size:11px;color:var(--text2);margin-bottom:6px">
        Aktuelle Disziplinen &ndash; × zum Entfernen:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">`;
      _edit.wettbewerbe.forEach(d => {
        const dJ = escapeHtml(JSON.stringify(d));
        html += `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;
          border-radius:12px;font-size:13px;background:var(--border);color:var(--text)">
          ${escapeHtml(d)}
          <button onclick="ADMIN_WETTKAMPF._removeWb(${dJ})"
            style="border:none;background:none;cursor:pointer;color:var(--text2);
                   font-size:16px;line-height:1;padding:0 0 0 2px;margin:0"
            title="Entfernen">&times;</button>
        </span>`;
      });
      html += `</div>`;
    } else {
      html += `<div style="font-size:13px;color:var(--text2);margin-bottom:12px">
        Noch keine Disziplinen eingetragen.</div>`;
    }

    html += `<div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px">Disziplin hinzufügen:</div>`;

    if (_alleDisziplinen === null) {
      html += `<div style="font-size:13px;color:var(--text2)">
        <span style="display:inline-block;width:12px;height:12px;border:2px solid var(--border);
          border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;
          vertical-align:middle;margin-right:6px"></span>Lade Disziplinen&hellip;</div>`;
    } else {
      const bereitsAktiv = new Set(_edit.wettbewerbe);
      const suchterm     = _diszFilter.trim().toLowerCase();
      const gefiltert    = _alleDisziplinen.filter(d =>
        !suchterm || d.toLowerCase().includes(suchterm)
      );
      const MAX_LIST = 40;

      html += `<input type="text" id="disz-filter-inp"
        placeholder="Suchen…"
        value="${escapeHtml(_diszFilter)}"
        oninput="ADMIN_WETTKAMPF._setDiszFilter(this.value)"
        style="width:100%;box-sizing:border-box;border:1px solid var(--border);
               border-radius:6px;padding:5px 8px;font-size:13px;
               background:var(--bg);color:var(--text);margin-bottom:6px">`;

      if (_alleDisziplinen.length === 0) {
        html += `<div style="font-size:13px;color:var(--text2);padding:4px 0">
          Keine Disziplinen aus dem Statistikportal verfügbar.</div>`;
      } else if (gefiltert.length === 0) {
        html += `<div style="font-size:13px;color:var(--text2);padding:4px 0">
          Keine passenden Disziplinen gefunden.</div>`;
      } else {
        html += `<div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);
          border-radius:6px;padding:3px">`;
        gefiltert.slice(0, MAX_LIST).forEach(d => {
          const dJ = escapeHtml(JSON.stringify(d));
          if (bereitsAktiv.has(d)) {
            html += `<div style="padding:5px 10px;font-size:13px;color:var(--text2);
              display:flex;align-items:center;gap:6px">
              <span style="color:#27ae60;font-size:11px">✓</span>${escapeHtml(d)}</div>`;
          } else {
            html += `<div onclick="ADMIN_WETTKAMPF._addDiszFromList(${dJ})"
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
    html += `</div>`;

    area.innerHTML = html;
  }

  function _removeWb(d) {
    if (!_edit) return;
    _edit.wettbewerbe = _edit.wettbewerbe.filter(x => x !== d);
    _renderDiszArea();
  }

  function _addDiszFromList(d) {
    if (!_edit) return;
    if (!_edit.wettbewerbe.includes(d)) _edit.wettbewerbe.push(d);
    _diszFilter = '';
    _renderDiszArea();
    setTimeout(() => document.getElementById('disz-filter-inp')?.focus(), 0);
  }

  function _setDiszFilter(val) {
    _diszFilter = val;
    _renderDiszArea();
    const inp = document.getElementById('disz-filter-inp');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  // ── Speichern (Anlage oder Bearbeitung) ───────────────────────
  async function savePlanung() {
    if (!_edit) return;

    const nameVal = (document.getElementById('planung-name')?.value || '').trim();
    const refVal  = (document.getElementById('planung-refdatum')?.value || '').trim() || null;
    const datum   = (document.getElementById('planung-datum')?.value || '').trim() || null;
    const url     = (document.getElementById('planung-url')?.value || '').trim() || null;
    const anmUrl  = (document.getElementById('planung-anmelde-url')?.value || '').trim() || null;
    const ergUrl  = (document.getElementById('planung-ergebnis-url')?.value || '').trim() || null;
    const impKat  = (document.getElementById('planung-import-kat')?.value || '').trim() || null;

    if (_edit.isManual && !nameVal) {
      benachrichtigen('Bitte einen Namen eingeben.', 'err');
      document.getElementById('planung-name')?.focus();
      return;
    }

    try {
      // ── Anlage-Modus ──
      if (_edit.create) {
        // Zukünftiges Datum direkt als fester Termin, vergangenes nur als Prognose-Basis
        const naechstes = (refVal && refVal >= _heute()) ? refVal : null;
        await apiPost('wettkampf', {
          name:            nameVal,
          referenz_datum:  refVal,
          naechstes_datum: naechstes,
          wettbewerbe:     _edit.wettbewerbe,
          url,
          ort_id: _edit.ort_id,
          lat:    _edit.lat,
          lon:    _edit.lon,
        });
        schliesseModal();
        _edit = null;
        benachrichtigen('Wettkampf angelegt.', 'ok');
        if (typeof _wettkampfCache !== 'undefined') _wettkampfCache = null;
        await reload();
        return;
      }

      // ── Bearbeiten ──
      const serieId      = _edit.serieId;
      const serieVor     = serien.find(s => s.id === serieId);
      const istVorschlag = !!(serieVor && serieVor.vorschlag_von);

      const payload = {
        naechstes_datum: datum,
        abgesagt_datum:  _edit.abgesagt_datum,
        wettbewerbe:     _edit.wettbewerbe,
        url,
        ort_id: _edit.ort_id,
        lat:    _edit.lat,
        lon:    _edit.lon,
        // Import-Kategorie gilt serienweit; Anmelde-/Ergebnis-URL pro Ausgabe-Jahr
        import_kategorie: impKat,
        ausgabe_jahr:     _edit.ausgabe_jahr,
        anmelde_url:      anmUrl,
        ergebnis_url:     ergUrl,
        ...(istVorschlag ? { vorschlag_bestaetigt: true } : {}),
      };
      // Name & Datum nur bei manuellen Wettkämpfen mitschicken
      if (_edit.isManual) {
        payload.name           = nameVal;
        payload.referenz_datum = refVal;
      }

      await apiPut(`wettkampf/${serieId}/planung`, payload);

      // Lokal sofort aktualisieren
      const serie = serien.find(s => s.id === serieId);
      if (serie) {
        serie.wettbewerbe     = [..._edit.wettbewerbe];
        serie.naechstes_datum = datum;
        serie.abgesagt_datum  = _edit.abgesagt_datum;
        serie.url             = url;
        serie.ort_id          = _edit.ort_id;
        serie.lat             = _edit.lat;
        serie.lon             = _edit.lon;
        if (_edit.isManual) { serie.name = nameVal; serie.referenz_datum = refVal; }
        if (istVorschlag) { serie.vorschlag_von = null; serie.vorschlag_von_name = null; }
        // Import-Kategorie ist serienweit
        serie.import_kategorie = impKat;
        // Ausgaben-URLs (pro Jahr) lokal spiegeln (Wiedereröffnen ohne Reload)
        if (!serie.ergebnis_ausgaben || typeof serie.ergebnis_ausgaben !== 'object') {
          serie.ergebnis_ausgaben = {};
        }
        if (!anmUrl && !ergUrl) {
          delete serie.ergebnis_ausgaben[String(_edit.ausgabe_jahr)];
        } else {
          serie.ergebnis_ausgaben[String(_edit.ausgabe_jahr)] = {
            anmelde_url: anmUrl, ergebnis_url: ergUrl,
          };
        }
      }

      schliesseModal();
      _edit = null;
      benachrichtigen('Planung gespeichert.', 'ok');
      if (typeof _wettkampfCache !== 'undefined') _wettkampfCache = null;
      await reload();
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  // ── Neuer Wettkampf (Anlage-Modal) ────────────────────────────
  function neuerWettkampf() {
    showPlanungModal(null);
  }

  // ── Aktiv-Status umschalten ───────────────────────────────────
  async function toggleAktiv(serieId) {
    const serie = serien.find(s => s.id === serieId);
    if (!serie) return;
    const neuAktiv = serie.aktiv === 0 ? 1 : 0;
    try {
      await apiPut(`wettkampf/${serieId}/planung`, { aktiv: neuAktiv });
      serie.aktiv = neuAktiv;
      renderTabelle();
      benachrichtigen(
        neuAktiv ? 'Aktiviert – erscheint wieder im Kalender.' : 'Deaktiviert – ausgeblendet im Kalender.',
        'ok'
      );
      if (typeof _wettkampfCache !== 'undefined') _wettkampfCache = null;
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  // ── Im Kalender eintragen ─────────────────────────────────────
  async function imKalenderEintragen(serieId) {
    const serie = serien.find(s => s.id === serieId);
    if (!serie) return;
    const next = naechstesDatum(serie);
    if (!next) { alert('Kein Termin verfügbar.'); return; }
    const wt = WT_KURZ[new Date(next.datum + 'T00:00:00').getDay()];
    if (!confirm(`„${decodeHtml(serie.name || serie.kuerzel)}" am ${wt}, ${fmtDate(next.datum)} als Kalender-Event eintragen?`)) return;
    try {
      await apiPost('einheiten', {
        datum:        next.datum,
        typ:          'event',
        titel:        decodeHtml(serie.name || serie.kuerzel),
        sichtbarkeit: 'oeffentlich',
        status:       'geplant',
      });
      benachrichtigen('Kalender-Eintrag erstellt.', 'ok');
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  // ── Reload ────────────────────────────────────────────────────
  async function reload() {
    if (!container || !container.isConnected) return;
    try {
      const resp = await apiGet('wettkampf', { silent: true });
      serien = resp.serien || [];
      renderTabelle();
    } catch (_) {}
  }

  return {
    render,
    showPlanungModal, savePlanung, neuerWettkampf,
    _removeWb, _addDiszFromList, _setDiszFilter,
    _clearOrt, _setOrtFilter, _waehleOrt,
    _clearDatumModal, _toggleAbsage, _setAusgabeJahr,
    toggleAktiv, imKalenderEintragen,
    predictNextDate, sortiereNach,
  };
})();
