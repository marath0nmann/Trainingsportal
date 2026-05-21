// ============================================================
// Trainingsportal – Profil-Modal
// ============================================================
// Öffnet sich per Klick auf den Avatar (oben rechts).
// Zwei Sektionen:
//   1. Pace-Referenzen – Bestzeit/manuell pro Distanz (Admin gibt Distanzen vor)
//   2. Weg zum Training – Typ+Treffpunkt-Kombis mit An-/Abreise-km
// ============================================================

const PROFIL = (() => {

  let _prefsData = null; // pace/prefs response
  let _wegData   = null; // weg/prefs response
  let _localWeg  = [];   // Arbeitskopie der Weg-Einträge

  // Fallback-Typen (analog 04_editor.js)
  const FALLBACK_TYPEN = [
    { value: 'intervall',     label: 'Intervall' },
    { value: 'dauerlauf',     label: 'Dauerlauf' },
    { value: 'funktionell',   label: 'Funktionelles Training' },
    { value: 'runde',         label: 'Runde / Strecke' },
    { value: 'event',         label: 'Event / Wettkampf' },
    { value: 'frei',          label: 'Sonstiges' },
    { value: 'kein_training', label: 'Kein Training' },
  ];
  function _typOptions() {
    const t = typeof appConfig !== 'undefined' && appConfig && appConfig.typen;
    const src = (Array.isArray(t) && t.length)
      ? t.map(x => ({ value: x.slug, label: x.bezeichnung }))
      : FALLBACK_TYPEN;
    // "Kein Training" macht für Anreise keinen Sinn → ausblenden
    return src.filter(x => x.value !== 'kein_training');
  }

  async function open() {
    if (!state.user) return;
    const cont = document.getElementById('modal-container');
    cont.innerHTML =
      '<div class="modal-overlay" onclick="schliesseModal(event)">' +
        '<div class="modal-card">' +
          '<div class="modal-body" style="padding:32px;text-align:center">' +
            '<div style="color:var(--text2);font-size:14px">Lade…</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    try {
      [_prefsData, _wegData] = await Promise.all([
        apiGet('pace/prefs', { silent: true }),
        apiGet('weg/prefs',  { silent: true }),
      ]);
    } catch (e) {
      cont.innerHTML =
        '<div class="modal-overlay" onclick="schliesseModal(event)">' +
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
          <input type="number" class="settings-input weg-km-inp" data-i="${safeI}"
                 placeholder="km" min="0.1" max="500" step="0.1"
                 value="${escapeHtml(kmVal)}" style="width:80px">
          <span class="weg-km-label">km einfach</span>
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

  function _rendereWegListe() {
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
      <div class="modal-overlay" onclick="schliesseModal(event)">
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

            <div class="profil-section-title">Pace-Referenzen</div>
            <p class="profil-hint-global">
              Wähle pro Distanz, welche Zeit als Referenz für die Pace-Berechnung im Trainingsplan verwendet wird.
              Bestzeiten werden automatisch aus dem Statistikportal übernommen.
            </p>
            ${_buildPaceSection()}

            <div class="profil-section-title" style="margin-top:28px">Weg zum Training</div>
            <p class="profil-hint-global">
              Trage ein, wie viele Kilometer du zum Startpunkt läufst (einfache Strecke).
              Hin- und Rückweg werden automatisch zu den Trainingskilometern addiert.
            </p>
            ${_buildWegSection()}

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
      newWeg.push({ typ, treffpunkt_id: tpId, km });
    });

    try {
      await Promise.all([
        apiPut('pace/prefs', { prefs: newPrefs }),
        apiPut('weg/prefs',  { config: newWeg }),
      ]);
      PACE.invalidate();
      WEG.invalidate();
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

  return { open, speichern, _onModusChange, _onManualInput, _wegHinzufuegen, _wegEntfernen };
})();
