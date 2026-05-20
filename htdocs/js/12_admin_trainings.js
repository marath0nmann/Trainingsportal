// ============================================================
// Trainingsportal – Admin: Trainings-Liste
// ============================================================

const ADMIN_TRAININGS = (() => {
  let einheiten = [];
  let sortKey   = 'datum';
  let sortDir   = -1;     // -1 = DESC
  let selected  = new Set();
  let container = null;

  const TYP_LABEL = {
    intervall: 'Intervall', dauerlauf: 'Dauerlauf',
    funktionell: 'Funkt. Tr.', runde: 'Runde',
    event: 'Event', frei: 'Training', kein_training: 'Kein Training',
  };
  const WOCHENTAG = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  const COLS = [
    { key: 'datum',      label: 'Datum'       },
    { key: 'uhrzeit',    label: 'Zeit'        },
    { key: 'typ',        label: 'Typ'         },
    { key: 'titel',      label: 'Titel'       },
    { key: 'treffpunkt', label: 'Treffpunkt'  },
    { key: 'status',     label: 'Status'      },
  ];

  async function render(el) {
    container = el;
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Trainings…</div>';
    try {
      const r = await apiGet('admin/einheiten?limit=2000', { silent: true });
      einheiten = r.einheiten || [];
      selected.clear();
      rendereTabelle();
    } catch (e) {
      el.innerHTML = '<div class="empty">Fehler: ' + escapeHtml(e.message || '') + '</div>';
    }
  }

  function sort(key) {
    if (sortKey === key) {
      sortDir *= -1;
    } else {
      sortKey = key;
      sortDir = (key === 'datum') ? -1 : 1;
    }
    rendereTabelle();
  }

  function getSortiert() {
    return [...einheiten].sort((a, b) => {
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

  function rendereTabelle() {
    if (!container) return;
    const data = getSortiert();
    const allChecked = data.length > 0 && data.every(e => selected.has(e.id));

    const thStyle = 'padding:8px;text-align:left;white-space:nowrap;cursor:pointer;user-select:none;' +
                    'color:var(--text2);font-weight:600;font-size:13px;border-bottom:2px solid var(--border)';

    const headerCols = COLS.map(c => {
      const arrow = sortKey === c.key ? (sortDir > 0 ? ' ↑' : ' ↓') : '';
      return `<th style="${thStyle}" onclick="ADMIN_TRAININGS.sort('${c.key}')">${escapeHtml(c.label)}${arrow}</th>`;
    }).join('');

    const rows = data.map(e => {
      const chk     = selected.has(e.id) ? ' checked' : '';
      const typLbl  = TYP_LABEL[e.typ] || e.typ;
      const d       = new Date(e.datum + 'T00:00:00');
      const datStr  = `${WOCHENTAG[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
      const abgesagt = e.status === 'abgesagt';
      const rowStyle = abgesagt ? 'opacity:.65' : '';
      const statusTxt = abgesagt ? 'Abgesagt' : 'Geplant';
      const statusSty = abgesagt ? 'color:var(--primary);font-weight:600' : '';
      return `<tr style="border-bottom:1px solid var(--border);${rowStyle}">
        <td style="padding:7px 8px"><input type="checkbox" data-id="${e.id}"${chk} onchange="ADMIN_TRAININGS.toggle(${e.id})"></td>
        <td style="padding:7px 8px;font-size:13px;white-space:nowrap">${escapeHtml(datStr)}</td>
        <td style="padding:7px 8px;font-size:13px;white-space:nowrap">${escapeHtml(e.uhrzeit || '–')}</td>
        <td style="padding:7px 8px;font-size:13px"><span class="liste-typ-badge liste-typ-${escapeHtml(e.typ)}">${escapeHtml(typLbl)}</span></td>
        <td style="padding:7px 8px;font-size:13px">${escapeHtml(e.titel)}</td>
        <td style="padding:7px 8px;font-size:13px;color:var(--text2)">${escapeHtml(e.treffpunkt || '–')}</td>
        <td style="padding:7px 8px;font-size:13px;${statusSty}">${escapeHtml(statusTxt)}</td>
      </tr>`;
    }).join('');

    const selCount = selected.size;
    const delDisabled = selCount === 0 ? ' disabled' : '';

    container.innerHTML = `
      <div class="panel" style="overflow:hidden">
        <div class="panel-header">
          <div class="panel-title">Alle Trainings (${einheiten.length})</div>
          <div style="display:flex;gap:8px;align-items:center">
            ${selCount > 0 ? `<span style="font-size:13px;color:var(--text2)">${selCount} ausgewählt</span>` : ''}
            <button class="btn btn-danger btn-sm"${delDisabled} onclick="ADMIN_TRAININGS.deleteSelected()">Löschen</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr>
                <th style="padding:8px;border-bottom:2px solid var(--border);width:36px">
                  <input type="checkbox"${allChecked ? ' checked' : ''} onchange="ADMIN_TRAININGS.toggleAll(this.checked)">
                </th>
                ${headerCols}
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text2)">Keine Trainingseinheiten vorhanden.</td></tr>'}</tbody>
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
    const data = getSortiert();
    if (checked) data.forEach(e => selected.add(e.id));
    else selected.clear();
    rendereTabelle();
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
      const notif = document.getElementById('notification-container');
      if (notif) {
        const d = document.createElement('div');
        d.className = 'notif notif-ok';
        d.textContent = ids.length + ' Einheit(en) gelöscht.';
        notif.appendChild(d);
        setTimeout(() => d.remove(), 3500);
      }
    } catch (e) {
      alert('Fehler beim Löschen: ' + escapeHtml(e.message || ''));
    }
  }

  return { render, sort, toggle, toggleAll, deleteSelected };
})();
