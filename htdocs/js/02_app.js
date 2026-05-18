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
  // Mobile: Standard-Ansicht ist Quartalsplan
  if (!location.hash || location.hash === '#') {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) + 1;
    location.hash = window.innerWidth < 720
      ? `#liste/${now.getFullYear()}-Q${q}`
      : '#kalender';
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
  if (state.tab === 'liste') {
    renderListe(main, args && args[0]);
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
          <div class="view-toggle">
            <button class="btn btn-ghost view-active" title="Kalenderansicht">▦ Kalender</button>
            <button class="btn btn-ghost" onclick="navigateListeFromKal('${ymd(monthStart).slice(0,7)}')" title="Quartalsplan">☰ Liste</button>
          </div>
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

  // Heute-Sektion immer unabhängig nachladen
  ladeHeuteSektionInto('heute-sektion');

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
        return `<div class="${cls}" data-einheit-id="${e.id}" onclick="zeigeEinheit(${e.id})" title="${escapeHtml(e.titel)}">${time}<span class="kal-item-title">${escapeHtml(e.titel)}</span></div>`;
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
  if (typeof KAL_POPOVER !== 'undefined') {
    KAL_POPOVER.initItems(document.querySelectorAll('#kal-grid .kal-item[data-einheit-id]'));
  }
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

async function ladeHeuteSektionInto(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const today = ymd(new Date());
  try {
    const d = await apiGet(`einheiten?von=${today}&bis=${today}`, { silent: true });
    const items = (d.einheiten || []).filter(e => e.typ !== 'kein_training');
    el.innerHTML = items.length ? renderHeuteSektionHtml(items) : '';
    if (items.length) ladHeuteDetails(items);
  } catch (e) {
    el.innerHTML = '';
  }
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

      const hatUnresolvedPace = state.user && hatPaceRef &&
        seg.filter(s => s.pace_referenz).some(s => PACE.paceSekProKm(paceData, s.pace_referenz) == null);

      let html = '';
      if (hatUnresolvedPace) {
        html += `<div class="heute-pace-warn">
          Persönliche Pace noch nicht konfiguriert –
          <button class="btn-link" onclick="PROFIL.open()">jetzt im Athletenprofil einrichten</button>
        </div>`;
      }
      if (seg.length) {
        html += renderSegmentBlocksHtml(seg, paceData, einheit.typ);
      }
      if (einheit.komoot_url) {
        const embedUrl = komootEmbedUrl(einheit.komoot_url);
        if (embedUrl) {
          html += `<div class="komoot-embed" style="margin-top:10px"><iframe src="${escapeHtml(embedUrl)}" frameborder="0" scrolling="no" allow="fullscreen" loading="lazy"></iframe></div>`;
        }
        html += `<div style="margin-top:4px"><a class="tp-link tp-link-komoot" href="${escapeHtml(einheit.komoot_url)}" target="_blank" rel="noopener">Auf Komoot ansehen ↗</a></div>`;
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

// Segment-Blöcke (TrainingPeaks-Stil): jede Wiederholung als eigener Block
function renderSegmentBlocksHtml(seg, paceData, typ) {
  if (!seg.length) return '';
  const maxDist = Math.max(
    ...seg.map(s => s.distanz_m || 0),
    ...seg.map(s => s.pause_m   || 0),
    1
  );
  const typClass = `seg-blk-typ-${typ || 'frei'}`;

  let blocksHtml = '';
  seg.forEach((s, si) => {
    if (si > 0) blocksHtml += `<div class="seg-blk-sep"></div>`;
    const wdh = s.wiederholungen || 1;
    const h   = Math.round(16 + (s.distanz_m / maxDist) * 40);
    const sekProKm = paceData ? PACE.paceSekProKm(paceData, s.pace_referenz) : null;
    const splitSek = sekProKm != null ? sekProKm * (s.distanz_m / 1000) : null;
    const paceStr  = splitSek != null ? PACE.formatTime(splitSek) : '';
    const distStr  = s.distanz_m >= 1000 ? (s.distanz_m / 1000) + ' km' : s.distanz_m + ' m';
    const PAUSE_LABEL = { TP: 'Trabbpause', GP: 'Gehpause', BP: 'Bergpause', frei: 'Pause' };
    for (let i = 0; i < wdh; i++) {
      const tip = `${wdh > 1 ? (i + 1) + ' / ' + wdh + ' · ' : ''}${distStr}${s.pace_referenz ? ' · ' + s.pace_referenz : ''}${paceStr ? ' · ' + paceStr : ''}`;
      blocksHtml += `<div class="seg-blk seg-blk-work ${typClass}" style="flex:${s.distanz_m};height:${h}px" title="${escapeHtml(tip)}"></div>`;
      if (s.pause_m) {
        const pH  = Math.round(16 + (s.pause_m / maxDist) * 40);
        const pLbl = PAUSE_LABEL[s.pause_typ] || 'Pause';
        blocksHtml += `<div class="seg-blk seg-blk-pause" style="flex:${s.pause_m};height:${pH}px" title="${s.pause_m} m ${pLbl}"></div>`;
      }
    }
  });

  const summaryHtml = seg.map(s => {
    const wdh = s.wiederholungen || 1;
    const distStr = s.distanz_m >= 1000 ? (s.distanz_m / 1000) + ' km' : s.distanz_m + ' m';
    let line = (wdh > 1 ? wdh + ' × ' : '') + distStr;
    if (s.pause_m) {
      const pLbl = { TP: 'Trabbpause', GP: 'Gehpause', BP: 'Bergpause', frei: 'Pause' }[s.pause_typ] || 'Pause';
      line += ` · ${s.pause_m} m ${pLbl}`;
    }
    if (s.pace_referenz) line += ` · ${escapeHtml(s.pace_referenz)}`;
    const sekProKm = paceData ? PACE.paceSekProKm(paceData, s.pace_referenz) : null;
    const splitSek = sekProKm != null ? sekProKm * (s.distanz_m / 1000) : null;
    if (splitSek != null) line += ` · ${PACE.formatTime(splitSek)} / Wdh`;
    if (sekProKm  != null) line += ` · ${PACE.formatPace(sekProKm)}`;
    return `<div class="seg-blk-sum-row">${line}</div>`;
  }).join('');

  return `<div class="seg-blocks-wrap">
    <div class="seg-blocks">${blocksHtml}</div>
    ${summaryHtml ? `<div class="seg-blk-summary">${summaryHtml}</div>` : ''}
  </div>`;
}

function navigateKalender(monthYM) {
  location.hash = `#kalender/${monthYM}`;
}
function navigateKalenderHeute() {
  const d = new Date();
  navigateKalender(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
}

function navigateListeFromKal(monthYM) {
  const [y, mo] = monthYM.split('-').map(Number);
  navigateListe(`${y}-Q${Math.floor((mo - 1) / 3) + 1}`);
}

function navigateListe(quarterKey) {
  if (!quarterKey) {
    const now = new Date();
    quarterKey = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  }
  location.hash = `#liste/${quarterKey}`;
}

function parseQuarterArg(arg) {
  if (arg && /^\d{4}-Q[1-4]$/.test(arg)) {
    const [y, qStr] = arg.split('-Q');
    return { year: +y, quarter: +qStr };
  }
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

function isoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function isoWeekYear(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  return d.getFullYear();
}

async function renderListe(main, quarterArg) {
  const { year, quarter } = parseQuarterArg(quarterArg);
  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd   = new Date(year, quarter * 3, 0);

  const QUARTALS_MONATE_LABEL = [
    'Jan. – März', 'Apr. – Jun.', 'Jul. – Sep.', 'Okt. – Dez.'
  ];
  const prevQ = quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
  const nextQ = quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`;
  const moKalStart = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}`;

  main.innerHTML = `
    <div class="liste-wrap">
      <div class="liste-toolbar">
        <div class="liste-nav">
          <button class="btn btn-ghost" onclick="navigateListe('${prevQ}')" aria-label="Vorheriges Quartal">‹</button>
          <span class="liste-title">Q${quarter} ${year} · ${QUARTALS_MONATE_LABEL[quarter - 1]}</span>
          <button class="btn btn-ghost" onclick="navigateListe('${nextQ}')" aria-label="Nächstes Quartal">›</button>
        </div>
        <div class="liste-nav-right">
          <button class="btn btn-ghost" onclick="ICS.open()" title="Im Kalender abonnieren">📅 Abonnieren</button>
          <button class="btn btn-ghost" onclick="navigateListe()">Heute</button>
          <div class="view-toggle">
            <button class="btn btn-ghost" onclick="navigateKalender('${moKalStart}')" title="Kalenderansicht">▦ Kalender</button>
            <button class="btn btn-ghost view-active" title="Quartalsplan">☰ Liste</button>
          </div>
        </div>
      </div>
      <div id="heute-sektion"></div>
      <div id="liste-content" class="liste-loading">Lade Trainingsplan…</div>
    </div>`;

  ladeHeuteSektionInto('heute-sektion');

  let einheiten = [];
  try {
    const d = await apiGet(`einheiten?von=${ymd(qStart)}&bis=${ymd(qEnd)}`, { silent: true });
    einheiten = d.einheiten || [];
  } catch (e) {
    document.getElementById('liste-content').innerHTML =
      `<div class="liste-error">Trainingsplan konnte nicht geladen werden: ${escapeHtml(e.message || '')}</div>`;
    return;
  }

  // Group by ISO calendar week (only days within the quarter)
  const byWeek = new Map(); // "YYYY-WW" → { weekNum, weekStart, items }
  const todayKey = ymd(new Date());

  for (let d = new Date(qStart); d <= qEnd; d.setDate(d.getDate() + 1)) {
    const k = ymd(new Date(d));
    const kw  = isoWeek(new Date(d));
    const wy  = isoWeekYear(new Date(d));
    const wKey = `${wy}-${String(kw).padStart(2, '0')}`;

    if (!byWeek.has(wKey)) {
      const mon = new Date(d);
      const dow = (mon.getDay() + 6) % 7;
      mon.setDate(mon.getDate() - dow);
      byWeek.set(wKey, { weekNum: kw, weekStart: new Date(mon), items: [] });
    }

    const dayItems = einheiten.filter(e => e.datum === k);
    if (dayItems.length) byWeek.get(wKey).items.push(...dayItems);
  }

  const WOCHENTAG_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MONAT_KURZ = ['Jan.','Feb.','März','Apr.','Mai','Jun.','Jul.','Aug.','Sep.','Okt.','Nov.','Dez.'];

  let html = '';
  for (const [, week] of byWeek) {
    if (!week.items.length) continue;

    const ws = week.weekStart;
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    let rangeStr;
    if (ws.getMonth() === we.getMonth()) {
      rangeStr = `${ws.getDate()}. – ${we.getDate()}. ${MONAT_KURZ[ws.getMonth()]} ${ws.getFullYear()}`;
    } else if (ws.getFullYear() === we.getFullYear()) {
      rangeStr = `${ws.getDate()}. ${MONAT_KURZ[ws.getMonth()]} – ${we.getDate()}. ${MONAT_KURZ[we.getMonth()]} ${ws.getFullYear()}`;
    } else {
      rangeStr = `${ws.getDate()}. ${MONAT_KURZ[ws.getMonth()]} ${ws.getFullYear()} – ${we.getDate()}. ${MONAT_KURZ[we.getMonth()]} ${we.getFullYear()}`;
    }

    const rowsHtml = week.items.map(e => {
      const dateObj = new Date(e.datum + 'T00:00:00');
      const dayStr = `${WOCHENTAG_KURZ[dateObj.getDay()]}, ${dateObj.getDate()}. ${MONAT_KURZ[dateObj.getMonth()]}`;
      const isToday = e.datum === todayKey;
      const isCancelled = e.status === 'abgesagt';
      const isKeinTraining = e.typ === 'kein_training';
      const treffpunktName = e.treffpunkt ? (e.treffpunkt.name || e.treffpunkt) : '';
      const typLabel = TYP_LABEL[e.typ] || e.typ;

      const rowCls = [
        'liste-row', `kal-typ-${e.typ}`,
        isToday ? 'is-today' : '',
        isCancelled ? 'is-cancelled' : '',
        isKeinTraining ? 'is-kein-training' : '',
      ].filter(Boolean).join(' ');

      const clickAttr = isKeinTraining ? '' : ` onclick="zeigeEinheit(${e.id})"`;
      const dateHtml = isToday
        ? `<span class="liste-date"><span class="liste-date-today">${escapeHtml(dayStr)}</span></span>`
        : `<span class="liste-date">${escapeHtml(dayStr)}</span>`;

      return `<div class="${rowCls}"${clickAttr}>
        ${dateHtml}
        <span class="liste-time">${e.uhrzeit ? escapeHtml(e.uhrzeit) : '–'}</span>
        <span class="liste-typ-badge liste-typ-${e.typ}">${escapeHtml(typLabel)}</span>
        <span class="liste-title-text">${escapeHtml(e.titel)}</span>
        <span class="liste-ort">${escapeHtml(treffpunktName)}</span>
      </div>`;
    }).join('');

    html += `<div class="liste-week-block">
      <div class="liste-kw-head">
        <span class="liste-kw-badge">KW ${week.weekNum}</span>
        <span class="liste-kw-range">${escapeHtml(rangeStr)}</span>
      </div>
      <div class="liste-rows">${rowsHtml}</div>
    </div>`;
  }

  if (!html) {
    html = '<div class="liste-empty">Keine Trainingseinheiten in diesem Quartal eingetragen.</div>';
  }

  document.getElementById('liste-content').outerHTML =
    `<div id="liste-content" class="liste-content">${html}</div>`;
}

async function zeigeEinheit(id) {
  const cont = document.getElementById('modal-container');
  cont.innerHTML = `<div class="modal-overlay" onclick="schliesseModal(event)"><div class="modal-card"><div class="loading">Lade…</div></div></div>`;
  try {
    const data = await apiGet(`einheiten/${id}`, { silent: true });
    const e = data.einheit;
    const seg = data.segmente || [];
    state._lastEinheit = { einheit: e, segmente: seg };

    // Pace laden wenn eingeloggt und Segmente mit Pace-Referenz vorhanden
    let paceData = null;
    const hatPaceRef = seg.some(s => s.pace_referenz);
    if (state.user && hatPaceRef) {
      paceData = await PACE.load();
    }
    const datum = new Date(e.datum + 'T00:00:00');
    const wochentag = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][datum.getDay()];
    const datStr = `${wochentag}, ${datum.getDate()}. ${MONATSNAMEN[datum.getMonth()]} ${datum.getFullYear()}`;

    const segHtml = seg.length ? `
      <div class="modal-row modal-row-block">
        <span class="modal-label">Segmente</span>
        ${renderSegmentBlocksHtml(seg, paceData, e.typ)}
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
            ${(() => {
              if (!e.komoot_url) return '';
              const embedUrl = komootEmbedUrl(e.komoot_url);
              return `<div class="modal-row modal-row-block">
                <span class="modal-label">Strecke</span>
                ${embedUrl ? `<div class="komoot-embed"><iframe src="${escapeHtml(embedUrl)}" frameborder="0" scrolling="no" allow="fullscreen" loading="lazy"></iframe></div>` : ''}
                <a class="tp-link tp-link-komoot" href="${escapeHtml(e.komoot_url)}" target="_blank" rel="noopener">Auf Komoot ansehen ↗</a>
              </div>`;
            })()}
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

// Extrahiert die Tour-ID aus einer Komoot-URL und gibt die Embed-URL zurück.
// Unterstützt: komoot.com/tour/ID, komoot.com/de-de/tour/ID, etc.
function komootEmbedUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/tour\/(\d+)/);
  return m ? 'https://www.komoot.com/tour/' + m[1] + '/embed?profile=1' : null;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
