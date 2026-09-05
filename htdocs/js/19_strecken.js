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

  // ── Vorschau mit Kartenhintergrund ─────────────────────────
  // Kleiner statischer Kachel-Renderer: kein Leaflet nötig (das wäre für
  // einen Hover-Tooltip zu schwer). Kacheln und Linie teilen sich dasselbe
  // Web-Mercator-Pixelsystem, deshalb liegen sie exakt übereinander.

  const TILE = 256;
  const ZOOM_MAX = 17;

  /** WGS84 → Weltpixel im Web-Mercator bei Zoomstufe z. */
  function _merc(lat, lng, z) {
    const welt = TILE * Math.pow(2, z);
    const sinLat = Math.min(0.9999, Math.max(-0.9999, Math.sin(lat * Math.PI / 180)));
    return [
      (lng + 180) / 360 * welt,
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * welt,
    ];
  }

  /**
   * Streckenvorschau auf OpenStreetMap-Kacheln.
   * Die Geometrie kommt weiterhin aus der eigenen DB – von außen
   * kommen nur die Kartenbilder (wie beim Treffpunkt-Picker).
   */
  /** Feste Pixelbreite auf den verfügbaren Platz begrenzen – sonst läuft die
      Kachelvorschau auf schmalen Screens (Popover-Sheet, Modal) über. */
  function _breiteBegrenzen(w) {
    const max = (window.innerWidth || 1024) - 48;
    return Math.max(200, Math.min(w, max));
  }

  function kartenVorschauHtml(s, opts) {
    const o   = opts || {};
    const wRoh = o.breite || 276;
    const w   = _breiteBegrenzen(wRoh);
    // Höhe proportional mitziehen, damit der Ausschnitt nicht verzerrt wirkt
    const h   = Math.round((o.hoehe || 170) * (w / wRoh));
    const pad = o.pad != null ? o.pad : 10;
    const pts = (s && s.geometrie) || [];
    if (pts.length < 2) return '<div class="strecke-svg-leer">Kein Streckenverlauf</div>';

    let minLat = pts[0][0], maxLat = pts[0][0], minLng = pts[0][1], maxLng = pts[0][1];
    for (const p of pts) {
      if (p[0] < minLat) minLat = p[0]; if (p[0] > maxLat) maxLat = p[0];
      if (p[1] < minLng) minLng = p[1]; if (p[1] > maxLng) maxLng = p[1];
    }

    // Größte Zoomstufe wählen, bei der die Strecke noch komplett hineinpasst
    let z = ZOOM_MAX;
    for (; z > 1; z--) {
      const a = _merc(maxLat, minLng, z);
      const b = _merc(minLat, maxLng, z);
      if (b[0] - a[0] <= w - 2 * pad && b[1] - a[1] <= h - 2 * pad) break;
    }

    // Weltpixel-Koordinate der linken oberen Ecke des Ausschnitts
    const mitte = _merc((minLat + maxLat) / 2, (minLng + maxLng) / 2, z);
    const offX  = mitte[0] - w / 2;
    const offY  = mitte[1] - h / 2;

    const maxIdx = Math.pow(2, z) - 1;
    let kacheln = '';
    for (let tx = Math.floor(offX / TILE); tx <= Math.floor((offX + w) / TILE); tx++) {
      for (let ty = Math.floor(offY / TILE); ty <= Math.floor((offY + h) / TILE); ty++) {
        if (ty < 0 || ty > maxIdx) continue;
        const wrapX = ((tx % (maxIdx + 1)) + maxIdx + 1) % (maxIdx + 1);   // Datumsgrenze
        kacheln += `<img class="strecke-kachel" alt="" aria-hidden="true"
          src="https://tile.openstreetmap.org/${z}/${wrapX}/${ty}.png"
          style="left:${(tx * TILE - offX).toFixed(0)}px;top:${(ty * TILE - offY).toFixed(0)}px">`;
      }
    }

    const px = p => {
      const m = _merc(p[0], p[1], z);
      return [(m[0] - offX).toFixed(1), (m[1] - offY).toFixed(1)];
    };
    const d = pts.map((p, i) => {
      const q = px(p);
      return (i === 0 ? 'M' : 'L') + q[0] + ' ' + q[1];
    }).join(' ');
    const start = px(pts[0]);
    const ende  = px(pts[pts.length - 1]);

    return `<div class="strecke-karte-mini" style="width:${w}px;height:${h}px">
      <div class="strecke-karte-mini-kacheln">${kacheln}</div>
      <svg class="strecke-svg strecke-svg-auf-karte" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"
           role="img" aria-label="Streckenverlauf ${escapeHtml(s.name || '')}">
        <path class="strecke-svg-schatten" d="${d}"/>
        <path class="strecke-svg-linie" d="${d}"/>
        <circle class="strecke-svg-start" cx="${start[0]}" cy="${start[1]}" r="4"/>
        ${s.ist_rundkurs ? '' : `<circle class="strecke-svg-ende" cx="${ende[0]}" cy="${ende[1]}" r="4"/>`}
      </svg>
      <span class="strecke-karte-mini-attr">© OpenStreetMap</span>
    </div>`;
  }

  /** Lädt die Geometrie nach und rendert die Vorschau in ein Element.
      Immer mit Kartenhintergrund – ein Klick öffnet die große Karte. */
  async function vorschauEinbinden(el, streckeId, opts) {
    if (!el) return;
    const s = await get(streckeId);
    if (!s) { el.innerHTML = ''; return; }
    const o = Object.assign({}, opts || {});
    // Wunschbreite auf den tatsächlich vorhandenen Platz begrenzen, sonst
    // laufen die Kacheln in schmalen Spalten (Heute-Karte, Modal) über.
    const platz = el.clientWidth - 14;
    if (platz > 120) o.breite = Math.min(o.breite || 320, platz);
    el.innerHTML = `
      <div class="strecke-vorschau">
        <div class="strecke-vorschau-bild" role="button" tabindex="0"
             title="Auf Karte anzeigen" onclick="STRECKEN.karteOeffnen(${s.id})"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();STRECKEN.karteOeffnen(${s.id})}">${kartenVorschauHtml(s, o)}</div>
        ${o.ohneText ? '' : `<div class="strecke-vorschau-meta">
          <span class="strecke-vorschau-name">${escapeHtml(s.name)}</span>
          <span class="strecke-vorschau-zahlen">${escapeHtml(metaText(s))}</span>
        </div>`}
      </div>`;
  }

  // ── Kartenansicht ──────────────────────────────────────────
  // Für die genaue Betrachtung: Strecke auf einer OSM-Karte.
  // Die Geometrie kommt weiterhin aus der eigenen DB – von außen
  // kommen nur die Kartenkacheln (wie beim Treffpunkt-Picker).

  async function karteOeffnen(id) {
    const s = await get(id);
    if (!s || !s.geometrie || s.geometrie.length < 2) {
      _hinweis('Für diese Strecke ist kein Verlauf gespeichert.', 'err');
      return;
    }
    const cont = document.getElementById('modal-container');
    if (!cont) return;

    // Als eigenes Overlay anhängen, damit ein bereits offenes Modal
    // (z. B. die Termin-Detailansicht) darunter erhalten bleibt.
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay strecke-karte-overlay';
    overlay.innerHTML = `
      <div class="modal-card modal-wide" onclick="event.stopPropagation()">
        <div class="modal-head">
          <div>
            <div class="modal-eyebrow">Streckenverlauf</div>
            <div class="modal-title">${escapeHtml(s.name)}</div>
            <div class="modal-sub">${escapeHtml(metaText(s))}</div>
          </div>
          <button class="modal-close" aria-label="Schließen">×</button>
        </div>
        <div class="modal-body">
          <div id="strecke-karte-map" class="strecke-karte-map">Karte wird geladen…</div>
          <div class="modal-actions">
            <a class="btn btn-ghost" href="api/index.php?p=strecken/${s.id}/gpx" download>🗺 Als GPX herunterladen</a>
          </div>
        </div>
      </div>`;
    const zu = () => overlay.remove();
    overlay.addEventListener('click', ev => { if (ev.target === overlay) zu(); });
    overlay.querySelector('.modal-close').addEventListener('click', zu);
    cont.appendChild(overlay);

    try {
      await TREFFPUNKTE.ladeLeaflet();
    } catch (e) {
      const el = document.getElementById('strecke-karte-map');
      if (el) el.textContent = 'Karte konnte nicht geladen werden. Die Strecke steht als GPX-Download bereit.';
      return;
    }
    if (!document.body.contains(overlay)) return;  // inzwischen geschlossen

    const el = document.getElementById('strecke-karte-map');
    el.textContent = '';
    const punkte = s.geometrie.map(p => [p[0], p[1]]);
    const map = L.map(el);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    const linie = L.polyline(punkte, { color: '#cc0000', weight: 4, opacity: .9 }).addTo(map);
    map.fitBounds(linie.getBounds(), { padding: [24, 24] });
    L.circleMarker(punkte[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 })
      .addTo(map).bindTooltip('Start');
    if (!s.ist_rundkurs) {
      L.circleMarker(punkte[punkte.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#cc0000', fillOpacity: 1 })
        .addTo(map).bindTooltip('Ziel');
    }
    // Leaflet braucht nach dem Einblenden im Modal eine Größenkorrektur
    setTimeout(() => map.invalidateSize(), 60);
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
            <a class="btn btn-ghost btn-sm" href="api/index.php?p=strecken/${st.strecke_id}/gpx" download>GPX</a>
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
      _hinweis(`Strecke „${s.name}" importiert (${metaText(s)}).`, 'ok');
      // Übersichtsseite rendert sich komplett neu, das Editor-Feld nur sich selbst
      if (st && st.nachImport) await st.nachImport(s);
      else await _feldRender(feldId);
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

  // ── Übersichtsseite (Admin → Strecken) ─────────────────────
  // Zentrale Verwaltung: alle importierten Strecken mit Vorschau,
  // GPX-Download, Umbenennen, Löschen – plus Import ohne Umweg
  // über eine konkrete Runde.

  const SEITE = 'seite-strecke';

  async function renderSeite(container) {
    if (!container) return;
    felder.set(SEITE, { strecke_id: null, offen: false, nachImport: () => renderSeite(container) });
    container.innerHTML = '<div class="bloecke-loading">Lade Strecken…</div>';
    await load(true);

    const liste = listeCache || [];
    const gesamt = liste.reduce((n, s) => n + s.distanz_m, 0);

    container.innerHTML = `
      <div class="panel">
        <div class="panel-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <span>Strecken</span>
          <span class="strecke-seite-summe">${liste.length} ${liste.length === 1 ? 'Strecke' : 'Strecken'}${liste.length ? ' · ' + fmtDistanz(gesamt) + ' gesamt' : ''}</span>
        </div>
        <p class="bloecke-intro">
          Streckenverläufe für Runden. Die Geometrie liegt vollständig in der Vereins-Datenbank –
          zum Anzeigen wird nichts von Garmin, Komoot &amp; Co. nachgeladen.
        </p>
        <div class="strecke-seite-import">${_importHtml(SEITE)}</div>
        <div id="strecke-zuordnung"></div>
        <div class="strecke-seite-grid">
          ${liste.length
            ? liste.map(s => `
              <div class="strecke-karte">
                <div class="strecke-karte-bild" data-strecke-id="${s.id}"></div>
                <div class="strecke-karte-titel">${escapeHtml(s.name)}</div>
                <div class="strecke-karte-meta">${escapeHtml(metaText(s))}</div>
                <div class="strecke-karte-info">
                  ${s.verwendet > 0
                    ? `${s.verwendet}× verplant`
                    : '<span class="strecke-karte-unbenutzt">nicht verwendet</span>'}
                  · ${s.punkte} Punkte${s.herkunft ? ' · ' + escapeHtml(s.herkunft) : ''}
                </div>
                <div class="strecke-karte-actions">
                  <a class="btn btn-ghost btn-sm" href="api/index.php?p=strecken/${s.id}/gpx" download title="Strecke als GPX für Uhr/Navi">GPX</a>
                  <button class="btn btn-ghost btn-sm" onclick="STRECKEN.seiteUmbenennen(${s.id})">Umbenennen</button>
                  <button class="btn btn-ghost btn-sm" onclick="STRECKEN.seiteLoeschen(${s.id})">Löschen</button>
                </div>
              </div>`).join('')
            : '<div class="bloecke-leer">Noch keine Strecken importiert.</div>'}
        </div>
      </div>`;

    container.querySelectorAll('.strecke-karte-bild[data-strecke-id]').forEach(el => {
      vorschauEinbinden(el, el.dataset.streckeId, { breite: 300, hoehe: 160, ohneText: true });
    });
    _dropzoneBinden(SEITE);
    _seitenContainer = container;
    _renderZuordnung();
  }

  let _seitenContainer = null;

  // ── Nachträgliche Zuordnung bereits geplanter Runden ───────
  // Einheiten übernehmen den Titel ihres Blocks; über (Titel, Typ)
  // lassen sich deshalb auch alte Termine einer Strecke zuordnen.

  async function _renderZuordnung() {
    const wrap = document.getElementById('strecke-zuordnung');
    if (!wrap) return;

    let gruppen = [];
    try {
      const r = await apiGet('strecken/zuordnung', { silent: true });
      gruppen = (r && r.gruppen) || [];
    } catch (e) { /* Endpunkt (noch) nicht verfügbar → Abschnitt ausblenden */ }

    if (!gruppen.length) {
      wrap.innerHTML = (listeCache || []).length
        ? '<div class="strecke-zuordnung-ok">✓ Alle geplanten Runden haben einen Streckenverlauf.</div>'
        : '';
      return;
    }

    const liste  = listeCache || [];
    const offene = gruppen.reduce((n, g) => n + g.anzahl, 0);
    const opts = g => `<option value="">— keine —</option>` + liste.map(s =>
      `<option value="${s.id}"${s.id === g.vorschlag_strecke_id ? ' selected' : ''}>${escapeHtml(s.name)} (${escapeHtml(fmtDistanz(s.distanz_m))})</option>`
    ).join('');

    const mitVorschlag = gruppen.filter(g => g.vorschlag_strecke_id).length;

    wrap.innerHTML = `
      <div class="strecke-zuordnung">
        <div class="strecke-zuordnung-head">
          <strong>Geplante Runden ohne Streckenverlauf</strong>
          <span>${offene} ${offene === 1 ? 'Termin' : 'Termine'} in ${gruppen.length} ${gruppen.length === 1 ? 'Gruppe' : 'Gruppen'}</span>
        </div>
        <p class="strecke-zuordnung-hilfe">
          Ein Trainingsblock gibt seine Strecke nur beim Einplanen weiter – schon vorhandene
          Termine bleiben leer. Hier lassen sie sich nachträglich zuordnen, gruppiert nach Titel.
        </p>
        <label class="strecke-zuordnung-opt">
          <input type="checkbox" id="strecke-zuordnung-vergangene" checked>
          <span>Auch zurückliegende Termine zuordnen</span>
        </label>
        <table class="strecke-zuordnung-tab">
          <thead><tr><th>Runde</th><th>Termine</th><th>Zeitraum</th><th>Strecke</th><th></th></tr></thead>
          <tbody>
            ${gruppen.map((g, i) => `
              <tr data-i="${i}">
                <td>${escapeHtml(g.titel)}</td>
                <td class="strecke-zuordnung-anzahl">
                  ${g.anzahl}${g.vergangen ? ` <span title="davon zurückliegend">(${g.vergangen} alt)</span>` : ''}
                </td>
                <td class="strecke-zuordnung-zeit">${_datKurz(g.von)}–${_datKurz(g.bis)}</td>
                <td><select class="strecke-zuordnung-sel">${opts(g)}</select></td>
                <td><button class="btn btn-ghost btn-sm" onclick="STRECKEN.zuordnen(${i})">Zuordnen</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${mitVorschlag ? `<div class="strecke-zuordnung-actions">
          <button class="btn btn-primary btn-sm" onclick="STRECKEN.zuordnenAlle()">
            Alle ${mitVorschlag} Vorschläge übernehmen
          </button>
        </div>` : ''}
      </div>`;

    _zuordnungGruppen = gruppen;
  }

  let _zuordnungGruppen = [];

  function _datKurz(iso) {
    if (!iso) return '';
    const [j, m, t] = iso.split('-');
    return `${t}.${m}.${j.slice(2)}`;
  }

  function _abDatum() {
    const cb = document.getElementById('strecke-zuordnung-vergangene');
    if (cb && cb.checked) return null;             // null = ohne Datumsgrenze
    return new Date().toISOString().slice(0, 10);
  }

  async function zuordnen(i) {
    const g   = _zuordnungGruppen[i];
    const sel = document.querySelector(`.strecke-zuordnung-tab tr[data-i="${i}"] .strecke-zuordnung-sel`);
    const sid = sel && sel.value ? parseInt(sel.value, 10) : null;
    if (!g || !sid) { _hinweis('Bitte zuerst eine Strecke auswählen.', 'err'); return; }
    await _zuordnungSenden([{ titel: g.titel, typ: g.typ, strecke_id: sid }]);
  }

  async function zuordnenAlle() {
    const eintraege = [];
    _zuordnungGruppen.forEach((g, i) => {
      const sel = document.querySelector(`.strecke-zuordnung-tab tr[data-i="${i}"] .strecke-zuordnung-sel`);
      const sid = sel && sel.value ? parseInt(sel.value, 10) : null;
      if (sid) eintraege.push({ titel: g.titel, typ: g.typ, strecke_id: sid });
    });
    if (!eintraege.length) { _hinweis('Keine Strecke ausgewählt.', 'err'); return; }
    await _zuordnungSenden(eintraege);
  }

  async function _zuordnungSenden(zuordnungen) {
    const ab = _abDatum();
    try {
      const r = await apiPost('strecken/zuordnung', { zuordnungen, ab_datum: ab });
      _hinweis(`${r.geaendert} ${r.geaendert === 1 ? 'Termin' : 'Termine'} zugeordnet.`, 'ok');
      await renderSeite(_seitenContainer);
    } catch (e) {
      _hinweis('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function seiteUmbenennen(id) {
    const s = ausListe(id);
    const name = prompt('Neuer Name der Strecke:', s ? s.name : '');
    if (name === null || !name.trim()) return;
    try {
      await apiPut(`strecken/${id}`, { name: name.trim() });
      detailCache.delete(parseInt(id, 10));
      await renderSeite(_seitenContainer);
      _hinweis('Strecke umbenannt.', 'ok');
    } catch (e) {
      _hinweis('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function seiteLoeschen(id) {
    const s = ausListe(id);
    if (!confirm(`Strecke „${s ? s.name : id}" endgültig aus der Datenbank löschen?`)) return;
    try {
      await apiDel(`strecken/${id}`);
      detailCache.delete(parseInt(id, 10));
      await renderSeite(_seitenContainer);
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
    svgHtml, kartenVorschauHtml, vorschauEinbinden, karteOeffnen,
    feldHtml, feldInit, feldWert,
    feldAuswahl, feldImportToggle, feldDatei, feldUrl,
    feldUmbenennen, feldLoeschen,
    renderSeite, seiteUmbenennen, seiteLoeschen,
    zuordnen, zuordnenAlle,
  };
})();
