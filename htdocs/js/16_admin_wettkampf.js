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

  // Sortierzustand
  let _sortCol = 'naechster'; // 'name' | 'letzter' | 'naechster'
  let _sortDir = 'asc';

  const WT_KURZ = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const WT_LANG = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const MONATE  = ['Januar','Februar','März','April','Mai','Juni','Juli',
                   'August','September','Oktober','November','Dezember'];

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
    if (serie.naechstes_datum && serie.naechstes_datum >= _heute()) {
      return { datum: serie.naechstes_datum, modus: 'manuell' };
    }
    const p = predictNextDate(serie.letztes_datum);
    return p ? { datum: p, modus: 'prognose' } : null;
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

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;
                  margin-bottom:16px;gap:12px;flex-wrap:wrap">
        <div>
          <h2 style="margin:0 0 2px;font-size:1.2rem;font-weight:700">Wettkämpfe</h2>
          <div style="font-size:12px;color:var(--text2)">
            Regelmäßige Veranstaltungen aus dem Statistikportal &bull;
            ${serien.length} Serien
          </div>
        </div>
      </div>`;

    if (!serien.length) {
      html += '<div style="padding:40px;text-align:center;color:var(--text2)">Keine Veranstaltungsserien vorhanden.</div>';
      container.innerHTML = html;
      return;
    }

    html += `<div class="panel"><div class="table-scroll">
    <table style="min-width:640px">
      <thead>
        <tr>
          <th class="${_sortCol==='name'?'sorted':''}" onclick="ADMIN_WETTKAMPF.sortiereNach('name')">
            Veranstaltung${_arrow('name')}</th>
          <th class="${_sortCol==='letzter'?'sorted':''}" onclick="ADMIN_WETTKAMPF.sortiereNach('letzter')">
            Letzter Wettkampf${_arrow('letzter')}</th>
          <th class="${_sortCol==='naechster'?'sorted':''}" onclick="ADMIN_WETTKAMPF.sortiereNach('naechster')">
            Nächster Termin${_arrow('naechster')}</th>
          <th>Disziplinen</th>
          <th style="width:60px"></th>
        </tr>
      </thead>
      <tbody>`;

    _sortiereSerien().forEach(s => {
      const next    = naechstesDatum(s);
      const disz    = allesDisziplinen(s);
      const inaktiv = s.aktiv === 0;

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
      if (next && (!inaktiv || next.modus === 'manuell')) {
        const nd = new Date(next.datum + 'T00:00:00');
        const wt = WT_KURZ[nd.getDay()];
        const badge = next.modus === 'manuell'
          ? '<span style="font-size:10px;padding:1px 5px;border-radius:8px;' +
            'background:#2ecc7122;color:#27ae60;margin-left:4px">fest</span>'
          : '<span style="font-size:10px;padding:1px 5px;border-radius:8px;' +
            'background:var(--border);color:var(--text2);margin-left:4px">Prognose</span>';
        nextCell = `<span style="font-weight:600;font-size:13px">${wt}, ${fmtDate(next.datum)}</span>${badge}`;
      }

      const rowOpacity = inaktiv ? 'opacity:.45' : '';

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
            <strong>${safeHtml(s.name || s.kuerzel)}</strong>${urlLink}
            ${inaktiv ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--border);color:var(--text2);margin-left:6px">Inaktiv</span>' : ''}
            ${ortName}
            <div style="font-size:11px;color:var(--text2);margin-top:1px">
              ${s.anz_veranstaltungen} Ausgabe${s.anz_veranstaltungen !== 1 ? 'n' : ''}
              ${s.erstes_datum ? ' &bull; seit ' + s.erstes_datum.slice(0, 4) : ''}
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
    _renderOrtSektion();
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

  // ── Modal: Planung bearbeiten ─────────────────────────────────
  async function showPlanungModal(serieId) {
    if (!istAdmin()) return;
    const serie = serien.find(s => s.id === serieId);
    if (!serie) return;

    // State zurücksetzen
    _diszFilter = '';
    _ortFilter  = '';
    if (_alleDisziplinen !== null && _alleDisziplinen.length === 0) _alleDisziplinen = null;
    _wkmMap    = null;
    _wkmMarker = null;

    // Prognose ermitteln
    const prognose = predictNextDate(serie.letztes_datum);
    // Datum-Vorschlag: manuell gesetzt oder Prognose (für direktes OK)
    const datumVorschlag = serie.naechstes_datum || prognose || '';

    let wtInfo = '';
    if (serie.letztes_datum) {
      const ld  = new Date(serie.letztes_datum + 'T00:00:00');
      const nth = Math.floor((ld.getDate() - 1) / 7) + 1;
      const ord = ['', '1.', '2.', '3.', '4.', '5.'][Math.min(nth, 5)];
      wtInfo = `${ord} ${WT_LANG[ld.getDay()]} im ${MONATE[ld.getMonth()]}`;
    }

    const istPrognose = !serie.naechstes_datum && !!prognose;

    _edit = {
      serieId,
      wettbewerbe: [...(serie.wettbewerbe || [])],
      url:    serie.url    || '',
      ort_id: serie.ort_id ?? null,
      lat:    serie.lat    ?? null,
      lon:    serie.lon    ?? null,
    };

    const cont = document.getElementById('modal-container');
    if (!cont) return;

    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card" onclick="event.stopPropagation()"
             style="max-width:600px;max-height:90vh;overflow-y:auto">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Planung bearbeiten</div>
              <div class="modal-title">${safeHtml(serie.name || serie.kuerzel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()">&times;</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:20px">

            <!-- Nächster Termin -->
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text2);margin-bottom:8px">Nächster Termin</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <input type="date" id="planung-datum"
                  style="flex:1;min-width:150px;border:1px solid var(--border);border-radius:6px;
                         padding:6px 8px;font-size:13px;background:var(--bg);color:var(--text)"
                  value="${escapeHtml(datumVorschlag)}">
                ${serie.naechstes_datum
                  ? `<button class="btn btn-sm btn-ghost" title="Manuelles Datum entfernen – Prognose wird wieder verwendet"
                      onclick="ADMIN_WETTKAMPF._clearDatumModal(${serieId})">↺ Datum löschen</button>`
                  : ''}
              </div>
              <div style="font-size:11px;color:var(--text2);margin-top:4px">
                ${istPrognose
                  ? `Datum basiert auf Prognose (${escapeHtml(wtInfo)}) &ndash; Leer lassen = Prognose weiter verwenden`
                  : prognose
                    ? `Prognose: <strong>${WT_KURZ[new Date(prognose+'T00:00:00').getDay()]}, ${fmtDate(prognose)}</strong>${wtInfo ? ' &bull; ' + escapeHtml(wtInfo) : ''}`
                    : 'Leer lassen = kein Termin'}
              </div>
            </div>

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
              onclick="ADMIN_WETTKAMPF.savePlanung(${serieId})">Speichern</button>
          </div>
        </div>
      </div>`;

    _renderDiszArea();
    _renderOrtSektion();

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
  async function _clearDatumModal(serieId) {
    const inp = document.getElementById('planung-datum');
    const prognose = predictNextDate((serien.find(s => s.id === serieId) || {}).letztes_datum);
    if (inp) inp.value = prognose || '';
    // Markierung: nach dem Save wird erkannt dass kein manuelles Datum gesetzt ist
    _edit._clearDatum = true;
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

  // ── Speichern ─────────────────────────────────────────────────
  async function savePlanung(serieId) {
    if (!_edit) return;

    const datumInp = document.getElementById('planung-datum');
    const urlInp   = document.getElementById('planung-url');

    // Datum: wenn Feld leer → null (Prognose) oder wenn _clearDatum gesetzt
    const datumVal = (datumInp?.value || '').trim();
    // Prüfen ob der Wert dem Prognose-Vorschlag entspricht → als manuell speichern
    const datum = datumVal || null;

    const url = (urlInp?.value || '').trim() || null;

    try {
      await apiPut(`wettkampf/${serieId}/planung`, {
        naechstes_datum: datum,
        wettbewerbe:     _edit.wettbewerbe,
        url,
        ort_id: _edit.ort_id,
        lat:    _edit.lat,
        lon:    _edit.lon,
      });

      // Lokal sofort aktualisieren
      const serie = serien.find(s => s.id === serieId);
      if (serie && _edit) {
        serie.wettbewerbe    = [..._edit.wettbewerbe];
        serie.naechstes_datum = datum;
        serie.url            = url;
        serie.ort_id         = _edit.ort_id;
        serie.lat            = _edit.lat;
        serie.lon            = _edit.lon;
      }

      schliesseModal();
      _edit = null;
      benachrichtigen('Planung gespeichert.', 'ok');
      await reload();
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
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
    showPlanungModal, savePlanung,
    _removeWb, _addDiszFromList, _setDiszFilter,
    _clearOrt, _setOrtFilter, _waehleOrt,
    _clearDatumModal,
    toggleAktiv, imKalenderEintragen,
    predictNextDate, sortiereNach,
  };
})();
