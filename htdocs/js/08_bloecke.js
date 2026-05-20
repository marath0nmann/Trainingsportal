// ============================================================
// Trainingsportal – Trainingsblöcke
// ============================================================
// Seite: #bloecke
//   - Alle eingeloggten User sehen globale + eigene private Blöcke
//   - Trainer/Admin: Neuen Block anlegen, bearbeiten, löschen
//   - Alle eingeloggten User: Block per „Im Kalender planen" anwenden
//   - Blöcke werden nach Trainingstyp gruppiert (konfigurierbar in Einstellungen)

const BLOECKE = (() => {

  const PAUSE_OPTIONS = [
    { value: 'TP',   label: 'TP – Trabpause' },
    { value: 'GP',   label: 'GP – Gehpause' },
    { value: 'BP',   label: 'BP – Blockpause' },
    { value: 'frei', label: '— frei —' },
  ];

  // Fallback-Typen falls Config noch nicht geladen
  const FALLBACK_TYPEN = [
    { slug: 'intervall',     bezeichnung: 'Intervall' },
    { slug: 'dauerlauf',     bezeichnung: 'Dauerlauf' },
    { slug: 'funktionell',   bezeichnung: 'Funktionelles Training' },
    { slug: 'runde',         bezeichnung: 'Runde / Strecke' },
    { slug: 'event',         bezeichnung: 'Event / Wettkampf' },
    { slug: 'frei',          bezeichnung: 'Sonstiges' },
    { slug: 'kein_training', bezeichnung: 'Kein Training' },
  ];

  function getTypen() {
    const t = appConfig && appConfig.typen;
    return (Array.isArray(t) && t.length) ? t : FALLBACK_TYPEN;
  }

  function getTypLabel(slug) {
    const t = getTypen().find(x => x.slug === slug);
    return t ? t.bezeichnung : slug;
  }

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
      const data = await apiGet('bloecke', { silent: true });
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
    const istRunde = b.typ === 'runde';
    const segCount = b.seg_count ?? null;
    const infoBadge = istRunde
      ? (b.komoot_url
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
        <div class="block-card-actions">
          <button class="btn btn-primary btn-sm" onclick="BLOECKE.anwenden(${b.id})">Im Kalender planen</button>
          ${kannBearbeiten ? `<button class="btn btn-ghost btn-sm" onclick="BLOECKE.bearbeiten(${b.id})">Bearbeiten</button>` : ''}
        </div>
      </div>`;
  }

  // ── Block auf Kalender anwenden ───────────────────────────
  // datum: optionales ISO-Datum (YYYY-MM-DD), z. B. vom Planung-DnD gesetzt
  async function anwenden(blockId, datum) {
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

    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
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
                <input type="date" id="apply-datum" value="${heute}">
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
            </div>
            <div class="ed-footer">
              <span></span>
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" onclick="BLOECKE.anwendenSpeichern(${b.id})">In Kalender eintragen</button>
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
    const payload = {
      datum,
      uhrzeit:       val('apply-uhrzeit') || null,
      treffpunkt_id: tpIdStr !== '' ? parseInt(tpIdStr, 10) : null,
      sichtbarkeit:  val('apply-sichtbarkeit'),
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

  // ── Block-Editor ──────────────────────────────────────────
  let editorBloecke = [];
  let titelManuellBearbeitet = false;

  function segmenteZuBloecke(segmente) {
    if (!segmente || !segmente.length) return [];
    const blocksMap = new Map();
    segmente.forEach(s => {
      const gid = s.gruppen_id != null ? s.gruppen_id : ('solo_' + s.id);
      if (!blocksMap.has(gid)) {
        blocksMap.set(gid, { gruppen_id: gid, wiederholungen: s.wiederholungen || 1, abschnitte: [] });
      }
      const block = blocksMap.get(gid);
      if (s.abschnitt_typ === 'pause') {
        block.abschnitte.push({ typ: 'pause', distanz_m: s.distanz_m, pause_typ: s.pause_typ || 'TP' });
      } else {
        block.abschnitte.push({ typ: 'work', distanz_m: s.distanz_m, pace_referenz: s.pace_referenz || null });
        // Altes Format: pause_m als eigenen Pause-Abschnitt anhängen
        if (s.pause_m) {
          block.abschnitte.push({ typ: 'pause', distanz_m: s.pause_m, pause_typ: s.pause_typ || 'TP' });
        }
      }
    });
    return [...blocksMap.values()];
  }

  function bloeckeZuSegmente(bloecke) {
    const segs = [];
    let gid = 1;
    bloecke.forEach(block => {
      block.abschnitte.forEach(a => {
        segs.push({
          gruppen_id:     block.abschnitte.length > 1 ? gid : null,
          wiederholungen: block.wiederholungen,
          abschnitt_typ:  a.typ,
          distanz_m:      a.distanz_m,
          pause_m:        null,
          pause_typ:      a.typ === 'pause' ? (a.pause_typ || 'TP') : null,
          pace_referenz:  a.typ === 'work'  ? (a.pace_referenz || null) : null,
          notiz:          null,
        });
      });
      gid++;
    });
    return segs;
  }

  function generiereBlockTitel(bloecke) {
    if (!bloecke || !bloecke.length) return '';
    return bloecke.map(block => {
      const works = block.abschnitte.filter(a => a.typ === 'work');
      if (!works.length) return null;
      const wdh = block.wiederholungen || 1;
      const distTeile = works.map(a => a.distanz_m != null ? String(a.distanz_m) : '?');
      const distStr = works.length > 1 ? '(' + distTeile.join(' + ') + ')' : distTeile[0];
      return wdh > 1 ? `${wdh} × ${distStr}` : distStr;
    }).filter(Boolean).join(' / ');
  }

  function aktualisiereBlockTitelFeld() {
    if (!titelManuellBearbeitet) {
      const el = document.getElementById('be-titel');
      if (el) el.value = generiereBlockTitel(editorBloecke);
    }
    aktualisiereGesamtdistanz();
  }

  function titelNeuGenerieren() {
    titelManuellBearbeitet = false;
    aktualisiereBlockTitelFeld();
  }

  async function neuerBlock() {
    await PACE.load();
    openBlockEditor(null, []);
  }

  async function bearbeiten(blockId) {
    try {
      const [data] = await Promise.all([
        apiGet(`bloecke/${blockId}`, { silent: true }),
        PACE.load(),
      ]);
      openBlockEditor(data.block, data.segmente || []);
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function openBlockEditor(block, segmente) {
    const istNeu = !block;
    editorBloecke = segmenteZuBloecke((segmente || []).map(s => ({ ...s })));
    // Segmente aus Titel parsen falls noch keine vorhanden
    if (!editorBloecke.length && block && block.titel) {
      const parsed = PARSER.parse(block.titel);
      if (parsed.length) editorBloecke = segmenteZuBloecke(parsed);
    }
    // Titel für bestehende Blöcke schützen; für neue Blöcke auto-generieren
    titelManuellBearbeitet = !istNeu;

    const b = block || {
      id: null, titel: '', typ: 'intervall',
      komoot_url: '', bemerkung: '', sichtbarkeit: 'global',
    };
    const typenOptionen = getTypen()
      .map(t => `<option value="${escapeHtml(t.slug)}"${t.slug === b.typ ? ' selected' : ''}>${escapeHtml(t.bezeichnung)}</option>`)
      .join('');

    const istRunde = b.typ === 'runde';

    const cont = document.getElementById('modal-container');

    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card modal-wide" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">${istNeu ? 'Neuer Trainingsblock' : 'Block bearbeiten'}</div>
              <div class="modal-title">${istNeu ? 'Block erstellen' : escapeHtml(b.titel || '')}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
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
              <div class="ed-fg ed-fg-wide">
                <label>Bemerkung</label>
                <textarea id="be-bemerkung" rows="2">${escapeHtml(b.bemerkung || '')}</textarea>
              </div>
            </div>

            <div id="be-komoot-wrap" class="ed-komoot-wrap"${istRunde ? '' : ' style="display:none"'}>
              <div class="ed-fg ed-fg-wide">
                <label>Komoot-Strecke <span class="ed-hint">(Tour-Link, z. B. https://www.komoot.com/tour/…)</span></label>
                <input type="url" id="be-komoot-url" value="${escapeHtml(b.komoot_url || '')}" placeholder="https://www.komoot.com/tour/…">
              </div>
              <div class="ed-komoot-preview" id="be-komoot-preview">
                ${komootEmbedUrl(b.komoot_url) ? `<div class="komoot-embed"><iframe src="${escapeHtml(komootEmbedUrl(b.komoot_url))}" frameborder="0" scrolling="no" allow="fullscreen" loading="lazy"></iframe></div>` : ''}
              </div>
            </div>

            <div id="be-seg-wrap" class="ed-segwrap"${istRunde ? ' style="display:none"' : ''}>
              <div class="ed-segheader">
                <h3>Segmente</h3>
                <div class="ed-segactions">
                  <button class="btn btn-ghost" onclick="BLOECKE.blockHinzufuegen()">+ Block</button>
                </div>
              </div>
              <div id="be-segmente-tabelle"></div>
              <div id="be-gesamtdistanz" class="be-gesamtdistanz"></div>
              <div class="ed-seghint">
                Distanz in Metern · TP/GP/BP = Trab-/Geh-/Blockpause · Pace-Referenz für persönliche Pace
              </div>
            </div>

            <div class="ed-titelwrap">
              <div class="ed-fg">
                <label>Titel <span class="ed-hint" id="be-titel-hint">${istRunde ? '' : '(automatisch aus Segmenten – kann überschrieben werden)'}</span></label>
                <div class="ed-titel-row">
                  <input type="text" id="be-titel" value="${escapeHtml(b.titel || '')}" placeholder="${istRunde ? 'Name der Runde / Strecke' : 'Wird aus Segmenten generiert…'}">
                  <button class="btn btn-ghost btn-sm ed-titel-reset" id="be-titel-reset-btn" onclick="BLOECKE.titelNeuGenerieren()" title="Titel aus Segmenten neu generieren"${istRunde ? ' style="display:none"' : ''}>↺</button>
                </div>
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
  }

  function onTypChange() {
    const typ = val('be-typ');
    const istRunde = typ === 'runde';
    const komootWrap = document.getElementById('be-komoot-wrap');
    const segWrap    = document.getElementById('be-seg-wrap');
    const resetBtn   = document.getElementById('be-titel-reset-btn');
    const titelHint  = document.getElementById('be-titel-hint');
    if (komootWrap) komootWrap.style.display = istRunde ? '' : 'none';
    if (segWrap)    segWrap.style.display    = istRunde ? 'none' : '';
    if (resetBtn)   resetBtn.style.display   = istRunde ? 'none' : '';
    if (titelHint)  titelHint.textContent    = istRunde ? '' : '(automatisch aus Segmenten – kann überschrieben werden)';
    const titelEl = document.getElementById('be-titel');
    if (titelEl) titelEl.placeholder = istRunde ? 'Name der Runde / Strecke' : 'Wird aus Segmenten generiert…';
    if (!istRunde) {
      titelManuellBearbeitet = false;
      aktualisiereBlockTitelFeld();
    }
  }

  function berechneGesamtdistanz(bloecke) {
    return (bloecke || []).reduce((sum, block) => {
      const wdh = (block.wiederholungen > 0) ? block.wiederholungen : 1;
      const blockDist = (block.abschnitte || []).reduce((s, a) => s + (a.distanz_m || 0), 0);
      return sum + wdh * blockDist;
    }, 0);
  }

  function formatDistanz(m) {
    if (!m) return null;
    if (m < 1000) return m + ' m';
    const km = m / 1000;
    return km.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' km';
  }

  function aktualisiereGesamtdistanz() {
    const el = document.getElementById('be-gesamtdistanz');
    if (!el) return;
    const gesamt = berechneGesamtdistanz(editorBloecke);
    const text = formatDistanz(gesamt);
    el.textContent = text ? 'Gesamtdistanz: ' + text : '';
  }

  function rendereBlockEditor() {
    const wrap = document.getElementById('be-segmente-tabelle');
    if (!wrap) return;
    if (!editorBloecke.length) {
      wrap.innerHTML = `<div class="ed-segleer">Kein Block. Klick „+ Block" um einen Block hinzuzufügen.</div>`;
      aktualisiereBlockTitelFeld();
      return;
    }

    wrap.innerHTML = editorBloecke.map((block, bi) => {
      const abschnitteRows = block.abschnitte.map((a, ai) => {
        const detailSel = a.typ === 'work'
          ? `<select data-b="${bi}" data-a="${ai}" data-f="pace_referenz" class="ed-seg-input">
               ${PACE.getOptions().map(o => `<option value="${o.value}"${o.value === (a.pace_referenz || '') ? ' selected' : ''}>${o.label}</option>`).join('')}
             </select>`
          : `<select data-b="${bi}" data-a="${ai}" data-f="pause_typ" class="ed-seg-input">
               ${PAUSE_OPTIONS.map(o => `<option value="${o.value}"${o.value === (a.pause_typ || 'TP') ? ' selected' : ''}>${o.label}</option>`).join('')}
             </select>`;
        return `
        <tr data-b="${bi}" data-a="${ai}">
          <td>
            <button class="ed-typ-btn ${a.typ === 'pause' ? 'ed-typ-pause' : 'ed-typ-work'}"
              data-b="${bi}" data-a="${ai}"
              onclick="BLOECKE.toggleAbschnittTyp(${bi},${ai})">${a.typ === 'pause' ? 'Pause' : 'Tempo'}</button>
          </td>
          <td><input type="number" min="50" step="50" value="${a.distanz_m ?? ''}"
            class="ed-seg-input ed-seg-dist" data-b="${bi}" data-a="${ai}" data-f="distanz_m"></td>
          <td>${detailSel}</td>
          <td><button class="btn-icon" onclick="BLOECKE.abschnittLoeschen(${bi},${ai})" title="Abschnitt löschen">×</button></td>
        </tr>`;
      }).join('');

      return `
        <div class="ed-block" data-block="${bi}">
          <div class="ed-block-head">
            <div class="ed-block-wdh">
              <label>Wdh</label>
              <input type="number" min="1" value="${block.wiederholungen ?? 1}"
                class="ed-seg-input ed-seg-num" data-b="${bi}" data-f="wiederholungen">
            </div>
            <div class="ed-block-abschnitte">
              <table class="ed-seg-table">
                <thead><tr><th>Typ</th><th>Distanz (m)</th><th>Pace / Pause-Typ</th><th></th></tr></thead>
                <tbody>${abschnitteRows}</tbody>
              </table>
              <div class="ed-block-actions">
                <button class="btn btn-ghost btn-sm" onclick="BLOECKE.abschnittHinzufuegen(${bi},'work')">+ Tempo</button>
                <button class="btn btn-ghost btn-sm" onclick="BLOECKE.abschnittHinzufuegen(${bi},'pause')">+ Pause</button>
              </div>
            </div>
            <button class="btn-icon ed-block-del" onclick="BLOECKE.blockLoeschen(${bi})" title="Block löschen">×</button>
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.ed-seg-input').forEach(el => {
      el.addEventListener('change', onBlockEdit);
      el.addEventListener('input',  onBlockEdit);
    });

    aktualisiereBlockTitelFeld();
  }

  function onBlockEdit(ev) {
    const t  = ev.target;
    const bi = parseInt(t.dataset.b, 10);
    const ai = t.dataset.a !== undefined ? parseInt(t.dataset.a, 10) : undefined;
    const f  = t.dataset.f;
    const numFelder = ['distanz_m', 'wiederholungen'];
    let v = t.value === '' ? null : (numFelder.includes(f) ? parseInt(t.value, 10) : t.value);
    if (!editorBloecke[bi]) return;
    if (ai !== undefined && !isNaN(ai)) {
      if (editorBloecke[bi].abschnitte[ai]) {
        editorBloecke[bi].abschnitte[ai][f] = v;
      }
    } else {
      editorBloecke[bi][f] = v;
    }
    aktualisiereBlockTitelFeld();
  }

  function blockHinzufuegen() {
    const letzter   = editorBloecke.length ? editorBloecke[editorBloecke.length - 1] : null;
    const letzteW   = letzter ? letzter.abschnitte.find(a => a.typ === 'work')  : null;
    const letzteP   = letzter ? letzter.abschnitte.find(a => a.typ === 'pause') : null;
    editorBloecke.push({
      gruppen_id: null,
      wiederholungen: 1,
      abschnitte: [
        { typ: 'work',  distanz_m: 400, pace_referenz: letzteW ? letzteW.pace_referenz : null },
        { typ: 'pause', distanz_m: 100, pause_typ: letzteP ? letzteP.pause_typ : 'TP' },
      ],
    });
    rendereBlockEditor();
  }

  function blockLoeschen(bi) {
    editorBloecke.splice(bi, 1);
    rendereBlockEditor();
  }

  function abschnittHinzufuegen(bi, typ) {
    if (!editorBloecke[bi]) return;
    const block = editorBloecke[bi];
    if (typ === 'pause') {
      const ref = [...block.abschnitte].reverse().find(a => a.typ === 'pause');
      block.abschnitte.push({ typ: 'pause', distanz_m: 100, pause_typ: ref ? ref.pause_typ : 'TP' });
    } else {
      const ref = [...block.abschnitte].reverse().find(a => a.typ === 'work');
      block.abschnitte.push({ typ: 'work', distanz_m: 300, pace_referenz: ref ? ref.pace_referenz : null });
    }
    rendereBlockEditor();
  }

  function abschnittLoeschen(bi, ai) {
    if (!editorBloecke[bi]) return;
    editorBloecke[bi].abschnitte.splice(ai, 1);
    if (!editorBloecke[bi].abschnitte.length) {
      editorBloecke.splice(bi, 1);
    }
    rendereBlockEditor();
  }

  function toggleAbschnittTyp(bi, ai) {
    if (!editorBloecke[bi] || !editorBloecke[bi].abschnitte[ai]) return;
    const a = editorBloecke[bi].abschnitte[ai];
    const block = editorBloecke[bi];
    if (a.typ === 'work') {
      a.typ = 'pause';
      if (!a.pause_typ) {
        const andereP = block.abschnitte.find((x, i) => i !== ai && x.typ === 'pause');
        a.pause_typ = andereP ? andereP.pause_typ : 'TP';
      }
      delete a.pace_referenz;
    } else {
      a.typ = 'work';
      if (!a.pace_referenz) {
        const andereW = block.abschnitte.find((x, i) => i !== ai && x.typ === 'work');
        a.pace_referenz = andereW ? andereW.pace_referenz : null;
      }
      delete a.pause_typ;
    }
    rendereBlockEditor();
  }

  function parsenAusTitel() {
    const titel = val('be-titel');
    const segs = PARSER.parse(titel);
    if (!segs.length) { notify('Konnte keine Segmente aus dem Titel erkennen.', 'warn'); return; }
    editorBloecke = segmenteZuBloecke(segs);
    rendereBlockEditor();
  }

  async function speichern(blockId) {
    const typ      = val('be-typ');
    const istRunde = typ === 'runde';
    const payload = {
      titel:        val('be-titel'),
      typ,
      komoot_url:   istRunde ? (val('be-komoot-url') || null) : null,
      bemerkung:    val('be-bemerkung') || null,
      sichtbarkeit: val('be-sichtbarkeit'),
      segmente:     istRunde ? [] : bloeckeZuSegmente(editorBloecke),
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
    parsenAusTitel, blockHinzufuegen, blockLoeschen,
    abschnittHinzufuegen, abschnittLoeschen, toggleAbschnittTyp,
    speichern, loeschen,
    titelNeuGenerieren, onTypChange,
  };
})();
