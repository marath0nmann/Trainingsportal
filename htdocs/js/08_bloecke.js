// ============================================================
// Trainingsportal – Trainingsblöcke
// ============================================================
// Seite: #bloecke
//   - Alle eingeloggten User sehen globale + eigene private Blöcke
//   - Trainer/Admin: Neuen Block anlegen, bearbeiten, löschen
//   - Alle eingeloggten User: Block per „Im Kalender planen" anwenden
//   - Blöcke werden nach Trainingstyp gruppiert (konfigurierbar in Einstellungen)

const BLOECKE = (() => {

  // getTypen(), getTypLabel(), hatStrecke() aus 02_app.js (global)



  function istTrainer() {
    return state.user && (state.user.rolle === 'admin' || state.user.rolle === 'trainer');
  }

  // ── Hauptseite ────────────────────────────────────────────
  async function render(main) {
    main.innerHTML = `
      <div class="bloecke-wrap">
        <div class="bloecke-toolbar">
          <h1 class="bloecke-title">Trainingsblöcke</h1>
          <div class="bloecke-toolbar-right">
            ${istTrainer() ? `<button class="btn btn-primary" onclick="BLOECKE.neuerBlock()">+ Neuer Block</button>` : ''}
          </div>
        </div>
        <p class="bloecke-intro">
          Trainingsblöcke sind datumsunabhängige Vorlagen. Per „Im Kalender planen" werden sie als konkrete Trainingseinheit auf ein Datum gelegt.
        </p>
        <div id="bloecke-list" class="bloecke-loading">Lade Blöcke…</div>
      </div>`;
    await ladeListe();
  }

  async function ladeListe() {
    const container = document.getElementById('bloecke-list');
    if (!container) return;
    try {
      const [data] = await Promise.all([apiGet('bloecke', { silent: true }), STRECKEN.load()]);
      const bloecke = data.bloecke || [];
      if (!bloecke.length) {
        container.innerHTML = `<div class="bloecke-leer">Noch keine Trainingsblöcke vorhanden.${istTrainer() ? ' Erstelle den ersten Block mit „+ Neuer Block".' : ''}</div>`;
        return;
      }

      // Nach Typ gruppieren (Reihenfolge der Typen aus Config)
      const typen = getTypen();
      const slugReihenfolge = typen.map(t => t.slug);

      // Gruppen aufbauen: slug → { bezeichnung, global: [], privat: [] }
      const gruppen = {};
      bloecke.forEach(b => {
        const slug = b.typ || 'frei';
        if (!gruppen[slug]) {
          gruppen[slug] = { bezeichnung: getTypLabel(slug), global: [], privat: [] };
        }
        if (b.sichtbarkeit === 'privat') {
          gruppen[slug].privat.push(b);
        } else {
          gruppen[slug].global.push(b);
        }
      });

      // Sortierreihenfolge: bekannte Typen zuerst (in Config-Reihenfolge), dann Rest
      const vorhandene = Object.keys(gruppen);
      const sortiert = [
        ...slugReihenfolge.filter(s => vorhandene.includes(s)),
        ...vorhandene.filter(s => !slugReihenfolge.includes(s)).sort(),
      ];

      let html = '';
      for (const slug of sortiert) {
        const g = gruppen[slug];
        const alle = [...g.global, ...g.privat];
        if (!alle.length) continue;
        const anzahl = alle.length;
        html += `<h2 class="bloecke-gruppe-titel">
          <span class="bloecke-gruppe-typ block-typ-${escapeHtml(slug)}">${escapeHtml(g.bezeichnung)}</span>
          <span class="bloecke-gruppe-count">${anzahl} ${anzahl === 1 ? 'Block' : 'Blöcke'}</span>
        </h2>`;
        if (g.global.length && g.privat.length) {
          // Beide Sichtbarkeiten vorhanden → kurze Sub-Labels
          html += `<div class="bloecke-grid">${g.global.map(renderBlockCard).join('')}</div>`;
          html += `<div class="bloecke-grid bloecke-grid-privat">${g.privat.map(renderBlockCard).join('')}</div>`;
        } else {
          html += `<div class="bloecke-grid">${alle.map(renderBlockCard).join('')}</div>`;
        }
      }

      container.innerHTML = html;

      // Streckenvorschauen nachladen (Geometrie steckt nicht in der Blockliste)
      container.querySelectorAll('.block-strecke-thumb[data-strecke-id]').forEach(el => {
        STRECKEN.vorschauEinbinden(el, el.dataset.streckeId, { breite: 260, hoehe: 120, ohneText: true });
      });
    } catch (e) {
      container.innerHTML = `<div class="bloecke-leer bloecke-error">Fehler: ${escapeHtml(e.message || '')}</div>`;
    }
  }

  // Extrahiert Tour-ID aus Komoot-URL → Embed-URL (lokale Kopie des globalen Helpers)
  function komootEmbedUrl(url) {
    if (!url) return null;
    const m = String(url).match(/\/tour\/(\d+)/);
    if (!m) return null;
    let token = null;
    try { token = new URL(url).searchParams.get('share_token'); } catch (_) {}
    const qs = token ? '?share_token=' + encodeURIComponent(token) : '';
    return 'https://www.komoot.com/tour/' + m[1] + '/embed' + qs;
  }

  function renderBlockCard(b) {
    const istGlobal = b.sichtbarkeit === 'global';
    const kannBearbeiten = istTrainer()
      || (!istGlobal && state.user && b.erstellt_von === state.user.id);
    const istRunde = hatStrecke(b.typ);
    const segCount = b.seg_count ?? null;
    const strecke = b.strecke_id ? STRECKEN.ausListe(b.strecke_id) : null;
    const infoBadge = istRunde
      ? (b.strecke_id
          ? `<span class="block-seg-badge block-strecke-badge" title="${escapeHtml(strecke ? strecke.name : 'Streckenverlauf hinterlegt')}">${escapeHtml(strecke ? STRECKEN.fmtDistanz(strecke.distanz_m) : 'Strecke')}</span>`
          : b.komoot_url
            ? `<a class="block-seg-badge block-komoot-badge" href="${escapeHtml(b.komoot_url)}" target="_blank" rel="noopener" title="Komoot-Strecke öffnen">Komoot</a>`
            : `<span class="block-seg-badge block-seg-leer">Keine Strecke</span>`)
      : (segCount !== null
          ? (segCount > 0
              ? `<span class="block-seg-badge">${segCount} Seg.</span>`
              : `<span class="block-seg-badge block-seg-leer" title="Titel wird beim Öffnen automatisch geparst">∅ Segmente</span>`)
          : '');
    return `
      <div class="block-card block-typ-${escapeHtml(b.typ)}">
        <div class="block-card-head">
          ${!istGlobal
            ? '<span class="block-sicht-badge block-sicht-privat">Privat</span>'
            : ''}
          ${infoBadge}
        </div>
        <div class="block-titel">${escapeHtml(b.titel)}</div>
        ${b.bemerkung  ? `<div class="block-bemerkung">${escapeHtml(b.bemerkung)}</div>`   : ''}
        ${b.strecke_id ? `<div class="block-strecke-thumb" data-strecke-id="${b.strecke_id}"></div>` : ''}
        <div class="block-card-actions">
          <button class="btn btn-primary btn-sm" onclick="BLOECKE.anwenden(${b.id})">Im Kalender planen</button>
          ${kannBearbeiten ? `<button class="btn btn-ghost btn-sm" onclick="BLOECKE.bearbeiten(${b.id})">Bearbeiten</button>` : ''}
          ${b.strecke_id ? `<a class="btn btn-ghost btn-sm" href="api/index.php?p=strecken/${b.strecke_id}/gpx" download title="Strecke als GPX für Uhr/Navi">GPX</a>` : ''}
        </div>
      </div>`;
  }

  // ── Block auf Kalender anwenden ───────────────────────────
  // datum:    optionales ISO-Datum (YYYY-MM-DD), z. B. vom Planung-DnD gesetzt
  // gruppeId: optionale Trainingsgruppen-ID aus dem aktiven Planungs-Tab
  async function anwenden(blockId, datum, gruppeId) {
    let blockData, tpListe;
    try {
      [blockData, tpListe] = await Promise.all([
        apiGet(`bloecke/${blockId}`, { silent: true }),
        TREFFPUNKTE.laden(),
      ]);
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
      return;
    }
    const b = blockData.block;
    _anwendenGruppeId = gruppeId || null;
    const heute = datum || ymd(new Date());
    const stdTpId = String(appConfig && appConfig.training_standard_treffpunkt_id || '');
    const tpOptionen = `<option value=""${stdTpId === '' ? ' selected' : ''}>— kein Treffpunkt —</option>` +
      tpListe.map(t => `<option value="${t.id}"${String(t.id) === stdTpId ? ' selected' : ''}>${escapeHtml(t.name)}</option>`).join('');

    // Default-Uhrzeit aus Admin-Einstellungen per Wochentag (1=Mo … 7=So)
    let defaultUhrzeit = '';
    try {
      const raw = appConfig && appConfig.training_default_uhrzeiten;
      if (raw) {
        const datObj = new Date(heute + 'T00:00:00');
        const dow = String(((datObj.getDay() + 6) % 7) + 1);
        const uMap = typeof raw === 'string' ? JSON.parse(raw) : raw;
        defaultUhrzeit = (uMap[dow] || '').trim();
      }
    } catch (_) {}
    const cont = document.getElementById('modal-container');

    // Standard-Wochentag des Startdatums (für Serienvorbelegung)
    const startDow = new Date(heute + 'T00:00:00').getDay(); // 0=So..6=Sa
    const dowMap = ['SU','MO','TU','WE','TH','FR','SA'];
    const defaultByday = dowMap[startDow];

    // Standardmäßiges Enddatum: 3 Monate nach Startdatum
    const defaultUntil = (() => {
      const d = new Date(heute + 'T00:00:00');
      d.setMonth(d.getMonth() + 3);
      return d.toISOString().slice(0, 10);
    })();

    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Block anwenden</div>
              <div class="modal-title">${escapeHtml(b.titel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <div class="ed-grid">
              <div class="ed-fg">
                <label>Datum *</label>
                <input type="date" id="apply-datum" value="${heute}" onchange="BLOECKE.onApplyDatumChange()">
              </div>
              <div class="ed-fg">
                <label>Uhrzeit</label>
                <input type="time" id="apply-uhrzeit" value="${escapeHtml(defaultUhrzeit)}">
              </div>
              <div class="ed-fg">
                <label>Treffpunkt</label>
                <select id="apply-treffpunkt-id">${tpOptionen}</select>
              </div>
              <div class="ed-fg">
                <label>Sichtbarkeit</label>
                <select id="apply-sichtbarkeit">
                  <option value="oeffentlich"${b.sichtbarkeit === 'global' ? ' selected' : ''}>Öffentlich</option>
                  <option value="intern"${b.sichtbarkeit === 'privat' ? ' selected' : ''}>Intern</option>
                </select>
              </div>
              <div class="ed-fg ed-fg-wide serie-toggle-row">
                <label class="serie-toggle-label">
                  <input type="checkbox" id="apply-wiederkehrend" onchange="BLOECKE.onWiederkehrendChange()">
                  Als Serientermin anlegen
                </label>
              </div>
            </div>

            <div id="apply-serie-wrap" class="apply-serie-wrap" style="display:none">
              <div class="apply-serie-inner">
                <div class="ed-fg">
                  <label>Wiederholung</label>
                  <select id="apply-freq" onchange="BLOECKE.onApplyFreqChange()">
                    <option value="weekly:1">Jede Woche</option>
                    <option value="weekly:2">Alle 2 Wochen</option>
                    <option value="weekly:3">Alle 3 Wochen</option>
                    <option value="weekly:4">Alle 4 Wochen</option>
                    <option value="monthly:1">Monatlich (gleicher Tag)</option>
                    <option value="daily:1">Täglich</option>
                  </select>
                </div>
                <div class="ed-fg" id="apply-byday-group">
                  <label>Wochentage</label>
                  <div class="byday-row">
                    ${['MO','TU','WE','TH','FR','SA','SU'].map((d, i) => {
                      const labels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
                      return `<label class="byday-item"><input type="checkbox" class="apply-byday" value="${d}"${d === defaultByday ? ' checked' : ''}><span>${labels[i]}</span></label>`;
                    }).join('')}
                  </div>
                </div>
                <div class="ed-fg">
                  <label>Ende</label>
                  <select id="apply-ende-typ" onchange="BLOECKE.onApplyEndeTypChange()">
                    <option value="datum">An Datum</option>
                    <option value="count">Nach Anzahl Terminen</option>
                  </select>
                </div>
                <div class="ed-fg" id="apply-until-wrap">
                  <label>Enddatum</label>
                  <input type="date" id="apply-until" value="${defaultUntil}">
                </div>
                <div class="ed-fg" id="apply-count-wrap" style="display:none">
                  <label>Anzahl Termine</label>
                  <input type="number" id="apply-count" min="2" max="200" value="10">
                </div>
                <div id="apply-vorschau" class="apply-vorschau"></div>
              </div>
            </div>

            <div class="ed-footer">
              <span></span>
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" id="apply-submit-btn" onclick="BLOECKE.anwendenSpeichern(${b.id})">In Kalender eintragen</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function anwendenSpeichern(blockId) {
    const datum = val('apply-datum');
    if (!datum) { notify('Datum fehlt.', 'err'); return; }
    const tpIdStr = val('apply-treffpunkt-id');
    const istWiederkehrend = document.getElementById('apply-wiederkehrend')?.checked;

    if (istWiederkehrend) {
      // ── Serientermin anlegen ────────────────────────────────
      const freqVal  = val('apply-freq'); // z.B. "weekly:2"
      const [freq, intervalStr] = freqVal.split(':');
      const interval = parseInt(intervalStr || '1', 10);
      const byday    = [...document.querySelectorAll('.apply-byday:checked')].map(cb => cb.value);
      const endTyp   = val('apply-ende-typ');
      const until    = endTyp === 'datum' ? (val('apply-until') || null) : null;
      const countRaw = endTyp === 'count' ? parseInt(val('apply-count') || '0', 10) : null;
      const count    = countRaw && countRaw > 0 ? countRaw : null;

      if (freq === 'weekly' && !byday.length) {
        notify('Bitte mindestens einen Wochentag auswählen.', 'err'); return;
      }
      if (endTyp === 'datum' && !until) {
        notify('Enddatum fehlt.', 'err'); return;
      }
      if (endTyp === 'datum' && until < datum) {
        notify('Enddatum muss nach dem Startdatum liegen.', 'err'); return;
      }
      if (endTyp === 'count' && !count) {
        notify('Anzahl Termine fehlt.', 'err'); return;
      }

      const payload = {
        block_id:      blockId,
        startdatum:    datum,
        uhrzeit:       val('apply-uhrzeit') || null,
        treffpunkt_id: tpIdStr !== '' ? parseInt(tpIdStr, 10) : null,
        sichtbarkeit:  val('apply-sichtbarkeit'),
        gruppe_id:     _anwendenGruppeId || null,
        regel: { freq, interval, byday: freq === 'weekly' ? byday : [], until, count },
      };
      try {
        const btn = document.getElementById('apply-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Wird angelegt…'; }
        const res = await apiPost('serien', payload);
        schliesseModal();
        notify(`${res.count} Serientermine angelegt.`, 'ok');
        const [y, m] = datum.split('-');
        location.hash = `#kalender/${y}-${m}`;
      } catch (e) {
        const btn = document.getElementById('apply-submit-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'In Kalender eintragen'; }
        notify('Fehler: ' + (e.message || ''), 'err');
      }
    } else {
      // ── Einzelner Termin ────────────────────────────────────
      const payload = {
        datum,
        uhrzeit:       val('apply-uhrzeit') || null,
        treffpunkt_id: tpIdStr !== '' ? parseInt(tpIdStr, 10) : null,
        sichtbarkeit:  val('apply-sichtbarkeit'),
        gruppe_id:     _anwendenGruppeId || null,
      };
      try {
        await apiPost(`bloecke/${blockId}/apply`, payload);
        schliesseModal();
        notify('Training in den Kalender eingetragen.', 'ok');
        if ((location.hash || '').startsWith('#planung') && typeof PLANUNG !== 'undefined') {
          PLANUNG.reloadKal();
        } else {
          const [y, m] = datum.split('-');
          location.hash = `#kalender/${y}-${m}`;
        }
      } catch (e) {
        notify('Fehler: ' + (e.message || ''), 'err');
      }
    }
  }

  // ── Serientermin-UI-Handler ────────────────────────────────
  function onWiederkehrendChange() {
    const checked = document.getElementById('apply-wiederkehrend')?.checked;
    const wrap = document.getElementById('apply-serie-wrap');
    if (wrap) wrap.style.display = checked ? '' : 'none';
    const btn = document.getElementById('apply-submit-btn');
    if (btn) btn.textContent = checked ? 'Serie anlegen' : 'In Kalender eintragen';
    if (checked) aktualisiereSerieVorschau();
  }

  function onApplyDatumChange() {
    // Standard-Wochentag bei Datumsänderung neu setzen (nur wenn kein Tag manuell gewählt)
    const datum = val('apply-datum');
    if (!datum) return;
    const checked = document.getElementById('apply-wiederkehrend')?.checked;
    if (!checked) return;
    const manuelleAuswahl = [...document.querySelectorAll('.apply-byday:checked')];
    if (!manuelleAuswahl.length) {
      const dow = new Date(datum + 'T00:00:00').getDay();
      const dowMap = ['SU','MO','TU','WE','TH','FR','SA'];
      document.querySelectorAll('.apply-byday').forEach(cb => {
        cb.checked = cb.value === dowMap[dow];
      });
    }
    aktualisiereSerieVorschau();
  }

  function onApplyFreqChange() {
    const freq = val('apply-freq').split(':')[0];
    const bdayGroup = document.getElementById('apply-byday-group');
    if (bdayGroup) bdayGroup.style.display = freq === 'weekly' ? '' : 'none';
    aktualisiereSerieVorschau();
  }

  function onApplyEndeTypChange() {
    const typ = val('apply-ende-typ');
    const untilWrap = document.getElementById('apply-until-wrap');
    const countWrap = document.getElementById('apply-count-wrap');
    if (untilWrap) untilWrap.style.display = typ === 'datum' ? '' : 'none';
    if (countWrap) countWrap.style.display = typ === 'count' ? '' : 'none';
    aktualisiereSerieVorschau();
  }

  function aktualisiereSerieVorschau() {
    const vEl = document.getElementById('apply-vorschau');
    if (!vEl) return;
    const datum    = val('apply-datum');
    const freqVal  = val('apply-freq');
    const [freq, intervalStr] = freqVal.split(':');
    const interval = parseInt(intervalStr || '1', 10);
    const byday    = [...document.querySelectorAll('.apply-byday:checked')].map(cb => cb.value);
    const endTyp   = val('apply-ende-typ');
    const until    = endTyp === 'datum' ? val('apply-until') : null;
    const countRaw = endTyp === 'count' ? parseInt(val('apply-count') || '0', 10) : null;
    if (!datum) { vEl.innerHTML = ''; return; }

    const daten = _generiereVorschauDaten(datum, freq, interval, byday, until, countRaw);
    if (!daten.length) { vEl.innerHTML = '<span class="vorschau-leer">Keine Termine generiert.</span>'; return; }

    const wdNames = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const formatDatum = d => {
      const dt = new Date(d + 'T00:00:00');
      return `${wdNames[dt.getDay()]}, ${dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })}`;
    };

    const anzeige = daten.slice(0, 5).map(d => `<span class="vorschau-datum">${formatDatum(d)}</span>`).join('');
    const rest = daten.length > 5 ? `<span class="vorschau-mehr">… und ${daten.length - 5} weitere</span>` : '';
    vEl.innerHTML = `<div class="vorschau-label">Vorschau (${daten.length} Termine)</div><div class="vorschau-liste">${anzeige}${rest}</div>`;
  }

  function _generiereVorschauDaten(startDatum, freq, interval, byday, until, count) {
    // Spiegellogik der PHP-Funktion generiereOccurrences (clientseitig)
    const dayMap = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    const targetDays = byday.map(d => dayMap[d] ?? -1).filter(d => d >= 0);
    if (freq === 'weekly') targetDays.sort((a,b) => a-b);

    const maxT  = 200;
    const safeUntil = (() => {
      const d = new Date(startDatum + 'T00:00:00');
      d.setFullYear(d.getFullYear() + 2);
      return d.toISOString().slice(0, 10);
    })();
    const effUntil = (until && until < safeUntil) ? until : (until ? until : safeUntil);

    const dates = [];
    let n = 0;

    if (freq === 'daily') {
      let cur = new Date(startDatum + 'T00:00:00');
      while (n < maxT) {
        const s = cur.toISOString().slice(0, 10);
        if (s > effUntil) break;
        if (count && n >= count) break;
        dates.push(s);
        n++;
        cur.setDate(cur.getDate() + interval);
      }
    } else if (freq === 'weekly') {
      const effDays = targetDays.length ? targetDays : [new Date(startDatum + 'T00:00:00').getDay()];
      const startTs = new Date(startDatum + 'T00:00:00');
      const startDow = startTs.getDay();
      const sunday = new Date(startTs);
      sunday.setDate(sunday.getDate() - startDow);

      let weekSun = new Date(sunday);
      outer: while (n < maxT) {
        for (const dow of effDays) {
          const d = new Date(weekSun);
          d.setDate(d.getDate() + dow);
          const s = d.toISOString().slice(0, 10);
          if (s < startDatum) continue;
          if (s > effUntil) break outer;
          if (count && n >= count) break outer;
          dates.push(s);
          n++;
          if (n >= maxT) break outer;
        }
        weekSun.setDate(weekSun.getDate() + interval * 7);
      }
    } else if (freq === 'monthly') {
      const parts = startDatum.split('-');
      let y = parseInt(parts[0]), m = parseInt(parts[1]);
      const origDay = parseInt(parts[2]);
      while (n < maxT) {
        const lastDay = new Date(y, m, 0).getDate();
        const useDay  = Math.min(origDay, lastDay);
        const s = `${y}-${String(m).padStart(2,'0')}-${String(useDay).padStart(2,'0')}`;
        if (s > effUntil) break;
        if (count && n >= count) break;
        dates.push(s);
        n++;
        m += interval;
        while (m > 12) { m -= 12; y++; }
      }
    }
    return dates;
  }

  // ── Block-Editor ──────────────────────────────────────────
  // Segmentstruktur (verschachtelte Blöcke) steckt komplett in SEG.
  let editorBaum = [];
  let titelManuellBearbeitet = false;
  let _anwendenGruppeId = null; // Gruppen-ID beim Block-Anwenden (aus Planungs-Tab)

  function aktualisiereBlockTitelFeld() {
    if (!titelManuellBearbeitet) {
      const el = document.getElementById('be-titel');
      if (el) el.value = SEG.titel(editorBaum);
    }
    aktualisiereGesamtdistanz();
  }

  function titelNeuGenerieren() {
    titelManuellBearbeitet = false;
    aktualisiereBlockTitelFeld();
  }

  async function neuerBlock() {
    await Promise.all([PACE.load(), GRUPPEN.laden()]);
    openBlockEditor(null, []);
  }

  async function bearbeiten(blockId) {
    try {
      const [data] = await Promise.all([
        apiGet(`bloecke/${blockId}`, { silent: true }),
        PACE.load(),
        GRUPPEN.laden(),
      ]);
      openBlockEditor(data.block, data.segmente || []);
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function openBlockEditor(block, segmente) {
    const istNeu = !block;
    editorBaum = SEG.baumAusRows(segmente || []);
    // Segmente aus Titel parsen falls noch keine vorhanden
    if (!editorBaum.length && block && block.titel) {
      editorBaum = PARSER.parseBaum(block.titel);
    }
    // Titel für bestehende Blöcke schützen; für neue Blöcke auto-generieren
    titelManuellBearbeitet = !istNeu;

    const b = block || {
      id: null, titel: '', typ: 'intervall',
      komoot_url: '', bemerkung: '', sichtbarkeit: 'global', gruppen_ids: [],
    };
    // Gruppen-Checkboxen aufbauen
    const alleGruppen = await GRUPPEN.laden();
    const beGrSet = new Set(b.gruppen_ids || []);
    const typenOptionen = getTypen()
      .map(t => `<option value="${escapeHtml(t.slug)}"${t.slug === b.typ ? ' selected' : ''}>${escapeHtml(t.bezeichnung)}</option>`)
      .join('');

    const istRunde = hatStrecke(b.typ);

    const cont = document.getElementById('modal-container');

    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card modal-wide" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">${istNeu ? 'Neuer Trainingsblock' : 'Block bearbeiten'}</div>
              <div class="modal-title">${istNeu ? 'Block erstellen' : escapeHtml(b.titel || '')}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <div class="ed-titel-top"${istRunde ? ' data-runde="1"' : ''}>
              <label for="be-titel">Titel
                <span class="ed-hint" id="be-titel-hint">${istRunde ? '' : '(Kurzschrift – daraus lassen sich die Segmente erzeugen)'}</span>
              </label>
              <div class="ed-titel-row">
                <input type="text" id="be-titel" value="${escapeHtml(b.titel || '')}"
                  placeholder="${istRunde ? 'Name der Runde / Strecke' : 'z. B. 3 x (4 x 400, 100 TP), BP 400 TP'}">
                <button class="btn btn-primary ed-titel-parse" id="be-titel-parse-btn"
                  onclick="BLOECKE.parsenAusTitel()"
                  title="Kurzschrift im Titel in Segmente umwandeln"${istRunde ? ' style="display:none"' : ''}>⚡ Segmente aus Titel</button>
                <button class="btn btn-ghost ed-titel-reset" id="be-titel-reset-btn"
                  onclick="BLOECKE.titelNeuGenerieren()"
                  title="Titel aus den Segmenten neu erzeugen"${istRunde ? ' style="display:none"' : ''}>↺</button>
              </div>
              <div class="ed-titel-tipp" id="be-titel-tipp"${istRunde ? ' style="display:none"' : ''}>
                Kurzschrift eintippen und „Segmente aus Titel“ klicken – Klammern werden zu verschachtelten Blöcken.
                Beispiele zum Übernehmen:
                ${['3 x (4 x 400, 100 TP), BP 400 TP', '12 x 400 (100 GP)', '400 (200 TP) / 600 (200 TP) / 800']
                  .map(bsp => `<button type="button" class="ed-titel-bsp" onclick="BLOECKE.beispielUebernehmen('${escapeHtml(bsp)}')">${escapeHtml(bsp)}</button>`)
                  .join('')}
              </div>
            </div>

            <div class="ed-grid">
              <div class="ed-fg">
                <label>Typ</label>
                <select id="be-typ" onchange="BLOECKE.onTypChange()">${typenOptionen}</select>
              </div>
              <div class="ed-fg">
                <label>Sichtbarkeit</label>
                <select id="be-sichtbarkeit">
                  <option value="global"${b.sichtbarkeit === 'global' ? ' selected' : ''}>Global (für alle Trainer sichtbar)</option>
                  <option value="privat"${b.sichtbarkeit === 'privat' ? ' selected' : ''}>Privat (nur ich)</option>
                </select>
              </div>
              ${alleGruppen.length ? `
              <div class="ed-fg ed-fg-wide">
                <label>Trainingsgruppen <span class="ed-hint">(Zuordnung für Planungsansicht)</span></label>
                <div class="be-gruppen-list">
                  ${alleGruppen.map(g => `
                    <label class="profil-gruppe-item">
                      <input type="checkbox" class="be-gruppe-cb" value="${g.id}"${beGrSet.has(g.id) ? ' checked' : ''}>
                      <span>${escapeHtml(g.name)}</span>
                    </label>`).join('')}
                </div>
              </div>` : ''}
              <div class="ed-fg ed-fg-wide">
                <label>Bemerkung</label>
                <textarea id="be-bemerkung" rows="2">${escapeHtml(b.bemerkung || '')}</textarea>
              </div>
            </div>

            <div id="be-komoot-wrap" class="ed-komoot-wrap"${istRunde ? '' : ' style="display:none"'}>
              ${STRECKEN.feldHtml('be-strecke')}
              <div class="ed-fg ed-fg-wide">
                <label>Komoot-Strecke <span class="ed-hint">(optionaler Tour-Link, z. B. https://www.komoot.com/tour/…)</span></label>
                <input type="url" id="be-komoot-url" value="${escapeHtml(b.komoot_url || '')}" placeholder="https://www.komoot.com/tour/…">
              </div>
              <div class="ed-komoot-preview" id="be-komoot-preview">
                ${komootEmbedUrl(b.komoot_url) ? `<div class="komoot-embed"><iframe src="${escapeHtml(komootEmbedUrl(b.komoot_url))}" frameborder="0" scrolling="no" allow="fullscreen" loading="lazy"></iframe></div>` : ''}
              </div>
            </div>

            <div id="be-seg-wrap" class="ed-segwrap"${istRunde ? ' style="display:none"' : ''}>
              <div class="ed-segheader">
                <h3>Segmente</h3>
              </div>
              <div id="be-segmente-tabelle"></div>
              <div id="be-gesamtdistanz" class="be-gesamtdistanz"></div>
              <div class="ed-seghint">
                Distanz in Metern · TP/GP/BP = Trab-/Geh-/Blockpause · Pace-Referenz für persönliche Pace
              </div>
            </div>

            <div class="ed-footer">
              ${!istNeu
                ? `<button class="btn btn-danger" onclick="BLOECKE.loeschen(${b.id})">Löschen</button>`
                : '<span></span>'}
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" onclick="BLOECKE.speichern(${b.id || 'null'})">Speichern</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Manuelles Bearbeiten des Titels deaktiviert Auto-Generierung
    const titelEl = document.getElementById('be-titel');
    if (titelEl) {
      titelEl.addEventListener('input', () => { titelManuellBearbeitet = true; });
    }

    // Live-Vorschau für Komoot-URL
    const komootUrlEl = document.getElementById('be-komoot-url');
    if (komootUrlEl) {
      komootUrlEl.addEventListener('input', () => {
        const preview = document.getElementById('be-komoot-preview');
        if (!preview) return;
        const embedUrl = komootEmbedUrl(komootUrlEl.value);
        preview.innerHTML = embedUrl
          ? `<div class="komoot-embed"><iframe src="${escapeHtml(embedUrl)}" frameborder="0" scrolling="no" allow="fullscreen" loading="lazy"></iframe></div>`
          : '';
      });
    }

    rendereBlockEditor();
    STRECKEN.feldInit('be-strecke', b.strecke_id || null);
  }

  function onTypChange() {
    const typ = val('be-typ');
    const istRunde = hatStrecke(typ);
    const komootWrap = document.getElementById('be-komoot-wrap');
    const segWrap    = document.getElementById('be-seg-wrap');
    const resetBtn   = document.getElementById('be-titel-reset-btn');
    const parseBtn   = document.getElementById('be-titel-parse-btn');
    const tipp       = document.getElementById('be-titel-tipp');
    const titelHint  = document.getElementById('be-titel-hint');
    if (komootWrap) komootWrap.style.display = istRunde ? '' : 'none';
    if (segWrap)    segWrap.style.display    = istRunde ? 'none' : '';
    if (resetBtn)   resetBtn.style.display   = istRunde ? 'none' : '';
    if (parseBtn)   parseBtn.style.display   = istRunde ? 'none' : '';
    if (tipp)       tipp.style.display       = istRunde ? 'none' : '';
    if (titelHint)  titelHint.textContent    = istRunde ? '' : '(Kurzschrift – daraus lassen sich die Segmente erzeugen)';
    const titelEl = document.getElementById('be-titel');
    if (titelEl) titelEl.placeholder = istRunde ? 'Name der Runde / Strecke' : 'z. B. 3 x (4 x 400, 100 TP), BP 400 TP';
    if (!istRunde) {
      titelManuellBearbeitet = false;
      aktualisiereBlockTitelFeld();
    }
  }

  function formatDistanz(m) {
    if (!m) return null;
    if (m < 1000) return m + 'm';
    const km = m / 1000;
    return km.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + 'km';
  }

  function aktualisiereGesamtdistanz() {
    const el = document.getElementById('be-gesamtdistanz');
    if (!el) return;
    const text = formatDistanz(SEG.gesamtDistanz(editorBaum));
    el.textContent = text ? 'Gesamtdistanz: ' + text : '';
  }

  function rendereBlockEditor() {
    SEG.editorMount('be-segmente-tabelle', editorBaum, baum => {
      editorBaum = baum;
      aktualisiereBlockTitelFeld();
    });
  }

  // Kurzschrift aus dem Titelfeld in Segmente umwandeln
  function parsenAusTitel() {
    const titel = val('be-titel');
    if (!titel) { notify('Bitte zuerst eine Kurzschrift in das Titelfeld eintragen.', 'warn'); return; }
    const baum = PARSER.parseBaum(titel);
    if (!baum.length) {
      notify('Aus „' + titel + '“ ließen sich keine Segmente lesen.', 'warn');
      return;
    }
    editorBaum = baum;
    rendereBlockEditor();
    const dist = formatDistanz(SEG.gesamtDistanz(baum));
    notify('Segmente erzeugt' + (dist ? ' – ' + dist + ' gesamt' : '') + '.', 'ok');
  }

  // Beispiel-Kurzschrift in das Titelfeld übernehmen und gleich parsen
  function beispielUebernehmen(text) {
    const el = document.getElementById('be-titel');
    if (!el) return;
    el.value = text;
    titelManuellBearbeitet = true;
    parsenAusTitel();
  }

  async function speichern(blockId) {
    const typ      = val('be-typ');
    const istRunde = hatStrecke(typ);
    const gruppenIds = [...document.querySelectorAll('.be-gruppe-cb:checked')]
      .map(cb => parseInt(cb.value, 10)).filter(id => id > 0);
    const payload = {
      titel:        val('be-titel'),
      typ,
      komoot_url:   istRunde ? (val('be-komoot-url') || null) : null,
      strecke_id:   istRunde ? STRECKEN.feldWert('be-strecke') : null,
      bemerkung:    val('be-bemerkung') || null,
      sichtbarkeit: val('be-sichtbarkeit'),
      segmente:     istRunde ? [] : SEG.rowsAusBaum(editorBaum),
      gruppen_ids:  gruppenIds,
    };
    if (!payload.titel) { notify('Titel fehlt.', 'err'); return; }
    try {
      if (blockId) {
        await apiPut(`bloecke/${blockId}`, payload);
      } else {
        await apiPost('bloecke', payload);
      }
      schliesseModal();
      notify('Block gespeichert.', 'ok');
      await ladeListe();
      if (typeof PLANUNG !== 'undefined') PLANUNG.reloadSidebar();
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function loeschen(blockId) {
    if (!confirm('Diesen Block wirklich löschen?')) return;
    try {
      await apiDel(`bloecke/${blockId}`);
      schliesseModal();
      notify('Block gelöscht.', 'ok');
      await ladeListe();
      if (typeof PLANUNG !== 'undefined') PLANUNG.reloadSidebar();
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  // ── Hilfsfunktionen ───────────────────────────────────────
  function val(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
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
    render, neuerBlock, bearbeiten, anwenden, anwendenSpeichern,
    parsenAusTitel, beispielUebernehmen, speichern, loeschen,
    titelNeuGenerieren, onTypChange,
    onWiederkehrendChange, onApplyDatumChange,
    onApplyFreqChange, onApplyEndeTypChange,
  };
})();
