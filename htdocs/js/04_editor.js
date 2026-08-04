// ============================================================
// Trainingsportal – Betreuer-Editor
// ============================================================
// Modal zum Anlegen/Bearbeiten einer Trainingseinheit:
//   - Datum, Uhrzeit, Typ, Titel, Treffpunkt, Bemerkung
//   - Sichtbarkeit (öffentlich/intern), Status (geplant/abgesagt)
//   - "Strukturieren"-Button: ruft PARSER.parse(titel) auf
//     und zeigt Segmente als editierbare Tabelle
//   - Speichern: PUT/POST einheiten inkl. Segmente
// ============================================================

const EDITOR = (() => {

  // Aktueller Editor-State (im Modal)
  let currentId       = null;
  let currentSerieId  = null;
  let currentDatum    = null;
  let currentBaum     = [];

  // Typen aus globalem getTypen() (02_app.js), konfiguriert via Admin → Einstellungen
  function getTypOptions() {
    return getTypen().map(x => ({ value: x.slug, label: x.bezeichnung }));
  }
  async function open(opts) {
    // opts: { datum?, einheit?, segmente? }
    const ist_neu = !opts.einheit;
    const e = opts.einheit || {
      id: null, datum: opts.datum || ymd(new Date()),
      uhrzeit: '', typ: 'intervall', titel: '',
      treffpunkt: null, komoot_url: '', bemerkung: '',
      sichtbarkeit: 'oeffentlich', status: 'geplant',
      serie_id: null,
    };
    currentId      = e.id;
    currentSerieId = e.serie_id || null;
    currentDatum   = e.datum || null;
    currentBaum = SEG.baumAusRows(opts.segmente || []);

    // Treffpunkte + Pace-Referenzen für die Dropdowns laden
    let tpListe = [];
    try { [tpListe] = await Promise.all([TREFFPUNKTE.laden(), PACE.load()]); } catch (_) {}
    const curTpId = e.treffpunkt ? e.treffpunkt.id
      : (ist_neu ? ((appConfig.typen || []).find(t => t.slug === e.typ)?.default_treffpunkt_id ?? null) : null);
    const tpOptionen = `<option value="">— kein Treffpunkt —</option>` +
      tpListe.map(t => `<option value="${t.id}"${t.id === curTpId ? ' selected' : ''}>${escapeHtml(t.name)}</option>`).join('');

    const istRunde = hatStrecke(e.typ);

    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card modal-wide" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">${ist_neu ? 'Neue Einheit' : 'Einheit bearbeiten'}${!ist_neu && e.serie_id ? ' <span class="serie-badge">↺ Serie</span>' : ''}</div>
              <div class="modal-title">${ist_neu ? 'Training planen' : escapeHtml(e.titel || '')}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <div class="ed-grid">
              <div class="ed-fg">
                <label>Datum</label>
                <input type="date" id="ed-datum" value="${escapeHtml(e.datum || '')}">
              </div>
              <div class="ed-fg">
                <label>Uhrzeit</label>
                <input type="time" id="ed-uhrzeit" value="${escapeHtml(e.uhrzeit || '')}">
              </div>
              <div class="ed-fg">
                <label>Typ</label>
                <select id="ed-typ" onchange="EDITOR.onTypChange()">${getTypOptions().map(o => `<option value="${o.value}"${o.value===e.typ?' selected':''}>${o.label}</option>`).join('')}</select>
              </div>
              <div class="ed-fg">
                <label>Sichtbarkeit</label>
                <select id="ed-sichtbarkeit">
                  <option value="oeffentlich"${e.sichtbarkeit==='oeffentlich'?' selected':''}>Öffentlich</option>
                  <option value="intern"${e.sichtbarkeit==='intern'?' selected':''}>Intern (nur eingeloggt)</option>
                </select>
              </div>
              <div class="ed-fg ed-fg-wide">
                <label>Titel / Kurzschrift <span class="ed-hint">(z. B. „12 x 400 m (100GP)")</span></label>
                <input type="text" id="ed-titel" value="${escapeHtml(e.titel || '')}" placeholder="z. B. 8 x 600 m (100TP)">
              </div>
              <div class="ed-fg">
                <label>Treffpunkt</label>
                <select id="ed-treffpunkt-id">${tpOptionen}</select>
              </div>
              <div class="ed-fg">
                <label>Status</label>
                <select id="ed-status">
                  <option value="geplant"${e.status==='geplant'?' selected':''}>Geplant</option>
                  <option value="abgesagt"${e.status==='abgesagt'?' selected':''}>Abgesagt</option>
                </select>
              </div>
              <div class="ed-fg ed-fg-wide">
                <label>Bemerkung</label>
                <textarea id="ed-bemerkung" rows="2">${escapeHtml(e.bemerkung || '')}</textarea>
              </div>
            </div>

            <div id="ed-komoot-wrap" class="ed-komoot-wrap"${istRunde ? '' : ' style="display:none"'}>
              ${STRECKEN.feldHtml('ed-strecke')}
              <div class="ed-fg ed-fg-wide">
                <label>Komoot-Strecke <span class="ed-hint">(optionaler Tour-Link, z. B. https://www.komoot.com/tour/…)</span></label>
                <input type="url" id="ed-komoot-url" value="${escapeHtml(e.komoot_url || '')}" placeholder="https://www.komoot.com/tour/…">
              </div>
            </div>

            <div id="ed-seg-wrap" class="ed-segwrap"${istRunde ? ' style="display:none"' : ''}>
              <div class="ed-segheader">
                <h3>Segmente</h3>
                <div class="ed-segactions">
                  <button class="btn btn-ghost" onclick="EDITOR.parsenAusTitel()">Aus Titel parsen</button>
                </div>
              </div>
              <div id="ed-segmente-tabelle"></div>
              <div id="ed-gesamtdistanz" class="be-gesamtdistanz"></div>
              <div class="ed-seghint">
                Distanz in Metern · Blöcke lassen sich verschachteln (Block im Block) · TP/GP/BP = Trab-/Geh-/Blockpause
              </div>
            </div>

            <div class="ed-footer">
              ${!ist_neu ? `<button class="btn btn-danger" onclick="EDITOR.loeschen()">Löschen</button>` : '<span></span>'}
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" onclick="EDITOR.speichern()">Speichern</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    rendereSegmente();
    STRECKEN.feldInit('ed-strecke', e.strecke_id || null);
  }

  function rendereSegmente() {
    SEG.editorMount('ed-segmente-tabelle', currentBaum, baum => {
      currentBaum = baum;
      const el = document.getElementById('ed-gesamtdistanz');
      if (el) {
        const m = SEG.gesamtDistanz(baum);
        el.textContent = m ? 'Gesamtdistanz: ' + SEG.fmtDist(m) : '';
      }
    });
  }

  function parsenAusTitel() {
    const titel = (document.getElementById('ed-titel') || {}).value || '';
    const baum = PARSER.parseBaum(titel);
    if (!baum.length) {
      benachrichtigen('Konnte aus dem Titel keine Segmente erkennen.', 'warn');
      return;
    }
    currentBaum = baum;
    rendereSegmente();
  }

  function onTypChange() {
    const typ = (document.getElementById('ed-typ') || {}).value || '';
    const istRunde = hatStrecke(typ);
    const komootWrap = document.getElementById('ed-komoot-wrap');
    const segWrap    = document.getElementById('ed-seg-wrap');
    if (komootWrap) komootWrap.style.display = istRunde ? '' : 'none';
    if (segWrap)    segWrap.style.display    = istRunde ? 'none' : '';

    // Standard-Treffpunkt des Typs vorausfüllen – nur wenn noch kein Treffpunkt gesetzt
    const tpSel = document.getElementById('ed-treffpunkt-id');
    if (tpSel && tpSel.value === '' && currentId === null) {
      const typDef = (appConfig.typen || []).find(t => t.slug === typ);
      if (typDef && typDef.default_treffpunkt_id) {
        tpSel.value = String(typDef.default_treffpunkt_id);
      }
    }
  }

  function _sammlePayload() {
    const tpIdStr  = val('ed-treffpunkt-id');
    const typ      = val('ed-typ');
    const istRunde = hatStrecke(typ);
    return {
      datum:          val('ed-datum'),
      uhrzeit:        val('ed-uhrzeit') || null,
      typ,
      titel:          val('ed-titel'),
      treffpunkt_id:  tpIdStr !== '' ? parseInt(tpIdStr, 10) : null,
      komoot_url:     istRunde ? (val('ed-komoot-url') || null) : null,
      strecke_id:     istRunde ? STRECKEN.feldWert('ed-strecke') : null,
      bemerkung:      val('ed-bemerkung') || null,
      sichtbarkeit:   val('ed-sichtbarkeit'),
      status:         val('ed-status'),
      segmente:       istRunde ? [] : SEG.rowsAusBaum(currentBaum),
    };
  }

  async function speichern() {
    // Serien-Einheit: erst Geltungsbereich abfragen
    if (currentId && currentSerieId) {
      const p = _sammlePayload();
      if (!p.datum) { benachrichtigen('Datum fehlt.', 'err'); return; }
      if (!p.titel) { benachrichtigen('Titel fehlt.', 'err'); return; }
      _zeigeSerienSpeichernOptionen();
      return;
    }
    await _speichernMitScope('einzel');
  }

  async function _speichernMitScope(scope) {
    const payload = _sammlePayload();
    if (!payload.datum)  { benachrichtigen('Datum fehlt.', 'err'); return; }
    if (!payload.titel)  { benachrichtigen('Titel fehlt.', 'err'); return; }

    try {
      if (!currentId) {
        await apiPost('einheiten', payload);
      } else if (scope === 'alle') {
        await apiPut(`serien/${currentSerieId}`, payload);
      } else if (scope === 'abjetzt') {
        await apiPut(`serien/${currentSerieId}/ab/${currentDatum}`, payload);
      } else {
        await apiPut(`einheiten/${currentId}`, payload);
      }
      schliesseModal();
      benachrichtigen('Gespeichert.', 'ok');
      renderPage();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function _zeigeSerienSpeichernOptionen() {
    const footer = document.querySelector('#modal-container .ed-footer');
    if (!footer) return;
    footer.innerHTML = `
      <div class="serie-del-frage">Änderungen auf welche Termine anwenden?</div>
      <div class="serie-del-btns">
        <button class="btn btn-ghost btn-sm" onclick="EDITOR.speichernEinzel()">Nur dieser Termin</button>
        <button class="btn btn-warning btn-sm" onclick="EDITOR.speichernAbJetzt()">Dieser und alle folgenden</button>
        <button class="btn btn-primary btn-sm" onclick="EDITOR.speichernAlle()">Gesamte Serie</button>
        <button class="btn btn-ghost btn-sm" onclick="EDITOR.loeschenAbbrechen()">Abbrechen</button>
      </div>`;
  }

  function speichernEinzel()  { _speichernMitScope('einzel');  }
  function speichernAbJetzt() { _speichernMitScope('abjetzt'); }
  function speichernAlle()    { _speichernMitScope('alle');    }

  async function loeschen() {
    if (!currentId) return;
    if (currentSerieId) {
      _zeigeSerienLoeschenOptionen();
      return;
    }
    if (!confirm('Diese Einheit wirklich löschen?')) return;
    try {
      await apiDel(`einheiten/${currentId}`);
      schliesseModal();
      benachrichtigen('Gelöscht.', 'ok');
      renderPage();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function _zeigeSerienLoeschenOptionen() {
    const footer = document.querySelector('#modal-container .ed-footer');
    if (!footer) return;
    footer.innerHTML = `
      <div class="serie-del-frage">Welche Termine löschen?</div>
      <div class="serie-del-btns">
        <button class="btn btn-ghost btn-sm" onclick="EDITOR.loeschenNurDieser()">Nur dieser Termin</button>
        <button class="btn btn-warning btn-sm" onclick="EDITOR.loeschenAbJetzt()">Dieser und alle folgenden</button>
        <button class="btn btn-danger btn-sm" onclick="EDITOR.loeschenAlleSerie()">Gesamte Serie</button>
        <button class="btn btn-ghost btn-sm" onclick="EDITOR.loeschenAbbrechen()">Abbrechen</button>
      </div>`;
  }

  async function loeschenNurDieser() {
    try {
      await apiDel(`einheiten/${currentId}`);
      schliesseModal();
      benachrichtigen('Termin gelöscht.', 'ok');
      renderPage();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function loeschenAbJetzt() {
    if (!confirm(`Diesen und alle folgenden Termine der Serie (ab ${currentDatum}) löschen?`)) return;
    try {
      await apiDel(`serien/${currentSerieId}/ab/${currentDatum}`);
      schliesseModal();
      benachrichtigen('Termine gelöscht.', 'ok');
      renderPage();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function loeschenAlleSerie() {
    if (!confirm('Alle Termine dieser Serie löschen?')) return;
    try {
      await apiDel(`serien/${currentSerieId}`);
      schliesseModal();
      benachrichtigen('Serie gelöscht.', 'ok');
      renderPage();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function loeschenAbbrechen() {
    const footer = document.querySelector('#modal-container .ed-footer');
    if (!footer) return;
    footer.innerHTML = `
      <button class="btn btn-danger" onclick="EDITOR.loeschen()">Löschen</button>
      <div class="ed-footer-right">
        <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="EDITOR.speichern()">Speichern</button>
      </div>`;
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
  }

  function benachrichtigen(text, art) {
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
    open, parsenAusTitel,
    speichern, loeschen, onTypChange,
    speichernEinzel, speichernAbJetzt, speichernAlle,
    loeschenNurDieser, loeschenAbJetzt, loeschenAlleSerie, loeschenAbbrechen,
  };
})();
