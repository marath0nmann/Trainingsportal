// ============================================================
// Trainingsportal – Strecken (Streckenverlauf für Runden)
// ============================================================
// Der Streckenverlauf liegt vollständig in der eigenen Datenbank:
// Beim Import wird eine GPX-/TCX-/KML-/GeoJSON-Datei einmalig geparst
// und als Punktliste gespeichert. Danach wird nichts mehr von Garmin,
// Komoot & Co. nachgeladen – die Vorschau ist ein reines Inline-SVG.
//
// Öffentliche API:
//   STRECKEN.load(force)          → Liste (ohne Geometrie), gecacht
//   STRECKEN.get(id)              → Einzelne Strecke inkl. Geometrie, gecacht
//   STRECKEN.svgHtml(strecke, o)  → Inline-SVG der Strecke
//   STRECKEN.vorschauEinbinden(el, id) → SVG asynchron in ein Element rendern
//   STRECKEN.feldHtml(feldId, id) → Markup für das Editor-Feld
//   STRECKEN.feldInit(feldId, id) → Feld befüllen (nach dem Einhängen aufrufen)
//   STRECKEN.feldWert(feldId)     → aktuell gewählte strecke_id oder null
// ============================================================

const STRECKEN = (() => {

  let listeCache = null;          // [{id, name, distanz_m, …}] ohne Geometrie
  const detailCache = new Map();  // id → Strecke inkl. Geometrie
  const felder = new Map();       // feldId → { strecke_id, offen }

  // ── Daten ──────────────────────────────────────────────────

  async function load(force) {
    if (!force && listeCache) return listeCache;
    try {
      const r = await apiGet('strecken', { silent: true });
      listeCache = (r && r.strecken) || [];
    } catch (e) {
      listeCache = [];
    }
    return listeCache;
  }

  async function get(id) {
    id = parseInt(id, 10);
    if (!id) return null;
    if (detailCache.has(id)) return detailCache.get(id);
    try {
      const r = await apiGet(`strecken/${id}`, { silent: true });
      const s = (r && r.strecke) || null;
      if (s) detailCache.set(id, s);
      return s;
    } catch (e) {
      return null;
    }
  }

  function invalidate() { listeCache = null; detailCache.clear(); }

  /** Listeneintrag (ohne Geometrie) aus dem Cache – für Badges o. Ä. */
  function ausListe(id) {
    id = parseInt(id, 10);
    return (listeCache || []).find(s => s.id === id) || null;
  }

  // ── Formatierung ───────────────────────────────────────────

  function fmtDistanz(m) {
    if (m == null) return '–';
    if (m < 1000) return m + ' m';
    return (m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  }

  function metaText(s) {
    if (!s) return '';
    const teile = [fmtDistanz(s.distanz_m)];
    if (s.aufstieg_m != null && s.aufstieg_m > 0) teile.push('↗ ' + s.aufstieg_m + ' hm');
    if (s.ist_rundkurs) teile.push('Rundkurs');
    return teile.join(' · ');
  }

  // ── SVG-Vorschau ───────────────────────────────────────────
  // Äquirektangulare Projektion: Längengrade werden mit cos(lat)
  // gestaucht, damit die Strecke nicht verzerrt erscheint.

  function svgHtml(s, opts) {
    const o    = opts || {};
    const w    = o.breite || 320;
    const h    = o.hoehe  || 180;
    const pad  = o.pad != null ? o.pad : 8;
    const pts  = (s && s.geometrie) || [];
    if (pts.length < 2) return '<div class="strecke-svg-leer">Kein Streckenverlauf</div>';

    const k = Math.cos((pts[0][0] * Math.PI) / 180) || 1;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const xy = pts.map(p => {
      const x = p[1] * k, y = -p[0];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      return [x, y];
    });

    const spanX = Math.max(maxX - minX, 1e-9);
    const spanY = Math.max(maxY - minY, 1e-9);
    const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
    // Reststrecke gleichmäßig verteilen → Strecke sitzt mittig im Rahmen
    const offX  = (w - spanX * scale) / 2;
    const offY  = (h - spanY * scale) / 2;
    const px = p => [
      (p[0] - minX) * scale + offX,
      (p[1] - minY) * scale + offY,
    ];

    const d = xy.map((p, i) => {
      const q = px(p);
      return (i === 0 ? 'M' : 'L') + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
    }).join(' ');

    const start = px(xy[0]);
    const ende  = px(xy[xy.length - 1]);
    const rund  = s.ist_rundkurs;

    return `<svg class="strecke-svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%"
                 preserveAspectRatio="xMidYMid meet" role="img"
                 aria-label="Streckenverlauf ${escapeHtml(s.name || '')}">
      <path class="strecke-svg-schatten" d="${d}"/>
      <path class="strecke-svg-linie" d="${d}"/>
      <circle class="strecke-svg-start" cx="${start[0].toFixed(1)}" cy="${start[1].toFixed(1)}" r="4"/>
      ${rund ? '' : `<circle class="strecke-svg-ende" cx="${ende[0].toFixed(1)}" cy="${ende[1].toFixed(1)}" r="4"/>`}
    </svg>`;
  }

  /** Lädt die Geometrie nach und rendert die Vorschau in ein Element. */
  async function vorschauEinbinden(el, streckeId, opts) {
    if (!el) return;
    const s = await get(streckeId);
    if (!s) { el.innerHTML = ''; return; }
    const o = opts || {};
    el.innerHTML = `
      <div class="strecke-vorschau">
        <div class="strecke-vorschau-bild">${svgHtml(s, o)}</div>
        ${o.ohneText ? '' : `<div class="strecke-vorschau-meta">
          <span class="strecke-vorschau-name">${escapeHtml(s.name)}</span>
          <span class="strecke-vorschau-zahlen">${escapeHtml(metaText(s))}</span>
        </div>`}
      </div>`;
  }

  // ── Editor-Feld ────────────────────────────────────────────
  // Wird von EDITOR (Einheit) und BLOECKE (Trainingsblock) benutzt.
  // feldId ist ein Präfix, z. B. 'ed-strecke' oder 'be-strecke'.

  function feldHtml(feldId) {
    return `<div class="strecke-feld" id="${feldId}-feld"></div>`;
  }

  async function feldInit(feldId, streckeId) {
    felder.set(feldId, { strecke_id: streckeId ? parseInt(streckeId, 10) : null, offen: false });
    await load();
    await _feldRender(feldId);
  }

  function feldWert(feldId) {
    const st = felder.get(feldId);
    return st && st.strecke_id ? st.strecke_id : null;
  }

  async function _feldRender(feldId) {
    const wrap = document.getElementById(`${feldId}-feld`);
    const st   = felder.get(feldId);
    if (!wrap || !st) return;

    const liste = listeCache || [];
    const opts  = `<option value="">— keine Strecke —</option>` + liste.map(s =>
      `<option value="${s.id}"${s.id === st.strecke_id ? ' selected' : ''}>${escapeHtml(s.name)} (${escapeHtml(fmtDistanz(s.distanz_m))})</option>`
    ).join('');

    wrap.innerHTML = `
      <div class="ed-fg ed-fg-wide">
        <label>Streckenverlauf <span class="ed-hint">(liegt in der Vereins-Datenbank – keine Verlinkung nach außen)</span></label>
        <div class="strecke-feld-zeile">
          <select id="${feldId}-select" onchange="STRECKEN.feldAuswahl('${feldId}', this.value)">${opts}</select>
          <button type="button" class="btn btn-ghost btn-sm" onclick="STRECKEN.feldImportToggle('${feldId}')">
            ${st.offen ? '× Import schließen' : '+ Importieren'}
          </button>
        </div>
      </div>
      <div class="strecke-feld-import" id="${feldId}-import"${st.offen ? '' : ' style="display:none"'}>
        ${_importHtml(feldId)}
      </div>
      <div class="strecke-feld-vorschau" id="${feldId}-vorschau"></div>`;

    const vor = document.getElementById(`${feldId}-vorschau`);
    if (st.strecke_id) {
      await vorschauEinbinden(vor, st.strecke_id, { breite: 420, hoehe: 200 });
      if (vor && vor.firstElementChild) {
        vor.insertAdjacentHTML('beforeend', `
          <div class="strecke-feld-aktionen">
            <a class="btn btn-ghost btn-sm" href="api/index.php?p=strecken/${st.strecke_id}/gpx" download>GPX herunterladen</a>
            <button type="button" class="btn btn-ghost btn-sm" onclick="STRECKEN.feldUmbenennen('${feldId}')">Umbenennen</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="STRECKEN.feldLoeschen('${feldId}')">Löschen</button>
          </div>`);
      }
    } else if (vor) {
      vor.innerHTML = '';
    }

    if (st.offen) _dropzoneBinden(feldId);
  }

  function _importHtml(feldId) {
    return `
      <div class="strecke-import">
        <div class="strecke-import-drop" id="${feldId}-drop">
          <strong>GPX-, TCX-, KML- oder GeoJSON-Datei hierher ziehen</strong>
          <span>oder <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('${feldId}-file').click()">Datei auswählen</button></span>
          <input type="file" id="${feldId}-file" accept=".gpx,.tcx,.kml,.json,.geojson,application/gpx+xml,text/xml,application/json" style="display:none"
                 onchange="STRECKEN.feldDatei('${feldId}', this.files)">
        </div>
        <div class="strecke-import-oder">oder Adresse einer Streckendatei</div>
        <div class="strecke-feld-zeile">
          <input type="url" id="${feldId}-url" placeholder="https://…/strecke.gpx">
          <button type="button" class="btn btn-ghost btn-sm" onclick="STRECKEN.feldUrl('${feldId}')">Laden</button>
        </div>
        <div class="strecke-import-hinweis">
          Garmin Connect und Komoot geben ihre Strecken nur an angemeldete Nutzer heraus.
          Dort die Aktivität öffnen, <em>„Exportieren nach GPX"</em> wählen und die Datei hier hochladen.
        </div>
        <div class="strecke-import-status" id="${feldId}-status"></div>
      </div>`;
  }

  function _dropzoneBinden(feldId) {
    const zone = document.getElementById(`${feldId}-drop`);
    if (!zone || zone.dataset.bound) return;
    zone.dataset.bound = '1';
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation(); zone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation(); zone.classList.remove('is-over');
    }));
    zone.addEventListener('drop', e => feldDatei(feldId, e.dataTransfer && e.dataTransfer.files));
  }

  function _status(feldId, text, art) {
    const el = document.getElementById(`${feldId}-status`);
    if (!el) return;
    el.className = 'strecke-import-status' + (art ? ' is-' + art : '');
    el.textContent = text || '';
  }

  // ── Feld-Aktionen (aus dem Markup aufgerufen) ──────────────

  async function feldAuswahl(feldId, wert) {
    const st = felder.get(feldId);
    if (!st) return;
    st.strecke_id = wert ? parseInt(wert, 10) : null;
    await _feldRender(feldId);
  }

  function feldImportToggle(feldId) {
    const st = felder.get(feldId);
    if (!st) return;
    st.offen = !st.offen;
    _feldRender(feldId);
  }

  async function feldDatei(feldId, files) {
    if (!files || !files.length) return;
    const datei = files[0];
    if (datei.size > 12 * 1024 * 1024) {
      _status(feldId, 'Datei zu groß (max. 12 MB).', 'err');
      return;
    }
    _status(feldId, `„${datei.name}" wird gelesen …`);
    let inhalt;
    try {
      inhalt = await datei.text();
    } catch (e) {
      _status(feldId, 'Datei konnte nicht gelesen werden.', 'err');
      return;
    }
    await _importieren(feldId, { inhalt, dateiname: datei.name });
  }

  async function feldUrl(feldId) {
    const el  = document.getElementById(`${feldId}-url`);
    const url = el ? el.value.trim() : '';
    if (!url) { _status(feldId, 'Bitte eine Adresse angeben.', 'err'); return; }
    await _importieren(feldId, { url });
  }

  async function _importieren(feldId, payload) {
    _status(feldId, 'Strecke wird importiert …');
    try {
      const r = await apiPost('strecken', payload);
      const s = r.strecke;
      detailCache.set(s.id, s);
      listeCache = null;
      await load(true);
      const st = felder.get(feldId);
      if (st) { st.strecke_id = s.id; st.offen = false; }
      await _feldRender(feldId);
      _hinweis(`Strecke „${s.name}" importiert (${metaText(s)}).`, 'ok');
    } catch (e) {
      _status(feldId, e.message || 'Import fehlgeschlagen.', 'err');
    }
  }

  async function feldUmbenennen(feldId) {
    const st = felder.get(feldId);
    if (!st || !st.strecke_id) return;
    const alt  = (listeCache || []).find(s => s.id === st.strecke_id);
    const name = prompt('Neuer Name der Strecke:', alt ? alt.name : '');
    if (name === null || !name.trim()) return;
    try {
      await apiPut(`strecken/${st.strecke_id}`, { name: name.trim() });
      detailCache.delete(st.strecke_id);
      await load(true);
      await _feldRender(feldId);
      _hinweis('Strecke umbenannt.', 'ok');
    } catch (e) {
      _hinweis('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function feldLoeschen(feldId) {
    const st = felder.get(feldId);
    if (!st || !st.strecke_id) return;
    if (!confirm('Diese Strecke endgültig aus der Datenbank löschen?')) return;
    try {
      await apiDel(`strecken/${st.strecke_id}`);
      detailCache.delete(st.strecke_id);
      st.strecke_id = null;
      await load(true);
      await _feldRender(feldId);
      _hinweis('Strecke gelöscht.', 'ok');
    } catch (e) {
      _hinweis('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function _hinweis(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) { console.log(text); return; }
    const div = document.createElement('div');
    div.className = 'notif ' + (art === 'err' ? 'notif-err' : 'notif-ok');
    div.textContent = text;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  return {
    load, get, invalidate, ausListe, fmtDistanz, metaText,
    svgHtml, vorschauEinbinden,
    feldHtml, feldInit, feldWert,
    feldAuswahl, feldImportToggle, feldDatei, feldUrl,
    feldUmbenennen, feldLoeschen,
  };
})();
