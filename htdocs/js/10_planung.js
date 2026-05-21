// ============================================================
// Trainingsportal – Kalender-Hover-Popover (global)
// ============================================================
// Kann von 02_app.js (Hauptkalender) und PLANUNG (Planungskalender) genutzt werden.
// Voraussetzung: kal-item-Elemente haben data-einheit-id="…"

const KAL_POPOVER = (() => {
  let hideTimer = null;
  let currentId = null;

  function initItems(items) {
    items.forEach(item => {
      item.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
        const id = parseInt(item.dataset.einheitId, 10);
        if (!id) return;
        _show(id, item);
      });
      item.addEventListener('mouseleave', () => {
        hideTimer = setTimeout(_hide, 180);
      });
    });
  }

  function _getPop() {
    let pop = document.getElementById('kal-popover');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'kal-popover';
      pop.className = 'kal-popover';
      pop.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      pop.addEventListener('mouseleave', () => { hideTimer = setTimeout(_hide, 180); });
      document.body.appendChild(pop);
    }
    return pop;
  }

  async function _show(einheitId, anchorEl) {
    const pop = _getPop();
    pop.innerHTML = `<div class="kal-pop-loading">…</div>`;
    pop.style.display = 'block';
    _position(pop, anchorEl.getBoundingClientRect());

    if (currentId === einheitId) return;
    currentId = einheitId;

    try {
      const data = await apiGet(`einheiten/${einheitId}`, { silent: true });
      if (currentId !== einheitId) return; // Maus bereits woanders

      const e    = data.einheit;
      const segs = data.segmente || [];

      // Pace-Daten laden (gecacht via PACE.load – kein spürbarer Overhead)
      let popPaceData = null;
      if (state.user && segs.some(s => s.pace_referenz)) {
        try { popPaceData = await PACE.load(); } catch (_) {}
      }
      if (currentId !== einheitId) return; // Maus bereits woanders (nach async)

      const typLabel  = _getTypLabel(e.typ);
      const metaParts = [];
      if (e.uhrzeit) metaParts.push(e.uhrzeit + ' Uhr');
      if (e.treffpunkt && e.treffpunkt.name) metaParts.push(e.treffpunkt.name);

      // Segmente: grafische Blöcke (renderSegmentBlocksHtml aus 02_app.js) statt Chips
      const segsHtml = segs.length
        ? (typeof renderSegmentBlocksHtml === 'function'
            ? `<div class="kal-pop-segs-blocks">${renderSegmentBlocksHtml(segs, popPaceData, e.typ)}</div>`
            : `<div class="kal-pop-segs">${segs.map(s => {
                const wdh = s.wiederholungen > 1 ? s.wiederholungen + '×' : '';
                return `<span class="kal-pop-seg">${wdh}${s.distanz_m} m</span>`;
              }).join('')}</div>`)
        : '';

      // Kontext-Buttons
      const hash           = location.hash || '';
      const onPlanung      = hash.startsWith('#planung');
      const onKalender     = hash === '' || hash === '#' || hash.startsWith('#kalender');
      const kannEdit       = onPlanung && state.user
        && (state.user.rolle === 'admin' || state.user.rolle === 'trainer');
      // Bereits übernommene Einheiten (data-is-adopted) zeigen keine Übernahme-Buttons
      const kannUebernehmen = onKalender && state.user && !anchorEl.dataset.isAdopted;

      // Daten für direktes Übernehmen serialisieren (kein zweiter API-Call nötig)
      const eJson = kannUebernehmen
        ? escapeHtml(JSON.stringify({ id: e.id, datum: e.datum, uhrzeit: e.uhrzeit || null, typ: e.typ, titel: e.titel }))
        : '';
      const segsJson = kannUebernehmen
        ? escapeHtml(JSON.stringify(segs.map(s => ({ wiederholungen: s.wiederholungen, distanz_m: s.distanz_m }))))
        : '';

      const aboAktiv = kannUebernehmen && MEINPLAN.istAboAktivFuerTyp(e.typ);
      const typEsc   = escapeHtml(e.typ);

      pop.innerHTML = `
        <div class="kal-pop-typ kal-typ-${typEsc}">${escapeHtml(typLabel)}</div>
        <div class="kal-pop-titel">${escapeHtml(e.titel)}</div>
        ${metaParts.length ? `<div class="kal-pop-meta">${metaParts.map(escapeHtml).join(' · ')}</div>` : ''}
        ${e.bemerkung ? `<div class="kal-pop-bemerkung">${escapeHtml(e.bemerkung)}</div>` : ''}
        ${segsHtml}
        ${kannUebernehmen ? `<div class="kal-pop-actions kal-pop-actions-col">
          <button class="btn btn-primary btn-sm"
            onclick="MEINPLAN.uebernehmenVonOeffentlich(${einheitId}, JSON.parse(this.dataset.e), JSON.parse(this.dataset.s))"
            data-e="${eJson}" data-s="${segsJson}">In meinen Plan</button>
          ${aboAktiv
            ? `<button class="btn btn-ghost btn-sm" onclick="MEINPLAN.aboDeaktivieren('${typEsc}')">Alle künftigen aus meinem Plan entfernen</button>`
            : `<button class="btn btn-ghost btn-sm" onclick="MEINPLAN.aboAktivieren('${typEsc}')">Alle künftigen in meinen Plan</button>`
          }
        </div>` : ''}
        ${kannEdit ? `<div class="kal-pop-actions">
          <button class="btn btn-primary btn-sm" onclick="PLANUNG.einheitBearbeiten(${einheitId})">Bearbeiten</button>
        </div>` : ''}`;

      _position(pop, anchorEl.getBoundingClientRect());
    } catch (_) {
      pop.style.display = 'none';
      currentId = null;
    }
  }

  function _position(pop, rect) {
    const popW   = 244;
    const margin = 10;
    const viewW  = window.innerWidth;
    const viewH  = window.innerHeight;
    let left = rect.right + margin;
    if (left + popW > viewW - margin) left = rect.left - popW - margin;
    if (left < margin) left = margin;
    let top = rect.top;
    const popH = pop.offsetHeight || 160;
    if (top + popH > viewH - margin) top = Math.max(margin, viewH - popH - margin);
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  }

  function _hide() {
    const pop = document.getElementById('kal-popover');
    if (pop) pop.style.display = 'none';
    currentId = null;
  }

  function _getTypLabel(slug) {
    const typen = (appConfig && Array.isArray(appConfig.typen) && appConfig.typen.length)
      ? appConfig.typen
      : [
          { slug: 'intervall',     bezeichnung: 'Intervall' },
          { slug: 'dauerlauf',     bezeichnung: 'Dauerlauf' },
          { slug: 'funktionell',   bezeichnung: 'Funktionelles Training' },
          { slug: 'runde',         bezeichnung: 'Runde / Strecke' },
          { slug: 'event',         bezeichnung: 'Event / Wettkampf' },
          { slug: 'frei',          bezeichnung: 'Sonstiges' },
          { slug: 'kein_training', bezeichnung: 'Kein Training' },
        ];
    const t = typen.find(x => x.slug === slug);
    return t ? t.bezeichnung : slug;
  }

  return { initItems, hide: _hide };
})();


// ============================================================
// Trainingsportal – Planung (Split-View: Kalender links + Blöcke rechts)
// ============================================================
const PLANUNG = (() => {
  let kalMonth = null;

  // ── Layout-Helpers (kein Seiten-Scroll) ─────────────────
  function _applyPlanungLayout() {
    // Inline-Styles mit !important überschreiben shared.php CSS zuverlässig
    document.body.style.setProperty('overflow', 'hidden', 'important');

    const screen = document.getElementById('app-screen');
    if (screen) {
      screen.style.setProperty('display',        'flex',    'important');
      screen.style.setProperty('flex-direction', 'column',  'important');
      screen.style.setProperty('height',         '100vh',   'important');
      screen.style.setProperty('overflow',       'hidden',  'important');
    }

    const main = document.getElementById('main-content');
    if (main) {
      main.style.setProperty('flex',       '1',       'important');
      main.style.setProperty('min-height', '0',       'important');
      main.style.setProperty('overflow',   'hidden',  'important');
      main.style.setProperty('padding',    '0',       'important');
    }

    const footer = document.getElementById('app-footer');
    if (footer) footer.style.setProperty('display', 'none', 'important');
  }

  function _clearPlanungLayout() {
    document.body.style.removeProperty('overflow');
    const screen = document.getElementById('app-screen');
    if (screen) {
      screen.style.removeProperty('display');
      screen.style.removeProperty('flex-direction');
      screen.style.removeProperty('height');
      screen.style.removeProperty('overflow');
    }
    const main = document.getElementById('main-content');
    if (main) {
      main.style.removeProperty('flex');
      main.style.removeProperty('min-height');
      main.style.removeProperty('overflow');
      main.style.removeProperty('padding');
    }
    const footer = document.getElementById('app-footer');
    if (footer) footer.style.removeProperty('display');
  }

  // ── Einstieg ─────────────────────────────────────────────
  async function render(main) {
    if (!kalMonth) {
      const now = new Date();
      kalMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    main.innerHTML = `
      <div class="planung-wrap">
        <div class="planung-split">
          <div class="planung-kal-col" id="planung-kal-col">
            <div class="planung-kal-loading">Lade Kalender…</div>
          </div>
          <aside class="planung-sidebar" id="planung-sidebar">
            <div class="planung-sidebar-head">
              <div class="planung-sidebar-head-top">
                <span class="planung-sidebar-title">Trainingsblöcke</span>
                ${state.user && (state.user.rolle === 'admin' || state.user.rolle === 'trainer')
                  ? `<button class="btn btn-primary btn-sm" onclick="BLOECKE.neuerBlock()">+ Neu</button>`
                  : ''}
              </div>
              <span class="planung-sidebar-hint">Auf einen Kalendertag ziehen</span>
            </div>
            <div id="planung-bloecke-list" class="planung-bloecke-loading">Lade…</div>
          </aside>
        </div>
      </div>`;

    // Layout einfrieren: kein Seiten-Scroll, Wrap füllt genau den verbleibenden Raum
    _applyPlanungLayout();
    window.addEventListener('resize', _applyPlanungLayout);
    const _offPlanung = () => {
      if (!(location.hash || '').startsWith('#planung')) {
        _clearPlanungLayout();
        window.removeEventListener('resize', _applyPlanungLayout);
        window.removeEventListener('hashchange', _offPlanung);
      }
    };
    window.addEventListener('hashchange', _offPlanung);

    await Promise.all([renderKal(), ladeBlocke()]);
  }

  // ── Kalender ─────────────────────────────────────────────
  async function renderKal() {
    const col = document.getElementById('planung-kal-col');
    if (!col) return;

    const y = kalMonth.getFullYear();
    const m = kalMonth.getMonth();

    const firstDay  = new Date(y, m, 1);
    const dow0      = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(y, m, 1 - dow0);

    const lastDay = new Date(y, m + 1, 0);
    const dowLast = (lastDay.getDay() + 6) % 7;
    const gridEnd = new Date(y, m + 1, 6 - dowLast);

    const todayKey = ymd(new Date());

    col.innerHTML = `
      <div class="planung-kal-toolbar">
        <button class="btn btn-ghost" onclick="PLANUNG.navigateMonth(-1)" aria-label="Vorheriger Monat">‹</button>
        <h2 class="planung-kal-title">${MONATSNAMEN[m]} ${y}</h2>
        <button class="btn btn-ghost" onclick="PLANUNG.navigateMonth(1)" aria-label="Nächster Monat">›</button>
      </div>
      <div id="planung-kal-grid" class="planung-kal-loading">Lade…</div>`;

    let einheiten = [], feiertage = [];
    try {
      const [d1, d2] = await Promise.all([
        apiGet(`einheiten?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true }),
        apiGet(`feiertage?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true }).catch(() => ({ feiertage: [] })),
      ]);
      einheiten = d1.einheiten || [];
      feiertage = d2.feiertage || [];
    } catch (e) { /* ignorieren */ }

    const byDate = {};
    einheiten.forEach(e => { (byDate[e.datum] = byDate[e.datum] || []).push(e); });

    const feiertageByDate = {};
    feiertage.forEach(f => {
      const start = new Date(f.datum + 'T00:00:00');
      const end   = new Date((f.datum_bis || f.datum) + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = ymd(d);
        (feiertageByDate[k] = feiertageByDate[k] || []).push(f);
      }
    });

    const head = `<div class="kal-head">${WOCHENTAGE.map(w =>
      `<div class="kal-head-cell">${w}</div>`).join('')}</div>`;

    const rows = [];
    let cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const k        = ymd(cursor);
        const inMonth  = cursor.getMonth() === m;
        const isToday  = k === todayKey;
        const items    = byDate[k] || [];
        const ferien   = feiertageByDate[k] || [];

        const dayCls = [
          'kal-cell', 'planung-kal-cell',
          inMonth ? 'in-month' : 'out-month',
          isToday ? 'is-today' : '',
          (cursor.getDay() === 0 || cursor.getDay() === 6) ? 'weekend' : '',
          ferien.length ? 'is-feiertag' : '',
        ].filter(Boolean).join(' ');

        const ferienHtml = ferien.map(f => {
          const farbeStyle = f.farbe ? ` style="background:${escapeHtml(f.farbe)};color:#fff"` : '';
          return `<div class="kal-feiertag" title="${escapeHtml(f.titel)}"${farbeStyle}>${escapeHtml(f.titel)}</div>`;
        }).join('');

        const kannEdit = state.user && (state.user.rolle === 'admin' || state.user.rolle === 'trainer');
        const itemsHtml = items.map(e => {
          const cls    = `kal-item kal-typ-${e.typ}${e.status === 'abgesagt' ? ' is-cancelled' : ''}`;
          const delBtn = kannEdit
            ? `<button class="kal-item-del" onclick="event.stopPropagation();PLANUNG.loescheEinheit(${e.id})" title="Eintrag löschen">×</button>`
            : '';
          return `<div class="${cls}" data-einheit-id="${e.id}" draggable="${kannEdit}" title="${escapeHtml(e.titel)}">
            ${e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : ''}
            <span class="kal-item-title">${escapeHtml(e.titel)}</span>
            ${delBtn}
          </div>`;
        }).join('');

        cells.push(`
          <div class="${dayCls}" data-datum="${k}">
            <div class="kal-cell-head"><span class="kal-day-num">${cursor.getDate()}</span></div>
            ${ferienHtml ? `<div class="kal-feiertag-list">${ferienHtml}</div>` : ''}
            <div class="kal-cell-items">
              ${itemsHtml}
              ${inMonth ? '<div class="planung-drop-hint">Hier ablegen</div>' : ''}
            </div>
          </div>`);
        cursor.setDate(cursor.getDate() + 1);
      }
      rows.push(`<div class="kal-row">${cells.join('')}</div>`);
    }

    const grid = document.getElementById('planung-kal-grid');
    if (grid) {
      grid.outerHTML = `<div id="planung-kal-grid" class="kal-grid">${head}${rows.join('')}</div>`;
    }

    // DnD: Drag von Kalender-Einheiten
    document.querySelectorAll('.planung-kal-cell .kal-item[draggable="true"]').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.setData('text/x-einheit-id', item.dataset.einheitId);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('kal-item-dragging');
        KAL_POPOVER.hide();
      });
      item.addEventListener('dragend', () => item.classList.remove('kal-item-dragging'));
    });

    // DnD: Drop auf Tages-Zellen
    document.querySelectorAll('.planung-kal-cell.in-month').forEach(cell => {
      const datum = cell.dataset.datum;
      cell.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes('text/x-einheit-id') ? 'move' : 'copy';
        cell.classList.add('planung-drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('planung-drag-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('planung-drag-over');
        const einheitId = parseInt(e.dataTransfer.getData('text/x-einheit-id') || '', 10);
        if (einheitId) { verschiebeEinheit(einheitId, datum); return; }
        const blockId = parseInt(e.dataTransfer.getData('text/plain') || '', 10);
        if (blockId) BLOECKE.anwenden(blockId, datum);
      });
    });

    // Hover-Popover
    KAL_POPOVER.initItems(document.querySelectorAll('.planung-kal-cell .kal-item[data-einheit-id]'));
  }

  function navigateMonth(dir) {
    kalMonth = new Date(kalMonth.getFullYear(), kalMonth.getMonth() + dir, 1);
    renderKal();
  }

  // ── Sidebar: Blöcke ──────────────────────────────────────
  async function ladeBlocke() {
    const cont = document.getElementById('planung-bloecke-list');
    if (!cont) return;
    try {
      const data = await apiGet('bloecke', { silent: true });
      renderSidebar(data.bloecke || []);
    } catch (e) {
      cont.innerHTML = `<div class="bloecke-leer bloecke-error">Fehler: ${escapeHtml(e.message || '')}</div>`;
    }
  }

  function renderSidebar(bloecke) {
    const cont = document.getElementById('planung-bloecke-list');
    if (!cont) return;

    if (!bloecke.length) {
      cont.innerHTML = `<div class="bloecke-leer">Keine Trainingsblöcke vorhanden.</div>`;
      return;
    }

    const typenCfg = (appConfig && Array.isArray(appConfig.typen) && appConfig.typen.length)
      ? appConfig.typen
      : [
          { slug: 'intervall',     bezeichnung: 'Intervall' },
          { slug: 'dauerlauf',     bezeichnung: 'Dauerlauf' },
          { slug: 'funktionell',   bezeichnung: 'Funktionelles Training' },
          { slug: 'runde',         bezeichnung: 'Runde / Strecke' },
          { slug: 'event',         bezeichnung: 'Event / Wettkampf' },
          { slug: 'frei',          bezeichnung: 'Sonstiges' },
          { slug: 'kein_training', bezeichnung: 'Kein Training' },
        ];

    const gruppen = {};
    bloecke.forEach(b => {
      const slug = b.typ || 'frei';
      (gruppen[slug] = gruppen[slug] || []).push(b);
    });

    const slugOrder = typenCfg.map(t => t.slug);
    const sortiert  = [
      ...slugOrder.filter(s => gruppen[s]),
      ...Object.keys(gruppen).filter(s => !slugOrder.includes(s)).sort(),
    ];

    let html = '';
    sortiert.forEach(slug => {
      const typCfg = typenCfg.find(t => t.slug === slug);
      const label  = typCfg ? typCfg.bezeichnung : slug;
      html += `<div class="pblock-gruppe">
        <div class="pblock-gruppe-titel block-typ-${escapeHtml(slug)}">${escapeHtml(label)}</div>
        ${gruppen[slug].map(renderPBlockCard).join('')}
      </div>`;
    });

    cont.innerHTML = html;

    cont.querySelectorAll('.pblock-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', card.dataset.blockId);
        e.dataTransfer.effectAllowed = 'copy';
        card.classList.add('pblock-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('pblock-dragging'));
    });
  }

  function kannBearbeiten(b) {
    if (!state.user) return false;
    if (state.user.rolle === 'admin' || state.user.rolle === 'trainer') return true;
    return b.sichtbarkeit === 'privat' && b.erstellt_von === state.user.id;
  }

  function renderPBlockCard(b) {
    const privBadge = b.sichtbarkeit === 'privat'
      ? `<span class="block-sicht-badge block-sicht-privat">Privat</span>` : '';
    const editBtn = kannBearbeiten(b)
      ? `<button class="btn btn-ghost btn-sm pblock-edit-btn" onclick="event.stopPropagation();BLOECKE.bearbeiten(${b.id})" title="Block bearbeiten">✎</button>`
      : '';
    return `
      <div class="pblock-card block-typ-${escapeHtml(b.typ)}"
           draggable="true" data-block-id="${b.id}"
           title="${escapeHtml(b.titel)} – auf Kalendertag ziehen">
        <div class="pblock-drag-handle" aria-hidden="true">⠿</div>
        <div class="pblock-info">
          <div class="pblock-titel">${escapeHtml(b.titel)}</div>
          <div class="pblock-meta">${privBadge}</div>
        </div>
        ${editBtn}
      </div>`;
  }

  // ── Einheit verschieben ───────────────────────────────────
  async function verschiebeEinheit(einheitId, neuesDatum) {
    const el        = document.querySelector(`.kal-item[data-einheit-id="${einheitId}"]`);
    const zielItems = document.querySelector(`.planung-kal-cell[data-datum="${neuesDatum}"] .kal-cell-items`);
    if (el && zielItems) {
      const hint = zielItems.querySelector('.planung-drop-hint');
      hint ? zielItems.insertBefore(el, hint) : zielItems.appendChild(el);
    }
    try {
      const data = await apiGet(`einheiten/${einheitId}`, { silent: true });
      const e = data.einheit;
      if (e.datum === neuesDatum) return;
      await apiPut(`einheiten/${einheitId}`, {
        datum: neuesDatum, uhrzeit: e.uhrzeit || null, typ: e.typ || 'frei',
        titel: e.titel, treffpunkt_id: e.treffpunkt_id || null,
        bemerkung: e.bemerkung || null, sichtbarkeit: e.sichtbarkeit || 'oeffentlich',
        status: e.status || 'geplant',
      });
      notify('Training verschoben.', 'ok');
    } catch (err) {
      notify('Fehler: ' + (err.message || ''), 'err');
      renderKal();
    }
  }

  // ── Einheit löschen ───────────────────────────────────────
  async function loescheEinheit(einheitId) {
    if (!confirm('Diesen Kalendereintrag löschen?\nDer Trainingsblock bleibt erhalten.')) return;
    const el = document.querySelector(`.kal-item[data-einheit-id="${einheitId}"]`);
    if (el) el.remove();
    try {
      await apiDel(`einheiten/${einheitId}`);
      notify('Eintrag gelöscht.', 'ok');
    } catch (err) {
      notify('Fehler: ' + (err.message || ''), 'err');
      renderKal();
    }
  }

  // ── Einheit bearbeiten (aus Popover) ─────────────────────
  async function einheitBearbeiten(einheitId) {
    KAL_POPOVER.hide();
    let einheitData, tpListe;
    try {
      [einheitData, tpListe] = await Promise.all([
        apiGet(`einheiten/${einheitId}`, { silent: true }),
        TREFFPUNKTE.laden(),
      ]);
    } catch (e) { notify('Fehler: ' + (e.message || ''), 'err'); return; }

    const e = einheitData.einheit;
    const tpOptionen = `<option value="">— kein Treffpunkt —</option>` +
      tpListe.map(t =>
        `<option value="${t.id}"${e.treffpunkt && e.treffpunkt.id === t.id ? ' selected' : ''}>${escapeHtml(t.name)}</option>`
      ).join('');

    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Kalendereintrag bearbeiten</div>
              <div class="modal-title">${escapeHtml(e.titel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <div class="ed-grid">
              <div class="ed-fg">
                <label>Datum *</label>
                <input type="date" id="edit-e-datum" value="${e.datum}">
              </div>
              <div class="ed-fg">
                <label>Uhrzeit</label>
                <input type="time" id="edit-e-uhrzeit" value="${e.uhrzeit || ''}">
              </div>
              <div class="ed-fg">
                <label>Treffpunkt</label>
                <select id="edit-e-treffpunkt-id">${tpOptionen}</select>
              </div>
              <div class="ed-fg">
                <label>Sichtbarkeit</label>
                <select id="edit-e-sichtbarkeit">
                  <option value="oeffentlich"${e.sichtbarkeit === 'oeffentlich' ? ' selected' : ''}>Öffentlich</option>
                  <option value="intern"${e.sichtbarkeit === 'intern' ? ' selected' : ''}>Intern</option>
                </select>
              </div>
            </div>
            <div class="ed-footer">
              <span></span>
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" onclick="PLANUNG.einheitBearbeitenSpeichern(${einheitId})">Speichern</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function einheitBearbeitenSpeichern(einheitId) {
    const datum = document.getElementById('edit-e-datum')?.value || '';
    if (!datum) { notify('Datum fehlt.', 'err'); return; }
    const tpIdStr = document.getElementById('edit-e-treffpunkt-id')?.value || '';
    try {
      const data = await apiGet(`einheiten/${einheitId}`, { silent: true });
      const e = data.einheit;
      await apiPut(`einheiten/${einheitId}`, {
        datum,
        uhrzeit:       document.getElementById('edit-e-uhrzeit')?.value || null,
        typ:           e.typ       || 'frei',
        titel:         e.titel,
        treffpunkt_id: tpIdStr !== '' ? parseInt(tpIdStr, 10) : null,
        bemerkung:     e.bemerkung || null,
        sichtbarkeit:  document.getElementById('edit-e-sichtbarkeit')?.value || 'oeffentlich',
        status:        e.status    || 'geplant',
      });
      schliesseModal();
      notify('Eintrag aktualisiert.', 'ok');
      if ((location.hash || '').startsWith('#planung')) {
        renderKal();
      } else {
        renderPage(); // Hauptkalender neu laden
      }
    } catch (err) {
      notify('Fehler: ' + (err.message || ''), 'err');
    }
  }

  function reloadSidebar() {
    if (document.getElementById('planung-bloecke-list')) ladeBlocke();
  }

  function notify(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) { console.log(text); return; }
    const cls = art === 'err' ? 'notif-err' : (art === 'warn' ? 'notif-warn' : 'notif-ok');
    const div = document.createElement('div');
    div.className = `notif ${cls}`;
    div.textContent = text;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  return {
    render, navigateMonth, reloadSidebar, loescheEinheit,
    einheitBearbeiten, einheitBearbeitenSpeichern,
    reloadKal: renderKal,
  };
})();
