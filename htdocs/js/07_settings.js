// ============================================================
// Trainingsportal – Einstellungen-Seite (Admin)
// ============================================================
// Route: #einstellungen
// Sichtbar nur, wenn user.rolle === 'admin'.
// Bearbeitet trainingsportal-spezifische Keys (vor allem die
// Feiertage-/Ferien-ICS-Liste). Geteilte Keys (Farben, Logo,
// Vereinsname) werden weiterhin im Statistikportal-Admin gepflegt.
// ============================================================

const SETTINGS = (() => {

  let felder = [];
  let feiertage = []; // Editierbarer Liste-State

  async function render(main) {
    if (!state.user || state.user.rolle !== 'admin') {
      main.innerHTML = `
        <div class="page-wrap">
          <h1 class="page-title">Einstellungen</h1>
          <div class="empty">Diese Seite ist nur für Admins zugänglich.</div>
        </div>`;
      return;
    }

    main.innerHTML = `
      <div class="page-wrap">
        <h1 class="page-title">Einstellungen</h1>
        <p class="page-sub">Vereinsfarben, Logo und Vereinsname werden weiterhin im Statistikportal gepflegt – hier landen nur die Trainingsportal-spezifischen Optionen.</p>
        <div id="settings-content" class="loading">Lade…</div>
      </div>`;

    try {
      const r = await apiGet('admin/settings', { silent: true });
      felder = r.felder || [];
      feiertage = parseFeiertageJson(getWert('training_feiertage_ics_urls'));
      rendereForm();
    } catch (e) {
      document.getElementById('settings-content').innerHTML =
        `<div class="kal-error">Fehler: ${escapeHtml(e.message || '')}</div>`;
    }
  }

  function getWert(key) {
    const f = felder.find(x => x.key === key);
    return f ? f.wert : '';
  }

  function parseFeiertageJson(raw) {
    if (!raw) return [];
    try {
      const j = JSON.parse(raw);
      if (!Array.isArray(j)) return [];
      return j.map(e => typeof e === 'string'
        ? { url: e, label: '', farbe: '' }
        : { url: e.url || '', label: e.label || '', farbe: e.farbe || '' });
    } catch (e) { return []; }
  }

  function rendereForm() {
    const c = document.getElementById('settings-content');
    if (!c) return;

    const dauerMin = getWert('training_default_dauer_min') || '90';

    const rows = feiertage.length
      ? feiertage.map((f, i) => `
        <tr>
          <td><input type="url" placeholder="https://…" value="${escapeHtml(f.url)}" data-i="${i}" data-f="url" class="set-input"></td>
          <td><input type="text" placeholder="Feiertage NRW" value="${escapeHtml(f.label)}" data-i="${i}" data-f="label" class="set-input"></td>
          <td><input type="color" value="${escapeHtml(f.farbe || '#cc0000')}" data-i="${i}" data-f="farbe" class="set-input set-color"></td>
          <td><button class="btn-icon" title="Entfernen" onclick="SETTINGS.entfernen(${i})">×</button></td>
        </tr>`).join('')
      : `<tr><td colspan="4" class="empty-row">Keine Feeds. Klick „+ Hinzufügen".</td></tr>`;

    c.innerHTML = `
      <section class="settings-card">
        <header class="settings-card-head">
          <h2>Feiertage / Ferien (ICS-Feeds)</h2>
          <button class="btn btn-ghost" onclick="SETTINGS.hinzufuegen()">+ Hinzufügen</button>
        </header>
        <p class="settings-hint">
          Pro Feed eine ICS-URL. Label und Farbe werden im Kalender als Marker angezeigt.
          Vorschläge:
          <a href="#" onclick="SETTINGS.beispiel('feiertage');return false;">Feiertage NRW</a>,
          <a href="#" onclick="SETTINGS.beispiel('ferien');return false;">Schulferien NRW</a>.
        </p>
        <table class="settings-table">
          <thead>
            <tr><th>URL</th><th>Label</th><th>Farbe</th><th></th></tr>
          </thead>
          <tbody id="settings-feiertage">${rows}</tbody>
        </table>
      </section>

      <section class="settings-card">
        <header class="settings-card-head"><h2>Standardwerte</h2></header>
        <div class="settings-fg">
          <label for="set-dauer">Standard-Dauer einer Einheit (Minuten)</label>
          <input type="number" id="set-dauer" min="15" max="600" step="15" value="${escapeHtml(dauerMin)}">
          <span class="settings-fg-hint">Wird im ICS-Export für DTEND verwendet, wenn eine Uhrzeit gesetzt ist.</span>
        </div>
      </section>

      <div class="settings-actions">
        <button class="btn btn-primary" onclick="SETTINGS.speichern()">Speichern</button>
      </div>`;

    c.querySelectorAll('.set-input').forEach(el => {
      el.addEventListener('input', onFeldChange);
      el.addEventListener('change', onFeldChange);
    });
  }

  function onFeldChange(ev) {
    const t = ev.target;
    const i = parseInt(t.dataset.i, 10);
    const f = t.dataset.f;
    if (!feiertage[i]) return;
    feiertage[i][f] = t.value;
  }

  function hinzufuegen() {
    feiertage.push({ url: '', label: '', farbe: '#cc0000' });
    rendereForm();
  }
  function entfernen(i) {
    feiertage.splice(i, 1);
    rendereForm();
  }

  function beispiel(typ) {
    const m = {
      feiertage: { url: 'https://www.schulferien.org/iCal/Ferien/Feiertag/ICalKalender_Schulferien_Feiertage_in_Nordrhein-Westfalen.ics', label: 'Feiertage NRW', farbe: '#cc0000' },
      ferien:    { url: 'https://www.schulferien.org/iCal/Ferien/ICalKalender_Schulferien_in_Nordrhein-Westfalen.ics',                 label: 'Schulferien NRW', farbe: '#003087' },
    };
    if (!m[typ]) return;
    feiertage.push(m[typ]);
    rendereForm();
  }

  async function speichern() {
    // Leere URLs verwerfen
    const liste = feiertage
      .map(f => ({ url: (f.url || '').trim(), label: (f.label || '').trim(), farbe: (f.farbe || '').trim() }))
      .filter(f => f.url !== '');

    const payload = {
      werte: {
        training_feiertage_ics_urls: JSON.stringify(liste),
        training_default_dauer_min:  document.getElementById('set-dauer').value || '90',
      },
    };
    try {
      await apiPut('admin/settings', payload);
      benachrichtigen('Gespeichert.', 'ok');
      // Config neu laden, damit Änderungen sofort greifen
      await CONFIG.load();
    } catch (e) {
      benachrichtigen('Fehler: ' + e.message, 'err');
    }
  }

  function benachrichtigen(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) { console.log(text); return; }
    const cls = art === 'err' ? 'notif-err' : (art === 'warn' ? 'notif-warn' : 'notif-ok');
    const div = document.createElement('div');
    div.className = `notif ${cls}`;
    div.textContent = text;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  }

  return { render, hinzufuegen, entfernen, beispiel, speichern };
})();
