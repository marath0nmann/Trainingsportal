// ============================================================
// Trainingsportal – Wettkämpfe (Admin-Ansicht)
// Zeigt alle regelmäßigen Veranstaltungsserien aus dem Statistikportal,
// extrahiert Disziplinen aus Ergebnissen, erlaubt Admin-Planung.
// ============================================================

const ADMIN_WETTKAMPF = (() => {
  let serien     = [];
  let container  = null;
  let expandedId = null;
  // Zustand des aktuell offenen Planungs-Modals
  let _edit      = null; // { serieId, ausgeschlossen: Set, extras: [] , extrahiert: [] }
  // Disziplin-Auswahl im Modal
  let _alleDisziplinen = null; // null = noch nicht geladen, [] = leer / Fehler
  let _diszFilter      = '';
  // Sortierzustand
  let _sortCol   = 'naechster'; // 'name' | 'letzter' | 'naechster'
  let _sortDir   = 'asc';

  const WT_KURZ = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const WT_LANG = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const MONATE  = ['Januar','Februar','März','April','Mai','Juni','Juli',
                   'August','September','Oktober','November','Dezember'];

  // Decodes HTML-entities stored in DB (e.g. &quot; → ")
  function decodeHtml(s) {
    if (!s) return '';
    const el = document.createElement('textarea');
    el.innerHTML = String(s);
    return el.value;
  }

  // Escape for safe HTML output (after entity decoding)
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
   * Exportiert, damit der Kalender die Funktion direkt nutzen kann.
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
        // toISOString() würde UTC liefern und in UTC+1/+2 einen Tag zurückspringen
        // → lokale Datumsteile verwenden
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
    // Manuell gesetzter Termin nur verwenden, wenn er noch nicht vergangen ist
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

  // Disziplinen-Quelle: wettbewerbe (einzige editierbare Quelle)
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
      } else { // naechster – Prognose bei Inaktiven wie in der Anzeige ignorieren
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
          <th style="width:80px"></th>
        </tr>
      </thead>
      <tbody>`;

    _sortiereSerien().forEach(s => {
      const next     = naechstesDatum(s);
      const disz     = allesDisziplinen(s);
      const expanded = expandedId === s.id;

      // Disziplin-Chips (max 4 + Überhang)
      const MAX  = 4;
      let chips  = '';
      disz.slice(0, MAX).forEach(d => {
        chips += `<span style="display:inline-block;padding:1px 7px;border-radius:10px;
          font-size:11px;background:var(--border);color:var(--text);margin:1px 2px">${escapeHtml(d)}</span>`;
      });
      if (disz.length > MAX)
        chips += `<span style="font-size:11px;color:var(--text2)">+${disz.length - MAX}</span>`;

      // Letzten Wochentag für Tooltip
      const letzterWt = s.letztes_datum
        ? WT_KURZ[new Date(s.letztes_datum + 'T00:00:00').getDay()] : '';

      // Nächster-Termin-Zelle (bei deaktivierten Serien keine Prognose anzeigen)
      let nextCell = '<span style="color:var(--text2);font-size:13px">–</span>';
      const inaktiv    = s.aktiv === 0;
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

      html += `
        <tr style="cursor:pointer;${rowOpacity}"
            onclick="ADMIN_WETTKAMPF.toggleExpand(${s.id})">
          <td>
            <strong>${safeHtml(s.name || s.kuerzel)}</strong>
            ${inaktiv ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--border);color:var(--text2);margin-left:6px">Inaktiv</span>' : ''}
            ${s.ort_letzter
              ? `<span style="font-size:12px;color:var(--text2);margin-left:6px">${safeHtml(s.ort_letzter)}</span>`
              : ''}
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
              title="${inaktiv ? 'Aktivieren (erscheint wieder im Kalender)' : 'Deaktivieren (ausblenden im Kalender)'}"
              style="border:none;background:none;cursor:pointer;font-size:18px;
                     color:${inaktiv ? 'var(--text2)' : '#27ae60'};padding:0 4px;vertical-align:middle">
              ${inaktiv ? '◯' : '●'}</button>` : ''}
            <span style="display:inline-block;transition:transform .18s;color:var(--text2);
              transform:${expanded ? 'rotate(90deg)' : 'rotate(0deg)'}">›</span>
          </td>
        </tr>`;

      if (expanded) html += renderDetailZeile(s, disz, admin);
    });

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
  }

  // ── Detail-Panel ──────────────────────────────────────────────
  function renderDetailZeile(serie, disz, admin) {
    const next = naechstesDatum(serie);

    let html = `
      <tr>
        <td colspan="5" style="padding:0;border-bottom:2px solid var(--primary)">
          <div style="background:var(--bg2);border-top:1px solid var(--border);padding:20px 16px">
            <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">`;

    // ── Disziplinen (aus wettbewerbe) ────────────────────────
    html += `<div style="flex:1;min-width:220px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.5px;color:var(--text2);margin-bottom:10px">Disziplinen</div>`;

    if (!disz.length) {
      html += '<div style="font-size:13px;color:var(--text2)">Keine Disziplinen erfasst.</div>';
    } else {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
      disz.forEach(d => {
        html += `<span style="padding:3px 10px;border-radius:12px;font-size:13px;
          background:var(--border);color:var(--text)">${escapeHtml(d)}</span>`;
      });
      html += '</div>';
    }
    html += '</div>';

    // ── Admin: Planung ──────────────────────────────────────
    if (admin) {
      const prognose = predictNextDate(serie.letztes_datum);
      let prognoseHint = '';
      if (serie.letztes_datum) {
        const ld   = new Date(serie.letztes_datum + 'T00:00:00');
        const nthL = Math.floor((ld.getDate() - 1) / 7) + 1;
        const ordL = ['', '1.', '2.', '3.', '4.', '5.'][Math.min(nthL, 5)];
        const regel = `${ordL} ${WT_LANG[ld.getDay()]} im ${MONATE[ld.getMonth()]}`;
        prognoseHint = prognose
          ? `<div style="font-size:11px;color:var(--text2);margin-top:3px">
              Prognose: ${WT_KURZ[new Date(prognose + 'T00:00:00').getDay()]}, ${fmtDate(prognose)}
              &bull; ${escapeHtml(regel)}
             </div>`
          : '';
      }

      html += `<div style="flex:0 0 auto;min-width:220px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                    letter-spacing:.5px;color:var(--text2);margin-bottom:10px">Planung</div>

        <div style="margin-bottom:12px">
          <div style="font-size:12px;color:var(--text2);margin-bottom:5px">Nächster Termin (manuell festlegen)</div>
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
            <input type="date" id="inline-datum-${serie.id}"
              style="border:1px solid var(--border);border-radius:6px;padding:4px 7px;
                     font-size:13px;background:var(--bg);color:var(--text);flex:1;min-width:130px"
              value="${escapeHtml(serie.naechstes_datum || '')}">
            <button class="btn btn-sm btn-primary"
              onclick="ADMIN_WETTKAMPF.saveDatumInline(${serie.id})">✓&nbsp;OK</button>
            ${serie.naechstes_datum
              ? `<button class="btn btn-sm btn-ghost"
                  onclick="ADMIN_WETTKAMPF.clearDatumInline(${serie.id})"
                  title="Manuelles Datum löschen – Prognose wird wieder verwendet">↺</button>`
              : ''}
          </div>
          ${prognoseHint}
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn btn-sm btn-ghost"
            onclick="ADMIN_WETTKAMPF.showPlanungModal(${serie.id})">Disziplinen&nbsp;bearbeiten</button>
          ${next
            ? `<button class="btn btn-sm btn-ghost"
                onclick="ADMIN_WETTKAMPF.imKalenderEintragen(${serie.id})">Im&nbsp;Kalender&nbsp;eintragen</button>`
            : ''}
        </div>
      </div>`;
    }

    html += '</div></div></td></tr>';
    return html;
  }

  // ── Auf-/Zuklappen ────────────────────────────────────────────
  function toggleExpand(id) {
    expandedId = (expandedId === id) ? null : id;
    renderTabelle();
  }

  // ── Modal: Planung bearbeiten ─────────────────────────────────
  async function showPlanungModal(serieId) {
    const serie = serien.find(s => s.id === serieId);
    if (!serie) return;

    _diszFilter = '';
    // Leeren Cache zurücksetzen, damit ein erneutes Öffnen einen Reload auslöst
    if (_alleDisziplinen !== null && _alleDisziplinen.length === 0) _alleDisziplinen = null;
    _edit = {
      serieId,
      wettbewerbe: [...(serie.wettbewerbe || [])],   // editierbare Disziplinliste
      historisch:  serie.disziplinen || [],           // schreibgeschützt (Statistikportal)
    };

    const prognose = predictNextDate(serie.letztes_datum);
    const manuell  = serie.naechstes_datum || '';
    let   wtInfo   = '';
    if (serie.letztes_datum) {
      const ld  = new Date(serie.letztes_datum + 'T00:00:00');
      const nth = Math.floor((ld.getDate() - 1) / 7) + 1;
      const ord = ['', '1.', '2.', '3.', '4.', '5.'][Math.min(nth, 5)];
      wtInfo = `${ord} ${WT_LANG[ld.getDay()]} im ${MONATE[ld.getMonth()]}`;
    }

    const cont = document.getElementById('modal-container');
    if (!cont) return;
    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width:560px">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Planung bearbeiten</div>
              <div class="modal-title">${safeHtml(serie.name || serie.kuerzel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()">&times;</button>
          </div>
          <div class="modal-body">

            <div class="modal-row" style="align-items:flex-start">
              <div class="modal-label" style="padding-top:6px">Nächster Termin</div>
              <div style="flex:1">
                <input type="date" id="planung-datum"
                  style="width:100%;border:1px solid var(--border);border-radius:6px;
                         padding:6px 8px;font-size:13px;background:var(--bg);color:var(--text)"
                  value="${escapeHtml(manuell)}">
                <div style="font-size:11px;color:var(--text2);margin-top:4px">
                  ${prognose
                    ? `Prognose: <strong>${WT_KURZ[new Date(prognose + 'T00:00:00').getDay()]}, ${fmtDate(prognose)}</strong>`
                      + (wtInfo ? ` &bull; ${escapeHtml(wtInfo)}` : '')
                      + `<br>Leer lassen = Prognose verwenden`
                    : 'Leer lassen = kein Termin'}
                </div>
              </div>
            </div>

            <div style="margin-top:20px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.5px;color:var(--text2);margin-bottom:10px">Disziplinen</div>
              <div id="planung-disz-area"></div>
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

    // Disziplin-Liste nachladen (gecacht) – Modal ist bereits sichtbar
    if (_alleDisziplinen === null) {
      try {
        const resp = await apiGet('wettkampf/disziplinen', { silent: true });
        _alleDisziplinen = resp.disziplinen || [];
      } catch (_) {
        _alleDisziplinen = [];
      }
      _renderDiszArea();
    }
  }

  // Disziplin-Bereich im Modal neu zeichnen
  function _renderDiszArea() {
    const area = document.getElementById('planung-disz-area');
    if (!area || !_edit) return;

    let html = '';

    // ── Aktuelle Disziplinliste (wettbewerbe) ──
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
    }

    if (!_edit.wettbewerbe.length) {
      html += `<div style="font-size:13px;color:var(--text2);margin-bottom:12px">
        Noch keine Disziplinen eingetragen.</div>`;
    }

    // ── Disziplin hinzufügen (aus Statistikportal-Liste oder Freitext) ──
    html += `<div style="margin-top:4px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
        Disziplin hinzufügen:</div>`;

    if (_alleDisziplinen === null) {
      html += `<div style="font-size:13px;color:var(--text2)">
        <span style="display:inline-block;width:12px;height:12px;border:2px solid var(--border);
          border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;
          vertical-align:middle;margin-right:6px"></span>Lade Disziplinen&hellip;</div>`;
    } else {
      const bereitsAktiv = new Set(_edit.wettbewerbe);

      const suchterm = _diszFilter.trim().toLowerCase();
      const gefiltert = _alleDisziplinen.filter(d =>
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

  // Disziplin aus wettbewerbe entfernen
  function _removeWb(d) {
    if (!_edit) return;
    _edit.wettbewerbe = _edit.wettbewerbe.filter(x => x !== d);
    _renderDiszArea();
  }

  // Disziplin zu wettbewerbe hinzufügen (aus Picker oder Freitext)
  function _addDiszFromList(d) {
    if (!_edit) return;
    if (!_edit.wettbewerbe.includes(d)) _edit.wettbewerbe.push(d);
    _diszFilter = '';
    _renderDiszArea();
    setTimeout(() => document.getElementById('disz-filter-inp')?.focus(), 0);
  }

  // Suchfilter im Disziplin-Picker aktualisieren
  function _setDiszFilter(val) {
    _diszFilter = val;
    _renderDiszArea();
    // Fokus & Cursorposition erhalten
    const inp = document.getElementById('disz-filter-inp');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  async function savePlanung(serieId) {
    const datum = (document.getElementById('planung-datum')?.value || '').trim() || null;
    try {
      await apiPut(`wettkampf/${serieId}/planung`, {
        naechstes_datum: datum,
        wettbewerbe:     _edit ? _edit.wettbewerbe : [],
      });
      // Lokales Serien-Objekt sofort aktualisieren
      const serie = serien.find(s => s.id === serieId);
      if (serie && _edit) serie.wettbewerbe = [..._edit.wettbewerbe];
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
      benachrichtigen(neuAktiv ? 'Aktiviert – erscheint wieder im Kalender.' : 'Deaktiviert – ausgeblendet im Kalender.', 'ok');
      if (typeof _wettkampfCache !== 'undefined') _wettkampfCache = null;
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  // ── Datum inline speichern ────────────────────────────────────
  async function saveDatumInline(serieId) {
    const inp = document.getElementById(`inline-datum-${serieId}`);
    const datum = (inp?.value || '').trim() || null;
    try {
      await apiPut(`wettkampf/${serieId}/planung`, { naechstes_datum: datum });
      const serie = serien.find(s => s.id === serieId);
      if (serie) serie.naechstes_datum = datum;
      benachrichtigen('Termin gespeichert.', 'ok');
      renderTabelle();
      if (typeof _wettkampfCache !== 'undefined') _wettkampfCache = null;
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  // ── Manuelles Datum löschen (zurück zur Prognose) ─────────────
  async function clearDatumInline(serieId) {
    try {
      await apiPut(`wettkampf/${serieId}/planung`, { naechstes_datum: null });
      const serie = serien.find(s => s.id === serieId);
      if (serie) serie.naechstes_datum = null;
      benachrichtigen('Manuelles Datum entfernt – Prognose wird verwendet.', 'ok');
      renderTabelle();
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
    render, toggleExpand,
    showPlanungModal, savePlanung,
    _removeWb, _addDiszFromList, _setDiszFilter,
    toggleAktiv, saveDatumInline, clearDatumInline,
    imKalenderEintragen, predictNextDate, sortiereNach,
  };
})();
