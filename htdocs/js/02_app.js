// ============================================================
// Trainingsportal – App-Bootstrap
// ============================================================
// - auth/me beim Laden (silent → kein Force-Redirect, App ist öffentlich)
// - Header mit Benutzerdaten (oder Login-Button bei Anonym)
// - Routing per Hash (#kalender, #kalender/2026-04)
// - Default: Monatskalender mit öffentlichen Einheiten
// ============================================================

const state = {
  user: null,
  tab:  'kalender',
};

window.addEventListener('DOMContentLoaded', init);
window.addEventListener('hashchange', renderPage);

async function init() {
  // Auth-Check, aber ohne Force-Redirect (öffentlicher Zugang erlaubt)
  try {
    const r = await apiGet('auth/me', { silent: true });
    state.user = r.user;
  } catch (e) {
    state.user = null;
  }
  showApp();
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = '';
  fillUserBadge();
  renderPage();
}

function fillUserBadge() {
  const u = state.user;
  const userBtn = document.getElementById('user-btn');

  if (!u) {
    if (userBtn) {
      userBtn.style.display = 'flex';
      userBtn.innerHTML = `<button class="btn-login-header" onclick="goToLoginPortal()">Anmelden</button>`;
    }
    return;
  }

  if (userBtn) userBtn.style.display = 'flex';
  const nameEl   = document.getElementById('user-name-disp');
  const rolleEl  = document.getElementById('user-rolle-disp');
  const avatarEl = document.getElementById('user-avatar');

  if (nameEl)  nameEl.textContent  = u.name || u.benutzername || '–';
  if (rolleEl) rolleEl.textContent = u.rolle || '–';
  if (avatarEl) {
    const initial = (u.name || u.benutzername || '?').trim().charAt(0).toUpperCase();
    avatarEl.textContent = initial;
  }
}

// ── Routing ─────────────────────────────────────────────────
function navigate(tab) {
  state.tab = tab;
  if (tab === 'kalender') {
    location.hash = '#kalender';
  } else {
    location.hash = '#' + tab;
  }
}

function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return { page: 'kalender' };
  const [page, ...rest] = h.split('/');
  return { page, args: rest };
}

function renderPage() {
  const main = document.getElementById('main-content');
  if (!main) return;
  const { page, args } = parseHash();
  state.tab = page || 'kalender';

  if (state.tab === 'kalender') {
    renderKalender(main, args && args[0]);
    return;
  }

  main.innerHTML = `
    <div style="padding:32px;max-width:880px;margin:0 auto">
      <h1 class="page-title">Seite nicht gefunden</h1>
      <p style="color:var(--text2);margin-top:8px">
        <a href="#kalender">Zurück zum Kalender</a>
      </p>
    </div>`;
}

async function logout() {
  try { await apiPost('auth/logout'); } catch (e) {}
  window.location.reload();
}

function toggleBurgerMenu() {
  const drawer = document.getElementById('mobile-nav-drawer');
  const overlay = document.getElementById('mobile-nav-overlay');
  if (!drawer || !overlay) return;
  const open = drawer.classList.toggle('open');
  overlay.classList.toggle('open', open);
  drawer.style.visibility = open ? 'visible' : 'hidden';
}
function closeBurgerMenu() {
  const drawer = document.getElementById('mobile-nav-drawer');
  const overlay = document.getElementById('mobile-nav-overlay');
  if (drawer)  { drawer.classList.remove('open'); drawer.style.visibility = 'hidden'; }
  if (overlay) overlay.classList.remove('open');
}

// ============================================================
// Kalender (Monatsansicht, 1 Woche = 1 Zeile, Mo–So)
// ============================================================

const MONATSNAMEN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const WOCHENTAGE  = ['Mo','Di','Mi','Do','Fr','Sa','So'];

const TYP_LABEL = {
  intervall:    'Intervall',
  dauerlauf:    'Dauerlauf',
  funktionell:  'Funkt. Tr.',
  runde:        'Runde',
  event:        'Event',
  frei:         'Training',
  kein_training:'Kein Training',
};

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseMonthArg(arg) {
  // Erwartet "YYYY-MM"; sonst aktueller Monat
  if (arg && /^\d{4}-\d{2}$/.test(arg)) {
    const [y, m] = arg.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function renderKalender(main, monthArg) {
  const monthStart = parseMonthArg(monthArg);
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();

  // Erster Mo der Anzeige (kann im Vormonat liegen)
  const firstDay = new Date(y, m, 1);
  const dow0 = (firstDay.getDay() + 6) % 7; // Mo=0 … So=6
  const gridStart = new Date(y, m, 1 - dow0);

  // Letzter Tag des Monats + Auffüllen bis Sonntag
  const lastDay = new Date(y, m + 1, 0);
  const dowLast = (lastDay.getDay() + 6) % 7;
  const gridEnd = new Date(y, m + 1, (6 - dowLast));

  const prev = new Date(y, m - 1, 1);
  const next = new Date(y, m + 1, 1);
  const todayKey = ymd(new Date());

  main.innerHTML = `
    <div class="kal-wrap">
      <div class="kal-toolbar">
        <div class="kal-nav">
          <button class="btn btn-ghost" onclick="navigateKalender('${ymd(prev).slice(0,7)}')" aria-label="Vorheriger Monat">‹</button>
          <h1 class="kal-title">${MONATSNAMEN[m]} ${y}</h1>
          <button class="btn btn-ghost" onclick="navigateKalender('${ymd(next).slice(0,7)}')" aria-label="Nächster Monat">›</button>
        </div>
        <div class="kal-nav-right">
          <button class="btn btn-ghost" onclick="navigateKalenderHeute()">Heute</button>
          ${state.user ? `<button class="btn btn-primary" onclick="EDITOR.open({})">+ Neue Einheit</button>` : ''}
        </div>
      </div>
      <div id="kal-grid" class="kal-loading">Lade Trainingsplan…</div>
    </div>`;

  let einheiten = [];
  try {
    const data = await apiGet(`einheiten?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true });
    einheiten = data.einheiten || [];
  } catch (e) {
    document.getElementById('kal-grid').innerHTML =
      `<div class="kal-error">Trainingsplan konnte nicht geladen werden: ${escapeHtml(e.message || '')}</div>`;
    return;
  }

  // Index: datum → [einheiten]
  const byDate = {};
  einheiten.forEach(e => {
    (byDate[e.datum] = byDate[e.datum] || []).push(e);
  });

  // Grid bauen (Wochenzeilen)
  const head = `<div class="kal-head">${WOCHENTAGE.map(w => `<div class="kal-head-cell">${w}</div>`).join('')}</div>`;

  const rows = [];
  let cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const k = ymd(cursor);
      const inMonth = cursor.getMonth() === m;
      const isToday = k === todayKey;
      const items = byDate[k] || [];

      const dayCls = [
        'kal-cell',
        inMonth ? 'in-month' : 'out-month',
        isToday ? 'is-today' : '',
        (cursor.getDay() === 0 || cursor.getDay() === 6) ? 'weekend' : '',
      ].filter(Boolean).join(' ');

      const itemsHtml = items.map(e => {
        const cls = `kal-item kal-typ-${e.typ}` + (e.status === 'abgesagt' ? ' is-cancelled' : '');
        const time = e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : '';
        return `<div class="${cls}" onclick="zeigeEinheit(${e.id})" title="${escapeHtml(e.titel)}">${time}<span class="kal-item-title">${escapeHtml(e.titel)}</span></div>`;
      }).join('');

      const addBtn = state.user
        ? `<button class="kal-add-btn" title="Einheit hinzufügen" onclick="event.stopPropagation();EDITOR.open({datum:'${k}'})">+</button>`
        : '';
      cells.push(`
        <div class="${dayCls}">
          <div class="kal-cell-head">
            <span class="kal-day-num">${cursor.getDate()}</span>
            ${addBtn}
          </div>
          <div class="kal-cell-items">${itemsHtml}</div>
        </div>`);
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push(`<div class="kal-row">${cells.join('')}</div>`);
  }

  document.getElementById('kal-grid').outerHTML =
    `<div id="kal-grid" class="kal-grid">${head}${rows.join('')}</div>`;
}

function navigateKalender(monthYM) {
  location.hash = `#kalender/${monthYM}`;
}
function navigateKalenderHeute() {
  const d = new Date();
  navigateKalender(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
}

async function zeigeEinheit(id) {
  const cont = document.getElementById('modal-container');
  cont.innerHTML = `<div class="modal-overlay" onclick="schliesseModal(event)"><div class="modal-card"><div class="loading">Lade…</div></div></div>`;
  try {
    const data = await apiGet(`einheiten/${id}`, { silent: true });
    const e = data.einheit;
    const seg = data.segmente || [];
    state._lastEinheit = { einheit: e, segmente: seg };
    const datum = new Date(e.datum + 'T00:00:00');
    const wochentag = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][datum.getDay()];
    const datStr = `${wochentag}, ${datum.getDate()}. ${MONATSNAMEN[datum.getMonth()]} ${datum.getFullYear()}`;

    const segHtml = seg.length ? `
      <div class="modal-row modal-row-block">
        <span class="modal-label">Segmente</span>
        <div class="seg-list">
          ${seg.map((s, i) => `
            <div class="seg-item">
              <div class="seg-num">${i + 1}</div>
              <div class="seg-main">${escapeHtml(PARSER.formatSegment(s))}</div>
              ${s.pace_referenz ? `<div class="seg-pace">${escapeHtml(s.pace_referenz)}</div>` : ''}
            </div>`).join('')}
        </div>
      </div>` : '';

    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">${escapeHtml(TYP_LABEL[e.typ] || e.typ)}${e.uhrzeit ? ' · ' + escapeHtml(e.uhrzeit) : ''}</div>
              <div class="modal-title">${escapeHtml(e.titel)}</div>
              <div class="modal-sub">${datStr}</div>
            </div>
            <button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            ${e.treffpunkt ? `<div class="modal-row"><span class="modal-label">Treffpunkt</span><span>${escapeHtml(e.treffpunkt)}</span></div>` : ''}
            ${e.bemerkung ? `<div class="modal-row"><span class="modal-label">Bemerkung</span><span>${escapeHtml(e.bemerkung)}</span></div>` : ''}
            ${e.sichtbarkeit === 'intern' ? `<div class="modal-row"><span class="modal-label">Sichtbarkeit</span><span>Nur intern</span></div>` : ''}
            ${e.status === 'abgesagt' ? `<div class="modal-row"><span class="modal-label">Status</span><span style="color:var(--primary);font-weight:600">Abgesagt</span></div>` : ''}
            ${segHtml}
            ${state.user ? `
              <div class="modal-actions">
                <button class="btn btn-ghost" onclick="EDITOR.open(state._lastEinheit)">Bearbeiten</button>
              </div>` : ''}
          </div>
        </div>
      </div>`;
  } catch (err) {
    cont.innerHTML = `<div class="modal-overlay" onclick="schliesseModal(event)"><div class="modal-card"><div class="modal-body">Fehler: ${escapeHtml(err.message || '')}</div></div></div>`;
  }
}

function schliesseModal(ev) {
  if (ev && ev.target && !ev.target.classList.contains('modal-overlay')) return;
  document.getElementById('modal-container').innerHTML = '';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
