// ============================================================
// Trainingsportal – ICS-Abo
// ============================================================
// Modal mit zwei Links:
//   - Öffentlicher Trainingsplan (kein Token)
//   - Persönlicher Trainingsplan (Token-basierter Link mit Pace)
// Token kann erzeugt, kopiert und widerrufen werden.
// ============================================================

const ICS = (() => {

  function basisUrl() {
    // ?p=ics/... – relative URL passt zu jeder Domain
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/index.php';
  }

  function publicUrl() {
    return basisUrl() + '?p=ics/public.ics';
  }
  function meUrl(token) {
    return basisUrl() + '?p=ics/me.ics&token=' + encodeURIComponent(token);
  }
  // webcal://-Variante (öffnet sich in Kalender-Apps direkt)
  function webcal(url) {
    return url.replace(/^https?:\/\//, 'webcal://');
  }

  async function open() {
    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">Kalender abonnieren</div>
              <div class="modal-title">Trainingsplan im Kalender</div>
              <div class="modal-sub">Apple Kalender, Google Kalender, Outlook etc.</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <div class="ics-section">
              <h4>Öffentlicher Plan</h4>
              <p class="ics-hint">Alle öffentlich sichtbaren Einheiten – ohne Pace-Vorgaben.</p>
              ${ics_url_block(publicUrl())}
            </div>
            <div class="ics-section" id="ics-me-block">
              <h4>Persönlicher Plan</h4>
              ${state.user
                ? '<div class="loading">Lade…</div>'
                : '<p class="ics-hint">Nur eingeloggt verfügbar. <a href="#" onclick="goToLoginPortal();return false;">Anmelden</a></p>'}
            </div>
          </div>
        </div>
      </div>`;

    if (state.user) {
      try {
        const r = await apiGet('ics/me/token', { silent: true });
        const block = document.getElementById('ics-me-block');
        if (!r.token) {
          block.innerHTML = `
            <h4>Persönlicher Plan</h4>
            <p class="ics-hint">Mit individueller Pace pro Segment, basierend auf deinen Bestzeiten.</p>
            <button class="btn btn-primary" onclick="ICS.tokenErzeugen()">Persönlichen Link erzeugen</button>`;
        } else {
          block.innerHTML = `
            <h4>Persönlicher Plan</h4>
            <p class="ics-hint">Pace pro Segment basierend auf deinen Bestzeiten.</p>
            ${ics_url_block(meUrl(r.token))}
            <div class="ics-actions">
              <button class="btn btn-ghost" onclick="ICS.tokenErzeugen()">Token rotieren</button>
              <button class="btn btn-ghost" onclick="ICS.tokenWiderrufen()">Widerrufen</button>
            </div>
            <p class="ics-warn">⚠️ Der Link enthält ein Token, das deinen persönlichen Plan ausliefert. Nur in vertrauenswürdige Kalender einbinden.</p>`;
        }
      } catch (e) {
        document.getElementById('ics-me-block').innerHTML = `<h4>Persönlicher Plan</h4><p class="ics-hint">Fehler: ${escapeHtml(e.message)}</p>`;
      }
    }
  }

  function ics_url_block(url) {
    const wc = webcal(url);
    return `
      <div class="ics-url">
        <input type="text" readonly value="${escapeHtml(url)}" onclick="this.select()">
        <button class="btn btn-ghost" onclick="ICS.copy('${url.replace(/'/g, "&#39;")}')">Kopieren</button>
        <a class="btn btn-primary" href="${escapeHtml(wc)}">In Kalender öffnen</a>
      </div>`;
  }

  async function tokenErzeugen() {
    try {
      await apiPost('ics/me/token');
      open(); // neu rendern
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  }
  async function tokenWiderrufen() {
    if (!confirm('Token wirklich widerrufen? Bestehende Kalender-Abos funktionieren danach nicht mehr.')) return;
    try {
      await apiDel('ics/me/token');
      open();
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  }

  function copy(url) {
    navigator.clipboard?.writeText(url);
    if (typeof EDITOR !== 'undefined' && EDITOR) {
      // verwende benachrichtigen über bekannten Pfad
    }
    const cont = document.getElementById('notification-container');
    if (cont) {
      const div = document.createElement('div');
      div.className = 'notif notif-ok';
      div.textContent = 'Link kopiert.';
      cont.appendChild(div);
      setTimeout(() => div.remove(), 2500);
    }
  }

  return { open, tokenErzeugen, tokenWiderrufen, copy, publicUrl, meUrl };
})();
