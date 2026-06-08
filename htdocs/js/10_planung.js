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
          ${e.status === 'abgesagt'
            ? `<button class="btn btn-ghost btn-sm" onclick="KAL_POPOVER.hide();PLANUNG.wiederherstellenEinheit(${einheitId})">↩ Wiederherstellen</button>`
            : `<button class="btn btn-warning btn-sm" onclick="KAL_POPOVER.hide();PLANUNG.absagenEinheit(${einheitId})">⚠ Absagen</button>`}
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
  let _activeTab     = 'training'; // 'training' | 'athleten' | 'trainingsgruppen'
  let _athletSel     = null;       // beim Athleten-Tab gewählter Plan: { benutzer_id, name, stufe } | null
  let _athletenCache = {};         // benutzer_id → { name, stufe } (aus der Übersicht)

  // ── Layout-Helpers (kein Seiten-Scroll) ─────────────────
  function _applyPlanungLayout() {
    // Athleten-Tab (Übersicht/fremder Plan) scrollt normal – kein Viewport-Lock.
    if (_activeTab === 'athleten') { _clearPlanungLayout(); return; }

    // Auf schmalen Bildschirmen kein Viewport-Lock: das 100vh/overflow-hidden-
    // Layout lässt die Flex-Kalenderzeilen kollabieren und erzeugt eine
    // unbenutzbare Darstellung. Stattdessen normales Seiten-Scrollen erlauben
    // (CSS-Breakpoint @max-width:900px übernimmt die gestapelte Darstellung).
    if (window.innerWidth <= 900) { _clearPlanungLayout(); return; }

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

  // ── Auto-Scroll beim Ziehen ──────────────────────────────
  // Damit man (v. a. auf dem Smartphone) Blöcke von der unten liegenden
  // Sidebar in den oben stehenden Kalender ziehen kann, scrollt die Seite
  // mit, sobald der Zeiger nahe an den oberen/unteren Rand kommt.
  var _autoScrollDir = 0;        // -1 hoch, +1 runter, 0 aus
  var _autoScrollRAF = null;
  var _autoScrollSpeed = 0;

  function _onDragAutoScroll(e) {
    const EDGE = 90;             // px-Zone an Ober-/Unterkante
    const MAX  = 22;             // max. px pro Frame
    const h = window.innerHeight;
    const y = e.clientY;
    if (y <= 0 || y > h) { _autoScrollDir = 0; return; }  // außerhalb (z. B. dragleave)
    if (y < EDGE) {
      _autoScrollDir = -1;
      _autoScrollSpeed = Math.ceil(((EDGE - y) / EDGE) * MAX);
    } else if (y > h - EDGE) {
      _autoScrollDir = 1;
      _autoScrollSpeed = Math.ceil(((y - (h - EDGE)) / EDGE) * MAX);
    } else {
      _autoScrollDir = 0;
    }
    if (_autoScrollDir !== 0 && _autoScrollRAF === null) _autoScrollTick();
  }

  function _autoScrollTick() {
    if (_autoScrollDir === 0) { _autoScrollRAF = null; return; }
    window.scrollBy(0, _autoScrollDir * _autoScrollSpeed);
    _autoScrollRAF = requestAnimationFrame(_autoScrollTick);
  }

  function _stopDragAutoScroll() {
    _autoScrollDir = 0;
    if (_autoScrollRAF !== null) { cancelAnimationFrame(_autoScrollRAF); _autoScrollRAF = null; }
  }

  function _bindDragAutoScroll() {
    // addEventListener dedupliziert identische (Funktion+Typ)-Paare → idempotent
    document.addEventListener('dragover', _onDragAutoScroll);
    document.addEventListener('dragend',  _stopDragAutoScroll, true);
    document.addEventListener('drop',     _stopDragAutoScroll, true);
  }
  function _unbindDragAutoScroll() {
    document.removeEventListener('dragover', _onDragAutoScroll);
    document.removeEventListener('dragend',  _stopDragAutoScroll, true);
    document.removeEventListener('drop',     _stopDragAutoScroll, true);
    _stopDragAutoScroll();
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

    const istAthleten = _activeTab === 'athleten';

    main.innerHTML = `
      <div class="planung-wrap${istAthleten ? ' planung-scroll' : ''}">
        ${istTrainer ? _renderSectionBar() : ''}
        ${istTrainer && _activeTab === 'training' ? _renderGruppenTabs() : ''}
        ${istAthleten
          ? `<div class="planung-athleten" id="planung-athleten">
               <div class="planung-bloecke-loading">Lade…</div>
             </div>`
          : `<div class="planung-split">
          <div class="planung-kal-col" id="planung-kal-col">
            <div class="planung-kal-loading">Lade Kalender…</div>
          </div>
          <aside class="planung-sidebar" id="planung-sidebar">
            <div class="planung-sidebar-head">
              <div class="planung-sidebar-head-top">
                <span class="planung-sidebar-title">Trainingsblöcke</span>
                ${istTrainer
                  ? `<button class="btn btn-primary btn-sm" onclick="BLOECKE.neuerBlock()">+ Neu</button>`
                  : ''}
              </div>
              <span class="planung-sidebar-hint">Auf einen Kalendertag ziehen</span>
            </div>
            <div id="planung-bloecke-list" class="planung-bloecke-loading">Lade…</div>
          </aside>
        </div>`}
      </div>`;

    // Layout einfrieren: kein Seiten-Scroll, Wrap füllt genau den verbleibenden Raum
    _applyPlanungLayout();
    if (!istAthleten) _bindDragAutoScroll();
    window.addEventListener('resize', _applyPlanungLayout);
    const _offPlanung = () => {
      if (!(location.hash || '').startsWith('#planung')) {
        _clearPlanungLayout();
        _unbindDragAutoScroll();
        window.removeEventListener('resize', _applyPlanungLayout);
        window.removeEventListener('hashchange', _offPlanung);
      }
    };
    window.addEventListener('hashchange', _offPlanung);

    if (istAthleten) {
      await _renderAthleten();
      return;
    }

    // Kalenderfarben für die geplanten Gruppen injizieren (können von den
    // eigenen Mitgliedschaften des Trainers abweichen).
    if (typeof applyKalenderFarben === 'function') {
      applyKalenderFarben(_gruppen.map(g => 'g' + g.id));
    }

    await Promise.all([renderKal(), ladeBlocke()]);
  }

  // ── Gruppen-Tabs ──────────────────────────────────────────
  // Jeder Tab trägt die Kalenderfarbe (Standard, vom Trainer setzbar).
  function _tab(key, label, aktiv, onclick, title) {
    const farbe = (typeof kalFarbeDefault === 'function') ? kalFarbeDefault(key) : '#888888';
    // Im Dark-Mode rohe Hex-Farben aufhellen, damit sie auf dunklem Grund lesbar sind
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    const farbeVis = (isDark && typeof _farbeFuerDark === 'function') ? _farbeFuerDark(farbe) : farbe;
    // Aktiv: Farbe als Border + Text; inaktiv: transparente Border (CSS übernimmt Hover)
    const btnStyle = aktiv
      ? `border-bottom:3px solid ${farbeVis};color:${farbeVis}`
      : `border-bottom:3px solid transparent`;
    return `<span class="planung-tab-wrap">
      <input type="color" class="planung-tab-color" value="${farbe}"
        title="Standard-Kalenderfarbe festlegen · Rechtsklick: zurücksetzen"
        onclick="event.stopPropagation()"
        onchange="PLANUNG.setDefaultFarbe('${key}', this.value)"
        oncontextmenu="return PLANUNG.resetDefaultFarbe(event, '${key}')">
      <button class="planung-tab${aktiv ? ' planung-tab-aktiv' : ''}" style="${btnStyle}"
        ${onclick}${title ? ` title="${title}"` : ''}>${escapeHtml(label)}</button>
    </span>`;
  }

  // ── Untermenü (Admin-Stil): Gruppenpläne · Athletenpläne · Trainingsgruppen ──
  function _renderSectionBar() {
    const item = (key, label, aktiv, title) =>
      `<button class="subtab${aktiv ? ' active' : ''}"
        onclick="PLANUNG.wechsleSection('${key}')"${title ? ` title="${title}"` : ''}>${escapeHtml(label)}</button>`;
    return `<div class="planung-section-nav">
      <div class="subtabs">
        ${item('training',         'Gruppenpläne',     _activeTab === 'training',         'Trainingspläne der Gruppen')}
        ${item('athleten',         'Athletenpläne',    _activeTab === 'athleten',         'Persönliche Trainingspläne der Athleten')}
        ${item('trainingsgruppen', 'Trainingsgruppen', _activeTab === 'trainingsgruppen', 'Gruppen anlegen und Mitglieder verwalten')}
      </div>
    </div>`;
  }

  // Gruppen-Tabs (nur innerhalb der Sektion „Gruppenpläne") – ein Tab je Gruppe.
  function _renderGruppenTabs() {
    if (!_gruppen.length) {
      return `<div class="planung-gruppen-bar">
        <span class="planung-gruppen-hint">Kein Gruppenfilter aktiv –</span>
        <button class="btn btn-ghost btn-sm" onclick="PLANUNG.wechsleSection('trainingsgruppen')">Gruppen konfigurieren</button>
      </div>`;
    }
    const tabs = _gruppen.map(g =>
      _tab('g' + g.id, g.name,
        _activeTab === 'training' && aktivGruppe && aktivGruppe.id === g.id,
        `onclick="PLANUNG.gruppeWechseln(${g.id})"`)
    ).join('');
    return `<div class="planung-gruppen-bar">
      ${tabs}
      <button class="planung-tab planung-tab-config" onclick="PLANUNG.wechsleSection('trainingsgruppen')" title="Trainingsgruppen verwalten">⚙</button>
    </div>`;
  }

  // Standard-Kalenderfarbe (global, für alle Athleten) setzen/zurücksetzen.
  async function setDefaultFarbe(key, hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    try {
      const r = await apiPut('planung/kalender-farbe', { key, farbe: hex });
      if (r && r.farben && typeof r.farben === 'object') kalFarbenDefaults = r.farben;
      applyKalenderFarben(_gruppen.map(g => 'g' + g.id));
      _aktualisiereTabs();
    } catch (e) {
      if (typeof benachrichtigen === 'function') benachrichtigen('Farbe konnte nicht gespeichert werden.', 'err');
    }
  }
  async function resetDefaultFarbe(ev, key) {
    ev.preventDefault();
    try {
      const r = await apiPut('planung/kalender-farbe', { key, farbe: '' });
      if (r && r.farben && typeof r.farben === 'object') kalFarbenDefaults = r.farben;
      applyKalenderFarben(_gruppen.map(g => 'g' + g.id));
      _aktualisiereTabs();
    } catch (_) {}
    return false;
  }
  function _aktualisiereTabs() {
    const bar = document.querySelector('.planung-gruppen-bar');
    if (bar) bar.outerHTML = _renderGruppenTabs();
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
  // ── Gruppen konfigurieren Modal ───────────────────────────
  // State für aufgeklappte Gruppen und geladene Mitglieder
  const _gkState = { expanded: new Set(), mitglieder: {}, verfuegbar: {} };

  async function gruppenKonfigurieren() {
    if (!_alleGruppen.length) {
      try { _alleGruppen = await GRUPPEN.laden(); } catch (_) { _alleGruppen = []; }
    }
    _gkRender();
  }

  function _gkRender() {
    const isAdmin    = state.user && state.user.rolle === 'admin';
    const ausgewaehlt = new Set(_gruppen.map(g => g.id));
    const cont = document.getElementById('modal-container');

    const gruppenHtml = _alleGruppen.map(g => {
      const chk      = ausgewaehlt.has(g.id) ? ' checked' : '';
      const expanded = _gkState.expanded.has(g.id);
      const mitgl    = _gkState.mitglieder[g.id] || null;
      const verfg    = _gkState.verfuegbar[g.id] || [];

      const mitglHtml = mitgl === null ? '' : (() => {
        const tags = mitgl.map(m =>
          `<span class="gk-mitglied-tag">
            ${escapeHtml(m.name)}
            ${isAdmin ? `<button class="gk-mitglied-del" onclick="event.stopPropagation();PLANUNG._gkMitgliedEntfernen(${g.id},${m.id})" title="Entfernen">×</button>` : ''}
          </span>`
        ).join('');
        const addHtml = isAdmin && verfg.length ? `
          <div class="gk-add-row">
            <select class="gk-add-select" id="gk-add-${g.id}">
              <option value="">— Mitglied hinzufügen —</option>
              ${verfg.map(u => `<option value="${u.id}">${escapeHtml(u.name)}${u.rolle !== 'athlet' ? ' (' + escapeHtml(u.rolle || '') + ')' : ''}</option>`).join('')}
            </select>
            <button class="btn btn-ghost btn-sm" onclick="PLANUNG._gkMitgliedHinzufuegen(${g.id})">Hinzufügen</button>
          </div>` : (isAdmin && !verfg.length ? '<p class="gk-no-more">Alle Benutzer sind bereits Mitglied.</p>' : '');
        return `<div class="gk-mitglieder-panel">
          ${mitgl.length ? `<div class="gk-mitglied-list">${tags}</div>` : '<p class="gk-no-more">Noch keine Mitglieder.</p>'}
          ${addHtml}
        </div>`;
      })();

      const memberCount = mitgl !== null ? ` <span class="gk-count">${mitgl.length}</span>` : '';

      return `<div class="gk-gruppe-row${expanded ? ' gk-expanded' : ''}">
        <div class="gk-gruppe-head">
          <label class="profil-gruppe-item gk-tab-label">
            <input type="checkbox" class="pg-cfg-cb" value="${g.id}"${chk}>
            <span class="gk-name">${escapeHtml(g.name)}</span>
          </label>
          <button class="gk-expand-btn" onclick="PLANUNG._gkToggle(${g.id})" title="Mitglieder anzeigen">
            👥${memberCount} ${expanded ? '▲' : '▼'}
          </button>
        </div>
        ${expanded ? mitglHtml : ''}
      </div>`;
    }).join('');

    const neueGruppeHtml = isAdmin ? `
      <div class="gk-neue-gruppe">
        <input id="gk-neu-name" class="ed-input" type="text" placeholder="Name der neuen Gruppe" style="flex:1">
        <button class="btn btn-ghost btn-sm" onclick="PLANUNG._gkNeuAnlegen()">+ Anlegen</button>
      </div>` : '';

    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width:560px">
          <div class="modal-head">
            <div><div class="modal-eyebrow">Planungsansicht</div><div class="modal-title">Trainingsgruppen konfigurieren</div></div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <p class="profil-hint-global">Wähle die Gruppen (Tab-Auswahl) und verwalte Mitglieder (👥).</p>
            <div class="gk-gruppen-list">${gruppenHtml || '<p class="gk-no-more">Keine Gruppen vorhanden.</p>'}</div>
            ${neueGruppeHtml}
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="PLANUNG.gruppenKonfigSpeichern()">Speichern</button>
          </div>
        </div>
      </div>`;
  }

  async function _gkToggle(gruppeId) {
    if (_gkState.expanded.has(gruppeId)) {
      _gkState.expanded.delete(gruppeId);
    } else {
      _gkState.expanded.add(gruppeId);
      if (!_gkState.mitglieder[gruppeId]) {
        try {
          const d = await apiGet(`trainingsgruppen/${gruppeId}/mitglieder`, { silent: true });
          _gkState.mitglieder[gruppeId] = d.mitglieder || [];
          _gkState.verfuegbar[gruppeId] = d.verfuegbar || [];
        } catch (_) {
          _gkState.mitglieder[gruppeId] = [];
          _gkState.verfuegbar[gruppeId] = [];
        }
      }
    }
    _gkRender();
  }

  async function _gkMitgliedHinzufuegen(gruppeId) {
    const sel = document.getElementById('gk-add-' + gruppeId);
    const benId = sel ? parseInt(sel.value, 10) : 0;
    if (!benId) return;
    const m = (_gkState.mitglieder[gruppeId] || []);
    const v = (_gkState.verfuegbar[gruppeId] || []);
    const idx = v.findIndex(u => u.id === benId);
    if (idx === -1) return;
    const nutzer = v[idx];
    // Optimistisch aktualisieren
    _gkState.mitglieder[gruppeId] = [...m, nutzer];
    _gkState.verfuegbar[gruppeId] = v.filter((_, i) => i !== idx);
    _gkRender();
    try {
      await apiPut(`trainingsgruppen/${gruppeId}/mitglieder`, {
        benutzer_ids: _gkState.mitglieder[gruppeId].map(u => u.id)
      });
    } catch (e) {
      // Rollback
      _gkState.mitglieder[gruppeId] = m;
      _gkState.verfuegbar[gruppeId] = v;
      _gkRender();
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function _gkMitgliedEntfernen(gruppeId, benId) {
    const m = (_gkState.mitglieder[gruppeId] || []);
    const v = (_gkState.verfuegbar[gruppeId] || []);
    const idx = m.findIndex(u => u.id === benId);
    if (idx === -1) return;
    const nutzer = m[idx];
    _gkState.mitglieder[gruppeId] = m.filter((_, i) => i !== idx);
    _gkState.verfuegbar[gruppeId] = [...v, nutzer].sort((a, b) => a.name.localeCompare(b.name));
    _gkRender();
    try {
      await apiPut(`trainingsgruppen/${gruppeId}/mitglieder`, {
        benutzer_ids: _gkState.mitglieder[gruppeId].map(u => u.id)
      });
    } catch (e) {
      _gkState.mitglieder[gruppeId] = m;
      _gkState.verfuegbar[gruppeId] = v;
      _gkRender();
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function _gkNeuAnlegen() {
    const inp = document.getElementById('gk-neu-name');
    const name = inp ? inp.value.trim() : '';
    if (!name) { inp && inp.focus(); return; }
    try {
      const d = await apiPost('trainingsgruppen', { name });
      _alleGruppen.push(d.gruppe);
      _alleGruppen.sort((a, b) => a.name.localeCompare(b.name));
      GRUPPEN.invalidate();
      _gkRender();
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
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
      _gruppenGeladen = true;
      // State zurücksetzen für nächsten Öffnen
      _gkState.expanded.clear();
      Object.keys(_gkState.mitglieder).forEach(k => delete _gkState.mitglieder[k]);
      Object.keys(_gkState.verfuegbar).forEach(k => delete _gkState.verfuegbar[k]);
      schliesseModal();
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

    let einheiten = [], feiertage = [], notizen = [];
    try {
      // Kein Gruppenfilter → keine Einheiten laden (sicherstellen dass alle Einheiten zugeordnet sind)
      const feiertagePromise = apiGet(`feiertage?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true }).catch(() => ({ feiertage: [] }));
      const notizParams = aktivGruppe ? `&gruppe_id=${aktivGruppe.id}` : '';
      const notizenPromise = apiGet(`tagesnotizen?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}${notizParams}`, { silent: true }).catch(() => ({ notizen: [] }));
      if (aktivGruppe) {
        const [d1, d2, d3] = await Promise.all([
          apiGet(`einheiten?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}&gruppe_id=${aktivGruppe.id}`, { silent: true }),
          feiertagePromise,
          notizenPromise,
        ]);
        einheiten = d1.einheiten || [];
        feiertage = d2.feiertage || [];
        notizen   = d3.notizen   || [];
      } else {
        const [d2, d3] = await Promise.all([feiertagePromise, notizenPromise]);
        feiertage = d2.feiertage || [];
        notizen   = d3.notizen   || [];
      }
    } catch (e) {
      // Nicht still verschlucken: leerer Kalender bei API-Fehler ist sonst nicht diagnostizierbar
      console.warn('Planung: Einheiten/Feiertage konnten nicht geladen werden –', e && e.message);
    }

    const byDate = {};
    einheiten.forEach(e => { (byDate[e.datum] = byDate[e.datum] || []).push(e); });

    const notizenByDate = {};
    notizen.forEach(n => { (notizenByDate[n.datum] = notizenByDate[n.datum] || []).push(n); });

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
        const tagNotizen = notizenByDate[k] || [];

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

        // Tagesnotizen
        const notizenHtml = tagNotizen.map(n => {
          const notizKey = n.gruppe_id ? 'g' + n.gruppe_id : 'teamplan';
          const autorHtml = n.ersteller_name
            ? `<span class="kal-notiz-autor">${escapeHtml(n.ersteller_name)}</span>`
            : '';
          return `<div class="kal-notiz kal-cal-${notizKey}" title="${escapeHtml(n.inhalt)}"
            data-notiz-id="${n.id}"${kannEdit ? ' draggable="true"' : ''}>
            <span class="kal-notiz-icon">📋</span>
            <span class="kal-notiz-text">${escapeHtml(n.inhalt)}</span>
            ${autorHtml}
            ${kannEdit
              ? `<button class="kal-notiz-edit" onclick="event.stopPropagation();PLANUNG.notizBearbeiten(${n.id},'${escapeHtml(n.inhalt).replace(/'/g,"&#39;")}')" title="Notiz bearbeiten">✎</button>
                 <button class="kal-notiz-del" onclick="event.stopPropagation();PLANUNG.notizLoeschen(${n.id})" title="Notiz löschen">×</button>`
              : ''}
          </div>`;
        }).join('');

        const notizAddBtn = kannEdit && inMonth
          ? `<button class="kal-notiz-add" onclick="event.stopPropagation();PLANUNG.notizHinzufuegen('${k}')" title="Notiz hinzufügen">📋+</button>`
          : '';

        const itemsHtml = items.map(e => {
          const abgesagt = e.status === 'abgesagt';
          const cls = `kal-item kal-cal-${kalKeyFor(e)}${abgesagt ? ' is-cancelled' : ''}`;
          const aktionsButtons = kannEdit ? `
            ${abgesagt
              ? `<button class="kal-item-wiederherstellen" onclick="event.stopPropagation();PLANUNG.wiederherstellenEinheit(${e.id})" title="Absage aufheben">↩</button>`
              : `<button class="kal-item-absagen" onclick="event.stopPropagation();PLANUNG.absagenEinheit(${e.id})" title="Training absagen">⚠</button>`
            }
            <button class="kal-item-del" onclick="event.stopPropagation();PLANUNG.loescheEinheit(${e.id})" title="Eintrag löschen">×</button>` : '';
          const absageNotizHtml = abgesagt && e.absage_notiz
            ? `<span class="kal-item-absage-notiz" title="${escapeHtml(e.absage_notiz)}">⚠ ${escapeHtml(e.absage_notiz)}</span>`
            : '';
          return `<div class="${cls}" data-einheit-id="${e.id}" draggable="${kannEdit && !abgesagt}" title="${escapeHtml(e.titel)}">
            <div class="kal-item-top">
              ${e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : ''}
              <span class="kal-item-title">${escapeHtml(e.titel)}</span>
              ${aktionsButtons}
            </div>
            ${absageNotizHtml}
          </div>`;
        }).join('');

        cells.push(`
          <div class="${dayCls}" data-datum="${k}">
            <div class="kal-cell-head">
              <span class="kal-day-num">${cursor.getDate()}</span>
              ${notizAddBtn}
            </div>
            ${ferienHtml ? `<div class="kal-feiertag-list">${ferienHtml}</div>` : ''}
            ${notizenHtml ? `<div class="kal-notiz-list">${notizenHtml}</div>` : ''}
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

    // DnD: Drag von Tagesnotizen
    document.querySelectorAll('.planung-kal-cell .kal-notiz[draggable="true"]').forEach(notiz => {
      notiz.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.setData('text/x-notiz-id', notiz.dataset.notizId);
        e.dataTransfer.effectAllowed = 'move';
        notiz.classList.add('kal-notiz-dragging');
      });
      notiz.addEventListener('dragend', () => notiz.classList.remove('kal-notiz-dragging'));
    });

    // DnD: Drop auf Tages-Zellen
    document.querySelectorAll('.planung-kal-cell.in-month').forEach(cell => {
      const datum = cell.dataset.datum;
      cell.addEventListener('dragover', e => {
        e.preventDefault();
        const isEinheit = e.dataTransfer.types.includes('text/x-einheit-id');
        const isNotiz   = e.dataTransfer.types.includes('text/x-notiz-id');
        e.dataTransfer.dropEffect = (isEinheit || isNotiz) ? 'move' : 'copy';
        cell.classList.add('planung-drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('planung-drag-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('planung-drag-over');
        const einheitId = parseInt(e.dataTransfer.getData('text/x-einheit-id') || '', 10);
        if (einheitId) { verschiebeEinheit(einheitId, datum); return; }
        const notizId = parseInt(e.dataTransfer.getData('text/x-notiz-id') || '', 10);
        if (notizId) { verschiebeNotiz(notizId, datum); return; }
        const blockId = parseInt(e.dataTransfer.getData('text/plain') || '', 10);
        if (blockId) BLOECKE.anwenden(blockId, datum, aktivGruppe ? aktivGruppe.id : null);
      });
    });

    // Hover-Popover
    KAL_POPOVER.initItems(document.querySelectorAll('.planung-kal-cell .kal-item[data-einheit-id]'));
  }

  // ── Untermenü-Wechsel (Gruppen/Athleten) ─────────────────
  // Komplette Neudarstellung, da sich Layout (Split vs. Scroll-Ansicht) je Sektion unterscheidet.
  function wechsleSection(key) {
    if (key === _activeTab && key !== 'athleten') return;
    _activeTab = key;
    if (key === 'athleten') _athletSel = null;
    if (key === 'training' && !aktivGruppe && _gruppen.length) aktivGruppe = _gruppen[0];
    const main = document.getElementById('main-content');
    if (main) render(main);
  }

  // Sidebar-Kopf (Titel, Hint, "+ Neu"-Button) anpassen
  function _aktualisiereSidebarKopf() {
    const head = document.querySelector('.planung-sidebar-head');
    if (!head) return;
    const istTrainer = state.user && (state.user.rolle === 'admin' || state.user.rolle === 'trainer');
    head.innerHTML = `
      <div class="planung-sidebar-head-top">
        <span class="planung-sidebar-title">Trainingsblöcke</span>
        ${istTrainer
          ? `<button class="btn btn-primary btn-sm" onclick="BLOECKE.neuerBlock()">+ Neu</button>`
          : ''}
      </div>
      <span class="planung-sidebar-hint">Auf einen Kalendertag ziehen</span>`;
  }

  // ── Athleten: persönliche Trainingspläne ─────────────────
  function _stufeLabel(stufe) {
    if (stufe === 'voll')   return 'Vollzugriff';
    if (stufe === 'lesend') return 'Lesend';
    return 'Kein Zugriff';
  }
  function _stufeCls(stufe) {
    if (stufe === 'voll')   return 'athlet-stufe-voll';
    if (stufe === 'lesend') return 'athlet-stufe-lesend';
    return 'athlet-stufe-nicht';
  }
  function _fmtKm(v) {
    const n = Number(v);
    if (!isFinite(n)) return '';
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  }
  function _fmtDatumKurz(d) {
    if (!d) return '–';
    const p = String(d).split('-');
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(d);
  }

  async function _renderAthleten() {
    const cont = document.getElementById('planung-athleten');
    if (!cont) return;
    if (_athletSel) { await _renderAthletPlan(cont); return; }
    await _renderAthletenUebersicht(cont);
  }

  async function _renderAthletenUebersicht(cont) {
    cont.innerHTML = `<div class="planung-bloecke-loading">Lade Athletenpläne…</div>`;
    let data;
    try {
      data = await apiGet('mein-plan/uebersicht', { silent: true });
    } catch (e) {
      cont.innerHTML = `<div class="athleten-leer athleten-error">Fehler: ${escapeHtml(e.message || '')}</div>`;
      return;
    }
    const list = data.athleten || [];
    _athletenCache = {};
    list.forEach(a => { _athletenCache[a.benutzer_id] = { name: a.name, stufe: a.meine_stufe }; });

    if (!list.length) {
      cont.innerHTML = `<div class="panel">
        <div class="panel-header">
          <span class="panel-title">Persönliche Trainingspläne</span>
        </div>
        <div style="padding:40px;text-align:center;color:var(--text2)">
          Noch keine persönlichen Trainingspläne vorhanden. Sobald Athleten eigene Einheiten anlegen, erscheinen sie hier.
        </div>
      </div>`;
      return;
    }
    const rows = list.map(a => {
      const hatZugriff = a.meine_stufe === 'lesend' || a.meine_stufe === 'voll';
      const aktion = hatZugriff
        ? `<button class="btn btn-ghost btn-sm" onclick="PLANUNG.oeffneAthletPlan(${a.benutzer_id})">Plan öffnen</button>`
        : `<span class="athlet-kein-zugriff">—</span>`;
      return `<tr class="${hatZugriff ? '' : 'athlet-row-disabled'}">
        <td class="athlet-name">${escapeHtml(a.name)}${a.ich ? ' <span class="athlet-ich">(ich)</span>' : ''}</td>
        <td class="athlet-anzahl">${a.anzahl}</td>
        <td class="athlet-letztes">${escapeHtml(_fmtDatumKurz(a.letztes))}</td>
        <td><span class="athlet-stufe-badge ${_stufeCls(a.meine_stufe)}">${_stufeLabel(a.meine_stufe)}</span></td>
        <td class="athlet-aktion">${aktion}</td>
      </tr>`;
    }).join('');
    cont.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Persönliche Trainingspläne</span>
          <span class="panel-count">${list.length} Athlet${list.length !== 1 ? 'en' : ''}</span>
        </div>
        <p class="athleten-intro" style="padding:10px 20px 0;margin:0">Athleten geben ihren Plan in ihrem Profil frei. Mit <em>Lesezugriff</em> kannst du ihn ansehen, mit <em>Vollzugriff</em> auch bearbeiten.</p>
        <div class="table-scroll">
          <table class="athleten-table">
            <thead><tr><th>Athlet</th><th>Einheiten</th><th>Letzte</th><th>Zugriff</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  async function _renderAthletPlan(cont) {
    const sel      = _athletSel;
    const darfEdit = sel.stufe === 'voll';
    const y = kalMonth.getFullYear(), m = kalMonth.getMonth();

    const firstDay  = new Date(y, m, 1);
    const dow0      = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(y, m, 1 - dow0);
    const lastDay   = new Date(y, m + 1, 0);
    const dowLast   = (lastDay.getDay() + 6) % 7;
    const gridEnd   = new Date(y, m + 1, 6 - dowLast);
    const todayKey  = ymd(new Date());

    cont.innerHTML = `
      <div class="athlet-plan-wrap">
        <div class="athlet-plan-head">
          <button class="btn btn-ghost btn-sm" onclick="PLANUNG.athletZurueck()">← Übersicht</button>
          <span class="athlet-plan-name">${escapeHtml(sel.name)}</span>
          <span class="athlet-stufe-badge ${_stufeCls(sel.stufe)}">${_stufeLabel(sel.stufe)}</span>
        </div>
        <div class="panel">
          <div class="athlet-plan-kal-head">
            <button class="btn btn-ghost" onclick="PLANUNG.navigateMonth(-1)" aria-label="Vorheriger Monat">‹</button>
            <h2 class="planung-kal-title">${MONATSNAMEN[m]} ${y}</h2>
            <button class="btn btn-ghost" onclick="PLANUNG.navigateMonth(1)" aria-label="Nächster Monat">›</button>
          </div>
          <div id="athlet-plan-grid" class="planung-kal-loading">Lade…</div>
        </div>
      </div>`;

    let pub = [], priv = [];
    try {
      const d = await apiGet(
        `mein-plan/einheiten?fuer=${sel.benutzer_id}&von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`,
        { silent: true });
      pub  = d.einheiten || [];
      priv = d.privat    || [];
    } catch (e) {
      const g = document.getElementById('athlet-plan-grid');
      if (g) g.outerHTML = `<div id="athlet-plan-grid" class="athleten-error athleten-leer">Fehler: ${escapeHtml(e.message || '')}</div>`;
      return;
    }

    const pubByDate = {};  pub.forEach(e  => (pubByDate[e.datum]  = pubByDate[e.datum]  || []).push(e));
    const privByDate = {}; priv.forEach(e => (privByDate[e.datum] = privByDate[e.datum] || []).push(e));

    const head = `<div class="kal-head">${WOCHENTAGE.map(w => `<div class="kal-head-cell">${w}</div>`).join('')}</div>`;
    const rows = [];
    let cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const k         = ymd(cursor);
        const inMonth   = cursor.getMonth() === m;
        const isToday   = k === todayKey;
        const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;

        const pubHtml = (pubByDate[k] || []).map(e =>
          `<div class="kal-item kal-typ-${escapeHtml(e.typ)}${e.status === 'abgesagt' ? ' is-cancelled' : ''}" title="${escapeHtml(e.titel)} (Teamplan)">
            ${e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : ''}
            <span class="kal-item-title">${escapeHtml(e.titel)}</span>
          </div>`).join('');

        const privHtml = (privByDate[k] || []).map(e => {
          const km      = e.distanz_km != null ? `<span class="kal-item-km">${_fmtKm(e.distanz_km)} km</span>` : '';
          const onclick = darfEdit ? ` onclick="MEINPLAN.bearbeitePrivat(${e.id}, ${sel.benutzer_id})" style="cursor:pointer"` : '';
          const del     = darfEdit
            ? `<button class="kal-item-del" onclick="event.stopPropagation();MEINPLAN.loeschePrivat(${e.id}, ${sel.benutzer_id})" title="Löschen">×</button>`
            : '';
          return `<div class="kal-item is-privat kal-typ-${escapeHtml(e.typ)}" data-privat-id="${e.id}"${onclick} title="${escapeHtml(e.titel)}">
            ${e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : ''}
            <span class="kal-item-title">${escapeHtml(e.titel)}</span>
            ${km}
            ${del}
          </div>`;
        }).join('');

        const addBtn = (darfEdit && inMonth)
          ? `<button class="kal-add-btn" onclick="MEINPLAN.neuePrivatEinheit('${k}', ${sel.benutzer_id})" title="Einheit hinzufügen">+</button>`
          : '';

        const dayCls = ['kal-cell', inMonth ? 'in-month' : 'out-month',
          isToday ? 'is-today' : '', isWeekend ? 'weekend' : ''].filter(Boolean).join(' ');
        cells.push(`
          <div class="${dayCls}" data-datum="${k}">
            <div class="kal-cell-head"><span class="kal-day-num">${cursor.getDate()}</span>${addBtn}</div>
            <div class="kal-cell-items">${pubHtml}${privHtml}</div>
          </div>`);
        cursor.setDate(cursor.getDate() + 1);
      }
      rows.push(`<div class="kal-row">${cells.join('')}</div>`);
    }
    const grid = document.getElementById('athlet-plan-grid');
    if (grid) grid.outerHTML = `<div id="athlet-plan-grid" class="kal-grid">${head}${rows.join('')}</div>`;
  }

  function oeffneAthletPlan(id) {
    const a = _athletenCache[id];
    if (!a) return;
    _athletSel = { benutzer_id: id, name: a.name, stufe: a.stufe };
    _renderAthleten();
  }
  function athletZurueck() {
    _athletSel = null;
    _renderAthleten();
  }

  function navigateMonth(dir) {
    kalMonth = new Date(kalMonth.getFullYear(), kalMonth.getMonth() + dir, 1);
    if (_activeTab === 'athleten') _renderAthleten();
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

  async function verschiebeNotiz(notizId, neuesDatum) {
    // Optimistisch: Element sofort in Zielzelle verschieben
    const el        = document.querySelector(`.kal-notiz[data-notiz-id="${notizId}"]`);
    const zielList  = document.querySelector(`.planung-kal-cell[data-datum="${neuesDatum}"] .kal-notiz-list`);
    if (el && zielList) zielList.prepend(el);
    try {
      await apiPut(`tagesnotizen/${notizId}`, { datum: neuesDatum });
      notify('Notiz verschoben.', 'ok');
      renderKal(); // neu laden damit Gruppen-Filterpositionen stimmen
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
      <div class="modal-overlay">
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

  // ── Training absagen / wiederherstellen ──────────────────────
  async function absagenEinheit(einheitId) {
    // Seriendaten laden um ggf. Scope-Auswahl zu zeigen
    let serieFeld = null;
    try {
      const d = await apiGet(`einheiten/${einheitId}`, { silent: true });
      serieFeld = d.einheit?.serie_id || null;
    } catch (_) {}
    _absagenDialog(einheitId, serieFeld);
  }

  function _absagenDialog(einheitId, serie_id) {
    const mc = document.getElementById('modal-container');
    if (!mc) return;

    const serieHinweis = serie_id ? `
      <div id="absage-scope-wrap" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text2)">Welche Termine absagen?</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
            <input type="radio" name="absage-scope" value="einzel" checked> Nur dieser Termin
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
            <input type="radio" name="absage-scope" value="abjetzt"> Dieser und alle folgenden
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
            <input type="radio" name="absage-scope" value="alle"> Gesamte Serie
          </label>
        </div>
      </div>` : '';

    mc.innerHTML = `
      <div class="modal-overlay" onclick="PLANUNG.absageDialogSchliessen()">
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width:440px">
          <div class="modal-head">
            <span class="modal-title">Training absagen</span>
            <button class="modal-close" onclick="PLANUNG.absageDialogSchliessen()">×</button>
          </div>
          <div class="modal-body" style="padding:20px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">
              Absagegrund <span style="font-weight:400;color:var(--text2)">(optional)</span>
            </label>
            <textarea id="absage-notiz-input" class="settings-input" rows="3"
              style="width:100%;resize:vertical;font-size:14px;line-height:1.5"
              placeholder="z. B. Schlechtes Wetter, Halle nicht verfügbar…"></textarea>
            <p style="font-size:12px;color:var(--text2);margin:8px 0 0">
              Das Training bleibt sichtbar und wird im Kalender durchgestrichen. Der Grund erscheint für alle Athleten.
            </p>
            ${serieHinweis}
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" onclick="PLANUNG.absageDialogSchliessen()">Abbrechen</button>
            <button class="btn btn-warning" onclick="PLANUNG.absagenSpeichern(${einheitId})">Training absagen</button>
          </div>
        </div>
      </div>`;
    setTimeout(() => document.getElementById('absage-notiz-input')?.focus(), 50);
  }

  function absageDialogSchliessen() {
    const mc = document.getElementById('modal-container');
    if (mc) mc.innerHTML = '';
  }

  async function absagenSpeichern(einheitId) {
    const notiz = document.getElementById('absage-notiz-input')?.value?.trim() || null;
    const scopeEl = document.querySelector('input[name="absage-scope"]:checked');
    const scope   = scopeEl ? scopeEl.value : 'einzel';
    try {
      await apiPost(`einheiten/${einheitId}/absagen`, { notiz, scope });
      absageDialogSchliessen();
      notify('Training abgesagt.', 'ok');
      renderKal();
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function wiederherstellenEinheit(einheitId) {
    // Seriendaten prüfen
    let serieFeld = null;
    try {
      const d = await apiGet(`einheiten/${einheitId}`, { silent: true });
      serieFeld = d.einheit?.serie_id || null;
    } catch (_) {}

    if (serieFeld) {
      _wiederherstellenDialog(einheitId);
    } else {
      if (!confirm('Absage aufheben und Training wieder als geplant markieren?')) return;
      try {
        await apiPost(`einheiten/${einheitId}/wiederherstellen`, { scope: 'einzel' });
        notify('Absage aufgehoben.', 'ok');
        renderKal();
      } catch (e) {
        notify('Fehler: ' + (e.message || ''), 'err');
      }
    }
  }

  function _wiederherstellenDialog(einheitId) {
    const mc = document.getElementById('modal-container');
    if (!mc) return;
    mc.innerHTML = `
      <div class="modal-overlay" onclick="PLANUNG.absageDialogSchliessen()">
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width:400px">
          <div class="modal-head">
            <span class="modal-title">Absage aufheben</span>
            <button class="modal-close" onclick="PLANUNG.absageDialogSchliessen()">×</button>
          </div>
          <div class="modal-body" style="padding:20px">
            <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text2)">Welche Termine wiederherstellen?</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="radio" name="wh-scope" value="einzel" checked> Nur dieser Termin
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="radio" name="wh-scope" value="abjetzt"> Dieser und alle folgenden
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="radio" name="wh-scope" value="alle"> Gesamte Serie
              </label>
            </div>
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" onclick="PLANUNG.absageDialogSchliessen()">Abbrechen</button>
            <button class="btn btn-primary" onclick="PLANUNG.wiederherstellenSpeichern(${einheitId})">Wiederherstellen</button>
          </div>
        </div>
      </div>`;
  }

  async function wiederherstellenSpeichern(einheitId) {
    const scopeEl = document.querySelector('input[name="wh-scope"]:checked');
    const scope   = scopeEl ? scopeEl.value : 'einzel';
    try {
      await apiPost(`einheiten/${einheitId}/wiederherstellen`, { scope });
      absageDialogSchliessen();
      notify('Absage aufgehoben.', 'ok');
      renderKal();
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  // ── Tagesnotizen ─────────────────────────────────────────────
  function notizHinzufuegen(datum) {
    _oeffneNotizDialog({ datum, inhalt: '', id: null });
  }

  function notizBearbeiten(id, inhalt) {
    _oeffneNotizDialog({ id, inhalt, datum: null });
  }

  function _oeffneNotizDialog({ datum, inhalt, id }) {
    const mc = document.getElementById('modal-container');
    if (!mc) return;
    const titel = id ? 'Notiz bearbeiten' : `Notiz für ${datum}`;
    mc.innerHTML = `
      <div class="modal-overlay" onclick="PLANUNG.notizDialogSchliessen()">
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width:480px">
          <div class="modal-head">
            <span class="modal-title">${escapeHtml(titel)}</span>
            <button class="modal-close" onclick="PLANUNG.notizDialogSchliessen()">×</button>
          </div>
          <div class="modal-body" style="padding:20px">
            <textarea id="notiz-inhalt" class="settings-input" rows="4"
              style="width:100%;resize:vertical;font-size:14px;line-height:1.5"
              placeholder="Notiz eingeben…">${escapeHtml(inhalt)}</textarea>
            <p style="font-size:12px;color:var(--text2);margin:8px 0 0">
              Erscheint bei allen Athleten im Kalender und im ICS-Abo als ganztägiger Termin.
            </p>
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost" onclick="PLANUNG.notizDialogSchliessen()">Abbrechen</button>
            <button class="btn btn-primary" onclick="PLANUNG.notizSpeichern(${id ? id : 'null'},'${datum || ''}')">Speichern</button>
          </div>
        </div>
      </div>`;
    setTimeout(() => {
      const ta = document.getElementById('notiz-inhalt');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 50);
  }

  function notizDialogSchliessen() {
    const mc = document.getElementById('modal-container');
    if (mc) mc.innerHTML = '';
  }

  async function notizSpeichern(id, datum) {
    const ta = document.getElementById('notiz-inhalt');
    if (!ta) return;
    const inhalt = ta.value.trim();
    if (!inhalt) { notify('Notiz darf nicht leer sein.', 'warn'); ta.focus(); return; }

    try {
      if (id) {
        await apiPut(`tagesnotizen/${id}`, { inhalt });
      } else {
        const gruppeId = aktivGruppe ? aktivGruppe.id : null;
        await apiPost('tagesnotizen', { datum, inhalt, gruppe_id: gruppeId });
      }
      notizDialogSchliessen();
      notify('Notiz gespeichert.', 'ok');
      renderKal();
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function notizLoeschen(id) {
    if (!confirm('Notiz wirklich löschen?')) return;
    try {
      await apiDel(`tagesnotizen/${id}`);
      notify('Notiz gelöscht.', 'ok');
      renderKal();
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  return {
    render, navigateMonth, reloadSidebar, loescheEinheit,
    einheitBearbeiten, einheitBearbeitenSpeichern,
    einheitLoeschenAusEditor, editorFooterRestore: _editorFooterStandard,
    reloadKal: renderKal,
    gruppeWechseln, gruppenKonfigurieren, gruppenKonfigSpeichern,
    _gkToggle, _gkMitgliedHinzufuegen, _gkMitgliedEntfernen, _gkNeuAnlegen,
    getAktivGruppe,
    wechsleSection,
    setDefaultFarbe, resetDefaultFarbe,
    oeffneAthletPlan, athletZurueck,
    notizHinzufuegen, notizBearbeiten, notizSpeichern,
    notizLoeschen, notizDialogSchliessen,
    absagenEinheit, absagenSpeichern, absageDialogSchliessen,
    wiederherstellenEinheit, wiederherstellenSpeichern,
  };
})();
