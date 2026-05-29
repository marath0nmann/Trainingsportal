// ============================================================
// Trainingsportal – Wettkampfplanung (pro Athlet, pro Jahr)
// Zeigt alle Veranstaltungsserien mit Nutzerstatus und erlaubt
// die persönliche Planung / Jahresübersicht.
// ============================================================

const WETTKAMPFPLANUNG = (() => {

  let _serien    = [];
  let _jahr      = new Date().getFullYear();
  let _container = null;
  let _popper    = null;  // global floating status-picker

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

  // Status-Gruppen für das Dropdown
  const ST_GRUPPEN = [
    { titel: 'To-Do',          keys: ['offen','in_klaerung'] },
    { titel: 'In Bearbeitung', keys: ['anmeldung_erforderlich'] },
    { titel: 'Abgeschlossen',  keys: ['angemeldet','absolviert','findet_nicht_statt','passt_nicht','nicht_angetreten'] },
  ];

  // ── Haupteinstieg ────────────────────────────────────────────
  async function render(el) {
    _container = el;
    if (!_container) return;
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

  // ── Liste rendern ────────────────────────────────────────────
  function _renderListe() {
    if (!_container) return;
    _closePopper();

    // Statistiken
    const stati = {};
    _serien.forEach(s => { stati[s.status] = (stati[s.status] || 0) + 1; });
    const angemeldet  = (stati['angemeldet']  || 0);
    const offen       = (stati['offen']       || 0) + (stati['in_klaerung'] || 0) + (stati['anmeldung_erforderlich'] || 0);
    const absolviert  = (stati['absolviert']  || 0);

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;
                  margin-bottom:20px;flex-wrap:wrap;gap:12px">
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
      </div>`;

    if (!_serien.length) {
      html += '<div style="padding:40px;text-align:center;color:var(--text2)">Keine Veranstaltungen vorhanden.</div>';
      _container.innerHTML = html;
      return;
    }

    html += `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:540px">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <th style="${_thStyle()}">Veranstaltung</th>
            <th style="${_thStyle()}">Datum ${_jahr}</th>
            <th style="${_thStyle()}">Wettbewerbe</th>
            <th style="${_thStyle()}">Status</th>
          </tr>
        </thead>
        <tbody>`;

    _serien.forEach(s => {
      const st   = ST[s.status] || ST['passt_nicht'];
      const datum = _datumFuerJahr(s, _jahr);
      const heute = (new Date()).toISOString().slice(0, 10);
      const vergangen = datum && datum < heute;

      // Wettbewerbe-Chips (max 3)
      const wb = Array.isArray(s.wettbewerbe) ? s.wettbewerbe : [];
      const MAX_WB = 3;
      let wbHtml = '';
      wb.slice(0, MAX_WB).forEach(w => {
        wbHtml += `<span style="display:inline-block;padding:1px 7px;border-radius:10px;
          font-size:11px;background:var(--border);color:var(--text);margin:1px 2px">${escapeHtml(w)}</span>`;
      });
      if (wb.length > MAX_WB) wbHtml += `<span style="font-size:11px;color:var(--text2)">+${wb.length - MAX_WB}</span>`;

      // Angemeldete Disziplinen
      const anmDisz = s.angemeldet_disziplinen || [];
      let anmHtml = '';
      if (anmDisz.length) {
        anmHtml = `<div style="margin-top:3px">` +
          anmDisz.map(d => `<span style="font-size:10px;padding:1px 5px;border-radius:6px;
            background:#27ae6022;color:#27ae60;margin-right:3px">✓ ${escapeHtml(d)}</span>`).join('') +
          `</div>`;
      }

      // Datum-Anzeige
      let datumHtml = '<span style="color:var(--text2);font-size:13px">–</span>';
      if (datum) {
        const d = new Date(datum + 'T00:00:00');
        const WT = ['So','Mo','Di','Mi','Do','Fr','Sa'];
        const fmt = `${WT[d.getDay()]}, ${d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' })}`;
        datumHtml = `<span style="font-size:13px${vergangen ? ';color:var(--text2)' : ';font-weight:600'}">${fmt}</span>`;
      }

      // Zeilen-Stil: vergangene Termine leicht ausgeblendet
      const rowOp = vergangen && s.status === 'passt_nicht' ? 'opacity:.55' : '';

      html += `
        <tr style="border-bottom:1px solid var(--border);${rowOp}">
          <td style="padding:9px 10px">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${s.aktiv === 0 ? '<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:var(--border);color:var(--text2)">inaktiv</span>' : ''}
              <strong style="font-size:13px">${escapeHtml(s.name)}</strong>
              ${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener"
                  style="font-size:11px;color:var(--primary);text-decoration:none" title="${escapeHtml(s.url)}">↗</a>` : ''}
            </div>
            ${anmHtml}
          </td>
          <td style="padding:9px 10px;white-space:nowrap">${datumHtml}</td>
          <td style="padding:9px 10px">${wbHtml || '<span style="color:var(--text2);font-size:12px">–</span>'}</td>
          <td style="padding:9px 10px;white-space:nowrap">
            <button class="wkp-status-btn"
              onclick="WETTKAMPFPLANUNG._openPopper(${s.id}, this)"
              style="background:${st.bg};color:${st.text};border:none;border-radius:12px;
                     padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;
                     white-space:nowrap">
              ${escapeHtml(st.label)}
            </button>
          </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    _container.innerHTML = html;
  }

  function _thStyle() {
    return 'text-align:left;padding:8px 10px;font-size:11px;font-weight:700;' +
           'text-transform:uppercase;letter-spacing:.4px;color:var(--text2);white-space:nowrap';
  }

  // ── Datum für ein bestimmtes Jahr berechnen ──────────────────
  function _datumFuerJahr(serie, jahr) {
    const y = String(jahr);
    // 1. Manuell gesetzter Termin in diesem Jahr
    if (serie.naechstes_datum && serie.naechstes_datum.startsWith(y)) return serie.naechstes_datum;
    // 2. Letzter Termin in diesem Jahr (aus Ergebnissen)
    if (serie.letztes_datum && serie.letztes_datum.startsWith(y)) return serie.letztes_datum;
    // 3. Sortierindex → YYYY-MM-DD (grobe Schätzung)
    if (serie.sortierindex) {
      const si = String(serie.sortierindex).padStart(4, '0');
      const mm = si.slice(0, 2);
      const dd = si.slice(2, 4);
      const m = parseInt(mm, 10), d = parseInt(dd, 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${mm}-${dd}`;
    }
    return null;
  }

  // ── Status-Popper ────────────────────────────────────────────
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
        const cfg = ST[key];
        const aktiv = s.status === key;
        html += `<div onclick="WETTKAMPFPLANUNG._waehleStatus(${serieId},'${key}')"
          style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;
                 ${aktiv ? `background:var(--border);font-weight:700;` : ''}"
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

    const rect = btnEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = p.offsetWidth || 200, ph = p.offsetHeight || 200;
    const left = Math.min(rect.left, vw - pw - 8);
    const top  = rect.bottom + ph > vh ? Math.max(4, rect.top - ph) : rect.bottom + 4;
    p.style.left = Math.max(4, left) + 'px';
    p.style.top  = top + 'px';
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

  // ── Jahreswechsel ────────────────────────────────────────────
  async function setJahr(j) {
    _jahr = j;
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
  return { render, setJahr, _openPopper, _waehleStatus };
})();
