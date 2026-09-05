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
  let paceDistanzen = [];
  let uhrzeiten = {};     // { "1": "18:00", ... } – 1=Mo … 7=So
  let typen = [];         // { slug, bezeichnung, farbe, reihenfolge, aktiv, block_count }
  let typenBearbeitet = null; // slug des gerade inline bearbeiteten Typs
  let seitentitel = '';
  let versionNurAdmin = false;

  const WOCHENTAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  async function render(main) {
    if (!state.user || state.user.rolle !== 'admin') {
      main.innerHTML = '<div style="margin:0 auto">' +
        '<div class="panel"><div class="panel-header"><div class="panel-title">Einstellungen</div></div>' +
        '<div class="settings-panel-body"><div class="empty">Diese Seite ist nur für Admins zugänglich.</div></div></div></div>';
      return;
    }

    main.innerHTML = '<div style="margin:0 auto">' +
      '<div class="loading"><div class="spinner"></div>Laden…</div></div>';

    try {
      const [settingsR, typenR] = await Promise.all([
        apiGet('admin/settings', { silent: true }),
        apiGet('admin/typen',    { silent: true }),
        TREFFPUNKTE.laden(),
      ]);
      felder         = settingsR.felder || [];
      feiertage      = parseFeiertageJson(getWert('training_feiertage_ics_urls'));
      paceDistanzen  = parsePaceDistanzenJson(getWert('training_pace_distanzen'));
      uhrzeiten      = parseUhrzeitenJson(getWert('training_default_uhrzeiten'));
      seitentitel    = getWert('training_seitentitel') || '';
      versionNurAdmin= getWert('training_version_anzeigen') === '1';
      typen          = typenR.typen || [];
      rendereForm(main);
    } catch (e) {
      main.innerHTML = '<div style="margin:0 auto">' +
        '<div class="panel"><div class="panel-header"><div class="panel-title">Einstellungen</div></div>' +
        '<div class="settings-panel-body"><div class="empty">Fehler: ' + escapeHtml(e.message || '') + '</div></div></div></div>';
    }
  }

  function getWert(key) {
    const f = felder.find(x => x.key === key);
    return f ? f.wert : '';
  }

  function parseUhrzeitenJson(raw) {
    if (!raw) return {};
    try {
      const j = JSON.parse(raw);
      if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
      const result = {};
      for (let d = 1; d <= 7; d++) {
        const v = (j[String(d)] || '').trim();
        result[String(d)] = /^\d{2}:\d{2}$/.test(v) ? v : '';
      }
      return result;
    } catch (e) { return {}; }
  }

  function parsePaceDistanzenJson(raw) {
    if (!raw) return [5000, 10000, 21098, 42195];
    try {
      const j = JSON.parse(raw);
      if (!Array.isArray(j)) return [5000, 10000, 21098, 42195];
      const r = j.map(v => parseInt(v, 10)).filter(v => v > 0 && v <= 200000);
      return r.length ? r : [5000, 10000, 21098, 42195];
    } catch (e) { return [5000, 10000, 21098, 42195]; }
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

  // ── Wartung (Admin → Wartung) ──────────────────────────────
  // Einmalige Werkzeuge, die frueher zwischen den taeglichen Einstellungen
  // standen. Sie brauchen keine geladenen Settings – nur die beiden Aktionen.
  function renderWartung(main) {
    if (!state.user || state.user.rolle !== 'admin') {
      main.innerHTML = '<div class="panel"><div class="settings-panel-body">' +
        '<div class="empty">Diese Seite ist nur für Admins zugänglich.</div></div></div>';
      return;
    }
    main.innerHTML =
      '<div style="margin:0 auto;display:flex;flex-direction:column;gap:20px">' +

      '<div class="panel">' +
        '<div class="panel-header"><div class="panel-title">🔄 Migration: Einheiten → Trainingsblöcke</div></div>' +
        '<div class="settings-panel-body">' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">Bestehende Kalendereinträge migrieren</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">' +
                'Liest alle vorhandenen Trainingseinheiten und legt pro eindeutigem Titel einen globalen Trainingsblock an (inklusive Segmente). Bereits vorhandene Blöcke werden übersprungen. Idempotent – kann mehrfach ausgeführt werden.' +
              '</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
              '<button class="btn btn-primary btn-sm" onclick="SETTINGS.migrieren()">▶ Jetzt migrieren</button>' +
            '</div>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">Segmente aus Titeln parsen</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">' +
                'Analysiert alle Blöcke ohne Segmente, erkennt Kurzschrift im Titel (z. B. „12 x 400 m (100GP)") und speichert die Segmente automatisch. Blöcke mit vorhandenen Segmenten werden nicht verändert.' +
              '</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
              '<button class="btn btn-ghost btn-sm" onclick="SETTINGS.reparseSegmente()">🔍 Segmente parsen</button>' +
            '</div>' +
          '</div>' +
          '<div id="migr-result"></div>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-header"><div class="panel-title">ℹ️ Wozu diese Seite</div></div>' +
        '<div class="settings-panel-body">' +
          '<div style="font-size:13px;color:var(--text2);line-height:1.5">' +
            'Hier stehen einmalige Werkzeuge, die den Datenbestand umbauen – nicht die täglichen Einstellungen. ' +
            'Alles, was regelmäßig gepflegt wird (Uhrzeiten, Trainingstypen, Pace-Distanzen, Feiertags-Feeds), ' +
            'liegt unter <strong>Admin → Einstellungen</strong>.' +
          '</div>' +
        '</div>' +
      '</div>' +

      '</div>';
  }

  function rendereForm(main) {
    main.innerHTML =
      '<div style="margin:0 auto;display:flex;flex-direction:column;gap:20px">' +

      // ── Portal ──
      '<div class="panel">' +
        '<div class="panel-header"><div class="panel-title">🌐 Portal</div></div>' +
        '<div class="settings-panel-body">' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">Seitentitel</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">Bezeichnet das Portal im Browser-Tab, Header und Login-Screen. Standard: „Trainingsplan".</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
              '<input type="text" id="set-seitentitel" class="settings-input" placeholder="Trainingsplan"' +
                ' value="' + escapeHtml(seitentitel) + '" style="max-width:320px">' +
            '</div>' +
          '</div>' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">Versionsstand im Header</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">Wenn aktiv, wird die Versionsnummer nur eingeloggten Admins angezeigt.</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
              '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">' +
                '<input type="checkbox" id="set-version-nur-admin"' + (versionNurAdmin ? ' checked' : '') + '>' +
                'Nur für Admins sichtbar' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

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
                'Pro Feed eine ICS-URL oder <code style="font-size:11px">builtin://feiertage/NRW</code> für den eingebauten Rechner. ' +
                '<code style="font-size:11px">{year}</code> in externen URLs wird automatisch ersetzt. ' +
                'Vorschläge: ' +
                '<a href="#" onclick="SETTINGS.beispiel(\'feiertage\');return false;" style="color:var(--accent)">Feiertage NRW</a>, ' +
                '<a href="#" onclick="SETTINGS.beispiel(\'ferien\');return false;" style="color:var(--accent)">Schulferien NRW</a>.' +
              '</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
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

      // ── Standard-Uhrzeiten ──
      '<div class="panel">' +
        '<div class="panel-header"><div class="panel-title">🕐 Standard-Uhrzeiten pro Wochentag</div></div>' +
        '<div class="settings-panel-body">' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">Uhrzeit je Wochentag</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">Wird beim Planen eines Trainings als Standarduhrzeit vorausgefüllt. Leer lassen = kein Standard.</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
              '<div id="uhrzeiten-grid" class="uhrzeiten-grid"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ── Pace-Referenz-Distanzen ──
      '<div class="panel">' +
        '<div class="panel-header">' +
          '<div class="panel-title">🏃 Pace-Referenz-Distanzen</div>' +
          '<button class="btn btn-primary btn-sm" onclick="SETTINGS.paceDistanzHinzufuegen()">+ Distanz</button>' +
        '</div>' +
        '<div class="settings-panel-body">' +
          '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text)">Verfügbare Distanzen</div>' +
              '<div style="font-size:12px;color:var(--text2);margin-top:2px">' +
                'Distanzen in Metern, die Athleten als Pace-Referenz auswählen können. ' +
                'Beispiel: 5000 findet alle 5-km-Ergebnisse (5 km Straße und 5.000 m Bahn).' +
              '</div>' +
            '</div>' +
            '<div class="settings-row-input">' +
              '<div id="pace-dist-liste"></div>' +
              '<div class="pace-dist-add-row" style="display:flex;gap:8px;align-items:center;margin-top:10px">' +
                '<input type="number" id="pace-dist-neu" class="settings-input" placeholder="Meter (z. B. 3000)" min="100" max="200000" step="1" style="width:200px">' +
                '<button class="btn btn-ghost btn-sm" onclick="SETTINGS.paceDistanzHinzufuegen()">Hinzufügen</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +


      // ── Trainingstypen ──
      '<div class="panel">' +
        '<div class="panel-header">' +
          '<div class="panel-title">🏷️ Trainingstypen</div>' +
          '<button class="btn btn-primary btn-sm" onclick="SETTINGS.typHinzufuegen()">+ Typ</button>' +
        '</div>' +
        '<div class="settings-panel-body">' +
          '<div style="font-size:12px;color:var(--text2);margin-bottom:12px">' +
            'Trainingsblöcke und Kalendereinträge werden einem Typ zugeordnet. Typen mit Blöcken können nicht gelöscht werden.' +
          '</div>' +
          '<div id="typen-liste"></div>' +
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
    rendereUhrzeiten();
    renderePaceDistanzen();
    rendereTypen();
  }

  function rendereUhrzeiten() {
    const wrap = document.getElementById('uhrzeiten-grid');
    if (!wrap) return;
    wrap.innerHTML = WOCHENTAGE_LANG.map((tag, i) => {
      const key = String(i + 1);
      const val = uhrzeiten[key] || '';
      return '<div class="uhrzeit-row">' +
        '<label class="uhrzeit-label">' + escapeHtml(tag) + '</label>' +
        '<input type="time" class="settings-input uhrzeit-input" data-dow="' + key + '" value="' + escapeHtml(val) + '" style="width:120px">' +
      '</div>';
    }).join('');
    wrap.querySelectorAll('.uhrzeit-input').forEach(el => {
      el.addEventListener('change', () => { uhrzeiten[el.dataset.dow] = el.value; });
    });
  }

  function renderePaceDistanzen() {
    const wrap = document.getElementById('pace-dist-liste');
    if (!wrap) return;
    if (!paceDistanzen.length) {
      wrap.innerHTML = '<div style="padding:10px;color:var(--text2);font-size:13px">Keine Distanzen konfiguriert.</div>';
      return;
    }
    const LABELS = { 5000: '5 km', 10000: '10 km', 21098: 'Halbmarathon', 42195: 'Marathon' };
    wrap.innerHTML = paceDistanzen.map((m, i) => {
      const label = LABELS[m] ? ` <span style="color:var(--text2);font-size:12px">(${LABELS[m]})</span>` : '';
      return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
        '<span style="font-size:13px;font-weight:600;min-width:80px">' + escapeHtml(String(m)) + 'm' + label + '</span>' +
        '<button class="btn" style="padding:2px 8px;font-size:14px;line-height:1" onclick="SETTINGS.paceDistanzEntfernen(' + i + ')" title="Entfernen">×</button>' +
      '</div>';
    }).join('');
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
      feiertage: { url: 'builtin://feiertage/NRW', label: 'Feiertage NRW', farbe: '#cc0000' },
      ferien:    { url: 'https://www.schulferien.org/deutschland/ical/download/?tbid=46&j={year}&t=1', label: 'Schulferien NRW', farbe: '#003087' },
    };
    if (!m[typ]) return;
    feiertage.push(m[typ]);
    rendereFeiertage();
  }

  function paceDistanzHinzufuegen() {
    const inp = document.getElementById('pace-dist-neu');
    const v = parseInt(inp ? inp.value : '', 10);
    if (!v || v < 100 || v > 200000) { benachrichtigen('Ungültige Distanz (100–200.000 m)', 'err'); return; }
    if (paceDistanzen.includes(v)) { benachrichtigen('Distanz bereits vorhanden.', 'warn'); return; }
    paceDistanzen.push(v);
    paceDistanzen.sort((a, b) => a - b);
    if (inp) inp.value = '';
    renderePaceDistanzen();
  }
  function paceDistanzEntfernen(i) {
    paceDistanzen.splice(i, 1);
    renderePaceDistanzen();
  }

  async function speichern() {
    // Offenen Typ-Edit automatisch mitspeichern
    if (typenBearbeitet !== null) {
      const editIdx = typen.findIndex(t => t.slug === typenBearbeitet);
      if (editIdx >= 0) {
        const ok = await typSpeichern(typenBearbeitet, editIdx, { silent: true });
        if (!ok) return; // Fehler im Typ-Save → nicht weitermachen
      }
    }

    const liste = feiertage
      .map(f => ({ url: (f.url || '').trim(), label: (f.label || '').trim(), farbe: (f.farbe || '').trim() }))
      .filter(f => f.url !== '');

    // Uhrzeiten aus den Inputs einlesen (damit auch direkte Eingabe ohne change-Event erfasst wird)
    document.querySelectorAll('.uhrzeit-input').forEach(el => { uhrzeiten[el.dataset.dow] = el.value; });

    const seitentitelVal    = (document.getElementById('set-seitentitel')?.value || '').trim();
    const versionNurAdminEl = document.getElementById('set-version-nur-admin');
    const versionVal        = versionNurAdminEl?.checked ? '1' : '';

    const payload = {
      werte: {
        training_feiertage_ics_urls:  JSON.stringify(liste),
        training_pace_distanzen:      JSON.stringify(paceDistanzen),
        training_default_uhrzeiten:   JSON.stringify(uhrzeiten),
        training_seitentitel:         seitentitelVal,
        training_version_anzeigen:    versionVal,
      },
    };
    try {
      await apiPut('admin/settings', payload);
      benachrichtigen('Gespeichert.', 'ok');
      CONFIG.clear();
      await CONFIG.load();
      applyVersionVisibility(state.user);
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
          const evLabel = q.ok
            ? (q.events_im_zeitraum ?? 0) + ' / ' + (q.events_gesamt ?? '?') + ' ges.'
            : '–';
          const sample = (q.sample || []).map(s =>
            '<div style="font-size:10px;color:var(--text2)">' + escapeHtml(s.datum) + ' ' + escapeHtml(s.titel) + '</div>'
          ).join('');
          return '<tr style="border-bottom:1px solid var(--border)">' +
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px;word-break:break-all">' + escapeHtml(q.url) + '</td>' +
            '<td style="padding:6px 8px;color:' + farbe + ';font-weight:600">' + icon + ' ' + escapeHtml(q.status) + detail + '</td>' +
            '<td style="padding:6px 8px;text-align:right;white-space:nowrap">' + evLabel + (sample ? '<br>' + sample : '') + '</td>' +
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

  async function reparseSegmente() {
    const out = document.getElementById('migr-result');
    if (out) out.innerHTML = '<div style="padding:10px;color:var(--text2);font-size:13px">⏳ Lade Blöcke…</div>';
    try {
      const data = await apiGet('bloecke', { silent: true });
      const bloecke = (data.bloecke || []).filter(b => (b.seg_count ?? 0) === 0);
      if (!bloecke.length) {
        if (out) out.innerHTML = '<div style="padding:10px;color:var(--text2);font-size:13px">Alle Blöcke haben bereits Segmente – nichts zu tun.</div>';
        return;
      }
      if (out) out.innerHTML = `<div style="padding:10px;color:var(--text2);font-size:13px">⏳ Verarbeite ${bloecke.length} Blöcke ohne Segmente…</div>`;
      let updated = 0, skipped = 0;
      for (const b of bloecke) {
        const segs = PARSER.parse(b.titel);
        if (!segs.length) { skipped++; continue; }
        await apiPut(`bloecke/${b.id}`, { ...b, segmente: segs });
        updated++;
      }
      if (out) out.innerHTML =
        '<div style="padding:10px;font-size:13px;color:var(--green,#1a8a3a);font-weight:600">' +
        `✅ Fertig: ${updated} Blöcke mit Segmenten befüllt, ${skipped} Titel nicht erkannt.</div>`;
      // Blöcke-Seite neu laden falls aktiv
      if (typeof BLOECKE !== 'undefined' && document.getElementById('bloecke-list')) {
        BLOECKE.render(document.getElementById('main-content'));
      }
    } catch (e) {
      if (out) out.innerHTML = '<div style="padding:10px;color:var(--primary);font-size:13px">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  async function migrieren() {
    const out = document.getElementById('migr-result');
    if (out) out.innerHTML = '<div style="padding:10px;color:var(--text2);font-size:13px">⏳ Migriere…</div>';
    try {
      const r = await apiPost('admin/migrate_einheiten_zu_bloecken', {});
      if (out) out.innerHTML =
        '<div style="padding:10px;font-size:13px;color:var(--green,#1a8a3a);font-weight:600">' +
        '✅ Fertig: ' + r.erstellt + ' neue Blöcke erstellt, ' +
        r.uebersprungen + ' bereits vorhanden übersprungen ' +
        '(' + r.unique_titel + ' eindeutige Titel aus ' + r.einheiten_gesamt + ' Einheiten).</div>';
    } catch (e) {
      if (out) out.innerHTML = '<div style="padding:10px;color:var(--primary);font-size:13px">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  // ── Trainingstypen ────────────────────────────────────────

  function rendereTypen() {
    const wrap = document.getElementById('typen-liste');
    if (!wrap) return;

    if (!typen.length) {
      wrap.innerHTML = '<div style="padding:14px;border:1px dashed var(--border);border-radius:6px;color:var(--text2);font-size:13px;text-align:center">Keine Typen vorhanden.</div>';
      return;
    }

    const zeilen = typen.map((t, i) => {
      const bearbeite = typenBearbeitet === t.slug;
      const gesperrt  = t.block_count > 0;
      const inaktivStil = !t.aktiv ? 'opacity:0.5;' : '';

      if (bearbeite) {
        return `
          <tr data-slug="${escapeHtml(t.slug)}" style="background:var(--panel-bg,var(--bg2))">
            <td colspan="8" style="padding:10px 8px">
              <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start">
                <div style="flex:2;min-width:130px">
                  <div style="font-size:11px;color:var(--text2);margin-bottom:3px">Bezeichnung</div>
                  <input type="text" id="typ-bez-${i}" value="${escapeHtml(t.bezeichnung)}"
                    class="settings-input" style="width:100%">
                </div>
                <div style="min-width:80px">
                  <div style="font-size:11px;color:var(--text2);margin-bottom:3px">Fallback km</div>
                  <input type="number" id="typ-fallback-km-${i}" value="${t.fallback_km != null ? t.fallback_km : ''}"
                    min="0" max="9999" step="0.1" placeholder="–" class="settings-input" style="width:80px;text-align:center"
                    title="Standard-Distanz für „In meinen Plan" wenn keine Segmente vorhanden">
                </div>
                <div style="min-width:90px">
                  <div style="font-size:11px;color:var(--text2);margin-bottom:3px">Termindauer (min)</div>
                  <input type="number" id="typ-dauer-${i}" value="${t.default_dauer_min != null ? t.default_dauer_min : ''}"
                    min="1" max="600" step="5" placeholder="–" class="settings-input" style="width:80px;text-align:center"
                    title="Standard-Dauer für ICS-Export (DTEND)">
                </div>
                <div style="min-width:160px">
                  <div style="font-size:11px;color:var(--text2);margin-bottom:3px">Standard-Treffpunkt</div>
                  <select id="typ-treffpunkt-${i}" class="settings-input" style="width:100%">
                    <option value="">— kein Standard —</option>
                    ${TREFFPUNKTE.getListe().map(tp => `<option value="${tp.id}"${String(tp.id) === String(t.default_treffpunkt_id ?? '') ? ' selected' : ''}>${escapeHtml(tp.name)}</option>`).join('')}
                  </select>
                </div>
                <div style="min-width:80px">
                  <div style="font-size:11px;color:var(--text2);margin-bottom:3px">Reihenfolge</div>
                  <input type="number" id="typ-reihenfolge-${i}" value="${t.reihenfolge}"
                    min="0" max="999" class="settings-input" style="width:70px;text-align:center">
                </div>
                <div style="display:flex;align-items:flex-end;padding-bottom:2px">
                  <label style="cursor:pointer;font-size:12px">
                    <input type="checkbox" id="typ-aktiv-${i}" ${t.aktiv ? 'checked' : ''}> aktiv
                  </label>
                </div>
                <div style="min-width:120px">
                  <div style="font-size:11px;color:var(--text2);margin-bottom:3px">Sonderfunktion</div>
                  <div style="display:flex;flex-direction:column;gap:5px">
                    <label style="cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px" title="Einheiten dieses Typs werden in der Heute-Sektion nicht angezeigt und aus km-Berechnungen ausgeschlossen">
                      <input type="checkbox" id="typ-kein-training-${i}" ${t.ist_kein_training ? 'checked' : ''}> Kein Training
                    </label>
                    <label style="cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px" title="Zeigt Komoot-Strecken-Feld statt Segmenten im Editor">
                      <input type="checkbox" id="typ-hat-strecke-${i}" ${t.hat_strecke ? 'checked' : ''}> Hat Strecke (Komoot)
                    </label>
                  </div>
                </div>
              </div>
              <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
                <button class="btn btn-ghost btn-sm" onclick="SETTINGS.typAbbrechen()">Abbrechen</button>
                <button class="btn btn-primary btn-sm" onclick="SETTINGS.typSpeichern('${escapeHtml(t.slug)}', ${i})">Speichern</button>
              </div>
            </td>
          </tr>`;
      }

      return `
        <tr style="${inaktivStil}">
          <td style="padding:6px 8px;font-weight:600">
            ${escapeHtml(t.bezeichnung)}
          </td>
          <td style="padding:6px 8px;text-align:center;color:var(--text2);font-size:12px">
            ${t.block_count} ${t.block_count === 1 ? 'Block' : 'Blöcke'}
          </td>
          <td style="padding:6px 8px;text-align:center;color:var(--text2);font-size:12px">
            ${t.fallback_km != null ? t.fallback_km + 'km' : '–'}
          </td>
          <td style="padding:6px 8px;text-align:center;color:var(--text2);font-size:12px">
            ${t.default_dauer_min != null ? t.default_dauer_min + 'min' : '–'}
          </td>
          <td style="padding:6px 8px;text-align:left;color:var(--text2);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml((TREFFPUNKTE.getListe().find(tp => String(tp.id) === String(t.default_treffpunkt_id ?? '')) || {}).name || '–')}
          </td>
          <td style="padding:6px 8px;text-align:center;color:var(--text2);font-size:12px">#${t.reihenfolge}</td>
          <td style="padding:6px 8px;text-align:center;font-size:12px;color:var(--text2)">${t.aktiv ? '✓' : '—'}</td>
          <td style="padding:6px 8px;text-align:right;white-space:nowrap">
            <button class="btn btn-ghost btn-sm" style="padding:2px 7px" onclick="SETTINGS.typBearbeiten('${escapeHtml(t.slug)}')" title="Bearbeiten">✎</button>
            <button class="btn btn-danger btn-sm" style="padding:2px 7px"
              onclick="SETTINGS.typLoeschen('${escapeHtml(t.slug)}')"
              ${gesperrt ? `disabled title="Wird von ${t.block_count} Block/Blöcken verwendet"` : 'title="Typ löschen"'}>✕</button>
          </td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:6px 8px;color:var(--text2);font-weight:600">Bezeichnung</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);font-weight:600">Blöcke</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);font-weight:600">Fallback km</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);font-weight:600">Termindauer</th>
            <th style="text-align:left;padding:6px 8px;color:var(--text2);font-weight:600">Treffpunkt</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);font-weight:600">Reihenfolge</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);font-weight:600">Aktiv</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${zeilen}</tbody>
      </table>
      </div>`;
  }

  function typBearbeiten(slug) {
    typenBearbeitet = slug;
    rendereTypen();
  }

  function typAbbrechen() {
    typenBearbeitet = null;
    rendereTypen();
  }

  async function typSpeichern(slug, idx, opts) {
    const bez = (document.getElementById(`typ-bez-${idx}`)?.value || '').trim();
    if (!bez) { benachrichtigen('Bezeichnung darf nicht leer sein.', 'err'); return false; }
    const reihenfolge = parseInt(document.getElementById(`typ-reihenfolge-${idx}`)?.value || '0', 10);
    const aktiv       = document.getElementById(`typ-aktiv-${idx}`)?.checked ? true : false;
    const fkRaw         = (document.getElementById(`typ-fallback-km-${idx}`)?.value || '').trim();
    const fallback_km   = fkRaw !== '' ? parseFloat(fkRaw) : null;
    const dauerRaw      = (document.getElementById(`typ-dauer-${idx}`)?.value || '').trim();
    const default_dauer_min = dauerRaw !== '' ? parseInt(dauerRaw, 10) : null;
    const tpRaw         = document.getElementById(`typ-treffpunkt-${idx}`)?.value || '';
    const default_treffpunkt_id = tpRaw !== '' ? parseInt(tpRaw, 10) : null;
    const ist_kein_training = document.getElementById(`typ-kein-training-${idx}`)?.checked ? true : false;
    const hat_strecke       = document.getElementById(`typ-hat-strecke-${idx}`)?.checked ? true : false;
    try {
      await apiPut(`admin/typen/${slug}`, { bezeichnung: bez, reihenfolge, aktiv, fallback_km, default_dauer_min, default_treffpunkt_id, ist_kein_training, hat_strecke });
      if (!opts || !opts.silent) benachrichtigen('Typ gespeichert.', 'ok');
      typenBearbeitet = null;
      const r = await apiGet('admin/typen', { silent: true });
      typen = r.typen || [];
      rendereTypen();
      CONFIG.clear();
      await CONFIG.load();
      return true;
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
      return false;
    }
  }

  async function typHinzufuegen() {
    const slug = prompt('Slug für neuen Typ (a–z, 0–9, _):');
    if (!slug) return;
    const slugClean = slug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const bez = prompt('Bezeichnung:');
    if (!bez || !bez.trim()) return;
    try {
      await apiPost('admin/typen', { slug: slugClean, bezeichnung: bez.trim(), reihenfolge: 99 });
      benachrichtigen('Typ angelegt.', 'ok');
      const r = await apiGet('admin/typen', { silent: true });
      typen = r.typen || [];
      rendereTypen();
      CONFIG.clear();
      await CONFIG.load();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function typLoeschen(slug) {
    const t = typen.find(x => x.slug === slug);
    if (!confirm(`Typ „${t ? t.bezeichnung : slug}" wirklich löschen?`)) return;
    try {
      await apiDel(`admin/typen/${slug}`);
      benachrichtigen('Typ gelöscht.', 'ok');
      const r = await apiGet('admin/typen', { silent: true });
      typen = r.typen || [];
      rendereTypen();
      CONFIG.clear();
      await CONFIG.load();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
    }
  }

  return { render, renderWartung, hinzufuegen, entfernen, beispiel, speichern, diagnose, migrieren,
           paceDistanzHinzufuegen, paceDistanzEntfernen, reparseSegmente,
           typBearbeiten, typAbbrechen, typSpeichern, typHinzufuegen, typLoeschen };
})();
