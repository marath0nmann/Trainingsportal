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
  let currentId = null;
  let currentSegmente = [];

  // Typen dynamisch aus appConfig (via GET /config geladen), Fallback hardcodiert
  const FALLBACK_TYP_OPTIONS = [
    { value: 'intervall',     label: 'Intervall' },
    { value: 'dauerlauf',     label: 'Dauerlauf' },
    { value: 'funktionell',   label: 'Funktionelles Training' },
    { value: 'runde',         label: 'Runde / Strecke' },
    { value: 'event',         label: 'Event / Wettkampf' },
    { value: 'frei',          label: 'Sonstiges' },
    { value: 'kein_training', label: 'Kein Training' },
  ];
  function getTypOptions() {
    const t = appConfig && appConfig.typen;
    if (Array.isArray(t) && t.length) return t.map(x => ({ value: x.slug, label: x.bezeichnung }));
    return FALLBACK_TYP_OPTIONS;
  }
  const PAUSE_OPTIONS = [
    { value: 'TP',   label: 'TP – Trabpause' },
    { value: 'GP',   label: 'GP – Gehpause' },
    { value: 'BP',   label: 'BP – Blockpause' },
    { value: 'frei', label: '— frei —' },
  ];

  function open(opts) {
    // opts: { datum?, einheit?, segmente? }
    const ist_neu = !opts.einheit;
    const e = opts.einheit || {
      id: null, datum: opts.datum || ymd(new Date()),
      uhrzeit: '', typ: 'intervall', titel: '',
      treffpunkt: 'Sportplatz', bemerkung: '',
      sichtbarkeit: 'oeffentlich', status: 'geplant',
    };
    currentId = e.id;
    currentSegmente = (opts.segmente || []).map(s => ({...s}));

    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card modal-wide" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">${ist_neu ? 'Neue Einheit' : 'Einheit bearbeiten'}</div>
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
                <select id="ed-typ">${getTypOptions().map(o => `<option value="${o.value}"${o.value===e.typ?' selected':''}>${o.label}</option>`).join('')}</select>
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
                <input type="text" id="ed-treffpunkt" value="${escapeHtml(e.treffpunkt || '')}">
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

            <div class="ed-segwrap">
              <div class="ed-segheader">
                <h3>Segmente</h3>
                <div class="ed-segactions">
                  <button class="btn btn-ghost" onclick="EDITOR.parsenAusTitel()">Aus Titel parsen</button>
                  <button class="btn btn-ghost" onclick="EDITOR.segmentHinzufuegen()">+ Segment</button>
                </div>
              </div>
              <div id="ed-segmente-tabelle"></div>
              <div class="ed-seghint">
                Pause in Metern · TP/GP/BP = Trab-/Geh-/Blockpause · Pace-Referenz wird für die persönliche Pace im Athleten-View benutzt
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
  }

  function rendereSegmente() {
    const wrap = document.getElementById('ed-segmente-tabelle');
    if (!wrap) return;
    if (!currentSegmente.length) {
      wrap.innerHTML = `<div class="ed-segleer">Keine Segmente. Klick „Aus Titel parsen" oder „+ Segment".</div>`;
      return;
    }
    const paceOpts = PACE.getOptions().map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const rows = currentSegmente.map((s, i) => `
      <tr>
        <td><input type="number" min="1" value="${s.wiederholungen ?? 1}" data-i="${i}" data-f="wiederholungen" class="ed-seg-input ed-seg-num"></td>
        <td><input type="number" min="50" step="50" value="${s.distanz_m ?? ''}" data-i="${i}" data-f="distanz_m" class="ed-seg-input ed-seg-dist"></td>
        <td><input type="number" min="0" step="50" value="${s.pause_m ?? ''}" data-i="${i}" data-f="pause_m" class="ed-seg-input ed-seg-dist"></td>
        <td>
          <select data-i="${i}" data-f="pause_typ" class="ed-seg-input">
            ${PAUSE_OPTIONS.map(o => `<option value="${o.value}"${o.value===(s.pause_typ||'TP')?' selected':''}>${o.label}</option>`).join('')}
          </select>
        </td>
        <td>
          <select data-i="${i}" data-f="pace_referenz" class="ed-seg-input">
            ${PACE.getOptions().map(o => `<option value="${o.value}"${o.value===(s.pace_referenz||'')?' selected':''}>${o.label}</option>`).join('')}
          </select>
        </td>
        <td><button class="btn-icon" title="Segment löschen" onclick="EDITOR.segmentLoeschen(${i})">×</button></td>
      </tr>`).join('');

    wrap.innerHTML = `
      <table class="ed-seg-table">
        <thead>
          <tr>
            <th>Wdh</th><th>Distanz (m)</th><th>Pause (m)</th><th>Pause-Typ</th><th>Pace-Referenz</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    wrap.querySelectorAll('.ed-seg-input').forEach(el => {
      el.addEventListener('change', onSegEdit);
      el.addEventListener('input',  onSegEdit);
    });
  }

  function onSegEdit(ev) {
    const t = ev.target;
    const i = parseInt(t.dataset.i, 10);
    const f = t.dataset.f;
    if (!currentSegmente[i]) return;
    let v = t.value;
    if (['wiederholungen','distanz_m','pause_m'].includes(f)) {
      v = v === '' ? null : parseInt(v, 10);
    }
    if (f === 'pace_referenz' && v === '') v = null;
    currentSegmente[i][f] = v;
  }

  function parsenAusTitel() {
    const titel = (document.getElementById('ed-titel') || {}).value || '';
    const segs = PARSER.parse(titel);
    if (!segs.length) {
      benachrichtigen('Konnte aus dem Titel keine Segmente erkennen.', 'warn');
      return;
    }
    currentSegmente = segs;
    rendereSegmente();
  }

  function segmentHinzufuegen() {
    currentSegmente.push({
      wiederholungen: 1, distanz_m: 400, pause_m: 100,
      pause_typ: 'TP', pace_referenz: '5000', notiz: null,
    });
    rendereSegmente();
  }

  function segmentLoeschen(i) {
    currentSegmente.splice(i, 1);
    rendereSegmente();
  }

  async function speichern() {
    const payload = {
      datum:        val('ed-datum'),
      uhrzeit:      val('ed-uhrzeit') || null,
      typ:          val('ed-typ'),
      titel:        val('ed-titel'),
      treffpunkt:   val('ed-treffpunkt') || null,
      bemerkung:    val('ed-bemerkung') || null,
      sichtbarkeit: val('ed-sichtbarkeit'),
      status:       val('ed-status'),
      segmente:     currentSegmente,
    };
    if (!payload.datum)  { benachrichtigen('Datum fehlt.', 'err'); return; }
    if (!payload.titel)  { benachrichtigen('Titel fehlt.', 'err'); return; }

    try {
      if (currentId) {
        await apiPut(`einheiten/${currentId}`, payload);
      } else {
        await apiPost('einheiten', payload);
      }
      schliesseModal();
      benachrichtigen('Gespeichert.', 'ok');
      renderPage();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function loeschen() {
    if (!currentId) return;
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

  return { open, parsenAusTitel, segmentHinzufuegen, segmentLoeschen, speichern, loeschen };
})();
