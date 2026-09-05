// ============================================================
// Trainingsportal – Profil-Modal
// ============================================================
// Öffnet sich per Klick auf den Avatar (oben rechts).
// Zwei Sektionen:
//   1. Pace-Referenzen – Bestzeit/manuell pro Distanz (Admin gibt Distanzen vor)
//   2. Weg zum Training – Typ+Treffpunkt-Kombis mit An-/Abreise-km
// ============================================================

const PROFIL = (() => {

  let _prefsData    = null; // pace/prefs response
  let _wegData      = null; // weg/prefs response
  let _localWeg     = [];   // Arbeitskopie der Weg-Einträge
  let _alleGruppen  = [];   // alle verfügbaren Gruppen
  let _meineGruppen = [];   // eigene Gruppen-IDs (Set)
  let _freigabeData = null; // profil/freigaben response (Trainer-Liste + Stufen)
  let _workoutData  = null;   // { format: 'garmin' | 'apple' | 'keine' }

  // _typOptions nutzt globales getTypen() aus 02_app.js
  function _typOptions() {
    // "Kein Training" macht für Anreise keinen Sinn → ausblenden
    return getTypen()
      .filter(x => !istKeinTraining(x.slug))
      .map(x => ({ value: x.slug, label: x.bezeichnung }));
  }

  async function open() {
    if (!state.user) return;
    const cont = document.getElementById('modal-container');
    cont.innerHTML =
      '<div class="modal-overlay">' +
        '<div class="modal-card">' +
          '<div class="modal-body" style="padding:32px;text-align:center">' +
            '<div style="color:var(--text2);font-size:14px">Lade…</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    try {
      [_prefsData, _wegData, _alleGruppen, _meineGruppen, _freigabeData, _workoutData] = await Promise.all([
        apiGet('pace/prefs',     { silent: true }),
        apiGet('weg/prefs',      { silent: true }),
        GRUPPEN.laden(),
        GRUPPEN.ladeMeine(),
        apiGet('profil/freigaben', { silent: true }).catch(() => ({ trainer: [] })),
        apiGet('profil/workout',   { silent: true }).catch(() => ({ format: 'keine' })),
      ]);
    } catch (e) {
      cont.innerHTML =
        '<div class="modal-overlay">' +
          '<div class="modal-card"><div class="modal-body">Fehler: ' + escapeHtml(e.message || '') + '</div></div>' +
        '</div>';
      return;
    }
    _localWeg = JSON.parse(JSON.stringify((_wegData && _wegData.prefs) || []));
    renderModal(cont);
  }

  function fmtDatum(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}.${m}.${y}`;
  }

  // ── Pace-Referenzen ──────────────────────────────────────

  function _paceForRef(ref, modus, manInput) {
    const distPb  = (_prefsData.distanzen && _prefsData.distanzen.pb)    || {};
    const dist12m = (_prefsData.distanzen && _prefsData.distanzen['12m']) || {};
    const distM   = parseFloat(ref);
    if (!distM) return null;
    let sek = null;
    if (modus === 'pb') {
      sek = distPb[ref]  ? distPb[ref].sekunden
          : dist12m[ref] ? dist12m[ref].sekunden : null;
    } else if (modus === '12m') {
      sek = dist12m[ref] ? dist12m[ref].sekunden : null;
    } else if (modus === 'manual') {
      sek = _parseZeit(manInput || '');
    }
    if (!sek || !distM) return null;
    return sek / (distM / 1000);
  }

  function _updatePaceChip(ref) {
    const chip = document.getElementById('profil-pace-' + ref);
    if (!chip) return;
    const sel = document.querySelector(`.profil-modus-sel[data-ref="${ref}"]`);
    const inp = document.getElementById('profil-manual-input-' + ref);
    const modus    = sel ? sel.value : 'pb';
    const manInput = inp ? inp.value : '';
    const sekProKm = _paceForRef(ref, modus, manInput);
    chip.textContent = sekProKm ? PACE.formatPace(sekProKm) : '–';
  }

  function _buildPaceSection() {
    const prefs     = _prefsData.prefs    || {};
    const distPb    = (_prefsData.distanzen && _prefsData.distanzen.pb)    || {};
    const dist12m   = (_prefsData.distanzen && _prefsData.distanzen['12m']) || {};
    const hatAthlet = !!_prefsData.hat_athlet;
    const refs      = _prefsData.dist_admin || Object.keys(prefs);

    if (!refs.length) {
      return '<div class="profil-hint">Keine Pace-Referenz-Distanzen konfiguriert (Admin-Einstellungen).</div>';
    }

    const refRows = refs.map(ref => {
      const p      = prefs[ref] || { modus: 'pb', manual_sek: null };
      const pb     = distPb[ref];
      const m12    = dist12m[ref];
      const manSek = p.manual_sek || null;

      let selVal;
      if (p.modus === 'manual') {
        selVal = 'manual';
      } else if (p.modus === 'pb'  && pb)  { selVal = 'pb';     }
      else if   (p.modus === '12m' && m12) { selVal = '12m';    }
      else if   (p.modus === 'pb'  && m12) { selVal = '12m';    }
      else if   (p.modus === '12m' && pb)  { selVal = 'pb';     }
      else if   (pb)                        { selVal = 'pb';     }
      else if   (m12)                       { selVal = '12m';    }
      else                                  { selVal = 'manual'; }

      let opts = '';
      if (pb) {
        const pbInfo = `${escapeHtml(pb.resultat)} · ${fmtDatum(pb.datum)}${pb.wettkampf ? ' · ' + escapeHtml(pb.wettkampf) : ''}`;
        opts += `<option value="pb"${selVal === 'pb' ? ' selected' : ''}>Bestzeit gesamt – ${pbInfo}</option>`;
      }
      if (m12) {
        const m12Info = `${escapeHtml(m12.resultat)} · ${fmtDatum(m12.datum)}${m12.wettkampf ? ' · ' + escapeHtml(m12.wettkampf) : ''}`;
        opts += `<option value="12m"${selVal === '12m' ? ' selected' : ''}>Letzte 12 Monate – ${m12Info}</option>`;
      }
      opts += `<option value="manual"${selVal === 'manual' ? ' selected' : ''}>Manuelle Eingabe</option>`;

      const manVisible    = selVal === 'manual';
      const manVal        = manSek ? PACE.formatTime(manSek) : '';
      const initPaceSekKm = _paceForRef(ref, selVal, manVal);
      const initPaceStr   = initPaceSekKm ? PACE.formatPace(initPaceSekKm) : '–';

      const noDataHint = !hatAthlet
        ? '<div class="profil-hint">Kein Athletenprofil verknüpft – nur manuelle Eingabe möglich.</div>'
        : (!pb && !m12
            ? '<div class="profil-hint">Keine Ergebnisse für diese Distanz im Statistikportal.</div>'
            : '');

      const safeRef = escapeHtml(ref);
      return `
        <div class="profil-ref-row">
          <div class="profil-ref-label">${escapeHtml(PACE.fmtDistLabel(ref))}</div>
          <div class="profil-ref-controls">
            <div class="profil-sel-row">
              <select class="settings-input profil-modus-sel" data-ref="${safeRef}"
                      onchange="PROFIL._onModusChange('${safeRef}', this.value)">${opts}</select>
              <span class="profil-pace-chip" id="profil-pace-${safeRef}">${escapeHtml(initPaceStr)}</span>
            </div>
            <div class="profil-manual-wrap" id="profil-manual-${safeRef}"${manVisible ? '' : ' style="display:none"'}>
              <input type="text" id="profil-manual-input-${safeRef}"
                     class="settings-input profil-manual-input"
                     placeholder="MM:SS oder H:MM:SS (leer = keine Referenz)"
                     value="${escapeHtml(manVal)}"
                     oninput="PROFIL._onManualInput('${safeRef}')">
            </div>
            ${noDataHint}
          </div>
        </div>`;
    }).join('');

    return `<div class="profil-refs">${refRows}</div>`;
  }

  // ── Weg zum Training ──────────────────────────────────────

  function _buildWegRow(entry, i) {
    const typen       = _typOptions();
    const treffpunkte = (_wegData && _wegData.treffpunkte) || [];
    const safeI       = parseInt(i, 10);

    const typOpts = typen.map(t =>
      `<option value="${escapeHtml(t.value)}"${t.value === entry.typ ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
    ).join('');

    const tpOpts = `<option value="">— kein Treffpunkt —</option>` +
      treffpunkte.map(tp =>
        `<option value="${tp.id}"${entry.treffpunkt_id === tp.id ? ' selected' : ''}>${escapeHtml(tp.name)}</option>`
      ).join('');

    const kmVal = entry.km != null ? String(entry.km).replace('.', ',') : '';

    return `
      <div class="weg-row" id="weg-row-${safeI}">
        <select class="settings-input weg-typ-sel" data-i="${safeI}">${typOpts}</select>
        <select class="settings-input weg-tp-sel"  data-i="${safeI}">${tpOpts}</select>
        <div class="weg-km-wrap">
          <input type="text" inputmode="decimal" class="settings-input weg-km-inp" data-i="${safeI}"
                 placeholder="z.B. 1,5" value="${escapeHtml(kmVal)}" style="width:80px">
          <span class="weg-km-label">km einfach</span>
        </div>
        <div class="weg-km-wrap">
          <input type="number" min="0" max="300" class="settings-input weg-min-inp" data-i="${safeI}"
                 placeholder="z.B. 20" value="${entry.minuten != null ? entry.minuten : ''}" style="width:70px">
          <span class="weg-km-label">min Weg</span>
        </div>
        <button class="btn-icon weg-del-btn" onclick="PROFIL._wegEntfernen(${safeI})" title="Entfernen">×</button>
      </div>`;
  }

  function _buildWegSection() {
    const rows = _localWeg.map((entry, i) => _buildWegRow(entry, i)).join('');
    return `
      <div id="weg-liste">${rows || '<div class="profil-hint" style="padding:8px 0">Noch keine Einträge. Klick „+ Hinzufügen".</div>'}</div>
      <div class="weg-add-row">
        <button class="btn btn-ghost btn-sm" onclick="PROFIL._wegHinzufuegen()">+ Hinzufügen</button>
      </div>`;
  }

  // ── Trainingsgruppen ──────────────────────────────────────

  function _buildGruppenSection() {
    if (!_alleGruppen.length) return '<div class="profil-hint">Keine Trainingsgruppen vorhanden.</div>';
    const meineSet = new Set((_meineGruppen && _meineGruppen.gruppen_ids) || []);
    const checks = _alleGruppen.map(g => {
      const checked = meineSet.has(g.id) ? ' checked' : '';
      return `<label class="profil-gruppe-item">
        <input type="checkbox" class="profil-gruppe-cb" value="${g.id}"${checked}>
        <span>${escapeHtml(g.name)}</span>
      </label>`;
    }).join('');
    return `<div class="profil-gruppen-list">${checks}</div>`;
  }

  // ── Plan-Freigabe an Trainer/Admins ──────────────────────

  function _rolleLabel(rolle) {
    if (rolle === 'admin')   return 'Admin';
    if (rolle === 'trainer') return 'Trainer';
    return '';
  }

  // Theme-Umschalter (auto/hell/dunkel) – identisch zum Statistikportal.
  // setTheme() aus 09a_utils_shared.js schreibt localStorage, setzt data-theme
  // und faerbt anschliessend alle Buttons in #theme-btns neu ein. Deshalb darf
  // an den Buttons nur `btn btn-sm btn-primary|btn-ghost` stehen.
  function _buildThemeSection() {
    if (typeof getThemePref !== 'function') return '';
    const pref = getThemePref();
    const opt = (key, label) =>
      `<button class="btn btn-sm ${pref === key ? 'btn-primary' : 'btn-ghost'}"
        onclick="setTheme('${key}')">${label}</button>`;
    return `<div id="theme-btns" style="display:flex;gap:8px;flex-wrap:wrap">
      ${opt('auto',  '&#x1F4BB; Automatisch')}
      ${opt('light', '&#x2600;&#xFE0F; Hell')}
      ${opt('dark',  '&#x1F319; Dunkel')}
    </div>`;
  }

  // Uhren-Format für den persönlichen Kalender-Feed
  function _buildWorkoutSection() {
    const aktuell = (_workoutData && _workoutData.format) || 'keine';
    const optionen = [
      { value: 'garmin', titel: '⌚ Garmin (.fit)',          text: 'Workout-Datei für Garmin Connect' },
      { value: 'apple',  titel: '⌚ Apple Watch (.workout)', text: 'Am iPhone öffnen → Fitness-App' },
      { value: 'keine',  titel: 'Keine',                     text: 'Termine ohne Workout-Datei' },
    ];
    return `<div class="profil-workout-wahl">
      ${optionen.map(o => `
        <label class="profil-workout-opt${o.value === aktuell ? ' is-aktiv' : ''}">
          <input type="radio" name="profil-workout" value="${o.value}"${o.value === aktuell ? ' checked' : ''}
            onchange="PROFIL._onWorkoutChange(this.value)">
          <span class="profil-workout-titel">${escapeHtml(o.titel)}</span>
          <span class="profil-workout-text">${escapeHtml(o.text)}</span>
        </label>`).join('')}
    </div>`;
  }

  function _buildFreigabeSection() {
    const trainer = (_freigabeData && _freigabeData.trainer) || [];
    if (!trainer.length) {
      return '<div class="profil-hint">Keine Trainer oder Admins vorhanden, an die du deinen Plan freigeben könntest.</div>';
    }
    const rows = trainer.map(t => {
      const opt = (val, label) =>
        `<option value="${val}"${t.stufe === val ? ' selected' : ''}>${label}</option>`;
      const rolle = _rolleLabel(t.rolle);
      return `
        <div class="profil-freigabe-row">
          <div class="profil-freigabe-name">
            ${escapeHtml(t.name)}
            ${rolle ? `<span class="profil-freigabe-rolle">${rolle}</span>` : ''}
          </div>
          <select class="settings-input profil-freigabe-sel" data-trainer="${t.id}">
            ${opt('nicht',  'Nicht freigegeben')}
            ${opt('lesend', 'Lesend')}
            ${opt('voll',   'Vollzugriff')}
          </select>
        </div>`;
    }).join('');
    return `<div class="profil-freigabe-list">${rows}</div>`;
  }

  // DOM → _localWeg synchronisieren (vor jedem Re-Render aufrufen)
  function _syncWegFromDom() {
    _localWeg.forEach((entry, i) => {
      const typEl = document.querySelector(`.weg-typ-sel[data-i="${i}"]`);
      const tpEl  = document.querySelector(`.weg-tp-sel[data-i="${i}"]`);
      const kmEl  = document.querySelector(`.weg-km-inp[data-i="${i}"]`);
      if (typEl) entry.typ          = typEl.value;
      if (tpEl)  entry.treffpunkt_id = tpEl.value ? parseInt(tpEl.value, 10) : null;
      if (kmEl)  entry.km           = parseFloat((kmEl.value || '').replace(',', '.')) || null;
    });
  }

  function _rendereWegListe() {
    _syncWegFromDom();
    const el = document.getElementById('weg-liste');
    if (!el) return;
    if (!_localWeg.length) {
      el.innerHTML = '<div class="profil-hint" style="padding:8px 0">Noch keine Einträge. Klick „+ Hinzufügen".</div>';
      return;
    }
    el.innerHTML = _localWeg.map((entry, i) => _buildWegRow(entry, i)).join('');
  }

  // ── Modal aufbauen ────────────────────────────────────────

  function renderModal(cont) {
    const u = state.user;
    const displayName  = u.vorname || u.name || u.benutzername || '';
    const displayRolle = (typeof ROLLE_LABEL !== 'undefined' && ROLLE_LABEL[u.rolle])
      || u.rolle || '';

    cont.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Mein Profil</div>
              <div class="modal-title">${escapeHtml(displayName)}</div>
              <div class="modal-sub">${escapeHtml(displayRolle)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">

            <div class="profil-section-title">Erscheinungsbild</div>
            <p class="profil-hint-global">
              „Automatisch“ folgt der Einstellung deines Geräts. Die Wahl gilt für dieses Gerät
              und wirkt sofort – ohne Speichern.
            </p>
            ${_buildThemeSection()}

            <div class="profil-section-title" style="margin-top:28px">Pace-Referenzen</div>
            <p class="profil-hint-global">
              Wähle pro Distanz, welche Zeit als Referenz für die Pace-Berechnung im Trainingsplan verwendet wird.
              Bestzeiten werden automatisch aus dem Statistikportal übernommen.
            </p>
            ${_buildPaceSection()}

            <div class="profil-section-title" style="margin-top:28px">Weg zum Training</div>
            <p class="profil-hint-global">
              Trage ein, wie viele Kilometer du zum Startpunkt läufst (einfache Strecke).
              Hin- und Rückweg werden automatisch zu den Trainingskilometern addiert.
              Die Wegzeit in Minuten erzeugt im Kalender-Abo eine Erinnerung „Aufbruch zum Training“
              – so lange vor dem Start, wie du für den Weg brauchst.
            </p>
            ${_buildWegSection()}

            <div class="profil-section-title" style="margin-top:28px">Workout-Datei im Kalender</div>
            <p class="profil-hint-global">
              Dein persönlicher Kalender-Feed („Mein Plan“ als ICS-Abo) kann zu jedem Training mit
              Segmenten die passende Workout-Datei mitliefern – als Link im Termin und als Anhang.
              Wähle, welches Format du nutzt; angehängt wird immer nur dieses eine.
            </p>
            ${_buildWorkoutSection()}

            ${_alleGruppen.length ? `
            <div class="profil-section-title" style="margin-top:28px">Trainingsgruppen</div>
            <p class="profil-hint-global">
              Wähle die Trainingsgruppen, denen du angehörst. Ein fehlender Eintrag erzeugt
              einen Hinweis auf der Startseite.
            </p>
            ${_buildGruppenSection()}
            ` : ''}

            <div class="profil-section-title" style="margin-top:28px">Trainingsplan freigeben</div>
            <p class="profil-hint-global">
              Lege fest, welche Trainer oder Admins deinen persönlichen Trainingsplan sehen
              (<em>Lesend</em>) oder bearbeiten (<em>Vollzugriff</em>) dürfen. Ohne Freigabe hat niemand Zugriff.
            </p>
            ${_buildFreigabeSection()}

            <div class="modal-actions">
              <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
              <button class="btn btn-primary" onclick="PROFIL.speichern()">Speichern</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Event-Handler ─────────────────────────────────────────

  function _onModusChange(ref, val) {
    const wrap = document.getElementById('profil-manual-' + ref);
    if (wrap) wrap.style.display = val === 'manual' ? '' : 'none';
    _updatePaceChip(ref);
  }

  function _onManualInput(ref) {
    _updatePaceChip(ref);
  }

  function _onWorkoutChange(val) {
    if (!_workoutData) _workoutData = {};
    _workoutData.format = val;
    document.querySelectorAll('.profil-workout-opt').forEach(el => {
      const inp = el.querySelector('input');
      el.classList.toggle('is-aktiv', !!inp && inp.value === val);
    });
  }

  function _wegHinzufuegen() {
    const typen = _typOptions();
    _localWeg.push({ typ: typen[0]?.value || 'intervall', treffpunkt_id: null, km: null });
    _rendereWegListe();
  }

  function _wegEntfernen(i) {
    _localWeg.splice(i, 1);
    _rendereWegListe();
  }

  // ── Speichern ─────────────────────────────────────────────

  function _parseZeit(s) {
    if (!s || !s.trim()) return null;
    const parts = s.trim().split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN) || parts.length < 2) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  async function speichern() {
    // Pace prefs
    const refs = _prefsData.dist_admin || Object.keys(_prefsData.prefs || {});
    const newPrefs = {};
    for (const ref of refs) {
      const sel = document.querySelector(`.profil-modus-sel[data-ref="${ref}"]`);
      if (!sel) continue;
      const modus = sel.value;
      let manualSek = null;
      if (modus === 'manual') {
        const inp = document.getElementById('profil-manual-input-' + ref);
        manualSek = inp ? _parseZeit(inp.value) : null;
      }
      newPrefs[ref] = { modus, manual_sek: manualSek };
    }

    // Weg config: Formulardaten auslesen
    const newWeg = [];
    _localWeg.forEach((_, i) => {
      const typEl = document.querySelector(`.weg-typ-sel[data-i="${i}"]`);
      const tpEl  = document.querySelector(`.weg-tp-sel[data-i="${i}"]`);
      const kmEl  = document.querySelector(`.weg-km-inp[data-i="${i}"]`);
      if (!typEl || !kmEl) return;
      const typ  = typEl.value;
      const tpId = tpEl && tpEl.value ? parseInt(tpEl.value, 10) : null;
      const km   = parseFloat((kmEl.value || '').replace(',', '.'));
      if (!typ || !km || km <= 0) return;
      const minEl = document.querySelector(`.weg-min-inp[data-i="${i}"]`);
      const min   = minEl ? parseInt(minEl.value, 10) : NaN;
      newWeg.push({ typ, treffpunkt_id: tpId, km, minuten: (!isNaN(min) && min > 0) ? min : null });
    });

    // Doppelte Typ+Treffpunkt-Kombinationen prüfen
    const wegKeys = newWeg.map(e => `${e.typ}|${e.treffpunkt_id ?? ''}`);
    const doppelt = wegKeys.find((k, i) => wegKeys.indexOf(k) !== i);
    if (doppelt) {
      _notify('Doppelte Kombination aus Trainingstyp und Treffpunkt – bitte korrigieren.', 'err');
      return;
    }

    // Gruppen-Auswahl einlesen
    const gruppenIds = [...document.querySelectorAll('.profil-gruppe-cb:checked')]
      .map(cb => parseInt(cb.value, 10))
      .filter(id => id > 0);

    // Plan-Freigaben einlesen (nur lesend/voll werden gespeichert, 'nicht' = keine Zeile)
    const freigaben = {};
    document.querySelectorAll('.profil-freigabe-sel').forEach(sel => {
      const tid = parseInt(sel.dataset.trainer, 10);
      if (tid > 0 && (sel.value === 'lesend' || sel.value === 'voll')) {
        freigaben[tid] = sel.value;
      }
    });

    try {
      await Promise.all([
        apiPut('pace/prefs',     { prefs: newPrefs }),
        apiPut('weg/prefs',      { config: newWeg }),
        apiPut('profil/gruppen', { gruppen_ids: gruppenIds }),
        apiPut('profil/freigaben', { freigaben }),
        apiPut('profil/workout', { format: (document.querySelector('input[name="profil-workout"]:checked') || {}).value || 'keine' }),
      ]);
      PACE.invalidate();
      WEG.invalidate();
      GRUPPEN.invalidate();
      schliesseModal();
      _notify('Profil gespeichert.', 'ok');
    } catch (e) {
      _notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function _notify(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) return;
    const cls = art === 'err' ? 'notif-err' : (art === 'warn' ? 'notif-warn' : 'notif-ok');
    const div = document.createElement('div');
    div.className = 'notif ' + cls;
    div.textContent = text;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  }

  return { open, speichern, _onModusChange, _onManualInput, _onWorkoutChange, _wegHinzufuegen, _wegEntfernen };
})();
