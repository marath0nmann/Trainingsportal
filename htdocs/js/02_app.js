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
  // Optik aus Statistikportal-Einstellungen ziehen (Farben, Logo, Verein)
  await CONFIG.load();

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

const ROLLE_LABEL = {
  admin:    'Administrator',
  trainer:  'Trainer',
  editor:   'Editor',
  athlet:   'Athlet',
  leser:    'Leser',
};

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

  const displayName = u.vorname || u.name || u.benutzername || '–';
  if (nameEl)  nameEl.textContent  = displayName;
  if (rolleEl) rolleEl.textContent = ROLLE_LABEL[u.rolle] || u.rolle || '–';
  if (avatarEl) {
    const initial = displayName.trim().charAt(0).toUpperCase();
    let avatarInner = '';
    if (u.avatar_pfad) {
      // Avatar liegt im Statistikportal-htdocs; über shared.php ausliefern
      avatarInner = `<img src="${assetUrl(u.avatar_pfad)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML='${escapeHtml(initial)}'">`;
    } else {
      avatarInner = escapeHtml(initial);
    }
    avatarEl.innerHTML = avatarInner + '<span class="user-online-dot" title="Online"></span>';
    avatarEl.onclick = () => PROFIL.open();
    avatarEl.title   = 'Profileinstellungen öffnen';
    avatarEl.style.cursor = 'pointer';
  }

  // Hauptnavigation abhängig von der Rolle
  const nav = document.getElementById('main-nav');
  if (nav && u) {
    const isAdmin   = u.rolle === 'admin';
    const isTrainer = isAdmin || u.rolle === 'trainer';
    nav.innerHTML = `
      <button onclick="navigate('kalender')"${state.tab === 'kalender' ? ' class="active"' : ''}>Kalender</button>
      ${isTrainer ? `<button onclick="navigate('planung')"${state.tab === 'planung' ? ' class="active"' : ''}>Planung</button>` : ''}
      ${isTrainer ? `<button onclick="navigate('treffpunkte')"${state.tab === 'treffpunkte' ? ' class="active"' : ''}>Treffpunkte</button>` : ''}
      ${isAdmin ? `<button onclick="navigate('einstellungen')"${state.tab === 'einstellungen' ? ' class="active"' : ''}>Einstellungen</button>` : ''}`;
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
  // Aktiv-Markierung der Navigation aktualisieren
  if (state.user) fillUserBadge();

  if (state.tab === 'kalender') {
    renderKalender(main, args && args[0]);
    return;
  }
  if (state.tab === 'bloecke') {
    location.replace('#planung');
    return;
  }
  if (state.tab === 'planung') {
    if (!state.user) { location.replace('#kalender'); return; }
    PLANUNG.render(main);
    return;
  }
  if (state.tab === 'treffpunkte') {
    if (!state.user) { location.replace('#kalender'); return; }
    TREFFPUNKTE.render(main);
    return;
  }
  if (state.tab === 'einstellungen') {
    SETTINGS.render(main);
    return;
  }

  // Unbekannte Route (z. B. #dashboard / #konto aus Statistikportal-Header)
  // → still auf den Kalender umleiten, statt 404 anzuzeigen
  location.replace('#kalender');
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
          <button class="btn btn-ghost" onclick="ICS.open()" title="Im Kalender abonnieren">📅 Abonnieren</button>
          <button class="btn btn-ghost" onclick="navigateKalenderHeute()">Heute</button>
          ${state.user ? `<button class="btn btn-primary" onclick="navigate('planung')">Planung</button>` : ''}
        </div>
      </div>
      <div id="heute-sektion"></div>
      <div id="kal-grid" class="kal-loading">Lade Trainingsplan…</div>
    </div>`;

  let einheiten = [], feiertage = [];
  try {
    const [d1, d2] = await Promise.all([
      apiGet(`einheiten?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true }),
      apiGet(`feiertage?von=${ymd(gridStart)}&bis=${ymd(gridEnd)}`, { silent: true }).catch(() => ({ feiertage: [] })),
    ]);
    einheiten = d1.einheiten || [];
    feiertage = d2.feiertage || [];
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

  // Heute-Sektion: nur anzeigen, wenn heute im geladenen Bereich liegt
  const todayInRange = todayKey >= ymd(gridStart) && todayKey <= ymd(gridEnd);
  const todayItems = todayInRange
    ? (byDate[todayKey] || []).filter(e => e.typ !== 'kein_training')
    : [];
  const heuteEl = document.getElementById('heute-sektion');
  if (heuteEl) {
    heuteEl.innerHTML = todayItems.length ? renderHeuteSektionHtml(todayItems) : '';
    if (todayItems.length) ladHeuteDetails(todayItems);
  }

  // Feiertage über Datum spreizen (mehrtägige Ferien)
  const feiertageByDate = {};
  feiertage.forEach(f => {
    const start = new Date(f.datum + 'T00:00:00');
    const end   = new Date((f.datum_bis || f.datum) + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = ymd(d);
      (feiertageByDate[k] = feiertageByDate[k] || []).push(f);
    }
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

      const ferien = feiertageByDate[k] || [];

      const dayCls = [
        'kal-cell',
        inMonth ? 'in-month' : 'out-month',
        isToday ? 'is-today' : '',
        (cursor.getDay() === 0 || cursor.getDay() === 6) ? 'weekend' : '',
        ferien.length ? 'is-feiertag' : '',
      ].filter(Boolean).join(' ');

      const ferienHtml = ferien.map(f => {
        const farbeStyle = f.farbe ? ` style="background:${escapeHtml(f.farbe)};color:#fff"` : '';
        return `<div class="kal-feiertag" title="${escapeHtml(f.titel)}"${farbeStyle}>${escapeHtml(f.titel)}</div>`;
      }).join('');

      const itemsHtml = items.map(e => {
        const cls = `kal-item kal-typ-${e.typ}` + (e.status === 'abgesagt' ? ' is-cancelled' : '');
        const time = e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : '';
        return `<div class="${cls}" onclick="zeigeEinheit(${e.id})" title="${escapeHtml(e.titel)}">${time}<span class="kal-item-title">${escapeHtml(e.titel)}</span></div>`;
      }).join('');

      const addBtn = '';
      cells.push(`
        <div class="${dayCls}">
          <div class="kal-cell-head">
            <span class="kal-day-num">${cursor.getDate()}</span>
            ${addBtn}
          </div>
          ${ferienHtml ? `<div class="kal-feiertag-list">${ferienHtml}</div>` : ''}
          <div class="kal-cell-items">${itemsHtml}</div>
        </div>`);
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push(`<div class="kal-row">${cells.join('')}</div>`);
  }

  document.getElementById('kal-grid').outerHTML =
    `<div id="kal-grid" class="kal-grid">${head}${rows.join('')}</div>`;
}

function renderHeuteSektionHtml(items) {
  const cardsHtml = items.map(e => {
    const typLabel = TYP_LABEL[e.typ] || e.typ;
    const zeitStr = e.uhrzeit ? ` · ${escapeHtml(e.uhrzeit)} Uhr` : '';
    const abgesagt = e.status === 'abgesagt';
    const intern = e.sichtbarkeit === 'intern';
    const treffpunktName = e.treffpunkt ? (e.treffpunkt.name || e.treffpunkt) : null;
    return `
      <div class="heute-card kal-typ-${e.typ}${abgesagt ? ' is-cancelled' : ''}">
        <div class="heute-card-eyebrow">
          <span class="heute-typ-label">${escapeHtml(typLabel)}${zeitStr}</span>
          ${abgesagt ? '<span class="heute-badge heute-badge-abgesagt">Abgesagt</span>' : ''}
          ${intern ? '<span class="heute-badge heute-badge-intern">Intern</span>' : ''}
        </div>
        <div class="heute-card-titel">${escapeHtml(e.titel)}</div>
        ${treffpunktName ? `<div class="heute-card-info heute-treffpunkt">Treffpunkt: ${escapeHtml(treffpunktName)}</div>` : ''}
        ${e.bemerkung    ? `<div class="heute-card-info">${escapeHtml(e.bemerkung)}</div>` : ''}
        <div id="heute-segs-${e.id}"></div>
      </div>`;
  }).join('');
  return `<div class="heute-sektion"><div class="heute-heading">Heute</div><div class="heute-cards">${cardsHtml}</div></div>`;
}

async function ladHeuteDetails(items) {
  if (!state._heuteEinheiten) state._heuteEinheiten = {};
  let paceData = null;

  for (const item of items) {
    const areaEl = document.getElementById(`heute-segs-${item.id}`);
    if (!areaEl) continue;
    try {
      const data = await apiGet(`einheiten/${item.id}`, { silent: true });
      const seg     = data.segmente || [];
      const einheit = data.einheit;
      state._heuteEinheiten[einheit.id] = { einheit, segmente: seg };

      const hatPaceRef = seg.some(s => s.pace_referenz);
      if (state.user && hatPaceRef && !paceData) {
        paceData = await PACE.load();
      }

      let html = '';
      if (seg.length) {
        const segItems = seg.map((s, i) => {
          const sekProKm = paceData ? PACE.paceSekProKm(paceData, s.pace_referenz) : null;
          const splitSek = paceData ? PACE.splitzeit(s, paceData) : null;
          const paceBox  = sekProKm != null ? `
            <div class="seg-pace-info">
              <div class="seg-split">${PACE.formatTime(splitSek)}<span class="seg-split-unit">/Wdh</span></div>
              <div class="seg-pace-pace">${PACE.formatPace(sekProKm)}</div>
            </div>` : '';
          return `
            <div class="seg-item">
              <div class="seg-num">${i + 1}</div>
              <div class="seg-main">${escapeHtml(PARSER.formatSegment(s))}</div>
              ${s.pace_referenz ? `<div class="seg-pace">${escapeHtml(s.pace_referenz)}</div>` : ''}
              ${paceBox}
            </div>`;
        }).join('');
        html += `<div class="seg-list heute-seg-list">${segItems}</div>`;
      }

      const actions = [];
      if (seg.length) {
        actions.push(`<a class="btn btn-ghost btn-sm" href="api/index.php?p=fit/einheit/${einheit.id}.fit" download title="Garmin Workout-Datei">⌚ FIT für Garmin</a>`);
      }
      if (state.user) {
        actions.push(`<button class="btn btn-ghost btn-sm" onclick="bearbeiteHeuteEinheit(${einheit.id})">Bearbeiten</button>`);
      }
      if (actions.length) {
        html += `<div class="heute-card-actions">${actions.join('')}</div>`;
      }

      areaEl.innerHTML = html;
    } catch (_) {
      // Segmente bleiben leer bei Fehler
    }
  }
}

function bearbeiteHeuteEinheit(id) {
  const data = state._heuteEinheiten && state._heuteEinheiten[id];
  if (data) EDITOR.open(data);
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

    // Pace nur laden, wenn eingeloggt und Segmente mit pace_referenz vorhanden
    let paceData = null;
    const hatPaceRef = seg.some(s => s.pace_referenz);
    if (state.user && hatPaceRef) {
      paceData = await PACE.load();
    }
    const datum = new Date(e.datum + 'T00:00:00');
    const wochentag = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][datum.getDay()];
    const datStr = `${wochentag}, ${datum.getDate()}. ${MONATSNAMEN[datum.getMonth()]} ${datum.getFullYear()}`;

    const paceHeader = (state.user && hatPaceRef) ? `
      <div class="pace-header">
        <span class="pace-label">Persönliche Pace</span>
        <button class="btn btn-ghost btn-sm" onclick="PROFIL.open()" title="Pace-Referenzen konfigurieren">⚙ Profil</button>
        ${paceData ? '' : '<span class="pace-hint">– keine Referenz konfiguriert –</span>'}
      </div>` : '';

    const segHtml = seg.length ? `
      <div class="modal-row modal-row-block">
        <span class="modal-label">Segmente</span>
        ${paceHeader}
        <div class="seg-list">
          ${seg.map((s, i) => {
            const sekProKm = paceData ? PACE.paceSekProKm(paceData, s.pace_referenz) : null;
            const splitSek = paceData ? PACE.splitzeit(s, paceData) : null;
            const totalSek = (splitSek != null) ? splitSek * (s.wiederholungen || 1) : null;
            const paceBox = (sekProKm != null) ? `
              <div class="seg-pace-info">
                <div class="seg-split">${PACE.formatTime(splitSek)}<span class="seg-split-unit">/Wdh</span></div>
                <div class="seg-pace-pace">${PACE.formatPace(sekProKm)}</div>
              </div>` : '';
            return `
              <div class="seg-item">
                <div class="seg-num">${i + 1}</div>
                <div class="seg-main">${escapeHtml(PARSER.formatSegment(s))}</div>
                ${s.pace_referenz ? `<div class="seg-pace">${escapeHtml(s.pace_referenz)}</div>` : ''}
                ${paceBox}
              </div>`;
          }).join('')}
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
            ${e.treffpunkt ? `<div class="modal-row"><span class="modal-label">Treffpunkt</span><span class="modal-treffpunkt">
              ${escapeHtml(e.treffpunkt.name || '')}
              ${e.treffpunkt.maps_google ? `<a class="tp-link" href="${escapeHtml(e.treffpunkt.maps_google)}" target="_blank" rel="noopener" title="Google Maps öffnen">Google Maps</a>` : ''}
              ${e.treffpunkt.maps_apple  ? `<a class="tp-link" href="${escapeHtml(e.treffpunkt.maps_apple)}"  target="_blank" rel="noopener" title="Apple Maps öffnen">Apple Maps</a>`  : ''}
              ${e.treffpunkt.maps_komoot ? `<a class="tp-link" href="${escapeHtml(e.treffpunkt.maps_komoot)}" target="_blank" rel="noopener" title="In Komoot öffnen">Komoot</a>` : ''}
            </span></div>` : ''}
            ${e.komoot_url ? `<div class="modal-row"><span class="modal-label">Strecke</span><span><a class="tp-link tp-link-komoot" href="${escapeHtml(e.komoot_url)}" target="_blank" rel="noopener">Komoot-Strecke öffnen</a></span></div>` : ''}
            ${e.bemerkung ? `<div class="modal-row"><span class="modal-label">Bemerkung</span><span>${escapeHtml(e.bemerkung)}</span></div>` : ''}
            ${e.sichtbarkeit === 'intern' ? `<div class="modal-row"><span class="modal-label">Sichtbarkeit</span><span>Nur intern</span></div>` : ''}
            ${e.status === 'abgesagt' ? `<div class="modal-row"><span class="modal-label">Status</span><span style="color:var(--primary);font-weight:600">Abgesagt</span></div>` : ''}
            ${segHtml}
            <div class="modal-actions">
              ${seg.length ? `<a class="btn btn-ghost" href="api/index.php?p=fit/einheit/${e.id}.fit" download title="Garmin Workout-Datei">⌚ FIT für Garmin</a>` : ''}
              ${state.user ? `<button class="btn btn-ghost" onclick="EDITOR.open(state._lastEinheit)">Bearbeiten</button>` : ''}
            </div>
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
