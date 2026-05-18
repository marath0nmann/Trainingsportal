// ============================================================
// Trainingsportal – Planung (Split-View: Kalender + Blöcke per DnD)
// ============================================================
// Seite: #planung
//   - Links: Monatskalender mit bestehenden Einheiten (Nur-Lesen-Ansicht)
//   - Rechts: Trainingsblöcke als ziehbare Karten
//   - Block auf Kalendertag fallen lassen → öffnet "Block anwenden"-Dialog
//     mit vorausgefülltem Datum

const PLANUNG = (() => {
  let kalMonth = null; // Date: erster Tag des angezeigten Monats

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

    await Promise.all([renderKal(), ladeBlocke()]);
  }

  // ── Kalender ─────────────────────────────────────────────
  async function renderKal() {
    const col = document.getElementById('planung-kal-col');
    if (!col) return;

    const y = kalMonth.getFullYear();
    const m = kalMonth.getMonth();

    const firstDay = new Date(y, m, 1);
    const dow0 = (firstDay.getDay() + 6) % 7; // Mo=0
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

    let einheiten = [];
    try {
      const d = await apiGet(
        `einheiten?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`,
        { silent: true }
      );
      einheiten = d.einheiten || [];
    } catch (e) { /* Einheiten optional – Fehler ignorieren */ }

    const byDate = {};
    einheiten.forEach(e => {
      (byDate[e.datum] = byDate[e.datum] || []).push(e);
    });

    const head = `<div class="kal-head">${WOCHENTAGE.map(w =>
      `<div class="kal-head-cell">${w}</div>`).join('')}</div>`;

    const rows = [];
    let cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const k = ymd(cursor);
        const inMonth = cursor.getMonth() === m;
        const isToday = k === todayKey;
        const items = byDate[k] || [];

        const dayCls = [
          'kal-cell', 'planung-kal-cell',
          inMonth ? 'in-month' : 'out-month',
          isToday ? 'is-today' : '',
          (cursor.getDay() === 0 || cursor.getDay() === 6) ? 'weekend' : '',
        ].filter(Boolean).join(' ');

        const itemsHtml = items.map(e => {
          const cls = `kal-item kal-typ-${e.typ}${e.status === 'abgesagt' ? ' is-cancelled' : ''}`;
          return `<div class="${cls}" title="${escapeHtml(e.titel)}">
            ${e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : ''}
            <span class="kal-item-title">${escapeHtml(e.titel)}</span>
          </div>`;
        }).join('');

        cells.push(`
          <div class="${dayCls}" data-datum="${k}">
            <div class="kal-cell-head">
              <span class="kal-day-num">${cursor.getDate()}</span>
            </div>
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

    // Drop-Listener auf alle Tages-Zellen des aktuellen Monats
    document.querySelectorAll('.planung-kal-cell.in-month').forEach(cell => {
      const datum = cell.dataset.datum;
      cell.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        cell.classList.add('planung-drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('planung-drag-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('planung-drag-over');
        const blockId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!blockId) return;
        BLOECKE.anwenden(blockId, datum);
      });
    });
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
    const sortiert = [
      ...slugOrder.filter(s => gruppen[s]),
      ...Object.keys(gruppen).filter(s => !slugOrder.includes(s)).sort(),
    ];

    let html = '';
    sortiert.forEach(slug => {
      const typCfg = typenCfg.find(t => t.slug === slug);
      const label = typCfg ? typCfg.bezeichnung : slug;
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
      ? `<span class="block-sicht-badge block-sicht-privat">Privat</span>`
      : '';
    const editBtn = kannBearbeiten(b)
      ? `<button class="btn btn-ghost btn-sm pblock-edit-btn" onclick="event.stopPropagation();BLOECKE.bearbeiten(${b.id})" title="Block bearbeiten">✎</button>`
      : '';
    return `
      <div class="pblock-card block-typ-${escapeHtml(b.typ)}"
           draggable="true"
           data-block-id="${b.id}"
           title="${escapeHtml(b.titel)} – auf Kalendertag ziehen">
        <div class="pblock-drag-handle" aria-hidden="true">⠿</div>
        <div class="pblock-info">
          <div class="pblock-titel">${escapeHtml(b.titel)}</div>
          <div class="pblock-meta">${privBadge}</div>
        </div>
        ${editBtn}
      </div>`;
  }

  function reloadSidebar() {
    if (document.getElementById('planung-bloecke-list')) ladeBlocke();
  }

  return { render, navigateMonth, reloadSidebar };
})();
