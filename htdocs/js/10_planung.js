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

      const isAdopted       = !!anchorEl.dataset.isAdopted;
      const privatId        = anchorEl.dataset.privatId ? parseInt(anchorEl.dataset.privatId, 10) : null;
      // kannUebernehmen: noch nicht übernommen → „In meinen Plan"-Button
      const kannUebernehmen = onKalender && !!state.user && !isAdopted;
      // kannEntfernen: bereits übernommen → „Aus meinem Plan entfernen"-Button
      const kannEntfernen   = onKalender && !!state.user && isAdopted && !!privatId;
      const zeigeAktionen   = kannUebernehmen || kannEntfernen;

      // Daten für direktes Übernehmen serialisieren (kein zweiter API-Call nötig)
      const eJson = kannUebernehmen
        ? escapeHtml(JSON.stringify({ id: e.id, datum: e.datum, uhrzeit: e.uhrzeit || null, typ: e.typ, titel: e.titel }))
        : '';
      const segsJson = kannUebernehmen
        ? escapeHtml(JSON.stringify(segs.map(s => ({ wiederholungen: s.wiederholungen, distanz_m: s.distanz_m, pause_m: s.pause_m ?? null }))))
        : '';

      const aboAktiv = zeigeAktionen && MEINPLAN.istAboAktivFuerTyp(e.typ);
      const typEsc   = escapeHtml(e.typ);

      pop.innerHTML = `
        <div class="kal-pop-typ kal-typ-${typEsc}">${escapeHtml(typLabel)}</div>
        <div class="kal-pop-titel">${escapeHtml(e.titel)}</div>
        ${metaParts.length ? `<div class="kal-pop-meta">${metaParts.map(escapeHtml).join(' · ')}</div>` : ''}
        ${e.bemerkung ? `<div class="kal-pop-bemerkung">${escapeHtml(e.bemerkung)}</div>` : ''}
        ${segsHtml}
        ${zeigeAktionen ? `<div class="kal-pop-actions kal-pop-actions-col">
          ${kannUebernehmen ? `<button class="btn btn-primary btn-sm"
            onclick="MEINPLAN.uebernehmenVonOeffentlich(${einheitId}, JSON.parse(this.dataset.e), JSON.parse(this.dataset.s))"
            data-e="${eJson}" data-s="${segsJson}">In meinen Plan</button>` : ''}
          ${kannEntfernen ? `<button class="btn btn-ghost btn-sm"
            onclick="KAL_POPOVER.hide(); MEINPLAN.loeschePrivat(${privatId})">Aus meinem Plan entfernen</button>` : ''}
          <label class="kal-pop-abo-label">
            <input type="checkbox" class="kal-pop-abo-cb" ${aboAktiv ? 'checked' : ''}
              onchange="MEINPLAN.aboToggle('${typEsc}', this.checked, this)">
            <span>${escapeHtml(typLabel)} abonnieren</span>
          </label>
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

  // _getTypLabel: delegiert an globales getTypLabel() aus 02_app.js
  function _getTypLabel(slug) { return getTypLabel(slug); }

  return { initItems, hide: _hide };
})();


// ============================================================
// Trainingsportal – Planung (Split-View: Kalender links + Blöcke rechts)
// ============================================================
const PLANUNG = (() => {
  let kalMonth        = null;
  let aktivGruppe     = null;   // { id, name } oder null (= ungefiltert)
  let _gruppen        = [];     // konfigurierte Gruppen des Trainers (sichtbar in Tabs)
  let _alleGruppen    = [];     // alle verfügbaren Gruppen (für Konfiguration)
  let _gruppenGeladen = false;  // true nach erstem Laden – verhindert erneutes Laden nach leerem Speichern
  let _activeTab           = 'training'; // 'training' | 'wettkampf'
  let _wettkampfSerienCache = null;      // { ts: number, serien: [] } – 5-Min-Cache

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

    const istTrainer = state.user && (state.user.rolle === 'admin' || state.user.rolle === 'trainer');

    // Gruppen-Konfiguration laden (nur beim ersten Aufruf, nicht nach leerem Speichern)
    if (istTrainer && !_gruppenGeladen) {
      try {
        let konfiguriert = false;
        [_alleGruppen, _gruppen] = await Promise.all([
          GRUPPEN.laden(),
          apiGet('planung/gruppen-prefs', { silent: true }).then(d => {
            konfiguriert = d.konfiguriert || false;
            const ids    = d.gruppen_ids || [];
            return GRUPPEN.laden().then(alle => alle.filter(g => ids.includes(g.id)));
          }),
        ]);
        // Erster Start (noch nie konfiguriert): falls nur eine Gruppe → vorauswählen
        if (!konfiguriert && !_gruppen.length && _alleGruppen.length === 1) {
          _gruppen = [_alleGruppen[0]];
        }
        // Aktive Gruppe aus den konfigurierten wählen
        if (_gruppen.length && !aktivGruppe) {
          aktivGruppe = _gruppen[0];
        }
      } catch (_) {}
      _gruppenGeladen = true;
    }

    main.innerHTML = `
      <div class="planung-wrap">
        ${istTrainer ? _renderGruppenTabs() : ''}
        <div class="planung-split">
          <div class="planung-kal-col" id="planung-kal-col">
            <div class="planung-kal-loading">Lade Kalender…</div>
          </div>
          <aside class="planung-sidebar" id="planung-sidebar">
            <div class="planung-sidebar-head">
              <div class="planung-sidebar-head-top">
                <span class="planung-sidebar-title">${_activeTab === 'wettkampf' ? 'Wettkämpfe' : 'Trainingsblöcke'}</span>
                ${istTrainer && _activeTab !== 'wettkampf'
                  ? `<button class="btn btn-primary btn-sm" onclick="BLOECKE.neuerBlock()">+ Neu</button>`
                  : ''}
              </div>
              <span class="planung-sidebar-hint">${_activeTab === 'wettkampf' ? 'Auf Datum ziehen zum Verschieben' : 'Auf einen Kalendertag ziehen'}</span>
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

    await Promise.all([
      _activeTab === 'wettkampf' ? renderKalWettkampf() : renderKal(),
      _activeTab === 'wettkampf' ? renderSidebarWettkampf() : ladeBlocke(),
    ]);
  }

  // ── Gruppen-Tabs ──────────────────────────────────────────
  function _renderGruppenTabs() {
    const wkAktiv = _activeTab === 'wettkampf' ? ' planung-tab-aktiv' : '';
    const wkTab   = `<button class="planung-tab${wkAktiv}" data-tab="wettkampf"
      onclick="PLANUNG.wechsleTab('wettkampf')" title="Wettkampf-Planung">🏆&nbsp;Wettkämpfe</button>`;

    if (!_gruppen.length) {
      return `<div class="planung-gruppen-bar">
        <span class="planung-gruppen-hint">Kein Gruppenfilter aktiv –</span>
        <button class="btn btn-ghost btn-sm" onclick="PLANUNG.gruppenKonfigurieren()">Gruppen auswählen</button>
        <span class="planung-gruppen-sep"></span>
        ${wkTab}
      </div>`;
    }
    const tabs = _gruppen.map(g => {
      const aktiv = _activeTab === 'training' && aktivGruppe && aktivGruppe.id === g.id ? ' planung-tab-aktiv' : '';
      return `<button class="planung-tab${aktiv}" data-tab="training" onclick="PLANUNG.gruppeWechseln(${g.id})">${escapeHtml(g.name)}</button>`;
    }).join('');
    return `<div class="planung-gruppen-bar">
      ${tabs}
      <button class="planung-tab planung-tab-config" onclick="PLANUNG.gruppenKonfigurieren()" title="Gruppen konfigurieren">⚙</button>
      <span class="planung-gruppen-sep"></span>
      ${wkTab}
    </div>`;
  }

  function gruppeWechseln(gruppeId) {
    const g = _gruppen.find(g => g.id === gruppeId);
    if (!g) return;
    aktivGruppe   = g;
    _activeTab    = 'training';
    // Tabs + Sidebar-Kopf neu rendern
    const bar = document.querySelector('.planung-gruppen-bar');
    if (bar) bar.outerHTML = _renderGruppenTabs();
    _aktualisiereSidebarKopf();
    // Kalender und Sidebar neu laden
    renderKal();
    ladeBlocke();
  }

  // Gruppen-Konfiguration: Trainer wählt, welche Gruppen er sieht
  async function gruppenKonfigurieren() {
    if (!_alleGruppen.length) {
      try { _alleGruppen = await GRUPPEN.laden(); } catch (_) { _alleGruppen = []; }
    }
    if (!_alleGruppen.length) {
      alert('Keine Trainingsgruppen im System vorhanden (Statistikportal).');
      return;
    }
    const ausgewaehlt = new Set(_gruppen.map(g => g.id));
    const cont = document.getElementById('modal-container');
    const checks = _alleGruppen.map(g => {
      const chk = ausgewaehlt.has(g.id) ? ' checked' : '';
      return `<label class="profil-gruppe-item">
        <input type="checkbox" class="pg-cfg-cb" value="${g.id}"${chk}>
        <span>${escapeHtml(g.name)}</span>
      </label>`;
    }).join('');
    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div><div class="modal-eyebrow">Planungsansicht</div><div class="modal-title">Trainingsgruppen konfigurieren</div></div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <p class="profil-hint-global">Wähle die Gruppen, für die du Trainingspläne erstellst. Nur diese erscheinen als Tabs.</p>
            <div class="profil-gruppen-list">${checks}</div>
            <div class="modal-actions">
              <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
              <button class="btn btn-primary" onclick="PLANUNG.gruppenKonfigSpeichern()">Speichern</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function gruppenKonfigSpeichern() {
    const ids = [...document.querySelectorAll('.pg-cfg-cb:checked')]
      .map(cb => parseInt(cb.value, 10)).filter(id => id > 0);
    try {
      await apiPut('planung/gruppen-prefs', { gruppen_ids: ids });
      _gruppen = _alleGruppen.filter(g => ids.includes(g.id));
      if (!_gruppen.some(g => aktivGruppe && g.id === aktivGruppe.id)) {
        aktivGruppe = _gruppen[0] || null;
      }
      // Flag setzen BEVOR render() – sonst würde render() die Prefs neu laden
      // und die Auto-Select-Logik könnte leere Auswahl überschreiben
      _gruppenGeladen = true;
      schliesseModal();
      // Komplette Planungsansicht neu rendern (inkl. Tabs)
      const main = document.getElementById('main-content');
      if (main) await render(main);
    } catch (e) {
      alert('Fehler beim Speichern: ' + (e.message || ''));
    }
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
      // Kein Gruppenfilter → keine Einheiten laden (sicherstellen dass alle Einheiten zugeordnet sind)
      const feiertagePromise = apiGet(`feiertage?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true }).catch(() => ({ feiertage: [] }));
      if (aktivGruppe) {
        const [d1, d2] = await Promise.all([
          apiGet(`einheiten?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}&gruppe_id=${aktivGruppe.id}`, { silent: true }),
          feiertagePromise,
        ]);
        einheiten = d1.einheiten || [];
        feiertage = d2.feiertage || [];
      } else {
        feiertage = (await feiertagePromise).feiertage || [];
      }
    } catch (e) {
      // Nicht still verschlucken: leerer Kalender bei API-Fehler ist sonst nicht diagnostizierbar
      console.warn('Planung: Einheiten/Feiertage konnten nicht geladen werden –', e && e.message);
    }

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
        if (blockId) BLOECKE.anwenden(blockId, datum, aktivGruppe ? aktivGruppe.id : null);
      });
    });

    // Hover-Popover
    KAL_POPOVER.initItems(document.querySelectorAll('.planung-kal-cell .kal-item[data-einheit-id]'));
  }

  // ── Tab wechseln (Training ↔ Wettkämpfe) ─────────────────
  function wechsleTab(tab) {
    _activeTab = tab;
    // Tab-Bar neu zeichnen
    const bar = document.querySelector('.planung-gruppen-bar');
    if (bar) bar.outerHTML = _renderGruppenTabs();
    // Sidebar-Kopf anpassen
    _aktualisiereSidebarKopf();
    // Inhalt laden
    if (tab === 'wettkampf') {
      renderKalWettkampf();
      renderSidebarWettkampf();
    } else {
      renderKal();
      ladeBlocke();
    }
  }

  // Sidebar-Kopf (Titel, Hint, "+ Neu"-Button) anpassen
  function _aktualisiereSidebarKopf() {
    const head = document.querySelector('.planung-sidebar-head');
    if (!head) return;
    const istTrainer = state.user && (state.user.rolle === 'admin' || state.user.rolle === 'trainer');
    head.innerHTML = `
      <div class="planung-sidebar-head-top">
        <span class="planung-sidebar-title">${_activeTab === 'wettkampf' ? 'Wettkämpfe' : 'Trainingsblöcke'}</span>
        ${istTrainer && _activeTab !== 'wettkampf'
          ? `<button class="btn btn-primary btn-sm" onclick="BLOECKE.neuerBlock()">+ Neu</button>`
          : ''}
      </div>
      <span class="planung-sidebar-hint">${_activeTab === 'wettkampf' ? 'Auf Datum ziehen zum Verschieben' : 'Auf einen Kalendertag ziehen'}</span>`;
  }

  // ── Wettkampf-Kalender ────────────────────────────────────
  async function renderKalWettkampf() {
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
      <div id="planung-kal-grid" class="planung-kal-loading">Lade Wettkämpfe…</div>`;

    // Serien laden (gecacht)
    const serien = await _ladeWettkampfSerien();

    const von = ymd(gridStart);
    const bis = ymd(gridEnd);

    // Datum-Map aufbauen
    const wkByDate = {};
    if (typeof ADMIN_WETTKAMPF !== 'undefined') {
      serien.forEach(s => {
        if (s.aktiv === 0) return;
        const datum = s.naechstes_datum || ADMIN_WETTKAMPF.predictNextDate(s.letztes_datum);
        if (datum && datum >= von && datum <= bis) {
          (wkByDate[datum] = wkByDate[datum] || []).push(s);
        }
      });
    }

    const kannEdit = state.user && (state.user.rolle === 'admin' || state.user.rolle === 'trainer');
    const decFn    = typeof _decodeHtml === 'function' ? _decodeHtml : (s => s);

    const head = `<div class="kal-head">${WOCHENTAGE.map(w =>
      `<div class="kal-head-cell">${w}</div>`).join('')}</div>`;

    const rows = [];
    let cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const k       = ymd(cursor);
        const inMonth = cursor.getMonth() === m;
        const isToday = k === todayKey;
        const items   = wkByDate[k] || [];

        const dayCls = [
          'kal-cell', 'planung-kal-cell',
          inMonth ? 'in-month' : 'out-month',
          isToday ? 'is-today' : '',
          (cursor.getDay() === 0 || cursor.getDay() === 6) ? 'weekend' : '',
        ].filter(Boolean).join(' ');

        const itemsHtml = items.map(s => {
          const name    = decFn(s.name || s.kuerzel || '');
          const manuell = !!s.naechstes_datum;
          const delBtn  = (kannEdit && manuell)
            ? `<button class="kal-item-del"
                onclick="event.stopPropagation();PLANUNG.loescheWkDatum(${s.id})"
                title="Manuelles Datum entfernen – Prognose wird wieder verwendet">×</button>`
            : '';
          return `<div class="kal-item" data-serie-id="${s.id}"
            draggable="${kannEdit}"
            title="${escapeHtml(name)}${manuell ? ' (manuell)' : ' (Prognose)'}"
            style="background:rgba(46,204,113,.15);border-left:3px solid #27ae60;
                   color:var(--text);cursor:${kannEdit ? 'grab' : 'default'}">
            <span class="kal-item-title">🏆 ${escapeHtml(name)}</span>
            ${delBtn}
          </div>`;
        }).join('');

        cells.push(`
          <div class="${dayCls}" data-datum="${k}">
            <div class="kal-cell-head"><span class="kal-day-num">${cursor.getDate()}</span></div>
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

    if (!kannEdit) return;

    // DnD: Drag von Kalender-Items (verschieben)
    document.querySelectorAll('.planung-kal-cell .kal-item[data-serie-id]').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.setData('text/x-serie-id', item.dataset.serieId);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('kal-item-dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('kal-item-dragging'));
    });

    // DnD: Drop auf Tages-Zellen
    document.querySelectorAll('.planung-kal-cell.in-month').forEach(cell => {
      const datum = cell.dataset.datum;
      cell.addEventListener('dragover', e => {
        if (!e.dataTransfer.types.includes('text/x-serie-id')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('planung-drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('planung-drag-over'));
      cell.addEventListener('drop', e => {
        if (!e.dataTransfer.types.includes('text/x-serie-id')) return;
        e.preventDefault();
        cell.classList.remove('planung-drag-over');
        const serieId = parseInt(e.dataTransfer.getData('text/x-serie-id') || '', 10);
        if (serieId) verschiebeSerie(serieId, datum);
      });
    });
  }

  // ── Wettkampf-Sidebar ─────────────────────────────────────
  async function renderSidebarWettkampf() {
    const cont = document.getElementById('planung-bloecke-list');
    if (!cont) return;

    cont.innerHTML = '<div class="planung-bloecke-loading">Lade…</div>';
    const serien = await _ladeWettkampfSerien();

    if (!serien.length) {
      cont.innerHTML = '<div class="bloecke-leer">Keine Wettkampfserien gefunden.</div>';
      return;
    }

    const kannEdit = state.user && (state.user.rolle === 'admin' || state.user.rolle === 'trainer');
    const decFn    = typeof _decodeHtml === 'function' ? _decodeHtml : (s => s);
    const MN       = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

    let html = '';
    serien.forEach(s => {
      const name    = decFn(s.name || s.kuerzel || '');
      const inaktiv = s.aktiv === 0;
      let nextInfo  = '';
      if (typeof ADMIN_WETTKAMPF !== 'undefined') {
        const nd = s.naechstes_datum || ADMIN_WETTKAMPF.predictNextDate(s.letztes_datum);
        if (nd) {
          const d       = new Date(nd + 'T00:00:00');
          const manuell = !!s.naechstes_datum;
          nextInfo = `<div class="pblock-meta" style="color:${manuell ? '#27ae60' : 'var(--text2)'}">
            ${d.getDate()}. ${MN[d.getMonth()]} ${d.getFullYear()}
            <span style="font-size:10px">${manuell ? '✓ fest' : '~ Prognose'}</span>
          </div>`;
        } else {
          nextInfo = `<div class="pblock-meta" style="color:var(--text2);font-size:11px">Kein Termin berechenbar</div>`;
        }
      }
      html += `
        <div class="pblock-card" data-serie-id="${s.id}" draggable="${kannEdit}"
             style="${inaktiv ? 'opacity:.4' : ''}"
             title="${escapeHtml(name)}${inaktiv ? ' (Inaktiv – nicht im Kalender)' : ''}">
          <div class="pblock-drag-handle" aria-hidden="true">⠿</div>
          <div class="pblock-info">
            <div class="pblock-titel">🏆 ${escapeHtml(name)}</div>
            ${nextInfo}
          </div>
        </div>`;
    });

    cont.innerHTML = html;

    if (!kannEdit) return;

    cont.querySelectorAll('.pblock-card[data-serie-id]').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/x-serie-id', card.dataset.serieId);
        e.dataTransfer.effectAllowed = 'copy';
        card.classList.add('pblock-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('pblock-dragging'));
    });
  }

  // ── Interne Cache-Hilfsfunktion für Wettkampf-Serien ─────
  async function _ladeWettkampfSerien() {
    const CACHE_MS = 5 * 60 * 1000;
    if (_wettkampfSerienCache && (Date.now() - _wettkampfSerienCache.ts) < CACHE_MS) {
      return _wettkampfSerienCache.serien;
    }
    try {
      const resp = await apiGet('wettkampf', { silent: true });
      const serien = resp.serien || [];
      _wettkampfSerienCache = { ts: Date.now(), serien };
      return serien;
    } catch (_) {
      return [];
    }
  }

  // ── Wettkampf-Termin verschieben (DnD) ───────────────────
  async function verschiebeSerie(serieId, neuesDatum) {
    // Optimistisches DOM-Update
    const el = document.querySelector(`.planung-kal-cell .kal-item[data-serie-id="${serieId}"]`);
    const zielItems = document.querySelector(`.planung-kal-cell[data-datum="${neuesDatum}"] .kal-cell-items`);
    if (el && zielItems) {
      const hint = zielItems.querySelector('.planung-drop-hint');
      hint ? zielItems.insertBefore(el, hint) : zielItems.appendChild(el);
    }
    try {
      await apiPut(`wettkampf/${serieId}/planung`, { naechstes_datum: neuesDatum });
      // Caches invalidieren
      _wettkampfSerienCache = null;
      if (typeof _wettkampfCache !== 'undefined') _wettkampfCache = null;
      notify('Wettkampf verschoben.', 'ok');
      renderKalWettkampf();
      renderSidebarWettkampf();
    } catch (err) {
      notify('Fehler: ' + (err.message || ''), 'err');
      renderKalWettkampf();
    }
  }

  // ── Manuelles Wettkampf-Datum entfernen ──────────────────
  async function loescheWkDatum(serieId) {
    try {
      await apiPut(`wettkampf/${serieId}/planung`, { naechstes_datum: null });
      _wettkampfSerienCache = null;
      if (typeof _wettkampfCache !== 'undefined') _wettkampfCache = null;
      notify('Manuelles Datum entfernt – Prognose wird verwendet.', 'ok');
      renderKalWettkampf();
      renderSidebarWettkampf();
    } catch (err) {
      notify('Fehler: ' + (err.message || ''), 'err');
    }
  }

  function navigateMonth(dir) {
    kalMonth = new Date(kalMonth.getFullYear(), kalMonth.getMonth() + dir, 1);
    if (_activeTab === 'wettkampf') renderKalWettkampf();
    else renderKal();
  }

  // ── Sidebar: Blöcke ──────────────────────────────────────
  async function ladeBlocke() {
    const cont = document.getElementById('planung-bloecke-list');
    if (!cont) return;
    try {
      const data = await apiGet('bloecke', { silent: true });
      let bloecke = data.bloecke || [];
      // Nach aktiver Gruppe filtern: zeige Blöcke, die der Gruppe zugeordnet sind
      // ODER keine Gruppe haben (gruppe-unabhängige Blöcke)
      if (aktivGruppe) {
        bloecke = bloecke.filter(b =>
          !b.gruppen_ids || b.gruppen_ids.length === 0 || b.gruppen_ids.includes(aktivGruppe.id)
        );
      }
      renderSidebar(bloecke);
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

    const typenCfg = getTypen();

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
    let gruppenListe = [];
    try {
      [einheitData, tpListe, gruppenListe] = await Promise.all([
        apiGet(`einheiten/${einheitId}`, { silent: true }),
        TREFFPUNKTE.laden(),
        GRUPPEN.laden(),
      ]);
    } catch (e) { notify('Fehler: ' + (e.message || ''), 'err'); return; }

    const e = einheitData.einheit;
    const tpOptionen = `<option value="">— kein Treffpunkt —</option>` +
      tpListe.map(t =>
        `<option value="${t.id}"${e.treffpunkt && e.treffpunkt.id === t.id ? ' selected' : ''}>${escapeHtml(t.name)}</option>`
      ).join('');
    const grOptionen = `<option value="">— keine Gruppe —</option>` +
      gruppenListe.map(g =>
        `<option value="${g.id}"${e.gruppe_id === g.id ? ' selected' : ''}>${escapeHtml(g.name)}</option>`
      ).join('');

    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Kalendereintrag bearbeiten${e.serie_id ? ' <span class="serie-badge">↺ Serie</span>' : ''}</div>
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
              ${gruppenListe.length ? `<div class="ed-fg">
                <label>Trainingsgruppe</label>
                <select id="edit-e-gruppe-id">${grOptionen}</select>
              </div>` : ''}
            </div>
            <div class="ed-footer">
              <button class="btn btn-danger" onclick="PLANUNG.einheitLoeschenAusEditor(${einheitId})">Löschen</button>
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" onclick="PLANUNG.einheitBearbeitenSpeichern(${einheitId})">Speichern</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function einheitBearbeitenSpeichern(einheitId, scope) {
    const datum = document.getElementById('edit-e-datum')?.value || '';
    if (!datum) { notify('Datum fehlt.', 'err'); return; }
    const tpIdStr      = document.getElementById('edit-e-treffpunkt-id')?.value || '';
    const grIdStr      = document.getElementById('edit-e-gruppe-id')?.value ?? '';
    const uhrzeit      = document.getElementById('edit-e-uhrzeit')?.value || null;
    const sichtbarkeit = document.getElementById('edit-e-sichtbarkeit')?.value || 'oeffentlich';
    try {
      const data = await apiGet(`einheiten/${einheitId}`, { silent: true });
      const e = data.einheit;

      // Serien-Einheit: erst Geltungsbereich abfragen
      if (e.serie_id && !scope) {
        _zeigeSerienScopeButtons(einheitId);
        return;
      }

      const basis = {
        uhrzeit,
        typ:           e.typ       || 'frei',
        titel:         e.titel,
        treffpunkt_id: tpIdStr !== '' ? parseInt(tpIdStr, 10) : null,
        bemerkung:     e.bemerkung || null,
        sichtbarkeit,
        status:        e.status    || 'geplant',
        gruppe_id:     grIdStr !== '' ? parseInt(grIdStr, 10) : null,
      };

      if (scope === 'alle') {
        await apiPut(`serien/${e.serie_id}`, basis);
      } else if (scope === 'abjetzt') {
        await apiPut(`serien/${e.serie_id}/ab/${e.datum}`, basis);
      } else {
        await apiPut(`einheiten/${einheitId}`, { ...basis, datum });
      }
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

  function _editorFooterStandard(einheitId) {
    const footer = document.querySelector('#modal-container .ed-footer');
    if (!footer) return;
    footer.innerHTML = `
      <button class="btn btn-danger" onclick="PLANUNG.einheitLoeschenAusEditor(${einheitId})">Löschen</button>
      <div class="ed-footer-right">
        <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="PLANUNG.einheitBearbeitenSpeichern(${einheitId})">Speichern</button>
      </div>`;
  }

  function _zeigeSerienScopeButtons(einheitId) {
    const footer = document.querySelector('#modal-container .ed-footer');
    if (!footer) return;
    footer.innerHTML = `
      <div class="serie-del-frage">Änderungen auf welche Termine anwenden?</div>
      <div class="serie-del-btns">
        <button class="btn btn-ghost btn-sm" onclick="PLANUNG.einheitBearbeitenSpeichern(${einheitId},'einzel')">Nur dieser Termin</button>
        <button class="btn btn-warning btn-sm" onclick="PLANUNG.einheitBearbeitenSpeichern(${einheitId},'abjetzt')">Dieser und alle folgenden</button>
        <button class="btn btn-primary btn-sm" onclick="PLANUNG.einheitBearbeitenSpeichern(${einheitId},'alle')">Gesamte Serie</button>
        <button class="btn btn-ghost btn-sm" onclick="PLANUNG.editorFooterRestore(${einheitId})">Abbrechen</button>
      </div>`;
  }

  // ── Einheit aus dem Editor löschen (mit Serien-Auswahl) ──
  async function einheitLoeschenAusEditor(einheitId, scope) {
    let e;
    try {
      e = (await apiGet(`einheiten/${einheitId}`, { silent: true })).einheit;
    } catch (err) { notify('Fehler: ' + (err.message || ''), 'err'); return; }

    // Serien-Einheit: Geltungsbereich abfragen
    if (e.serie_id && !scope) {
      const footer = document.querySelector('#modal-container .ed-footer');
      if (footer) {
        footer.innerHTML = `
          <div class="serie-del-frage">Welche Termine löschen?</div>
          <div class="serie-del-btns">
            <button class="btn btn-ghost btn-sm" onclick="PLANUNG.einheitLoeschenAusEditor(${einheitId},'einzel')">Nur dieser Termin</button>
            <button class="btn btn-warning btn-sm" onclick="PLANUNG.einheitLoeschenAusEditor(${einheitId},'abjetzt')">Dieser und alle folgenden</button>
            <button class="btn btn-danger btn-sm" onclick="PLANUNG.einheitLoeschenAusEditor(${einheitId},'alle')">Gesamte Serie</button>
            <button class="btn btn-ghost btn-sm" onclick="PLANUNG.editorFooterRestore(${einheitId})">Abbrechen</button>
          </div>`;
      }
      return;
    }
    if (!e.serie_id && !confirm('Diesen Kalendereintrag löschen?')) return;

    try {
      if (scope === 'alle') {
        await apiDel(`serien/${e.serie_id}`);
      } else if (scope === 'abjetzt') {
        await apiDel(`serien/${e.serie_id}/ab/${e.datum}`);
      } else {
        await apiDel(`einheiten/${einheitId}`);
      }
      schliesseModal();
      notify('Gelöscht.', 'ok');
      if ((location.hash || '').startsWith('#planung')) {
        renderKal();
      } else {
        renderPage();
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

  function getAktivGruppe() { return aktivGruppe; }

  return {
    render, navigateMonth, reloadSidebar, loescheEinheit,
    einheitBearbeiten, einheitBearbeitenSpeichern,
    einheitLoeschenAusEditor, editorFooterRestore: _editorFooterStandard,
    reloadKal: renderKal,
    gruppeWechseln, gruppenKonfigurieren, gruppenKonfigSpeichern,
    getAktivGruppe,
    wechsleTab, loescheWkDatum,
  };
})();
