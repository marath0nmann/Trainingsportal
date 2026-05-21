// ============================================================
// Trainingsportal – Mein Plan (private Einheiten)
// ============================================================
// Modals und CRUD für private Kalendereinheiten.
// Das Rendering übernimmt renderKalender() in 02_app.js.
// ============================================================

const MEINPLAN = (() => {

  // Abo-Status: wird von renderKalender() gesetzt (aus GET-Antwort)
  let _aboAktiv = false;

  function setAbo(val) { _aboAktiv = !!val; }
  function istAboAktiv() { return _aboAktiv; }

  // ── km-Berechnung ────────────────────────────────────────
  // Wenn Segmente vorhanden: Summe aller Wiederholungen × Distanz.
  // Sonst: Fallback-km aus der Typen-Konfiguration.
  function _berechneKm(e, segs) {
    if (Array.isArray(segs) && segs.length) {
      const total = segs.reduce((s, seg) =>
        s + (seg.wiederholungen || 1) * ((seg.distanz_m || 0) / 1000), 0);
      return total > 0 ? Math.round(total * 100) / 100 : null;
    }
    const typen = (window.appConfig && Array.isArray(window.appConfig.typen))
      ? window.appConfig.typen : [];
    const t = typen.find(x => x.slug === e.typ);
    return (t && t.fallback_km != null) ? t.fallback_km : null;
  }

  // ── Neue private Einheit (per Modal) ─────────────────────
  function neuePrivatEinheit(datum) {
    _openModal(null, datum);
  }

  async function bearbeitePrivat(id) {
    try {
      const data = await apiGet(`mein-plan/einheiten/${id}`, { silent: true });
      _openModal(data.einheit, null);
    } catch (e) {
      _notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  async function loeschePrivat(id) {
    if (!confirm('Private Einheit löschen?')) return;
    schliesseModal();
    const el = document.querySelector(`.kal-item[data-privat-id="${id}"]`);
    if (el) el.remove();
    try {
      await apiDel(`mein-plan/einheiten/${id}`);
      _notify('Gelöscht.', 'ok');
    } catch (e) {
      _notify('Fehler: ' + (e.message || ''), 'err');
    }
    renderPage();
  }

  // ── Direkt übernehmen (ohne Modal) ──────────────────────
  async function uebernehmenVonOeffentlich(einheitId, einheitData, segmente) {
    KAL_POPOVER.hide();
    const km = _berechneKm(einheitData, segmente);
    try {
      await apiPost('mein-plan/einheiten', {
        datum:          einheitData.datum,
        typ:            einheitData.typ,
        titel:          einheitData.titel,
        distanz_km:     km,
        ref_einheit_id: einheitData.id,
      });
      _notify('In deinen Plan übernommen.', 'ok');
      renderPage();
    } catch (err) {
      _notify('Fehler: ' + (err.message || ''), 'err');
    }
  }

  // ── Abo aktivieren ───────────────────────────────────────
  async function aboAktivieren() {
    KAL_POPOVER.hide();
    try {
      await apiPost('mein-plan/abo', {});
      _aboAktiv = true;
      _notify('Alle künftigen Einheiten wurden übernommen.', 'ok');
      renderPage();
    } catch (err) {
      _notify('Fehler: ' + (err.message || ''), 'err');
    }
  }

  // ── Abo deaktivieren ─────────────────────────────────────
  async function aboDeaktivieren() {
    if (!confirm('Abo beenden? Bereits übernommene Einheiten bleiben erhalten.')) return;
    KAL_POPOVER.hide();
    try {
      await apiDel('mein-plan/abo');
      _aboAktiv = false;
      _notify('Abo beendet.', 'ok');
      renderPage();
    } catch (err) {
      _notify('Fehler: ' + (err.message || ''), 'err');
    }
  }

  function _openModal(einheit, datum, prefill) {
    const typenCfg = (appConfig && Array.isArray(appConfig.typen) && appConfig.typen.length)
      ? appConfig.typen
      : [
          { slug: 'dauerlauf',     bezeichnung: 'Dauerlauf' },
          { slug: 'intervall',     bezeichnung: 'Intervall' },
          { slug: 'funktionell',   bezeichnung: 'Funktionelles Training' },
          { slug: 'runde',         bezeichnung: 'Runde / Strecke' },
          { slug: 'event',         bezeichnung: 'Event / Wettkampf' },
          { slug: 'frei',          bezeichnung: 'Sonstiges' },
          { slug: 'kein_training', bezeichnung: 'Kein Training' },
        ];

    const isNew   = !einheit;
    const e       = einheit || {};
    const d_datum = datum || e.datum || ymd(new Date());
    const d_typ   = prefill?.typ   || e.typ   || 'dauerlauf';
    const d_titel = prefill?.titel || e.titel || '';
    const d_km    = e.distanz_km != null ? e.distanz_km : '';
    const d_bem   = e.bemerkung   || '';
    const d_ref   = prefill?.ref_einheit_id || e.ref_einheit_id || '';

    const typOptionen = typenCfg.map(t =>
      `<option value="${escapeHtml(t.slug)}"${t.slug === d_typ ? ' selected' : ''}>${escapeHtml(t.bezeichnung)}</option>`
    ).join('');

    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Mein Trainingsplan</div>
              <div class="modal-title">${isNew ? 'Neue Einheit' : escapeHtml(e.titel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            ${d_ref ? `<div class="meinplan-ref-hint">Aus dem Teamplan übernommen</div>` : ''}
            <div class="ed-grid">
              <div class="ed-fg">
                <label>Datum *</label>
                <input type="date" id="mp-datum" value="${escapeHtml(d_datum)}">
              </div>
              <div class="ed-fg">
                <label>Typ</label>
                <select id="mp-typ">${typOptionen}</select>
              </div>
              <div class="ed-fg ed-fg-wide">
                <label>Bezeichnung *</label>
                <input type="text" id="mp-titel" value="${escapeHtml(d_titel)}" placeholder="z.B. Dauerlauf 10 km">
              </div>
              <div class="ed-fg">
                <label>Distanz (km)</label>
                <input type="number" id="mp-km" value="${escapeHtml(String(d_km))}" min="0" max="999.9" step="0.1" placeholder="z.B. 10.5">
              </div>
              <div class="ed-fg ed-fg-wide">
                <label>Bemerkung</label>
                <textarea id="mp-bemerkung" rows="2">${escapeHtml(d_bem)}</textarea>
              </div>
            </div>
            <input type="hidden" id="mp-ref" value="${escapeHtml(String(d_ref))}">
            <div class="ed-footer">
              <span>${!isNew ? `<button class="btn btn-ghost" onclick="MEINPLAN.loeschePrivat(${e.id})">Löschen</button>` : ''}</span>
              <div class="ed-footer-right">
                <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
                <button class="btn btn-primary" onclick="MEINPLAN.speichern(${isNew ? 'null' : e.id})">${isNew ? 'Hinzufügen' : 'Speichern'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function speichern(id) {
    const datum = document.getElementById('mp-datum')?.value || '';
    const titel = (document.getElementById('mp-titel')?.value || '').trim();
    if (!datum) { _notify('Bitte Datum angeben.', 'err'); return; }
    if (!titel) { _notify('Bitte Bezeichnung angeben.', 'err'); return; }

    const kmStr  = (document.getElementById('mp-km')?.value  || '').trim();
    const refStr = (document.getElementById('mp-ref')?.value || '').trim();
    const body = {
      datum,
      typ:            document.getElementById('mp-typ')?.value || 'dauerlauf',
      titel,
      distanz_km:     kmStr !== '' ? parseFloat(kmStr) : null,
      bemerkung:      (document.getElementById('mp-bemerkung')?.value || '').trim() || null,
      ref_einheit_id: refStr ? parseInt(refStr, 10) : null,
    };
    try {
      if (id) {
        await apiPut(`mein-plan/einheiten/${id}`, body);
        _notify('Gespeichert.', 'ok');
      } else {
        await apiPost('mein-plan/einheiten', body);
        _notify('Einheit hinzugefügt.', 'ok');
      }
      schliesseModal();
      renderPage();
    } catch (e) {
      _notify('Fehler: ' + (e.message || ''), 'err');
    }
  }

  function _notify(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) return;
    const cls = art === 'err' ? 'notif-err' : (art === 'warn' ? 'notif-warn' : 'notif-ok');
    const div = document.createElement('div');
    div.className = `notif ${cls}`;
    div.textContent = text;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  return {
    setAbo, istAboAktiv,
    neuePrivatEinheit, bearbeitePrivat, loeschePrivat,
    uebernehmenVonOeffentlich, speichern,
    aboAktivieren, aboDeaktivieren,
  };
})();
