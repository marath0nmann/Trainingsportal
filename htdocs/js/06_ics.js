// ============================================================
// Trainingsportal – ICS-Abo
// ============================================================
// Modal mit zwei Links:
//   - Öffentlicher Trainingsplan (kein Token)
//   - Persönlicher Trainingsplan (Token-basierter Link mit Pace)
// Token kann erzeugt, kopiert und widerrufen werden.
// Umschalter: ganztägige Events vs. zeitgenaue Termine
// ============================================================

const ICS = (() => {

  // Format-Präferenz: true = mit Uhrzeit, false = ganztägig (default)
  let _mitUhrzeit = false;

  function basisUrl() {
    // ?p=ics/... – relative URL passt zu jeder Domain
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/index.php';
  }

  function publicUrl() {
    const u = basisUrl() + '?p=ics/public.ics';
    return _mitUhrzeit ? u + '&mit_uhrzeit=1' : u;
  }
  function meUrl(token) {
    const u = basisUrl() + '?p=ics/me.ics&token=' + encodeURIComponent(token);
    return _mitUhrzeit ? u + '&mit_uhrzeit=1' : u;
  }
  // webcal://-Variante (öffnet sich in Kalender-Apps direkt)
  function webcal(url) {
    return url.replace(/^https?:\/\//, 'webcal://');
  }

  // Wird durch den Format-Schalter im Modal aufgerufen
  function setFormat(mitUhrzeit) {
    _mitUhrzeit = mitUhrzeit;
    _renderLinks();
  }

  function _renderLinks() {
    // Format-Buttons aktualisieren
    const btnAllday = document.getElementById('ics-fmt-allday');
    const btnTimed  = document.getElementById('ics-fmt-timed');
    if (btnAllday) { btnAllday.className = 'btn btn-sm ' + (_mitUhrzeit ? 'btn-ghost'   : 'btn-primary'); }
    if (btnTimed)  { btnTimed.className  = 'btn btn-sm ' + (_mitUhrzeit ? 'btn-primary' : 'btn-ghost');  }

    // Öffentlicher Plan neu rendern
    const pubBlock = document.getElementById('ics-public-url');
    if (pubBlock) pubBlock.outerHTML = ics_url_block(publicUrl(), 'ics-public-url');

    // Persönlicher Plan neu rendern (nur wenn Token bekannt)
    const meBlock = document.getElementById('ics-me-url');
    if (meBlock) {
      const token = meBlock.dataset.token;
      if (token) meBlock.outerHTML = ics_url_block(meUrl(token), 'ics-me-url', token);
    }
  }

  async function open() {
    const cont = document.getElementById('modal-container');
    cont.innerHTML = `
      <div class="modal-overlay">
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
            <div class="ics-format-toggle">
              <span class="ics-format-label">Format:</span>
              <button id="ics-fmt-allday" class="btn btn-sm${_mitUhrzeit ? ' btn-ghost' : ' btn-primary'}" onclick="ICS.setFormat(false)">Ganztägig</button>
              <button id="ics-fmt-timed"  class="btn btn-sm${_mitUhrzeit ? ' btn-primary' : ' btn-ghost'}" onclick="ICS.setFormat(true)">Mit Uhrzeit</button>
            </div>
            <div class="ics-section">
              <h4>Öffentlicher Plan</h4>
              <p class="ics-hint">Alle öffentlich sichtbaren Einheiten – ohne Pace-Vorgaben.</p>
              ${ics_url_block(publicUrl(), 'ics-public-url')}
            </div>
            <div class="ics-section" id="ics-me-block">
              <h4>Mein Plan</h4>
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
            <h4>Mein Plan</h4>
            <p class="ics-hint">Nur deine Einheiten aus „Mein Plan" – mit individueller Pace basierend auf deinen Bestzeiten.</p>
            <button class="btn btn-primary" onclick="ICS.tokenErzeugen()">Persönlichen Link erzeugen</button>`;
        } else {
          block.innerHTML = `
            <h4>Mein Plan</h4>
            <p class="ics-hint">Nur deine Einheiten aus „Mein Plan" – mit Pace pro Segment basierend auf deinen Bestzeiten.</p>
            ${ics_url_block(meUrl(r.token), 'ics-me-url', r.token)}
            <div class="ics-actions">
              <button class="btn btn-ghost" onclick="ICS.tokenErzeugen()">Token rotieren</button>
              <button class="btn btn-ghost" onclick="ICS.tokenWiderrufen()">Widerrufen</button>
            </div>
            <p class="ics-warn">⚠️ Der Link enthält ein Token, das deinen persönlichen Plan ausliefert. Nur in vertrauenswürdige Kalender einbinden.</p>`;
        }
      } catch (e) {
        document.getElementById('ics-me-block').innerHTML = `<h4>Mein Plan</h4><p class="ics-hint">Fehler: ${escapeHtml(e.message)}</p>`;
      }
    }
  }

  function ics_url_block(url, id = '', token = '') {
    const wc = webcal(url);
    const idAttr   = id    ? ` id="${id}"`                    : '';
    const dataAttr = token ? ` data-token="${escapeHtml(token)}"` : '';
    return `
      <div class="ics-url"${idAttr}${dataAttr}>
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
    const cont = document.getElementById('notification-container');
    if (cont) {
      const div = document.createElement('div');
      div.className = 'notif notif-ok';
      div.textContent = 'Link kopiert.';
      cont.appendChild(div);
      setTimeout(() => div.remove(), 2500);
    }
  }

  return { open, setFormat, tokenErzeugen, tokenWiderrufen, copy, publicUrl, meUrl };
})();
