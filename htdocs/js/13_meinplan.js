// ============================================================
// Trainingsportal – Mein Plan (privater Trainingsplan)
// ============================================================
// Zeigt öffentliche Einheiten (normal) + eigene private Einheiten
// (farblich invertiert) nebeneinander im Monatskalender.
// Rechts des Kalenders: Wochenkilometer-Spalte (KW-Nummer + km-Summe
// aus privaten Einheiten mit Distanzangabe).
// ============================================================

const MEINPLAN = (() => {
  let kalMonth = null;

  // ── Einstieg ─────────────────────────────────────────────
  async function render(main) {
    if (!kalMonth) {
      const now = new Date();
      kalMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    await _renderInMain(main);
  }

  async function _renderInMain(main) {
    const y = kalMonth.getFullYear();
    const m = kalMonth.getMonth();
    main.innerHTML = `
      <div class="meinplan-wrap">
        <div class="kal-toolbar">
          <div class="kal-nav">
            <button class="btn btn-ghost" onclick="MEINPLAN.navigateMonth(-1)" aria-label="Vorheriger Monat">‹</button>
            <h2 class="kal-title">${MONATSNAMEN[m]} ${y}</h2>
            <button class="btn btn-ghost" onclick="MEINPLAN.navigateMonth(1)" aria-label="Nächster Monat">›</button>
          </div>
          <div class="kal-nav-right">
            <span class="meinplan-legend">
              <span class="meinplan-legend-pub">Teamplan</span>
              <span class="meinplan-legend-priv">Mein Plan</span>
            </span>
          </div>
        </div>
        <div id="meinplan-kal-container" class="meinplan-kal-container">
          <div class="kal-loading">Lade…</div>
        </div>
      </div>`;
    await _renderKal();
  }

  async function navigateMonth(dir) {
    kalMonth = new Date(kalMonth.getFullYear(), kalMonth.getMonth() + dir, 1);
    const main = document.getElementById('main-content');
    if (main) await _renderInMain(main);
  }

  // ── Kalender rendern ─────────────────────────────────────
  async function _renderKal() {
    const container = document.getElementById('meinplan-kal-container');
    if (!container) return;

    const y = kalMonth.getFullYear();
    const m = kalMonth.getMonth();

    const firstDay  = new Date(y, m, 1);
    const dow0      = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(y, m, 1 - dow0);
    const lastDay   = new Date(y, m + 1, 0);
    const dowLast   = (lastDay.getDay() + 6) % 7;
    const gridEnd   = new Date(y, m + 1, 6 - dowLast);

    const todayKey = ymd(new Date());

    let oeffentlich = [], privat = [], feiertage = [];
    try {
      const [d1, d2] = await Promise.all([
        apiGet(`mein-plan/einheiten?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true }),
        apiGet(`feiertage?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true }).catch(() => ({ feiertage: [] })),
      ]);
      oeffentlich = d1.einheiten || [];
      privat      = d1.privat    || [];
      feiertage   = d2.feiertage || [];
    } catch (_) { /* ignorieren */ }

    const byDate = {};
    oeffentlich.forEach(e => { (byDate[e.datum] = byDate[e.datum] || []).push({ ...e, _privat: false }); });
    privat.forEach(e =>      { (byDate[e.datum] = byDate[e.datum] || []).push({ ...e, _privat: true  }); });
    Object.values(byDate).forEach(arr =>
      arr.sort((a, b) => {
        if (a._privat !== b._privat) return a._privat ? 1 : -1;
        return (a.uhrzeit || '99:99').localeCompare(b.uhrzeit || '99:99');
      })
    );

    const feiertageByDate = {};
    feiertage.forEach(f => {
      const start = new Date(f.datum + 'T00:00:00');
      const end   = new Date((f.datum_bis || f.datum) + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = ymd(d);
        (feiertageByDate[k] = feiertageByDate[k] || []).push(f);
      }
    });

    // Wochen berechnen (für KW-Spalte)
    const weeks = [];
    {
      let cur = new Date(gridStart);
      while (cur <= gridEnd) {
        const weekStart = new Date(cur);
        const dates = [];
        for (let i = 0; i < 7; i++) {
          dates.push(ymd(new Date(cur)));
          cur.setDate(cur.getDate() + 1);
        }
        const kw = _isoWeek(weekStart);
        const kmSum = dates.reduce((sum, d) => {
          return sum + (byDate[d] || [])
            .filter(e => e._privat && e.distanz_km != null)
            .reduce((s, e) => s + parseFloat(e.distanz_km), 0);
        }, 0);
        weeks.push({ dates, kw, kmSum: Math.round(kmSum * 10) / 10 });
      }
    }

    // Header (KW-Zelle + 7 Wochentage)
    const head = `<div class="kal-head meinplan-kal-head">
      <div class="kal-head-cell meinplan-kw-head-cell">KW</div>
      ${WOCHENTAGE.map(w => `<div class="kal-head-cell">${w}</div>`).join('')}
    </div>`;

    // Zeilen
    const rows = weeks.map(({ dates, kw, kmSum }) => {
      const hasKm = kmSum > 0;
      const kmStr = kmSum % 1 === 0 ? String(kmSum) : kmSum.toFixed(1);
      const kwCell = `<div class="meinplan-kw-cell">
        <span class="meinplan-kw-num">KW&nbsp;${kw}</span>
        <span class="meinplan-kw-km${hasKm ? ' has-km' : ''}">${hasKm ? kmStr + '&thinsp;km' : '–'}</span>
      </div>`;

      const cells = dates.map(k => {
        const d = new Date(k + 'T00:00:00');
        const inMonth = d.getMonth() === m;
        const isToday = k === todayKey;
        const items   = byDate[k] || [];
        const ferien  = feiertageByDate[k] || [];

        const dayCls = ['kal-cell',
          inMonth ? 'in-month' : 'out-month',
          isToday ? 'is-today' : '',
          (d.getDay() === 0 || d.getDay() === 6) ? 'weekend' : '',
          ferien.length ? 'is-feiertag' : '',
        ].filter(Boolean).join(' ');

        const ferienHtml = ferien.map(f => {
          const s = f.farbe ? ` style="background:${escapeHtml(f.farbe)};color:#fff"` : '';
          return `<div class="kal-feiertag"${s}>${escapeHtml(f.titel)}</div>`;
        }).join('');

        const itemsHtml = items.map(e => {
          if (e._privat) {
            const cls = `kal-item kal-typ-${e.typ} is-privat`;
            const kmBadge = e.distanz_km != null
              ? `<span class="kal-item-km">${+e.distanz_km % 1 === 0 ? +e.distanz_km : (+e.distanz_km).toFixed(1)}&thinsp;km</span>`
              : '';
            return `<div class="${cls}" data-privat-id="${e.id}"
                         onclick="MEINPLAN.bearbeitePrivat(${e.id})"
                         title="${escapeHtml(e.titel)}">
              <span class="kal-item-title">${escapeHtml(e.titel)}</span>
              ${kmBadge}
              <button class="kal-item-del" onclick="event.stopPropagation();MEINPLAN.loeschePrivat(${e.id})" title="Löschen">×</button>
            </div>`;
          }
          const cls = `kal-item kal-typ-${e.typ}${e.status === 'abgesagt' ? ' is-cancelled' : ''}`;
          return `<div class="${cls}" data-einheit-id="${e.id}" title="${escapeHtml(e.titel)}">
            ${e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : ''}
            <span class="kal-item-title">${escapeHtml(e.titel)}</span>
          </div>`;
        }).join('');

        const addBtn = inMonth
          ? `<button class="kal-add-btn" onclick="MEINPLAN.neuePrivatEinheit('${k}')" title="Private Einheit hinzufügen">+</button>`
          : '';

        return `<div class="${dayCls}" data-datum="${k}">
          <div class="kal-cell-head">
            <span class="kal-day-num">${d.getDate()}</span>
            ${addBtn}
          </div>
          ${ferienHtml ? `<div class="kal-feiertag-list">${ferienHtml}</div>` : ''}
          <div class="kal-cell-items">${itemsHtml}</div>
        </div>`;
      }).join('');

      return `<div class="kal-row meinplan-kal-row">${kwCell}${cells}</div>`;
    }).join('');

    container.innerHTML = `<div class="kal-grid meinplan-kal-grid">${head}${rows}</div>`;

    // Hover-Popover für öffentliche Einheiten
    KAL_POPOVER.initItems(
      container.querySelectorAll('.kal-item:not(.is-privat)[data-einheit-id]')
    );
  }

  function _isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // ── Neue private Einheit ─────────────────────────────────
  function neuePrivatEinheit(datum) {
    _openModal(null, datum);
  }

  async function bearbeitePrivat(id) {
    try {
      const data = await apiGet(`mein-plan/einheiten/${id}`, { silent: true });
      _openModal(data.einheit, null);
    } catch (e) {
      _notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function loeschePrivat(id) {
    if (!confirm('Private Einheit löschen?')) return;
    schliesseModal();
    const el = document.querySelector(`.kal-item[data-privat-id="${id}"]`);
    if (el) el.remove();
    try {
      await apiDel(`mein-plan/einheiten/${id}`);
      _notify('Gelöscht.', 'ok');
    } catch (e) {
      _notify('Fehler: ' + (e.message || ''), 'err');
    }
    _renderKal();
  }

  async function uebernehmenVonOeffentlich(einheitId) {
    KAL_POPOVER.hide();
    try {
      const data = await apiGet(`einheiten/${einheitId}`, { silent: true });
      const e = data.einheit;
      _openModal(null, e.datum, { titel: e.titel, typ: e.typ, ref_einheit_id: e.id });
    } catch (err) {
      _notify('Fehler: ' + (err.message || ''), 'err');
    }
  }

  function _openModal(einheit, datum, prefill) {
    const typenCfg = (appConfig && Array.isArray(appConfig.typen) && appConfig.typen.length)
      ? appConfig.typen
      : [
          { slug: 'dauerlauf',     bezeichnung: 'Dauerlauf' },
          { slug: 'intervall',     bezeichnung: 'Intervall' },
          { slug: 'funktionell',   bezeichnung: 'Funktionelles Training' },
          { slug: 'runde',         bezeichnung: 'Runde / Strecke' },
          { slug: 'event',         bezeichnung: 'Event / Wettkampf' },
          { slug: 'frei',          bezeichnung: 'Sonstiges' },
          { slug: 'kein_training', bezeichnung: 'Kein Training' },
        ];

    const isNew   = !einheit;
    const e       = einheit || {};
    const d_datum = datum || e.datum || ymd(new Date());
    const d_typ   = prefill?.typ   || e.typ   || 'dauerlauf';
    const d_titel = prefill?.titel || e.titel || '';
    const d_km    = e.distanz_km != null ? e.distanz_km : '';
    const d_bem   = e.bemerkung   || '';
    const d_ref   = prefill?.ref_einheit_id || e.ref_einheit_id || '';

    const typOptionen = typenCfg.map(t =>
      `<option value="${escapeHtml(t.slug)}"${t.slug === d_typ ? ' selected' : ''}>${escapeHtml(t.bezeichnung)}</option>`
    ).join('');

    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Mein Trainingsplan</div>
              <div class="modal-title">${isNew ? 'Neue Einheit' : escapeHtml(e.titel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            ${d_ref ? `<div class="meinplan-ref-hint">Aus dem Teamplan übernommen</div>` : ''}
            <div class="ed-grid">
              <div class="ed-fg">
                <label>Datum *</label>
                <input type="date" id="mp-datum" value="${escapeHtml(d_datum)}">
              </div>
              <div class="ed-fg">
                <label>Typ</label>
                <select id="mp-typ">${typOptionen}</select>
              </div>
              <div class="ed-fg ed-fg-wide">
                <label>Bezeichnung *</label>
                <input type="text" id="mp-titel" value="${escapeHtml(d_titel)}" placeholder="z.B. Dauerlauf 10 km">
              </div>
              <div class="ed-fg">
                <label>Distanz (km)</label>
                <input type="number" id="mp-km" value="${escapeHtml(String(d_km))}" min="0" max="999.9" step="0.1" placeholder="z.B. 10.5">
              </div>
              <div class="ed-fg ed-fg-wide">
                <label>Bemerkung</label>
                <textarea id="mp-bemerkung" rows="2">${escapeHtml(d_bem)}</textarea>
              </div>
            </div>
            <input type="hidden" id="mp-ref" value="${escapeHtml(String(d_ref))}">
            <div class="ed-footer">
              <span>${!isNew ? `<button class="btn btn-ghost" onclick="MEINPLAN.loeschePrivat(${e.id})">Löschen</button>` : ''}</span>
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" onclick="MEINPLAN.speichern(${isNew ? 'null' : e.id})">${isNew ? 'Hinzufügen' : 'Speichern'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function speichern(id) {
    const datum = document.getElementById('mp-datum')?.value || '';
    const titel = (document.getElementById('mp-titel')?.value || '').trim();
    if (!datum) { _notify('Bitte Datum angeben.', 'err'); return; }
    if (!titel) { _notify('Bitte Bezeichnung angeben.', 'err'); return; }

    const kmStr  = (document.getElementById('mp-km')?.value  || '').trim();
    const refStr = (document.getElementById('mp-ref')?.value || '').trim();
    const body = {
      datum,
      typ:            document.getElementById('mp-typ')?.value || 'dauerlauf',
      titel,
      distanz_km:     kmStr !== '' ? parseFloat(kmStr) : null,
      bemerkung:      (document.getElementById('mp-bemerkung')?.value || '').trim() || null,
      ref_einheit_id: refStr ? parseInt(refStr, 10) : null,
    };
    try {
      if (id) {
        await apiPut(`mein-plan/einheiten/${id}`, body);
        _notify('Gespeichert.', 'ok');
      } else {
        await apiPost('mein-plan/einheiten', body);
        _notify('Einheit hinzugefügt.', 'ok');
      }
      schliesseModal();
      _renderKal();
    } catch (e) {
      _notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function _notify(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) return;
    const cls = art === 'err' ? 'notif-err' : (art === 'warn' ? 'notif-warn' : 'notif-ok');
    const div = document.createElement('div');
    div.className = `notif ${cls}`;
    div.textContent = text;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  return {
    render, navigateMonth,
    neuePrivatEinheit, bearbeitePrivat, loeschePrivat,
    uebernehmenVonOeffentlich, speichern,
  };
})();
