// ============================================================
// Trainingsportal – Admin: Trainings-Liste
// ============================================================

const ADMIN_TRAININGS = (() => {
  let einheiten   = [];
  let treffpunkte = [];
  let sortKey     = 'datum';
  let sortDir     = 1;      //  1 = ASC (aufsteigend = älteste zuerst)
  let selected    = new Set();
  let container   = null;

  const WOCHENTAG = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  const COLS = [
    { key: 'datum',      label: 'Datum'            },
    { key: 'uhrzeit',    label: 'Zeit'             },
    { key: 'typ',        label: 'Typ'              },
    { key: 'gruppe',     label: 'Trainingsgruppe'  },
    { key: 'titel',      label: 'Titel'            },
    { key: 'treffpunkt', label: 'Treffpunkt'       },
    { key: 'status',     label: 'Status'           },
  ];

  async function render(el) {
    container = el;
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Trainings…</div>';
    try {
      const resp = await apiGet('admin/einheiten?limit=2000', { silent: true });
      einheiten   = resp.einheiten || [];
      treffpunkte = await TREFFPUNKTE.laden().catch(() => []);
      selected.clear();
      tfLeeren(TF);
      rendereTabelle();
    } catch (e) {
      if (container) {
        container.innerHTML = '<div style="padding:20px;color:var(--primary)">Fehler: ' + escapeHtml(e.message || String(e)) + '</div>';
      }
    }
  }

  function sort(key) {
    if (sortKey === key) {
      sortDir *= -1;
    } else {
      sortKey = key;
      sortDir = 1; // beim Wechsel immer aufsteigend
    }
    rendereTabelle();
  }

  // ── Gemeinsame Filterleiste (Statistikportal-Modul, via shared.php) ──
  const TF = 'tp-trainings';
  const WOCHENTAG_LANG = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const MONATE = ['Januar','Februar','März','April','Mai','Juni',
                  'Juli','August','September','Oktober','November','Dezember'];

  function filterInit() {
    tfInit(TF, {
      platzhalter: 'Titel, Treffpunkt, Gruppe…',
      rows: () => einheiten,
      suche: e => [e.titel, e.treffpunkt, e.gruppe, getTypLabel(e.typ)],
      spalten: [
        { key: 'jahr',  label: 'Jahr', absteigend: true, wert: e => (e.datum || '').slice(0, 4) },
        { key: 'monat', label: 'Monat', wert: e => (e.datum || '').slice(5, 7),
          anzeige: w => MONATE[parseInt(w, 10) - 1] || w },
        { key: 'wochentag', label: 'Wochentag', wert: e => {
            if (!e.datum) return '';
            const d = new Date(e.datum + 'T00:00:00');
            return isNaN(d) ? '' : WOCHENTAG_LANG[d.getDay()];
          } },
        { key: 'typ',        label: 'Typ',            wert: e => getTypLabel(e.typ) || '' },
        { key: 'gruppe',     label: 'Trainingsgruppe', wert: e => e.gruppe || '— ohne Gruppe —' },
        { key: 'treffpunkt', label: 'Treffpunkt',     wert: e => e.treffpunkt || '— ohne Treffpunkt —' },
        { key: 'status',     label: 'Status',         wert: e => e.status === 'abgesagt' ? 'Abgesagt' : 'Geplant' },
      ],
      onChange: () => { selected.clear(); rendereTabelle(); },
    });
  }

  function getSortiert() {
    filterInit();
    const basis = tfFilter(TF, einheiten);
    return basis.slice().sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'datum') {
        av = (a.datum || '') + 'T' + (a.uhrzeit || '00:00');
        bv = (b.datum || '') + 'T' + (b.uhrzeit || '00:00');
      }
      if (av < bv) return -sortDir;
      if (av > bv) return  sortDir;
      return 0;
    });
  }

  // Die Filterleiste wird nur einmal gebaut – sonst verliert das Suchfeld beim
  // Tippen den Fokus. Neu gezeichnet wird ausschliesslich der Tabellenblock.
  function rendereTabelle() {
    if (!container || !container.isConnected) return;
    filterInit();
    let box = document.getElementById('atr-box');
    if (!box) {
      container.innerHTML = tfBarHtml(TF, { suchbreite: '1 1 240px' }) + '<div id="atr-box"></div>';
      box = document.getElementById('atr-box');
    }
    box.innerHTML = tabellenHtml();
    tfRefresh(TF);
  }

  function tabellenHtml() {
    const data = getSortiert();
    const allChecked = data.length > 0 && data.every(e => selected.has(e.id));
    const selCount   = selected.size;

    const headerCols = COLS.map(c => {
      const arrow = sortKey === c.key ? (sortDir > 0 ? ' ↑' : ' ↓') : '';
      const sorted = sortKey === c.key ? ' sorted' : '';
      return `<th class="${sorted}" onclick="ADMIN_TRAININGS.sort('${c.key}')">${escapeHtml(c.label)}${arrow}</th>`;
    }).join('');

    const rows = data.map(e => {
      const chk      = selected.has(e.id) ? ' checked' : '';
      const d        = new Date(e.datum + 'T00:00:00');
      const datStr   = `${WOCHENTAG[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
      const zeitStr  = e.uhrzeit ? e.uhrzeit.slice(0, 5) : '–';
      const abgesagt = e.status === 'abgesagt';
      const typLbl   = getTypLabel(e.typ);
      const rowHover = 'cursor:pointer';
      const rowStyle = abgesagt ? `${rowHover};opacity:.65` : rowHover;
      const statusSty = abgesagt ? 'color:var(--primary);font-weight:600' : 'color:var(--text2)';

      const tdClip = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0';

      return `<tr style="${rowStyle}" onclick="ADMIN_TRAININGS.editRow(event,${e.id})">
        <td style="width:40px" onclick="event.stopPropagation()">
          <input type="checkbox" data-id="${e.id}"${chk} onchange="ADMIN_TRAININGS.toggle(${e.id})">
        </td>
        <td style="${tdClip}">${escapeHtml(datStr)}</td>
        <td style="${tdClip}">${escapeHtml(zeitStr)}</td>
        <td style="overflow:hidden;max-width:0">
          <span class="liste-typ-badge liste-typ-${escapeHtml(e.typ)}"
            style="display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;white-space:nowrap"
          >${escapeHtml(typLbl)}</span>
        </td>
        <td style="${tdClip}" title="${escapeHtml(e.gruppe || '')}">${escapeHtml(e.gruppe || '–')}</td>
        <td style="${tdClip}" title="${escapeHtml(e.titel)}">${escapeHtml(e.titel)}</td>
        <td style="${tdClip}" title="${escapeHtml(e.treffpunkt || '')}">${escapeHtml(e.treffpunkt || '–')}</td>
        <td style="white-space:nowrap;${statusSty}">${abgesagt ? 'Abgesagt' : 'Geplant'}</td>
      </tr>`;
    }).join('');

    const filterAnzeige = tfAktiv(TF)
      ? `${data.length} von ${einheiten.length}`
      : `${einheiten.length}`;

    // ── Aktionsleiste (nur wenn Auswahl vorhanden) ──────────
    const tpOptionen = treffpunkte.map(t =>
      `<option value="${t.id}">${escapeHtml(t.name)}</option>`
    ).join('');

    const aktionsleiste = selCount > 0 ? `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;
                  background:var(--bg2);border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text2);margin-right:4px">${selCount} ausgewählt</span>
        <div style="display:flex;gap:4px;align-items:center">
          <select id="bulk-status" class="settings-input" style="height:30px;font-size:13px;padding:2px 8px">
            <option value="">Status…</option>
            <option value="geplant">Geplant</option>
            <option value="abgesagt">Abgesagt</option>
          </select>
          <button class="btn btn-ghost btn-sm" onclick="ADMIN_TRAININGS.bulkSetStatus()">Setzen</button>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <select id="bulk-treffpunkt" class="settings-input" style="height:30px;font-size:13px;padding:2px 8px">
            <option value="">Treffpunkt…</option>
            <option value="null">— keiner —</option>
            ${tpOptionen}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="ADMIN_TRAININGS.bulkSetTreffpunkt()">Setzen</button>
        </div>
        <button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="ADMIN_TRAININGS.deleteSelected()">Löschen</button>
      </div>` : '';

    return `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Alle Trainings (${filterAnzeige})</div>
          <button class="btn btn-ghost btn-sm" onclick="ADMIN_TRAININGS.reload()" title="Liste neu laden">↻</button>
        </div>
        ${aktionsleiste}
        <div class="table-scroll">
          <table style="table-layout:fixed;min-width:700px">
            <colgroup>
              <col style="width:40px">
              <col style="width:155px">
              <col style="width:60px">
              <col style="width:180px">
              <col style="width:160px">
              <col><!-- Titel: Rest -->
              <col style="width:140px">
              <col style="width:85px">
            </colgroup>
            <thead>
              <tr>
                <th style="width:40px">
                  <input type="checkbox"${allChecked ? ' checked' : ''} onchange="ADMIN_TRAININGS.toggleAll(this.checked)">
                </th>
                ${headerCols}
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text2)">${tfAktiv(TF) ? 'Keine Trainingseinheiten für diesen Filter.' : 'Keine Trainingseinheiten vorhanden.'}</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    rendereTabelle();
  }

  function toggleAll(checked) {
    if (checked) getSortiert().forEach(e => selected.add(e.id));
    else selected.clear();
    rendereTabelle();
  }

  // ── Zeile anklicken → Editor öffnen ────────────────────────
  async function editRow(ev, id) {
    if (!state.user) return;
    try {
      const data = await apiGet(`einheiten/${id}`, { silent: true });
      EDITOR.open({ einheit: data.einheit, segmente: data.segmente || [] });
      watchEditorClose();
    } catch (e) {
      alert('Fehler: ' + escapeHtml(e.message || ''));
    }
  }

  function watchEditorClose() {
    const cont = document.getElementById('modal-container');
    if (!cont) return;
    const obs = new MutationObserver(() => {
      if (!cont.innerHTML.trim()) {
        obs.disconnect();
        reload();
      }
    });
    obs.observe(cont, { childList: true });
  }

  async function reload() {
    if (!container || !container.isConnected) return;
    try {
      const r = await apiGet('admin/einheiten?limit=2000', { silent: true });
      einheiten = r.einheiten || [];
      rendereTabelle();
    } catch (_) {}
  }

  // ── Bulk-Aktionen ───────────────────────────────────────────
  async function bulkSetStatus() {
    const val = document.getElementById('bulk-status')?.value;
    if (!val) { benachrichtigen('Bitte Status auswählen.', 'warn'); return; }
    const ids = [...selected];
    try {
      await apiPost('admin/einheiten/bulk_update', { ids, status: val });
      ids.forEach(id => {
        const e = einheiten.find(x => x.id === id);
        if (e) e.status = val;
      });
      benachrichtigen(ids.length + ' Einheit(en) aktualisiert.', 'ok');
      rendereTabelle();
    } catch (e) { benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err'); }
  }

  async function bulkSetTreffpunkt() {
    const sel = document.getElementById('bulk-treffpunkt');
    if (!sel || !sel.value) { benachrichtigen('Bitte Treffpunkt auswählen.', 'warn'); return; }
    const tpId = sel.value === 'null' ? null : parseInt(sel.value, 10);
    const tpName = tpId ? (treffpunkte.find(t => t.id === tpId)?.name || '') : '';
    const ids = [...selected];
    try {
      await apiPost('admin/einheiten/bulk_update', { ids, treffpunkt_id: tpId });
      ids.forEach(id => {
        const e = einheiten.find(x => x.id === id);
        if (e) e.treffpunkt = tpName;
      });
      benachrichtigen(ids.length + ' Einheit(en) aktualisiert.', 'ok');
      rendereTabelle();
    } catch (e) { benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err'); }
  }

  async function deleteSelected() {
    if (!selected.size) return;
    const ids = [...selected];
    if (!confirm(`Wirklich ${ids.length} Trainingseinheit(en) unwiderruflich löschen?`)) return;
    try {
      await apiPost('admin/einheiten/bulk_delete', { ids });
      einheiten = einheiten.filter(e => !selected.has(e.id));
      selected.clear();
      rendereTabelle();
      benachrichtigen(ids.length + ' Einheit(en) gelöscht.', 'ok');
    } catch (e) { benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err'); }
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

  return { render, sort, toggle, toggleAll, editRow, reload, bulkSetStatus, bulkSetTreffpunkt, deleteSelected };
})();
