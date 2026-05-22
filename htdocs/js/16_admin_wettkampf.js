// ============================================================
// Trainingsportal – Wettkämpfe
// Zeigt alle regelmäßigen Veranstaltungsserien aus dem Statistikportal,
// extrahiert Disziplinen aus den Ergebnissen, ermöglicht Anmeldung
// und Datumsprognose für die nächste Ausgabe.
// ============================================================

const ADMIN_WETTKAMPF = (() => {
  let serien     = [];
  let container  = null;
  let expandedId = null;

  const WT_KURZ = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const WT_LANG = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

  // ── Öffentlicher Einstiegspunkt ──────────────────────────────
  async function render(el) {
    container = el;
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Wettkämpfe&hellip;</div>';
    try {
      const resp = await apiGet('wettkampf', { silent: true });
      serien = resp.serien || [];
      renderTabelle();
    } catch (e) {
      if (container) {
        container.innerHTML =
          '<div style="padding:20px;color:var(--primary)">Fehler beim Laden: ' +
          escapeHtml(e.message || String(e)) + '</div>';
      }
    }
  }

  // ── Hilfsfunktionen ──────────────────────────────────────────
  function istAdmin() {
    return window.state && window.state.user &&
           ['admin', 'trainer'].includes(window.state.user.rolle);
  }

  /**
   * Prognose: Nth Wochentag des gleichen Monats im laufenden/nächsten Jahr.
   * Beispiel: letzter Wettkampf war am 2. Sonntag im Mai → nächster Termin
   * ist der 2. Sonntag im Mai des aktuellen/nächsten Jahres.
   */
  function prognoseNaechstesDatum(letztesDateStr) {
    if (!letztesDateStr) return null;
    const last   = new Date(letztesDateStr + 'T00:00:00');
    const month  = last.getMonth();          // 0-11
    const dow    = last.getDay();            // 0=So … 6=Sa
    const dom    = last.getDate();           // 1-31
    const nth    = Math.floor((dom - 1) / 7); // 0=1., 1=2., 2=3. …
    const heute  = new Date(); heute.setHours(0, 0, 0, 0);

    for (let off = 0; off <= 2; off++) {
      const yr       = heute.getFullYear() + off;
      const erstDow  = new Date(yr, month, 1).getDay();
      let   diff     = (dow - erstDow + 7) % 7;
      let   tag      = 1 + diff + nth * 7;
      const tage     = new Date(yr, month + 1, 0).getDate();
      if (tag > tage) tag -= 7; // overflow → letztes Vorkommen des Wochentages
      const kandidat = new Date(yr, month, tag);
      if (kandidat >= heute) {
        return kandidat.toISOString().split('T')[0];
      }
    }
    return null;
  }

  function naechstesDatumFuerSerie(serie) {
    if (serie.naechstes_datum) return { datum: serie.naechstes_datum, modus: 'manuell' };
    const p = prognoseNaechstesDatum(serie.letztes_datum);
    return p ? { datum: p, modus: 'prognose' } : null;
  }

  function fmtDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function allesDisziplinen(serie) {
    const set = new Set(serie.disziplinen || []);
    (serie.disziplinen_extra || []).forEach(d => set.add(d));
    return [...set];
  }

  function benachrichtigen(text, art) {
    const cont = document.getElementById('notification-container');
    if (!cont) return;
    const d = document.createElement('div');
    d.className = 'notif ' + (art === 'err' ? 'notif-err' : art === 'warn' ? 'notif-warn' : 'notif-ok');
    d.textContent = text;
    cont.appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  // ── Tabelle ───────────────────────────────────────────────────
  function renderTabelle() {
    if (!container) return;
    const admin = istAdmin();

    let html = '';
    html += `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;gap:12px;flex-wrap:wrap">
        <div>
          <h2 style="margin:0 0 2px;font-size:1.2rem;font-weight:700">Wettkämpfe</h2>
          <div style="font-size:12px;color:var(--text2)">
            Regelmäßige Veranstaltungen aus dem Statistikportal &bull; ${serien.length} Serien
          </div>
        </div>
      </div>`;

    if (!serien.length) {
      html += '<div style="padding:40px;text-align:center;color:var(--text2)">Keine Veranstaltungsserien vorhanden.</div>';
      container.innerHTML = html;
      return;
    }

    html += `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;min-width:640px">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text2)">Veranstaltung</th>
          <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text2);white-space:nowrap">Letzter Wettkampf</th>
          <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text2);white-space:nowrap">Nächster Termin</th>
          <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text2)">Disziplinen</th>
          <th style="text-align:center;padding:8px 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text2)">Anm.</th>
          <th style="width:32px"></th>
        </tr>
      </thead>
      <tbody>`;

    serien.forEach(s => {
      const next        = naechstesDatumFuerSerie(s);
      const disziplinen = allesDisziplinen(s);
      const anmCnt      = (s.anmeldungen || []).length;
      const expanded    = expandedId === s.id;

      // Disziplin-Chips (max 4 + Rest-Zähler)
      const MAX = 4;
      let chips = '';
      disziplinen.slice(0, MAX).forEach(d => {
        const extra = (s.disziplinen_extra || []).includes(d);
        chips += `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;
          background:var(--border);color:var(--text);margin:1px 2px;
          ${extra ? 'border:1px dashed var(--text2)' : ''}">${escapeHtml(d)}</span>`;
      });
      if (disziplinen.length > MAX) {
        chips += `<span style="font-size:11px;color:var(--text2)">+${disziplinen.length - MAX}</span>`;
      }

      // Wochentag des letzten Wettkampfs für Tooltip
      let letzterWt = '';
      if (s.letztes_datum) {
        const ld = new Date(s.letztes_datum + 'T00:00:00');
        letzterWt = WT_KURZ[ld.getDay()];
      }

      // Nächster-Termin-Zelle
      let nextCell = '<span style="color:var(--text2);font-size:13px">–</span>';
      if (next) {
        const nd    = new Date(next.datum + 'T00:00:00');
        const wt    = WT_KURZ[nd.getDay()];
        const badge = next.modus === 'manuell'
          ? '<span style="font-size:10px;padding:1px 5px;border-radius:8px;background:var(--green,#2ecc71)22;color:var(--green,#27ae60);margin-left:4px;vertical-align:middle">fest</span>'
          : '<span style="font-size:10px;padding:1px 5px;border-radius:8px;background:var(--border);color:var(--text2);margin-left:4px;vertical-align:middle">Prognose</span>';
        nextCell = `<span style="font-weight:600;font-size:13px">${wt}, ${fmtDate(next.datum)}</span>${badge}`;
      }

      // Anmeldungs-Badge
      let anmBadge = '';
      if (s.meine_disziplin) {
        anmBadge = `<div style="font-size:11px;margin-top:2px;color:var(--green,#27ae60)">✓ ${escapeHtml(s.meine_disziplin)}</div>`;
      }

      html += `
        <tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s${expanded ? ';background:var(--bg2,#f5f5f5)' : ''}"
            onmouseenter="this.style.background='var(--bg2,#f5f5f5)'"
            onmouseleave="this.style.background='${expanded ? 'var(--bg2,#f5f5f5)' : ''}'"
            onclick="ADMIN_WETTKAMPF.toggleExpand(${s.id})">
          <td style="padding:10px 10px">
            <strong>${escapeHtml(s.name || s.kuerzel)}</strong>
            ${s.ort_letzter ? `<span style="font-size:12px;color:var(--text2);margin-left:6px">${escapeHtml(s.ort_letzter)}</span>` : ''}
            <div style="font-size:11px;color:var(--text2);margin-top:1px">
              ${s.anz_veranstaltungen} Ausgabe${s.anz_veranstaltungen !== 1 ? 'n' : ''}
              ${s.erstes_datum ? ' &bull; seit ' + s.erstes_datum.slice(0, 4) : ''}
            </div>
          </td>
          <td style="padding:10px 10px;font-size:13px;white-space:nowrap">
            ${s.letztes_datum
              ? `<span title="Wochentag: ${letzterWt}">${fmtDate(s.letztes_datum)}</span>`
              : '<span style="color:var(--text2)">–</span>'}
          </td>
          <td style="padding:10px 10px">${nextCell}</td>
          <td style="padding:10px 10px">${chips || '<span style="color:var(--text2);font-size:13px">–</span>'}</td>
          <td style="padding:10px 10px;text-align:center">
            ${anmCnt ? `<strong style="font-size:14px">${anmCnt}</strong>` : '<span style="color:var(--text2)">–</span>'}
            ${anmBadge}
          </td>
          <td style="padding:10px 6px;text-align:center;color:var(--text2);font-size:16px">
            <span style="display:inline-block;transition:transform .18s;transform:${expanded ? 'rotate(90deg)' : 'rotate(0deg)'}">›</span>
          </td>
        </tr>`;

      if (expanded) {
        html += renderDetailZeile(s, disziplinen, admin);
      }
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  // ── Detail-Panel (ausgeklappt) ────────────────────────────────
  function renderDetailZeile(serie, disziplinen, admin) {
    const next       = naechstesDatumFuerSerie(serie);
    const anmeldungen = serie.anmeldungen || [];
    const meineDisziplin = serie.meine_disziplin;
    const meineAnmId     = serie.meine_anmeldung_id;

    let html = `
      <tr>
        <td colspan="6" style="padding:0;border-bottom:2px solid var(--primary)">
          <div style="background:var(--bg2,#f8f8f8);padding:20px 16px">
            <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">`;

    // ── Meine Anmeldung ─────────────────────────────
    html += `<div style="flex:1;min-width:260px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:10px">Meine Anmeldung</div>`;

    if (!disziplinen.length) {
      html += '<div style="font-size:13px;color:var(--text2)">Keine Disziplinen hinterlegt.</div>';
    } else if (meineDisziplin) {
      html += `
        <div style="font-size:13px;margin-bottom:10px">
          Angemeldet für: <strong style="margin-left:4px">${escapeHtml(meineDisziplin)}</strong>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="ADMIN_WETTKAMPF.showAnmeldeModal(${serie.id})">Disziplin&nbsp;ändern</button>
          <button class="btn btn-sm btn-ghost" onclick="ADMIN_WETTKAMPF.abmelden(${serie.id},${meineAnmId})">Abmelden</button>
        </div>`;
    } else {
      html += `
        <div style="font-size:13px;color:var(--text2);margin-bottom:10px">Noch nicht angemeldet.</div>
        <button class="btn btn-sm" style="background:var(--primary);color:#fff"
          onclick="ADMIN_WETTKAMPF.showAnmeldeModal(${serie.id})">Anmelden</button>`;
    }
    html += '</div>';

    // ── Alle Anmeldungen ────────────────────────────
    html += `<div style="flex:1;min-width:200px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:10px">
        Teilnehmer (${anmeldungen.length})
      </div>`;

    if (!anmeldungen.length) {
      html += '<div style="font-size:13px;color:var(--text2)">Noch keine Anmeldungen.</div>';
    } else {
      html += '<table style="width:100%;font-size:13px;border-collapse:collapse"><tbody>';
      anmeldungen.forEach(a => {
        const istIch = window.state && window.state.user && (a.benutzer_id === window.state.user.id);
        html += `<tr>
          <td style="padding:3px 0;${istIch ? 'font-weight:600' : ''}">${escapeHtml(a.name)}</td>
          <td style="padding:3px 8px;color:var(--text2)">${escapeHtml(a.disziplin)}</td>
          ${a.bemerkung ? `<td style="padding:3px 0;font-size:11px;color:var(--text2);font-style:italic">${escapeHtml(a.bemerkung)}</td>` : '<td></td>'}
          ${admin ? `<td style="padding:3px 0;text-align:right">
            <button style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:13px;padding:0 2px"
              onclick="ADMIN_WETTKAMPF.adminAbmelden(${serie.id},${a.id})" title="Entfernen">&times;</button>
          </td>` : ''}
        </tr>`;
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    // ── Admin-Planung ───────────────────────────────
    if (admin) {
      html += `<div style="flex:0 0 auto;min-width:190px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:10px">Planung</div>
        <div style="font-size:12px;margin-bottom:8px;line-height:1.5">
          <div style="color:var(--text2)">Nächster Termin:</div>
          <div style="font-weight:600">${next ? fmtDate(next.datum) : '–'}
            ${next && next.modus === 'prognose' ? '<span style="font-size:11px;color:var(--text2);font-weight:400"> (Prognose)</span>' : ''}
          </div>
          ${serie.letztes_datum ? (() => {
            const ld = new Date(serie.letztes_datum + 'T00:00:00');
            const nth = Math.floor((ld.getDate() - 1) / 7) + 1;
            const ord = nth === 1 ? '1.' : nth === 2 ? '2.' : nth === 3 ? '3.' : nth === 4 ? '4.' : '5.';
            return `<div style="font-size:11px;color:var(--text2);margin-top:2px">${ord} ${WT_LANG[ld.getDay()]} im Monat</div>`;
          })() : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn btn-sm btn-ghost" onclick="ADMIN_WETTKAMPF.showPlanungModal(${serie.id})">Planung&nbsp;bearbeiten</button>
          ${next ? `<button class="btn btn-sm btn-ghost" onclick="ADMIN_WETTKAMPF.imKalenderEintragen(${serie.id})">Im&nbsp;Kalender&nbsp;eintragen</button>` : ''}
        </div>
      </div>`;
    }

    html += '</div></div></td></tr>';
    return html;
  }

  // ── Auf-/Zuklappen ────────────────────────────────────────────
  function toggleExpand(id) {
    expandedId = (expandedId === id) ? null : id;
    renderTabelle();
  }

  // ── Modal: Anmeldung ─────────────────────────────────────────
  function showAnmeldeModal(serieId) {
    const serie      = serien.find(s => s.id === serieId);
    if (!serie) return;
    const disziplinen  = allesDisziplinen(serie);
    const meineDisziplin = serie.meine_disziplin || '';

    const cont = document.getElementById('modal-container');
    if (!cont) return;

    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width:460px">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Wettkampf-Anmeldung</div>
              <div class="modal-title">${escapeHtml(serie.name || serie.kuerzel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">&times;</button>
          </div>
          <div class="modal-body">
            <div class="modal-row">
              <div class="modal-label">Disziplin</div>
              <div style="flex:1">
                ${disziplinen.length === 0
                  ? '<div style="font-size:13px;color:var(--text2)">Keine Disziplinen vorhanden.</div>'
                  : disziplinen.map(d =>
                      `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:14px">
                        <input type="radio" name="anm-disz" value="${escapeHtml(d)}" ${d === meineDisziplin ? 'checked' : ''}
                          style="accent-color:var(--primary);width:16px;height:16px;flex-shrink:0">
                        ${escapeHtml(d)}
                       </label>`
                    ).join('')}
              </div>
            </div>
            <div class="modal-row">
              <div class="modal-label">Anmerkung</div>
              <textarea id="anm-bemerkung" rows="2"
                style="flex:1;resize:vertical;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit"
                placeholder="optional: Wettkampfziel, Reiseplanung …"></textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="ADMIN_WETTKAMPF.anmelden(${serieId})">
              ${meineDisziplin ? 'Aktualisieren' : 'Anmelden'}
            </button>
          </div>
        </div>
      </div>`;
  }

  async function anmelden(serieId) {
    const selected = document.querySelector('input[name="anm-disz"]:checked');
    const disziplin = selected ? selected.value : '';
    const bemerkung = (document.getElementById('anm-bemerkung')?.value || '').trim() || null;
    if (!disziplin) { benachrichtigen('Bitte Disziplin auswählen.', 'warn'); return; }

    try {
      await apiPost(`wettkampf/${serieId}/anmeldungen`, { disziplin, bemerkung });
      schliesseModal();
      benachrichtigen('Anmeldung gespeichert.', 'ok');
      await reload();
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  async function abmelden(serieId, anmId) {
    if (!confirm('Anmeldung wirklich stornieren?')) return;
    try {
      await apiDel(`wettkampf/anmeldungen/${anmId}`);
      benachrichtigen('Abgemeldet.', 'ok');
      await reload();
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  async function adminAbmelden(serieId, anmId) {
    if (!confirm('Anmeldung dieser Person entfernen?')) return;
    try {
      await apiDel(`wettkampf/anmeldungen/${anmId}`);
      benachrichtigen('Anmeldung entfernt.', 'ok');
      await reload();
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  // ── Modal: Planung bearbeiten (Admin) ────────────────────────
  function showPlanungModal(serieId) {
    const serie = serien.find(s => s.id === serieId);
    if (!serie) return;
    const prognose     = prognoseNaechstesDatum(serie.letztes_datum);
    const manuellDatum = serie.naechstes_datum || '';

    // Wochentag-Info für den letzten Wettkampf
    let wtInfo = '';
    if (serie.letztes_datum) {
      const ld  = new Date(serie.letztes_datum + 'T00:00:00');
      const nth = Math.floor((ld.getDate() - 1) / 7) + 1;
      const ord = nth === 1 ? '1.' : nth === 2 ? '2.' : nth === 3 ? '3.' : nth === 4 ? '4.' : '5.';
      wtInfo = `${ord} ${WT_LANG[ld.getDay()]} im ${['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][ld.getMonth()]}`;
    }

    const cont = document.getElementById('modal-container');
    if (!cont) return;

    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width:500px">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Planung bearbeiten</div>
              <div class="modal-title">${escapeHtml(serie.name || serie.kuerzel)}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">&times;</button>
          </div>
          <div class="modal-body">
            <div class="modal-row">
              <div class="modal-label">Nächster Termin</div>
              <div style="flex:1">
                <input type="date" id="planung-datum"
                  style="width:100%;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:13px"
                  value="${escapeHtml(manuellDatum)}">
                <div style="font-size:11px;color:var(--text2);margin-top:4px">
                  ${prognose
                    ? `Prognose (${WT_KURZ[new Date(prognose+'T00:00:00').getDay()]}): <strong>${fmtDate(prognose)}</strong>
                       ${wtInfo ? ' &bull; ' + escapeHtml(wtInfo) : ''}
                       <br>Leer lassen = Prognose verwenden`
                    : 'Leer lassen = kein Termin'}
                </div>
              </div>
            </div>
            <div class="modal-row modal-row-block">
              <div class="modal-label">Zusätzliche Disziplinen</div>
              <textarea id="planung-disziplinen" rows="4"
                style="resize:vertical;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit"
                placeholder="Eine Disziplin pro Zeile">${escapeHtml((serie.disziplinen_extra || []).join('\n'))}</textarea>
              <div style="font-size:11px;color:var(--text2);margin-top:4px">
                Ergänzt die aus den Ergebnissen extrahierten Disziplinen.
                ${serie.disziplinen.length
                  ? 'Aus Ergebnissen: ' + serie.disziplinen.slice(0, 5).map(d =>
                      `<span style="padding:1px 5px;border-radius:8px;background:var(--border);font-size:11px">${escapeHtml(d)}</span>`
                    ).join(' ') + (serie.disziplinen.length > 5 ? ` +${serie.disziplinen.length - 5}` : '')
                  : ''}
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="ADMIN_WETTKAMPF.savePlanung(${serieId})">Speichern</button>
          </div>
        </div>
      </div>`;
  }

  async function savePlanung(serieId) {
    const datum      = (document.getElementById('planung-datum')?.value || '').trim() || null;
    const diszText   = document.getElementById('planung-disziplinen')?.value || '';
    const diszExtra  = diszText.split('\n').map(s => s.trim()).filter(Boolean);

    try {
      await apiPut(`wettkampf/${serieId}/planung`, {
        naechstes_datum:   datum,
        disziplinen_extra: diszExtra,
      });
      schliesseModal();
      benachrichtigen('Planung gespeichert.', 'ok');
      await reload();
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  // ── Im Kalender eintragen ─────────────────────────────────────
  async function imKalenderEintragen(serieId) {
    const serie = serien.find(s => s.id === serieId);
    if (!serie) return;
    const next = naechstesDatumFuerSerie(serie);
    if (!next) { alert('Kein Termin verfügbar.'); return; }

    const wt = WT_KURZ[new Date(next.datum + 'T00:00:00').getDay()];
    if (!confirm(`„${serie.name || serie.kuerzel}" am ${wt}, ${fmtDate(next.datum)} als Kalender-Event eintragen?`)) return;

    try {
      await apiPost('einheiten', {
        datum:        next.datum,
        typ:          'event',
        titel:        serie.name || serie.kuerzel,
        sichtbarkeit: 'oeffentlich',
        status:       'geplant',
      });
      benachrichtigen('Kalender-Eintrag erstellt.', 'ok');
    } catch (e) {
      benachrichtigen('Fehler: ' + escapeHtml(e.message || ''), 'err');
    }
  }

  // ── Reload ────────────────────────────────────────────────────
  async function reload() {
    if (!container || !container.isConnected) return;
    try {
      const resp = await apiGet('wettkampf', { silent: true });
      serien = resp.serien || [];
      renderTabelle();
    } catch (_) {}
  }

  return {
    render,
    toggleExpand,
    showAnmeldeModal,
    anmelden,
    abmelden,
    adminAbmelden,
    showPlanungModal,
    savePlanung,
    imKalenderEintragen,
  };
})();
