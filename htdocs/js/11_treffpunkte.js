// ============================================================
// Trainingsportal – Treffpunkte-Verwaltung
// ============================================================
// Seite zum Anlegen, Bearbeiten und Löschen von Treffpunkten.
// Jeder Treffpunkt hat Name, GPS-Koordinaten (Karten-Picker)
// sowie automatisch generierte Links zu Google Maps / Apple Maps.
// Sichtbar für Trainer und Admins.
// ============================================================

const TREFFPUNKTE = (() => {

  let _liste = [];
  let _leafletLoaded = false;
  let _map = null;
  let _marker = null;

  // ── Karten-Bibliothek (Leaflet) nachladen ─────────────────
  async function ladeLeaflet() {
    if (_leafletLoaded || window.L) { _leafletLoaded = true; return; }
    await new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    _leafletLoaded = true;
  }

  // ── Haupt-Render ──────────────────────────────────────────
  async function render(main) {
    main.innerHTML = `<div class="tp-wrap"><div class="tp-loading">Lade Treffpunkte…</div></div>`;
    try {
      const data = await apiGet('treffpunkte', { silent: true });
      _liste = data.treffpunkte || [];
    } catch (e) {
      main.innerHTML = `<div class="tp-wrap"><div class="tp-error">Fehler beim Laden: ${escapeHtml(e.message || '')}</div></div>`;
      return;
    }
    renderListe(main);
  }

  function renderListe(main) {
    const istTrainer = state.user &&
      (state.user.rolle === 'admin' || state.user.rolle === 'trainer');

    main.innerHTML = `
      <div class="tp-wrap">
        <div class="tp-header">
          <h2>Treffpunkte</h2>
          ${istTrainer ? `<button class="btn btn-primary" onclick="TREFFPUNKTE.neu()">+ Neuer Treffpunkt</button>` : ''}
        </div>
        ${_liste.length === 0
          ? `<div class="tp-leer">Noch keine Treffpunkte angelegt.</div>`
          : `<div class="tp-grid">
              ${_liste.map(renderKarte).join('')}
            </div>`
        }
      </div>`;
  }

  function staticMapHtml(lat, lng) {
    const zoom = 16;
    const TILE  = 256;
    const GRID  = 3; // 3×3 Kacheln
    const n     = Math.pow(2, zoom);

    const cx = (lng + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const cy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

    const tx0 = Math.floor(cx) - 1; // linke Kachel
    const ty0 = Math.floor(cy) - 1; // obere Kachel

    // Pixel-Position des Markers innerhalb des 3×3-Blocks
    const markerX = (cx - tx0) * TILE;
    const markerY = (cy - ty0) * TILE;

    let tiles = '';
    for (let dy = 0; dy < GRID; dy++) {
      for (let dx = 0; dx < GRID; dx++) {
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        tiles += `<img src="https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png" `
               + `style="position:absolute;left:${dx*TILE}px;top:${dy*TILE}px;width:${TILE}px;height:${TILE}px" `
               + `draggable="false" alt="">`;
      }
    }

    // Marker via CSS in der Mitte des Containers platzieren (unabhängig von der Containerbreite)
    return `<div class="tp-karte-map" style="overflow:hidden;position:relative;user-select:none">
      <div style="position:absolute;width:${GRID*TILE}px;height:${GRID*TILE}px;left:calc(50% - ${Math.round(markerX)}px);top:calc(50% - ${Math.round(markerY)}px);pointer-events:none">
        ${tiles}
        <div style="position:absolute;left:${Math.round(markerX)-12}px;top:${Math.round(markerY)-32}px;width:24px;height:32px">
          <svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 7.75 12 20 12 20S24 19.75 24 12C24 5.37 18.63 0 12 0z" fill="#cc0000"/>
            <circle cx="12" cy="12" r="5" fill="#fff"/>
          </svg>
        </div>
      </div>
    </div>`;
  }

  function renderKarte(t) {
    const istTrainer = state.user &&
      (state.user.rolle === 'admin' || state.user.rolle === 'trainer');
    const hatKoords = t.lat != null && t.lng != null;

    // Kartenvorschau via OSM-Tiles (statisch, nicht verschiebbar)
    const mapPreview = hatKoords ? staticMapHtml(t.lat, t.lng) : '';

    const mapLinks = hatKoords
      ? `<div class="tp-map-links">
           ${t.maps_google ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(t.maps_google)}" target="_blank" rel="noopener">Google Maps</a>` : ''}
           ${t.maps_apple  ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(t.maps_apple)}"  target="_blank" rel="noopener">Apple Maps</a>`  : ''}
           ${t.maps_komoot ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(t.maps_komoot)}" target="_blank" rel="noopener">Komoot</a>` : ''}
         </div>`
      : '';
    const coords = hatKoords
      ? `<div class="tp-coords">📍 ${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}</div>`
      : `<div class="tp-coords tp-coords-leer">Keine Koordinaten</div>`;
    return `
      <div class="tp-karte" id="tpk-${t.id}">
        ${mapPreview}
        <div class="tp-karte-body">
          <div class="tp-karte-name">${escapeHtml(t.name)}</div>
          ${coords}
          ${mapLinks}
          ${istTrainer ? `
            <div class="tp-karte-actions">
              <button class="btn btn-ghost btn-sm" onclick="TREFFPUNKTE.bearbeiten(${t.id})">Bearbeiten</button>
              <button class="btn btn-ghost btn-sm tp-del-btn" onclick="TREFFPUNKTE.loeschen(${t.id})">Löschen</button>
            </div>` : ''}
        </div>
      </div>`;
  }

  // ── Neuer Treffpunkt ──────────────────────────────────────
  function neu() { oeffneEditor(null); }

  function bearbeiten(id) {
    const t = _liste.find(x => x.id === id);
    if (t) oeffneEditor(t);
  }

  async function oeffneEditor(t) {
    const istNeu = !t;
    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card modal-wide" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Treffpunkt</div>
              <div class="modal-title">${istNeu ? 'Neuer Treffpunkt' : escapeHtml(t.name)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <div class="ed-grid">
              <div class="ed-fg ed-fg-wide">
                <label>Name *</label>
                <input type="text" id="tp-ed-name" value="${escapeHtml(t ? t.name : '')}" placeholder="z. B. Sportplatz, Vereinsheim">
              </div>
              <div class="ed-fg">
                <label>Breitengrad (Lat)</label>
                <input type="number" step="0.0000001" id="tp-ed-lat" value="${t && t.lat != null ? t.lat : ''}" placeholder="z. B. 51.2345678">
              </div>
              <div class="ed-fg">
                <label>Längengrad (Lng)</label>
                <input type="number" step="0.0000001" id="tp-ed-lng" value="${t && t.lng != null ? t.lng : ''}" placeholder="z. B. 6.4567890">
              </div>
            </div>
            <div class="tp-map-hint">Auf die Karte klicken, um Koordinaten zu setzen:</div>
            <div id="tp-ed-map" class="tp-ed-map"></div>
            <div class="ed-footer">
              <span></span>
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" onclick="TREFFPUNKTE.speichern(${t ? t.id : 'null'})">Speichern</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Karte initialisieren
    try {
      await ladeLeaflet();
      initKarte(t ? t.lat : null, t ? t.lng : null);
    } catch (e) {
      const mapEl = document.getElementById('tp-ed-map');
      if (mapEl) mapEl.innerHTML = '<div class="tp-map-err">Karte konnte nicht geladen werden.<br>Koordinaten bitte manuell eingeben.</div>';
    }
  }

  function initKarte(initLat, initLng) {
    const mapEl = document.getElementById('tp-ed-map');
    if (!mapEl || !window.L) return;

    const startLat = initLat != null ? initLat : 51.33;
    const startLng = initLng != null ? initLng : 6.57;
    const zoom     = (initLat != null) ? 16 : 11;

    _map = L.map('tp-ed-map').setView([startLat, startLng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_map);

    if (initLat != null && initLng != null) {
      _marker = L.marker([initLat, initLng], { draggable: true }).addTo(_map);
      _marker.on('dragend', () => {
        const pos = _marker.getLatLng();
        setKoords(pos.lat, pos.lng);
      });
    }

    _map.on('click', (ev) => {
      const { lat, lng } = ev.latlng;
      setKoords(lat, lng);
      if (_marker) {
        _marker.setLatLng([lat, lng]);
      } else {
        _marker = L.marker([lat, lng], { draggable: true }).addTo(_map);
        _marker.on('dragend', () => {
          const pos = _marker.getLatLng();
          setKoords(pos.lat, pos.lng);
        });
      }
    });

    // Lat/Lng-Felder → Karte aktualisieren
    ['tp-ed-lat', 'tp-ed-lng'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', aktualisierePinAusFelder);
    });
  }

  function setKoords(lat, lng) {
    const latEl = document.getElementById('tp-ed-lat');
    const lngEl = document.getElementById('tp-ed-lng');
    if (latEl) latEl.value = lat.toFixed(7);
    if (lngEl) lngEl.value = lng.toFixed(7);
  }

  function aktualisierePinAusFelder() {
    if (!_map || !window.L) return;
    const lat = parseFloat(document.getElementById('tp-ed-lat')?.value || '');
    const lng = parseFloat(document.getElementById('tp-ed-lng')?.value || '');
    if (isNaN(lat) || isNaN(lng)) return;
    if (_marker) {
      _marker.setLatLng([lat, lng]);
    } else {
      _marker = L.marker([lat, lng], { draggable: true }).addTo(_map);
      _marker.on('dragend', () => {
        const pos = _marker.getLatLng();
        setKoords(pos.lat, pos.lng);
      });
    }
    _map.setView([lat, lng], Math.max(_map.getZoom(), 15));
  }

  // ── Speichern ─────────────────────────────────────────────
  async function speichern(id) {
    const name = (document.getElementById('tp-ed-name')?.value || '').trim();
    if (!name) { notify('Name ist erforderlich.', 'err'); return; }
    const latStr = document.getElementById('tp-ed-lat')?.value;
    const lngStr = document.getElementById('tp-ed-lng')?.value;
    const lat = latStr !== '' && latStr != null ? parseFloat(latStr) : null;
    const lng = lngStr !== '' && lngStr != null ? parseFloat(lngStr) : null;
    const payload = { name, lat: (isNaN(lat) ? null : lat), lng: (isNaN(lng) ? null : lng) };
    try {
      if (id) {
        await apiPut(`treffpunkte/${id}`, payload);
      } else {
        await apiPost('treffpunkte', payload);
      }
      schliesseModal();
      notify(id ? 'Treffpunkt aktualisiert.' : 'Treffpunkt angelegt.', 'ok');
      // Liste neu laden
      const data = await apiGet('treffpunkte', { silent: true });
      _liste = data.treffpunkte || [];
      renderListe(document.getElementById('main-content'));
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  // ── Löschen ───────────────────────────────────────────────
  async function loeschen(id) {
    const t = _liste.find(x => x.id === id);
    if (!confirm(`Treffpunkt „${t ? t.name : id}" wirklich löschen?\nAlle Trainingseinheiten verlieren diesen Treffpunkt.`)) return;
    try {
      await apiDel(`treffpunkte/${id}`);
      notify('Treffpunkt gelöscht.', 'ok');
      _liste = _liste.filter(x => x.id !== id);
      renderListe(document.getElementById('main-content'));
    } catch (e) {
      notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  // ── Öffentliche Hilfsfunktion: Treffpunkte-Liste laden ────
  // Wird von Editor und Bloecke-Apply aufgerufen.
  let _loadPromise = null;
  async function laden() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = apiGet('treffpunkte', { silent: true })
      .then(d => { _liste = d.treffpunkte || []; return _liste; })
      .catch(() => { _liste = []; return _liste; });
    return _loadPromise;
  }
  function getListe() { return _liste; }
  function invalidate() { _loadPromise = null; }

  return { render, neu, bearbeiten, speichern, loeschen, laden, getListe, invalidate, ladeLeaflet };
})();
