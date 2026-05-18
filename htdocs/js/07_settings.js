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

  const WOCHENTAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

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
      const [settingsR, typenR] = await Promise.all([
        apiGet('admin/settings', { silent: true }),
        apiGet('admin/typen',    { silent: true }),
      ]);
      felder        = settingsR.felder || [];
      feiertage     = parseFeiertageJson(getWert('training_feiertage_ics_urls'));
      paceDistanzen = parsePaceDistanzenJson(getWert('training_pace_distanzen'));
      uhrzeiten     = parseUhrzeitenJson(getWert('training_default_uhrzeiten'));
      typen         = typenR.typen || [];
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

      // ── Migration: Einheiten → Blöcke ──
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
        '<span style="font-size:13px;font-weight:600;min-width:80px">' + escapeHtml(String(m)) + ' m' + label + '</span>' +
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
      feiertage: { url: 'https://www.schulferien.org/iCal/Ferien/Feiertag/ICalKalender_Schulferien_Feiertage_in_Nordrhein-Westfalen.ics', label: 'Feiertage NRW', farbe: '#cc0000' },
      ferien:    { url: 'https://www.schulferien.org/iCal/Ferien/ICalKalender_Schulferien_in_Nordrhein-Westfalen.ics',                 label: 'Schulferien NRW', farbe: '#003087' },
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
    const liste = feiertage
      .map(f => ({ url: (f.url || '').trim(), label: (f.label || '').trim(), farbe: (f.farbe || '').trim() }))
      .filter(f => f.url !== '');

    // Uhrzeiten aus den Inputs einlesen (damit auch direkte Eingabe ohne change-Event erfasst wird)
    document.querySelectorAll('.uhrzeit-input').forEach(el => { uhrzeiten[el.dataset.dow] = el.value; });

    const payload = {
      werte: {
        training_feiertage_ics_urls:  JSON.stringify(liste),
        training_default_dauer_min:   document.getElementById('set-dauer').value || '90',
        training_pace_distanzen:      JSON.stringify(paceDistanzen),
        training_default_uhrzeiten:   JSON.stringify(uhrzeiten),
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
            <td style="padding:6px 4px">
              <input type="text" id="typ-bez-${i}" value="${escapeHtml(t.bezeichnung)}"
                class="settings-input" style="width:100%;min-width:120px">
            </td>
            <td style="padding:6px 4px;text-align:center">
              <input type="color" id="typ-farbe-${i}" value="${escapeHtml(t.farbe || '#888888')}"
                style="width:36px;height:32px;border:none;background:none;cursor:pointer;padding:0">
            </td>
            <td style="padding:6px 4px;text-align:center">
              <input type="number" id="typ-reihenfolge-${i}" value="${t.reihenfolge}"
                min="0" max="999" class="settings-input" style="width:60px;text-align:center">
            </td>
            <td style="padding:6px 4px;text-align:center">
              <label style="cursor:pointer;font-size:12px">
                <input type="checkbox" id="typ-aktiv-${i}" ${t.aktiv ? 'checked' : ''}> aktiv
              </label>
            </td>
            <td style="padding:6px 4px;text-align:right;white-space:nowrap">
              <button class="btn btn-primary btn-sm" onclick="SETTINGS.typSpeichern('${escapeHtml(t.slug)}', ${i})">✓</button>
              <button class="btn btn-ghost btn-sm" onclick="SETTINGS.typAbbrechen()">✗</button>
            </td>
          </tr>`;
      }

      return `
        <tr style="${inaktivStil}">
          <td style="padding:6px 8px;font-weight:600">
            ${t.farbe ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escapeHtml(t.farbe)};margin-right:6px;vertical-align:middle"></span>` : ''}
            ${escapeHtml(t.bezeichnung)}
            <code style="font-size:11px;color:var(--text2);margin-left:6px">${escapeHtml(t.slug)}</code>
          </td>
          <td style="padding:6px 8px;text-align:center;color:var(--text2);font-size:12px">
            ${t.block_count} ${t.block_count === 1 ? 'Block' : 'Blöcke'}
          </td>
          <td style="padding:6px 8px;text-align:center;color:var(--text2);font-size:12px">#${t.reihenfolge}</td>
          <td style="padding:6px 8px;text-align:center;font-size:12px;color:var(--text2)">${t.aktiv ? '✓' : '—'}</td>
          <td style="padding:6px 8px;text-align:right;white-space:nowrap">
            <button class="btn btn-ghost btn-sm" onclick="SETTINGS.typBearbeiten('${escapeHtml(t.slug)}')">Bearbeiten</button>
            <button class="btn btn-danger btn-sm" onclick="SETTINGS.typLoeschen('${escapeHtml(t.slug)}')" ${gesperrt ? 'disabled title="Typ wird von Blöcken verwendet"' : ''}>Löschen</button>
          </td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:6px 8px;color:var(--text2);font-weight:600">Bezeichnung / Slug</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);font-weight:600">Blöcke</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);font-weight:600">Reihenfolge</th>
            <th style="text-align:center;padding:6px 8px;color:var(--text2);font-weight:600">Aktiv</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${zeilen}</tbody>
      </table>`;
  }

  function typBearbeiten(slug) {
    typenBearbeitet = slug;
    rendereTypen();
  }

  function typAbbrechen() {
    typenBearbeitet = null;
    rendereTypen();
  }

  async function typSpeichern(slug, idx) {
    const bez = (document.getElementById(`typ-bez-${idx}`)?.value || '').trim();
    if (!bez) { benachrichtigen('Bezeichnung darf nicht leer sein.', 'err'); return; }
    const farbe       = document.getElementById(`typ-farbe-${idx}`)?.value || null;
    const reihenfolge = parseInt(document.getElementById(`typ-reihenfolge-${idx}`)?.value || '0', 10);
    const aktiv       = document.getElementById(`typ-aktiv-${idx}`)?.checked ? true : false;
    try {
      await apiPut(`admin/typen/${slug}`, { bezeichnung: bez, farbe, reihenfolge, aktiv });
      benachrichtigen('Typ gespeichert.', 'ok');
      typenBearbeitet = null;
      const r = await apiGet('admin/typen', { silent: true });
      typen = r.typen || [];
      rendereTypen();
      CONFIG.clear();
      await CONFIG.load();
    } catch (e) {
      benachrichtigen('Fehler: ' + (e.message || ''), 'err');
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

  return { render, hinzufuegen, entfernen, beispiel, speichern, diagnose, migrieren,
           paceDistanzHinzufuegen, paceDistanzEntfernen, reparseSegmente,
           typBearbeiten, typAbbrechen, typSpeichern, typHinzufuegen, typLoeschen };
})();
