// ============================================================
// Trainingsportal – Einstellungen-Seite (Admin)
// ============================================================
// Verwendet 1:1 die Statistikportal-Optik:
//   .panel / .panel-header / .panel-title / .settings-panel-body
//   .settings-row / .settings-row-label / .settings-row-input
//   .settings-input / .btn / .btn-primary / .btn-ghost / .btn-danger
// ============================================================

const SETTINGS = (() => {

  let felder = [];
  let feiertage = [];

  async function render(main) {
    if (!state.user || state.user.rolle !== 'admin') {
      main.innerHTML = '<div style="max-width:680px;margin:24px auto;padding:0 16px">' +
        '<div class="panel"><div class="panel-header"><div class="panel-title">Einstellungen</div></div>' +
        '<div class="settings-panel-body"><div class="empty">Diese Seite ist nur für Admins zugänglich.</div></div></div></div>';
      return;
    }

    main.innerHTML = '<div style="max-width:680px;margin:24px auto;padding:0 16px">' +
      '<div class="loading"><div class="spinner"></div>Laden…</div></div>';

    try {
      const r = await apiGet('admin/settings', { silent: true });
      felder = r.felder || [];
      feiertage = parseFeiertageJson(getWert('training_feiertage_ics_urls'));
      rendereForm(main);
    } catch (e) {
      main.innerHTML = '<div style="max-width:680px;margin:24px auto;padding:0 16px">' +
        '<div class="panel"><div class="panel-header"><div class="panel-title">Einstellungen</div></div>' +
        '<div class="settings-panel-body"><div class="empty">Fehler: ' + escapeHtml(e.message || '') + '</div></div></div></div>';
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

  function rendereForm(main) {
    const dauerMin = getWert('training_default_dauer_min') || '90';

    main.innerHTML =
      '<div style="max-width:680px;margin:24px auto;padding:0 16px;display:flex;flex-direction:column;gap:20px">' +

      // ── Externe Kalender ──
      '<div class="panel">' +
        '<div class="panel-header">' +
          '<div class="panel-title">📅 Externe Kalender (Feiertage / Ferien)</div>' +
          '<button class="btn btn-primary btn-sm" onclick="SETTINGS.hinzufuegen()">+ Hinzufügen</button>' +
        '</div>' +
        '<div class="settings-panel-body">' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">ICS-Feeds</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">' +
                'Pro Feed eine ICS-URL. Label und Farbe werden im Kalender als Marker auf den jeweiligen Tagen angezeigt. ' +
                'Vorschläge: ' +
                '<a href="#" onclick="SETTINGS.beispiel(\'feiertage\');return false;" style="color:var(--accent)">Feiertage NRW</a>, ' +
                '<a href="#" onclick="SETTINGS.beispiel(\'ferien\');return false;" style="color:var(--accent)">Schulferien NRW</a>.' +
              '</div>' +
            '</div>' +
            '<div class="settings-row-input" style="width:100%">' +
              '<div id="feiertage-liste"></div>' +
            '</div>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">Diagnose</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">Prüft, ob die Feeds erreichbar sind und wie viele Events im aktuellen Monat liegen.</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
              '<button class="btn btn-ghost btn-sm" onclick="SETTINGS.diagnose()">🔍 Feeds testen</button>' +
            '</div>' +
          '</div>' +
          '<div id="diag-result" style="margin-top:8px"></div>' +
        '</div>' +
      '</div>' +

      // ── Standardwerte ──
      '<div class="panel">' +
        '<div class="panel-header"><div class="panel-title">⚙️ Standardwerte</div></div>' +
        '<div class="settings-panel-body">' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">Standard-Dauer einer Einheit</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">In Minuten. Wird im ICS-Export für DTEND verwendet, wenn eine Uhrzeit gesetzt ist.</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
              '<input type="number" id="set-dauer" min="15" max="600" step="15" value="' + escapeHtml(dauerMin) + '" class="settings-input" style="width:120px">' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Hinweis zu geteilten Settings ──
      '<div class="panel">' +
        '<div class="panel-header"><div class="panel-title">ℹ️ Optik &amp; Verein</div></div>' +
        '<div class="settings-panel-body">' +
          '<div style="font-size:13px;color:var(--text2);line-height:1.5">' +
            'Vereinsname, Vereinslogo, Farben, Wartungsmodus etc. werden im ' +
            '<strong>Statistikportal</strong> gepflegt – beide Portale teilen sich die Tabelle <code>einstellungen</code>. ' +
            'Änderungen dort schlagen automatisch hier durch.' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Aktionsleiste ──
      '<div style="display:flex;justify-content:flex-end;gap:8px">' +
        '<button class="btn btn-primary" onclick="SETTINGS.speichern()">💾 Speichern</button>' +
      '</div>' +

      '</div>';

    rendereFeiertage();
  }

  function rendereFeiertage() {
    const wrap = document.getElementById('feiertage-liste');
    if (!wrap) return;
    if (!feiertage.length) {
      wrap.innerHTML = '<div style="padding:14px;border:1px dashed var(--border);border-radius:6px;color:var(--text2);font-size:13px;text-align:center">' +
        'Keine Feeds konfiguriert. Klick „+ Hinzufügen".' +
      '</div>';
      return;
    }
    wrap.innerHTML = feiertage.map((f, i) =>
      '<div class="feiertag-row" style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">' +
        '<input type="url" placeholder="https://..." value="' + escapeHtml(f.url) + '" data-i="' + i + '" data-f="url" class="settings-input feiertag-input" style="flex:2;min-width:200px">' +
        '<input type="text" placeholder="Label" value="' + escapeHtml(f.label) + '" data-i="' + i + '" data-f="label" class="settings-input feiertag-input" style="flex:1;min-width:120px">' +
        '<input type="color" value="' + escapeHtml(f.farbe || '#cc0000') + '" data-i="' + i + '" data-f="farbe" class="feiertag-input" style="width:42px;height:36px;border:none;background:none;cursor:pointer;padding:0">' +
        '<button class="btn" style="padding:4px 10px;font-size:16px;line-height:1" onclick="SETTINGS.entfernen(' + i + ')" title="Entfernen">×</button>' +
      '</div>'
    ).join('');

    wrap.querySelectorAll('.feiertag-input').forEach(el => {
      el.addEventListener('input',  onFeldChange);
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
    rendereFeiertage();
  }
  function entfernen(i) {
    feiertage.splice(i, 1);
    rendereFeiertage();
  }
  function beispiel(typ) {
    const m = {
      feiertage: { url: 'https://www.schulferien.org/iCal/Ferien/Feiertag/ICalKalender_Schulferien_Feiertage_in_Nordrhein-Westfalen.ics', label: 'Feiertage NRW', farbe: '#cc0000' },
      ferien:    { url: 'https://www.schulferien.org/iCal/Ferien/ICalKalender_Schulferien_in_Nordrhein-Westfalen.ics',                 label: 'Schulferien NRW', farbe: '#003087' },
    };
    if (!m[typ]) return;
    feiertage.push(m[typ]);
    rendereFeiertage();
  }

  async function speichern() {
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
      await CONFIG.load();
    } catch (e) {
      benachrichtigen('Fehler: ' + e.message, 'err');
    }
  }

  async function diagnose() {
    const out = document.getElementById('diag-result');
    out.innerHTML = '<div style="padding:10px;color:var(--text2);font-size:13px">⏳ Prüfe Feeds…</div>';
    try {
      const r = await apiGet('admin/feiertage_test', { silent: true });
      const quellen = (r && r.quellen) || [];
      if (!quellen.length) {
        out.innerHTML = '<div style="padding:10px;color:var(--text2);font-size:13px">Keine Feeds konfiguriert. Erst speichern, dann testen.</div>';
        return;
      }
      out.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="border-bottom:2px solid var(--border)">' +
          '<th style="text-align:left;padding:6px 8px;color:var(--text2);font-weight:600">URL</th>' +
          '<th style="text-align:left;padding:6px 8px;color:var(--text2);font-weight:600">Status</th>' +
          '<th style="text-align:right;padding:6px 8px;color:var(--text2);font-weight:600">Events</th>' +
        '</tr></thead><tbody>' +
        quellen.map(q => {
          const farbe = q.ok ? 'var(--green,#1a8a3a)' : 'var(--primary)';
          const icon  = q.ok ? '✅' : '❌';
          const detail = q.fehler ? ' <span style="color:var(--text2);font-size:11px">(' + escapeHtml(q.fehler) + ')</span>' : '';
          return '<tr style="border-bottom:1px solid var(--border)">' +
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px;word-break:break-all">' + escapeHtml(q.url) + '</td>' +
            '<td style="padding:6px 8px;color:' + farbe + ';font-weight:600">' + icon + ' ' + escapeHtml(q.status) + detail + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + (q.events_im_zeitraum ?? '–') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    } catch (e) {
      out.innerHTML = '<div style="padding:10px;color:var(--primary);font-size:13px">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  function benachrichtigen(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) { console.log(text); return; }
    const cls = art === 'err' ? 'notif-err' : (art === 'warn' ? 'notif-warn' : 'notif-ok');
    const div = document.createElement('div');
    div.className = 'notif ' + cls;
    div.textContent = text;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  }

  return { render, hinzufuegen, entfernen, beispiel, speichern, diagnose };
})();
