// ============================================================
// Trainingsportal – Formularfelder für Trainingseinheiten
// ============================================================
// Ein Training entsteht auf vier Wegen, und jeder brachte bis v342 sein
// eigenes Formular mit:
//
//   1. EDITOR (04_editor.js)      – volle Einheit inkl. Segmenten
//   2. BLOECKE.anwenden()          – Block auf ein Datum legen, optional Serie
//   3. oeffneTerminModal()         – Termin-Felder einer bestehenden Einheit
//   4. MEINPLAN._openModal()       – private Einheit im eigenen Plan
//
// Die Feldmengen sind bewusst verschieden – eine private Einheit hat keinen
// Treffpunkt, ein Block bringt Titel und Typ schon mit. Gleich sind dagegen
// die *Felder selbst*: Beschriftung, Platzhalter, Optionslisten, Escaping.
// Genau die stehen hier, einmal.
//
// Jeder Aufrufer behält seine eigenen Element-IDs (`ed-datum`, `apply-datum`,
// `hte-datum`, `mp-datum`), damit die vorhandenen Speicher-Funktionen
// unverändert weiterlesen können.
// ============================================================

const FELDER = (() => {

  function _esc(v) { return escapeHtml(v == null ? '' : String(v)); }

  /** Ein Feld im Standard-Raster; `weit` spannt über beide Spalten. */
  function _fg(label, inhalt, weit, hinweis) {
    return `<div class="ed-fg${weit ? ' ed-fg-wide' : ''}">
      <label>${label}${hinweis ? ` <span class="ed-hint">${hinweis}</span>` : ''}</label>
      ${inhalt}
    </div>`;
  }

  // ── Standard-Uhrzeit je Wochentag ──────────────────────────
  // Gepflegt unter Admin → Einstellungen als JSON-Map { "1": "18:00", … }
  // mit 1 = Montag … 7 = Sonntag. Lag bis v342 nur in 08_bloecke.js, weshalb
  // sie beim Editor und im Mein-Plan-Modal fehlte.
  function standardUhrzeit(datum) {
    try {
      const raw = window.appConfig && appConfig.training_default_uhrzeiten;
      if (!raw || !datum) return '';
      const d = new Date(datum + 'T00:00:00');
      if (isNaN(d)) return '';
      const dow  = String(((d.getDay() + 6) % 7) + 1);
      const uMap = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (uMap[dow] || '').trim();
    } catch (_) { return ''; }
  }

  /**
   * Vorbelegter Treffpunkt für einen *neuen* Eintrag.
   * Erst der Typ-eigene Treffpunkt, dann der vereinsweite Standard – vorher
   * kannte der Editor nur den ersten, das Block-Formular nur den zweiten.
   */
  function standardTreffpunktId(typSlug) {
    const typen = (window.appConfig && Array.isArray(appConfig.typen)) ? appConfig.typen : [];
    const t = typen.find(x => x.slug === typSlug);
    if (t && t.default_treffpunkt_id != null && t.default_treffpunkt_id !== '') {
      return parseInt(t.default_treffpunkt_id, 10);
    }
    const global = window.appConfig && appConfig.training_standard_treffpunkt_id;
    return (global != null && global !== '') ? parseInt(global, 10) : null;
  }

  // ── Einzelfelder ───────────────────────────────────────────

  function datum(id, wert, opt) {
    opt = opt || {};
    // onchange zieht die Standard-Uhrzeit nach, solange keine eigene gesetzt
    // ist; `opt.onchange` haengt eigene Logik des Aufrufers dahinter an
    // (das Block-Formular zieht daran seine Serien-Vorschau nach).
    const teile = [];
    if (opt.uhrzeitId) teile.push(`FELDER.uhrzeitNachziehen('${id}','${opt.uhrzeitId}')`);
    if (opt.onchange)  teile.push(opt.onchange);
    const on = teile.length ? ` onchange="${teile.join(';')}"` : '';
    return _fg(opt.pflicht === false ? 'Datum' : 'Datum *',
      `<input type="date" id="${id}" value="${_esc(wert)}"${on}>`);
  }

  function uhrzeit(id, wert) {
    return _fg('Uhrzeit', `<input type="time" id="${id}" value="${_esc(wert)}">`);
  }

  function typ(id, wert, opt) {
    opt = opt || {};
    const on = opt.onchange ? ` onchange="${opt.onchange}"` : '';
    const options = getTypen().map(t =>
      `<option value="${_esc(t.slug)}"${t.slug === wert ? ' selected' : ''}>${_esc(t.bezeichnung)}</option>`
    ).join('');
    return _fg('Typ', `<select id="${id}"${on}>${options}</select>`);
  }

  function titel(id, wert, opt) {
    opt = opt || {};
    return _fg(opt.label || 'Bezeichnung *',
      `<input type="text" id="${id}" value="${_esc(wert)}" placeholder="${_esc(opt.platzhalter || 'z. B. Dauerlauf 10 km')}">`,
      true, opt.hinweis);
  }

  /**
   * Treffpunkt-Auswahl. `aktuellId` ist der gespeicherte Wert; ist er null und
   * `neuMitStandard` gesetzt, wird der Standard-Treffpunkt vorausgewählt.
   */
  function treffpunkt(id, tpListe, aktuellId, opt) {
    opt = opt || {};
    let sel = aktuellId;
    if ((sel == null || sel === '') && opt.neuMitStandard) sel = standardTreffpunktId(opt.typ);
    const optionen = `<option value=""${sel == null ? ' selected' : ''}>— kein Treffpunkt —</option>` +
      (tpListe || []).map(t =>
        `<option value="${t.id}"${Number(t.id) === Number(sel) ? ' selected' : ''}>${_esc(t.name)}</option>`
      ).join('');
    return _fg('Treffpunkt', `<select id="${id}">${optionen}</select>`);
  }

  function sichtbarkeit(id, wert) {
    return _fg('Sichtbarkeit', `<select id="${id}">
      <option value="oeffentlich"${wert === 'oeffentlich' ? ' selected' : ''}>Öffentlich</option>
      <option value="intern"${wert === 'intern' ? ' selected' : ''}>Intern (nur eingeloggt)</option>
    </select>`);
  }

  function status(id, wert) {
    return _fg('Status', `<select id="${id}">
      <option value="geplant"${wert === 'geplant' ? ' selected' : ''}>Geplant</option>
      <option value="abgesagt"${wert === 'abgesagt' ? ' selected' : ''}>Abgesagt</option>
    </select>`);
  }

  function distanz(id, wert) {
    return _fg('Distanz (km)',
      `<input type="number" id="${id}" value="${_esc(wert)}" min="0" max="999.9" step="0.1" placeholder="z. B. 10.5">`);
  }

  function bemerkung(id, wert) {
    return _fg('Bemerkung', `<textarea id="${id}" rows="2">${_esc(wert)}</textarea>`, true);
  }

  // ── Verhalten ──────────────────────────────────────────────

  /**
   * Nach einem Datumswechsel die Standard-Uhrzeit des neuen Wochentags
   * eintragen – aber nur, wenn das Feld leer ist oder noch den Standard des
   * alten Tages enthält. Eine von Hand gesetzte Zeit bleibt stehen.
   */
  function uhrzeitNachziehen(datumId, uhrzeitId) {
    const dEl = document.getElementById(datumId);
    const uEl = document.getElementById(uhrzeitId);
    if (!dEl || !uEl) return;
    const neu = standardUhrzeit(dEl.value);
    const alt = uEl.dataset.standard || '';
    if (uEl.value === '' || uEl.value === alt) {
      uEl.value = neu;
      uEl.dataset.standard = neu;
    }
  }

  // ── Werte lesen ────────────────────────────────────────────

  function wert(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
  }

  /** Zahl oder null – für Treffpunkt-IDs und Distanzen. */
  function zahl(id) {
    const v = wert(id);
    if (v === '') return null;
    const n = parseFloat(v.replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  /** Ganzzahl oder null. */
  function ganzzahl(id) {
    const n = zahl(id);
    return n == null ? null : parseInt(n, 10);
  }

  return {
    datum, uhrzeit, typ, titel, treffpunkt, sichtbarkeit, status, distanz, bemerkung,
    standardUhrzeit, standardTreffpunktId, uhrzeitNachziehen,
    wert, zahl, ganzzahl,
  };
})();
