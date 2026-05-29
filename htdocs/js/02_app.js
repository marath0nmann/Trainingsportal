// ============================================================
// Trainingsportal – App-Bootstrap
// ============================================================
// - auth/me beim Laden (silent → kein Force-Redirect, App ist öffentlich)
// - Header mit Benutzerdaten (oder Login-Button bei Anonym)
// - Routing per Hash (#kalender, #kalender/2026-04)
// - Default: Monatskalender mit öffentlichen Einheiten
// ============================================================

const state = {
  user:         null,
  tab:          'kalender',
  kalFilter:    null,   // {gruppen:Set, teamplan:bool, meinPlan:bool} | null
  meineGruppen: [],     // [{id, name, farbe}]
};

// ── Drag & Drop (private Einheiten verschieben) ────────────
let _dragPrivatId   = null;  // ID der gerade gezogenen Einheit
let _dragPrivat     = [];    // Referenz auf aktuelle privat[]-Liste (aus renderKalender)
let _wettkampfCache = null;  // { ts: number, data: [] } – Wettkampf-Serien-Cache

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
  // Startseite: Smartphone → Quartalsplan (Liste), Desktop → Kalender
  if (!location.hash || location.hash === '#') {
    location.hash = startHash();
  }
  showApp();
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = '';
  fillUserBadge();
  buildFooter();
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

  applyVersionVisibility(u);

  if (!u) {
    if (userBtn) {
      userBtn.style.display = 'flex';
      userBtn.innerHTML = `<button class="btn-login-header" onclick="goToLoginPortal()">Anmelden</button>`;
    }
    _fillMobileNav(false, false);
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
    // Initialen: Vorname[0]+Nachname[0] wenn beide vorhanden, sonst erster Buchstabe
    const initials = (u.vorname && u.nachname)
      ? (u.vorname.trim()[0] + u.nachname.trim()[0]).toUpperCase()
      : displayName.trim().charAt(0).toUpperCase();
    avatarEl.style.overflow = 'visible';
    avatarEl.style.position = 'relative';
    let avatarInner = '';
    if (u.avatar_pfad) {
      // Avatar liegt im Statistikportal-htdocs; über shared.php ausliefern
      avatarInner = `<img src="${assetUrl(u.avatar_pfad)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`;
    } else {
      avatarInner = `<span style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px">${escapeHtml(initials)}</span>`;
    }
    avatarEl.innerHTML = avatarInner + '<span class="user-online-dot" title="Online"></span>';
  }

  const isAdmin   = u.rolle === 'admin';
  const isTrainer = isAdmin || u.rolle === 'trainer';

  // Hauptnavigation abhängig von der Rolle
  const nav = document.getElementById('main-nav');
  if (nav) {
    nav.innerHTML = `
      <button onclick="navigate('kalender')"${state.tab === 'kalender' ? ' class="active"' : ''}>Kalender</button>
      ${isTrainer ? `<button onclick="navigate('planung')"${state.tab === 'planung' ? ' class="active"' : ''}>Planung</button>` : ''}
      ${isAdmin ? `<button onclick="navigate('admin')"${state.tab === 'admin' ? ' class="active"' : ''}>Admin</button>` : ''}`;
  }

  _fillMobileNav(isTrainer, isAdmin);
}

function _fillMobileNav(isTrainer, isAdmin) {
  const mobileNav = document.getElementById('mobile-nav-items');
  if (!mobileNav) return;
  const u = state.user;
  const act = (tab) => state.tab === tab ? ' active' : '';
  let html = `<button class="mobile-nav-item${act('kalender')}" onclick="navigate('kalender');closeBurgerMenu()">Kalender</button>`;
  if (isTrainer) html += `<button class="mobile-nav-item${act('planung')}" onclick="navigate('planung');closeBurgerMenu()">Planung</button>`;
  if (isAdmin)   html += `<button class="mobile-nav-item${act('admin')}" onclick="navigate('admin');closeBurgerMenu()">Admin</button>`;
  if (u) {
    html += `<button class="mobile-nav-item mobile-nav-profil" onclick="PROFIL.open();closeBurgerMenu()">Profil</button>`;
    html += `<button class="mobile-nav-item mobile-nav-logout" onclick="logout()">Abmelden</button>`;
  } else {
    html += `<button class="mobile-nav-item" onclick="goToLoginPortal()">Anmelden</button>`;
  }
  mobileNav.innerHTML = html;
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

// Startseite: auf dem Smartphone konsequent Listenansicht (aktuelles Quartal),
// auf größeren Bildschirmen der Monatskalender.
function startHash() {
  if (window.innerWidth < 720) {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `#liste/${now.getFullYear()}-Q${q}`;
  }
  return '#kalender';
}
function navigateStart() {
  location.hash = startHash();
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

  // Rechtliches (öffentlich, ohne Login) – vor den Login-Checks behandeln
  if (FOOTER_LEGAL[state.tab]) {
    renderLegalPage(state.tab);
    return;
  }

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
    if (!state.user) { location.replace(startHash()); return; }
    PLANUNG.render(main);
    return;
  }
  if (state.tab === 'treffpunkte') {
    location.replace('#admin/treffpunkte');
    return;
  }
  if (state.tab === 'einstellungen') {
    location.replace('#admin/einstellungen');
    return;
  }
  if (state.tab === 'admin') {
    if (!state.user || state.user.rolle !== 'admin') { location.replace(startHash()); return; }
    renderAdminPage(main, args && args[0]);
    return;
  }

  // Unbekannte Route (z. B. #dashboard / #konto aus Statistikportal-Header)
  // → still auf die Startseite umleiten, statt 404 anzuzeigen
  location.replace(startHash());
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

// ── Admin-Seite mit Sub-Navigation ──────────────────────────
function renderAdminPage(main, subTab) {
  const tab = subTab || 'system';

  main.innerHTML = `
    <div style="max-width:1400px;margin:0 auto;padding:16px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;border-bottom:2px solid var(--border);padding-bottom:10px">
        <button class="btn btn-ghost${tab === 'system' ? ' active' : ''}"
          onclick="navigateAdmin('system')">&#x1F5A5;&#xFE0E; System</button>
        <button class="btn btn-ghost${tab === 'einstellungen' ? ' active' : ''}"
          onclick="navigateAdmin('einstellungen')">Einstellungen</button>
        <button class="btn btn-ghost${tab === 'trainings' ? ' active' : ''}"
          onclick="navigateAdmin('trainings')">Trainings</button>
        <button class="btn btn-ghost${tab === 'wettkampf' ? ' active' : ''}"
          onclick="navigateAdmin('wettkampf')">Wettkämpfe</button>
        <button class="btn btn-ghost${tab === 'treffpunkte' ? ' active' : ''}"
          onclick="navigateAdmin('treffpunkte')">Treffpunkte</button>
      </div>
      <div id="admin-content"></div>
    </div>`;

  const contentEl = document.getElementById('admin-content');
  if (tab === 'system') {
    renderAdminSystem(contentEl);
  } else if (tab === 'trainings') {
    ADMIN_TRAININGS.render(contentEl);
  } else if (tab === 'wettkampf') {
    ADMIN_WETTKAMPF.render(contentEl);
  } else if (tab === 'treffpunkte') {
    TREFFPUNKTE.render(contentEl);
  } else {
    SETTINGS.render(contentEl);
  }
}

function navigateAdmin(subTab) {
  location.hash = '#admin/' + subTab;
}

// ============================================================
// Footer (1:1 aus dem Statistikportal übernommen)
// ------------------------------------------------------------
// Datengetrieben über die gemeinsame `einstellungen`-Tabelle:
//   footer_*_url  → externe Linkziele (optional)
//   footer_*_text → Markdown der Rechtsseiten (mit Default-Fallback)
// Beide Portale teilen sich diese Keys.
// ============================================================
var FOOTER_DEFAULT_DS  = "# Datenschutzerklärung\n\n**Stand: 2026**\n\n## 1. Verantwortlicher\nVerantwortlich für diese Anwendung ist der Verein [Vereinsname]\n\n## 2. Erhobene Daten\nDiese Anwendung verarbeitet ausschließlich Daten, die zur Darstellung von Leichtathletik-Ergebnissen und Vereinsstatistiken erforderlich sind:\n- Athleten-Namen und Wettkampfergebnisse (öffentlich zugänglich)\n- Benutzerdaten registrierter Nutzer (Name, E-Mail-Adresse) zur Authentifizierung\n\n## 3. Keine Weitergabe an Dritte\nPersonenbezogene Daten werden nicht an Dritte weitergegeben.\n\n## 4. Hosting\nDie Anwendung wird auf Servern von all-inkl.com (ALL-INKL.COM – Neue Medien Münnich) in Deutschland betrieben.\n\n## 5. Kontakt\nBei Fragen zur Datenverarbeitung wenden Sie sich bitte an die Vereinsverantwortlichen.";
var FOOTER_DEFAULT_NU  = "# Nutzungsbedingungen\n\n**Stand: 2026**\n\n## 1. Nutzung\nDiese Anwendung dient der internen Vereinsstatistik des [Vereinsname] Die Nutzung ist Vereinsmitgliedern und autorisierten Personen vorbehalten.\n\n## 2. Inhalte\nDie dargestellten Ergebnisse und Athletendaten sind vereinseigene Daten. Eine Weiterverwendung oder Veröffentlichung bedarf der Genehmigung des Vereins.\n\n## 3. Technische Verfügbarkeit\nDer Betreiber übernimmt keine Gewähr für die ständige Verfügbarkeit der Anwendung.\n\n## 4. Änderungen\nDiese Nutzungsbedingungen können jederzeit angepasst werden.";
var FOOTER_DEFAULT_IMP = "# Impressum\n\n**Angaben gemäß § 5 TMG**\n\n[Vereinsname] – Leichtathletik-Abteilung\n\n*Bitte vervollständigen Sie das Impressum mit Ihrer Vereinsanschrift und einem Verantwortlichen.*\n\n## Kontakt\nE-Mail: [Ihre E-Mail-Adresse]\n\n## Vereinsregister\nEingetragen im Vereinsregister.\nRegistergericht: [Ihr Registergericht]\n\n## Inhaltlich Verantwortlicher\n[Name des Verantwortlichen gemäß § 55 Abs. 2 RStV]";

var FOOTER_LEGAL = {
  datenschutz: { titel: 'Datenschutz',          urlKey: 'footer_datenschutz_url', textKey: 'footer_datenschutz_text', def: FOOTER_DEFAULT_DS },
  nutzung:     { titel: 'Nutzungsbedingungen',  urlKey: 'footer_nutzung_url',      textKey: 'footer_nutzung_text',     def: FOOTER_DEFAULT_NU },
  impressum:   { titel: 'Impressum',            urlKey: 'footer_impressum_url',    textKey: 'footer_impressum_text',   def: FOOTER_DEFAULT_IMP },
};

function buildFooter() {
  var el = document.getElementById('app-footer');
  if (!el) return;
  var cfg = window.appConfig || {};
  var ghUrl = 'https://github.com/marath0nmann/Trainingsportal';
  var authorUrl = 'https://webdev.danielweyers.de';
  var linkStyle = 'color:inherit;text-decoration:underline;text-underline-offset:2px;opacity:.7;';
  // Externe URL (neuer Tab) oder interne Hash-Route als Fallback
  function footerLink(type, label) {
    var url = cfg[FOOTER_LEGAL[type].urlKey] || '';
    if (url) {
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" style="' + linkStyle + '">' + label + '</a>';
    }
    return '<a href="#' + type + '" style="' + linkStyle + '">' + label + '</a>';
  }
  var legalLine = footerLink('datenschutz', 'Datenschutz') + ' &nbsp;&middot;&nbsp; ' +
                  footerLink('nutzung',     'Nutzungsbedingungen') + ' &nbsp;&middot;&nbsp; ' +
                  footerLink('impressum',   'Impressum');
  el.innerHTML =
    '<div>Powered by <a href="' + ghUrl + '" target="_blank" rel="noopener" style="' + linkStyle + '">Trainingsportal</a> &copy; 2026 <a href="' + authorUrl + '" target="_blank" rel="noopener" style="' + linkStyle + '">Daniel Weyers</a></div>' +
    '<div>' + legalLine + '</div>';
}

function renderLegalPage(type) {
  var meta = FOOTER_LEGAL[type];
  if (!meta) { location.replace(startHash()); return; }
  var cfg = window.appConfig || {};
  var text = cfg[meta.textKey] || meta.def || '';
  // Einfaches Markdown → HTML (h1, h2, bold, italic, Listen)
  function mdToHtml(md) {
    var lines = String(md).split('\n');
    var out = [];
    var inUl = false;
    for (var li = 0; li < lines.length; li++) {
      var l = lines[li].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (l.match(/^# /)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        out.push('<h1 style="font-size:22px;font-weight:700;margin:16px 0 10px;color:var(--primary)">' + l.slice(2) + '</h1>');
      } else if (l.match(/^## /)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        out.push('<h2 style="font-size:16px;font-weight:700;margin:20px 0 6px;color:var(--text)">' + l.slice(3) + '</h2>');
      } else if (l.match(/^- /)) {
        if (!inUl) { out.push('<ul style="margin:8px 0 8px 20px">'); inUl = true; }
        out.push('<li style="margin:4px 0">' + l.slice(2) + '</li>');
      } else {
        if (inUl) { out.push('</ul>'); inUl = false; }
        out.push(l === '' ? '<br>' : '<p style="margin:6px 0">' + l + '</p>');
      }
    }
    if (inUl) out.push('</ul>');
    return out.join('\n')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }
  var html = '<p style="margin:8px 0">' + mdToHtml(text) + '</p>';
  var isAdmin = state.user && state.user.rolle === 'admin';
  var main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML =
    '<div style="max-width:720px;margin:0 auto;padding:16px">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">' +
        '<button class="btn btn-ghost btn-sm" onclick="history.back()" style="white-space:nowrap">&#x2190; Zurück</button>' +
        (isAdmin ? '<button class="btn btn-ghost btn-sm" onclick="editLegalPage(&quot;' + type + '&quot;)" style="white-space:nowrap">&#x270F;&#xFE0E; Bearbeiten</button>' : '') +
      '</div>' +
      '<div class="panel" style="padding:28px 32px">' + html + '</div>' +
    '</div>';
}

function editLegalPage(type) {
  var meta = FOOTER_LEGAL[type];
  if (!meta) return;
  var cfg = window.appConfig || {};
  var current = cfg[meta.textKey] || meta.def || '';
  var cont = document.getElementById('modal-container');
  if (!cont) return;
  cont.innerHTML =
    '<div class="modal-overlay" onclick="schliesseModal(event)">' +
      '<div class="modal-card" onclick="event.stopPropagation()">' +
        '<div class="modal-head">' +
          '<div><div class="modal-title">' + escapeHtml(meta.titel) + ' bearbeiten</div></div>' +
          '<button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<p style="font-size:12px;color:var(--text2);margin:0 0 12px">Markdown wird unterstützt: # Überschrift, ## Unterüberschrift, **fett**, *kursiv*, - Liste</p>' +
          '<textarea id="legal-edit-ta" style="width:100%;height:360px;box-sizing:border-box;padding:12px;border:1.5px solid var(--border);border-radius:8px;font-family:monospace;font-size:13px;background:var(--surf2);color:var(--text);resize:vertical">' + escapeHtml(current) + '</textarea>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>' +
            '<button class="btn btn-ghost" onclick="resetLegalPage(&quot;' + type + '&quot;)">&#x21BA; Standard</button>' +
            '<button class="btn btn-primary" onclick="saveLegalPage(&quot;' + type + '&quot;)">&#x1F4BE; Speichern</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

async function saveLegalPage(type) {
  var meta = FOOTER_LEGAL[type];
  var ta = document.getElementById('legal-edit-ta');
  if (!meta || !ta) return;
  var payload = { werte: {} };
  payload.werte[meta.textKey] = ta.value;
  try {
    await apiPut('admin/settings', payload);
    window.appConfig[meta.textKey] = ta.value;
    schliesseModal();
    benachrichtigen('Gespeichert.', 'ok');
    renderLegalPage(type);
  } catch (e) {
    benachrichtigen('Fehler: ' + (e.message || ''), 'err');
  }
}

function resetLegalPage(type) {
  var meta = FOOTER_LEGAL[type];
  var ta = document.getElementById('legal-edit-ta');
  if (meta && ta) ta.value = meta.def || '';
}

// ============================================================
// Kalender (Monatsansicht, 1 Woche = 1 Zeile, Mo–So)
// ============================================================

const MONATSNAMEN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const WOCHENTAGE  = ['Mo','Di','Mi','Do','Fr','Sa','So'];

// Fallback-Typen wenn appConfig noch nicht geladen (vollständige Flags)
const FALLBACK_TYPEN = [
  { slug: 'intervall',     bezeichnung: 'Intervall',              farbe: null, fallback_km: null, ist_kein_training: false, hat_strecke: false },
  { slug: 'dauerlauf',     bezeichnung: 'Dauerlauf',              farbe: null, fallback_km: null, ist_kein_training: false, hat_strecke: false },
  { slug: 'funktionell',   bezeichnung: 'Funktionelles Training', farbe: null, fallback_km: null, ist_kein_training: false, hat_strecke: false },
  { slug: 'runde',         bezeichnung: 'Runde / Strecke',        farbe: null, fallback_km: null, ist_kein_training: false, hat_strecke: true  },
  { slug: 'event',         bezeichnung: 'Event / Wettkampf',      farbe: null, fallback_km: null, ist_kein_training: false, hat_strecke: false },
  { slug: 'frei',          bezeichnung: 'Sonstiges',              farbe: null, fallback_km: null, ist_kein_training: false, hat_strecke: false },
  { slug: 'kein_training', bezeichnung: 'Kein Training',          farbe: null, fallback_km: null, ist_kein_training: true,  hat_strecke: false },
];

// Globale Typ-Helfer (genutzt von allen Modulen)
function getTypen() {
  const t = window.appConfig && window.appConfig.typen;
  return (Array.isArray(t) && t.length) ? t : FALLBACK_TYPEN;
}
function getTypLabel(typ) {
  const t = getTypen().find(x => x.slug === typ);
  return t ? t.bezeichnung : typ;
}
function hatStrecke(typ) {
  const t = getTypen().find(x => x.slug === typ);
  return t ? !!t.hat_strecke : typ === 'runde';
}
function istKeinTraining(typ) {
  const t = getTypen().find(x => x.slug === typ);
  return t ? !!t.ist_kein_training : typ === 'kein_training';
}

// Typ-Bezeichnung: zuerst aus appConfig.typen (Admin-konfiguriert), dann TYP_LABEL, dann Slug
function getTypLabel(typ) {
  const typen = window.appConfig && Array.isArray(window.appConfig.typen) ? window.appConfig.typen : [];
  const t = typen.find(x => x.slug === typ);
  if (t) return t.bezeichnung;
  return TYP_LABEL[typ] || typ;
}

// Effektive Distanz einer privaten Einheit:
// - expliziter Wert (inkl. 0) wird direkt genutzt
// - null → Fallback-km aus der Typen-Konfiguration (oder null wenn kein Fallback)
function _effektivKm(e) {
  let km = null;
  if (e.distanz_km !== null && e.distanz_km !== undefined) {
    km = parseFloat(e.distanz_km);
  } else {
    const typen = (window.appConfig && Array.isArray(window.appConfig.typen)) ? window.appConfig.typen : [];
    const t = typen.find(x => x.slug === e.typ);
    km = (t && t.fallback_km != null) ? parseFloat(t.fallback_km) : null;
  }
  // Anreise-km hinzurechnen (sofern WEG-Modul geladen und Präferenz vorhanden)
  if (km !== null && typeof WEG !== 'undefined') {
    const wkm = WEG.wegKm(e);
    if (wkm != null) km += wkm;
  }
  return km;
}

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

function _isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function renderKalender(main, monthArg) {
  const monthStart = parseMonthArg(monthArg);
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();

  const firstDay  = new Date(y, m, 1);
  const dow0      = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(y, m, 1 - dow0);
  const lastDay   = new Date(y, m + 1, 0);
  const dowLast   = (lastDay.getDay() + 6) % 7;
  const gridEnd   = new Date(y, m + 1, 6 - dowLast);
  const prev      = new Date(y, m - 1, 1);
  const next      = new Date(y, m + 1, 1);
  const todayKey  = ymd(new Date());
  const angemeldet = !!state.user;

  main.innerHTML = `
    <div class="kal-wrap">
      <div id="pace-warn-sektion"></div>
      <div id="heute-sektion"></div>
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
            <button class="btn btn-ghost" onclick="navigateListe()" title="Quartalsplan (aktuelles Quartal)">☰ Liste</button>
          </div>
        </div>
      </div>
      <div id="kal-grid" class="kal-loading">Lade Trainingsplan…</div>
      <div id="wettkampf-sektion"></div>
    </div>`;

  ladeGlobalePaceWarnung('pace-warn-sektion');
  ladeHeuteSektionInto('heute-sektion');
  ladeWettkampfSektionInto('wettkampf-sektion');

  const von = ymd(gridStart);
  const bis = ymd(gridEnd);
  let oeffentlich = [], privat = [], feiertage = [], wettkampfRaw = [];
  let termineRaw = [], statistikUrlKal = '';
  try {
    const needPrefs = angemeldet && state.kalFilter === null;
    const [d1, d2, d3, d4, d5] = await Promise.all([
      angemeldet
        ? apiGet(`mein-plan/einheiten?von=${von}&bis=${bis}`, { silent: true })
        : apiGet(`einheiten?von=${von}&bis=${bis}`, { silent: true }),
      apiGet(`feiertage?von=${von}&bis=${bis}`, { silent: true }).catch(() => ({ feiertage: [] })),
      needPrefs ? apiGet('kal/prefs', { silent: true }).catch(() => ({ prefs: null })) : Promise.resolve({ prefs: null }),
      _ladeWettkampfDaten().catch(() => []),
      _ladeWettkampfTermine(von, bis).catch(() => ({ termine: [], statistikportal_url: '' })),
    ]);
    oeffentlich    = d1.einheiten || [];
    privat         = angemeldet ? (d1.privat || []) : [];
    _dragPrivat    = privat;   // Referenz für Drag&Drop-Handler
    feiertage      = d2.feiertage || [];
    wettkampfRaw   = Array.isArray(d4) ? d4 : [];
    termineRaw     = d5.termine || [];
    statistikUrlKal = d5.statistikportal_url || _statistikportalUrl || '';
    if (angemeldet) {
      MEINPLAN.setAbo(d1.abo_typen || []);
      state.meineGruppen = d1.meine_gruppen || [];
      if (state.kalFilter === null) {
        state.kalFilter = _initKalFilter(state.meineGruppen.map(g => g.id), d3.prefs);
      }
      if (d3.farben && typeof d3.farben === 'object') kalFarbenUser = d3.farben;
      applyKalenderFarben(state.meineGruppen.map(g => 'g' + g.id));
    }
  } catch (e) {
    const g = document.getElementById('kal-grid');
    if (g) g.innerHTML = `<div class="kal-error">Trainingsplan konnte nicht geladen werden: ${escapeHtml(e.message || '')}</div>`;
    return;
  }

  // WEG vorladen damit _effektivKm die Anreise-km einrechnen kann
  if (angemeldet && typeof WEG !== 'undefined') await WEG.load();

  // byDate: datum → [ {..., _privat: bool}, ... ]
  // Bereits übernommene öffentliche Einheiten werden ausgeblendet (die private Kopie vertritt sie)
  const adoptedIds = new Set(
    privat.filter(p => p.ref_einheit_id != null).map(p => p.ref_einheit_id)
  );

  // Kalender-Filter anwenden
  const kf = state.kalFilter;
  const hatGruppen = angemeldet && state.meineGruppen.length > 0;
  const oeffentlichGefiltert = oeffentlich.filter(e => {
    if (!angemeldet || !kf) return true;
    if (hatGruppen) {
      // Einträge ohne Gruppe → immer sichtbar (allgemein)
      if (e.gruppe_id == null) return kf.gruppen.size > 0;
      return kf.gruppen.has(e.gruppe_id);
    }
    return kf.teamplan !== false;
  });
  const privatGefiltert = (!angemeldet || !kf || kf.meinPlan !== false) ? privat : [];

  const byDate = {};
  oeffentlichGefiltert.forEach(e => {
    if (adoptedIds.has(e.id)) return;      // private Kopie vorhanden → Team-Eintrag ausblenden
    (byDate[e.datum] = byDate[e.datum] || []).push({ ...e, _privat: false });
  });
  privatGefiltert.forEach(e => { (byDate[e.datum] = byDate[e.datum] || []).push({ ...e, _privat: true }); });
  Object.values(byDate).forEach(arr =>
    arr.sort((a, b) => a._privat !== b._privat ? (a._privat ? 1 : -1) : (a.uhrzeit || '99:99').localeCompare(b.uhrzeit || '99:99'))
  );

  const feiertageByDate = {};
  feiertage.forEach(f => {
    const start = new Date(f.datum + 'T00:00:00');
    const end   = new Date((f.datum_bis || f.datum) + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = ymd(d);
      (feiertageByDate[k] = feiertageByDate[k] || []).push(f);
    }
  });

  // Wettkampf-Termine: predicted/manuelles Datum → Array von Serien
  // Befülle globale Map datum → [{id, bemerkung, titel}] für Popover-Toggle-Logik + Serien-Zuordnung
  _wkPrivatMap = {};
  privatGefiltert.filter(e => e.typ === 'wettkampf').forEach(e => {
    (_wkPrivatMap[e.datum] = _wkPrivatMap[e.datum] || []).push({ id: e.id, bemerkung: e.bemerkung || null, titel: e.titel || '' });
  });
  const wettkampfSerien  = wettkampfRaw;
  const wettkampfBeiDatum  = {}; // für Forecast-Chips (gefiltert)
  const wkSerieDatumMap    = {}; // datum → [serien] für ALLE aktiven (für persönliche WK-Einträge)
  const _heute = ymd(new Date());
  if (typeof ADMIN_WETTKAMPF !== 'undefined') {
    wettkampfSerien.forEach(s => {
      if (s.aktiv === 0) return; // Deaktivierte Wettkämpfe ausblenden
      // Vergangenes manuelles Datum ignorieren → Prognose verwenden
      const manuell = s.naechstes_datum && s.naechstes_datum >= _heute ? s.naechstes_datum : null;
      const datum   = manuell || ADMIN_WETTKAMPF.predictNextDate(s.letztes_datum);
      if (datum) (wkSerieDatumMap[datum] = wkSerieDatumMap[datum] || []).push(s);
      // Doppeleintrag nur unterdrücken wenn ein privater Eintrag für genau diese Serie existiert
      const sNorm = _decodeHtml(s.name || s.kuerzel || '');
      if ((_wkPrivatMap[datum] || []).some(ev => (ev.titel || '').startsWith('🏆 ' + sNorm))) return;
      if (datum && datum >= von && datum <= bis) {
        (wettkampfBeiDatum[datum] = wettkampfBeiDatum[datum] || []).push(s);
      }
    });
  }

  // Historische Wettkampf-Termine (vergangene Veranstaltungen aus Statistikportal)
  const histByDate = {};
  termineRaw.forEach(t => {
    if (t.datum <= _heute) {
      (histByDate[t.datum] = histByDate[t.datum] || []).push(t);
    }
  });

  // Wochen (für KW-Spalte)
  const weeks = [];
  {
    let cur = new Date(gridStart);
    while (cur <= gridEnd) {
      const ws = new Date(cur);
      const dates = [];
      for (let i = 0; i < 7; i++) { dates.push(ymd(new Date(cur))); cur.setDate(cur.getDate() + 1); }
      const kw = _isoWeek(ws);
      const kmSum = Math.round(dates.reduce((s, d) =>
        s + (byDate[d] || []).filter(e => e._privat)
                              .reduce((ss, e) => { const km = _effektivKm(e); return ss + (km !== null ? km : 0); }, 0), 0) * 10) / 10;
      weeks.push({ dates, kw, kmSum });
    }
  }

  // Header: KW-Zelle + Wochentage (nur für angemeldete Nutzer)
  const head = angemeldet
    ? `<div class="kal-head">
        <div class="kal-head-cell meinplan-kw-head-cell">KW</div>
        ${WOCHENTAGE.map(w => `<div class="kal-head-cell">${w}</div>`).join('')}
       </div>`
    : `<div class="kal-head">${WOCHENTAGE.map(w => `<div class="kal-head-cell">${w}</div>`).join('')}</div>`;

  const rows = weeks.map(({ dates, kw, kmSum }) => {
    const kwCell = angemeldet ? `<div class="meinplan-kw-cell">
      <span class="meinplan-kw-num">KW&nbsp;${kw}</span>
      <span class="meinplan-kw-km${kmSum > 0 ? ' has-km' : ''}">${kmSum > 0 ? (kmSum % 1 === 0 ? kmSum : kmSum.toFixed(1)) + 'km' : '–'}</span>
    </div>` : '';

    const cells = dates.map(k => {
      const d = new Date(k + 'T00:00:00');
      const inMonth = d.getMonth() === m;
      const isToday = k === todayKey;
      const items   = byDate[k] || [];
      const ferien  = feiertageByDate[k] || [];

      const dayCls = ['kal-cell',
        inMonth ? 'in-month' : 'out-month',
        isToday ? 'is-today' : '',
        (d.getDay() === 0 || d.getDay() === 6) ? 'weekend' : '',
        ferien.length ? 'is-feiertag' : '',
      ].filter(Boolean).join(' ');

      const ferienHtml = ferien.map(f => {
        const s = f.farbe ? ` style="background:${escapeHtml(f.farbe)};color:#fff"` : '';
        return `<div class="kal-feiertag" title="${escapeHtml(f.titel)}"${s}>${escapeHtml(f.titel)}</div>`;
      }).join('');

      const itemsHtml = items.map(e => {
        if (e._privat) {
          const _ekm = _effektivKm(e);
          const _isFallback = _ekm !== null && (e.distanz_km === null || e.distanz_km === undefined);
          const kmBadge = (_ekm !== null && _ekm > 0)
            ? `<span class="kal-item-km${_isFallback ? ' is-fallback-km' : ''}">${_ekm % 1 === 0 ? _ekm : _ekm.toFixed(1)}km</span>`
            : '';

          // ── Persönliche Wettkampf-Teilnahme: Hover-Popover, kein Drag ──
          if (e.typ === 'wettkampf') {
            // Serie anhand des Titelprefix zuordnen – bei mehreren Serien am selben Tag korrekte wählen
            const _privTitel = e.titel || '';
            const wkSerie = (wkSerieDatumMap[e.datum] || []).find(s => {
              const sn = _decodeHtml(s.name || s.kuerzel || '');
              return _privTitel.startsWith('🏆 ' + sn);
            }) || (wkSerieDatumMap[e.datum] || [])[0] || null;
            const sid     = wkSerie ? wkSerie.id : null;
            const hAttr   = sid
              ? `onmouseenter="clearTimeout(_wkHideTimer);_wkPopoverShow(${sid},this)" onmouseleave="_wkHideTimer=setTimeout(_wkPopoverHide,180)"`
              : '';
            return `<div class="kal-item kal-cal-${kalKeyFor(e)} is-privat" data-privat-id="${e.id}"
                         ${sid ? `data-serie-id="${sid}"` : ''} ${hAttr}>
              <span class="kal-item-title">${escapeHtml(e.titel)}</span>
              ${kmBadge}
              <button class="kal-item-del" onclick="event.stopPropagation();MEINPLAN.loeschePrivat(${e.id})" title="Löschen">×</button>
            </div>`;
          }

          const cls = `kal-item kal-cal-${kalKeyFor(e)} is-privat`;
          // Aus Team-Eintrag übernommen → normales Detail-Modal; eigener Eintrag → Edit-Modal
          const clickFn = e.ref_einheit_id
            ? `zeigeEinheit(${e.ref_einheit_id})`
            : `MEINPLAN.bearbeitePrivat(${e.id})`;
          const timeHtml = e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : '';
          // Übernommene Einheiten bekommen data-einheit-id (ref) → Popover wie beim Team-Eintrag
          const adoptedAttr = e.ref_einheit_id
            ? `data-einheit-id="${e.ref_einheit_id}" data-is-adopted="1"`
            : '';
          const dragAttr = !e.ref_einheit_id
            ? `draggable="true" ondragstart="_kalDragStart(${e.id},event)" ondragend="_kalDragEnd(event)"`
            : '';
          return `<div class="${cls}" data-privat-id="${e.id}" ${adoptedAttr} ${dragAttr}
                       onclick="${clickFn}">
            ${timeHtml}<span class="kal-item-title">${escapeHtml(e.titel)}</span>
            ${kmBadge}
            <button class="kal-item-del" onclick="event.stopPropagation();MEINPLAN.loeschePrivat(${e.id})" title="Löschen">×</button>
          </div>`;
        }
        const cls = `kal-item kal-cal-${kalKeyFor(e)}${e.status === 'abgesagt' ? ' is-cancelled' : ''}`;
        const time = e.uhrzeit ? `<span class="kal-item-time">${escapeHtml(e.uhrzeit)}</span>` : '';
        return `<div class="${cls}" data-einheit-id="${e.id}" onclick="zeigeEinheit(${e.id})">${time}<span class="kal-item-title">${escapeHtml(e.titel)}</span></div>`;
      }).join('');

      // Wettkampf-Einträge für diesen Tag
      const wkItems = wettkampfBeiDatum[k] || [];
      const showWk  = !kf || kf.wettkampf !== false;
      const wkHtml  = (showWk && wkItems.length)
        ? wkItems.map(s => {
            const name   = _decodeHtml(s.name || s.kuerzel || '');
            const isFest = !!(s.naechstes_datum && s.naechstes_datum >= _heute);
            const emoji  = isFest ? '🏆' : '❓';
            const hint   = isFest ? ' (fester Termin)' : ' (Prognosedatum – noch nicht bestätigt)';
            const canAdd = !!state.user;
            return `<div class="kal-item kal-cal-wettkampf is-privat" data-serie-id="${s.id}"
              style="cursor:${canAdd ? 'pointer' : 'default'}"
              ${canAdd ? `onmouseenter="clearTimeout(_wkHideTimer);_wkPopoverShow(${s.id},this)" onmouseleave="_wkHideTimer=setTimeout(_wkPopoverHide,180)"` : ''}>
              <span class="kal-item-title">${emoji} ${escapeHtml(name)}</span>
            </div>`;
          }).join('')
        : '';

      const addBtn = (angemeldet && inMonth)
        ? `<button class="kal-add-btn" onclick="MEINPLAN.neuePrivatEinheit('${k}')" title="Private Einheit hinzufügen">+</button>`
        : '';

      return `<div class="${dayCls}" data-datum="${k}"
               ondragover="_kalDragOver(event)" ondragleave="_kalDragLeave(event)" ondrop="_kalDrop(event)">
        <div class="kal-cell-head">
          <span class="kal-day-num">${d.getDate()}</span>
          ${addBtn}
        </div>
        ${ferienHtml ? `<div class="kal-feiertag-list">${ferienHtml}</div>` : ''}
        <div class="kal-cell-items">${_histHtml(histByDate[k], statistikUrlKal)}${itemsHtml}${wkHtml}</div>
      </div>`;
    }).join('');

    return `<div class="kal-row">${kwCell}${cells}</div>`;
  }).join('');

  const gridCls = angemeldet ? 'kal-grid meinplan-kal-grid' : 'kal-grid';
  const legendHtml = angemeldet ? _renderKalLegend() : '';
  // Vorherige Legende(n) entfernen – outerHTML ersetzt nur #kal-grid,
  // nicht dessen Geschwister-Elemente, sodass sich .kal-legend bei jedem Render aufaddieren würde.
  document.querySelectorAll('#kal-grid ~ .kal-legend').forEach(el => el.remove());
  document.getElementById('kal-grid').outerHTML =
    `<div id="kal-grid" class="${gridCls}">${head}${rows}</div>${legendHtml}`;

  if (typeof KAL_POPOVER !== 'undefined') {
    KAL_POPOVER.initItems(document.querySelectorAll('#kal-grid .kal-item[data-einheit-id]'));
  }

  // Neu rendern, nachdem _wkPrivatMap befüllt ist → korrekte Aktiv-Zustände der Karten-Buttons
  ladeWettkampfSektionInto('wettkampf-sektion');
}

// ── Kalender-Filter: Initialisierung ───────────────────
function _initKalFilter(gruppenIds, serverPrefs) {
  const filter = {
    gruppen:   new Set(gruppenIds),
    teamplan:  true,
    meinPlan:  true,
    wettkampf: true,
  };
  if (serverPrefs && typeof serverPrefs === 'object') {
    if (Array.isArray(serverPrefs.gruppen)) {
      filter.gruppen = new Set(serverPrefs.gruppen.filter(id => gruppenIds.includes(id)));
    }
    if (typeof serverPrefs.teamplan  === 'boolean') filter.teamplan  = serverPrefs.teamplan;
    if (typeof serverPrefs.meinPlan  === 'boolean') filter.meinPlan  = serverPrefs.meinPlan;
    if (typeof serverPrefs.wettkampf === 'boolean') filter.wettkampf = serverPrefs.wettkampf;
  }
  return filter;
}

// ── Kalender-Legend (Checkboxen + Farbwähler) ───────────
// Jeder Kalender hat einen Farb-Swatch (input type=color); der Athlet
// kann die Farbe für sich überschreiben. Ist eine eigene Farbe gesetzt,
// erscheint ein Zurücksetzen-Knopf (↺), der auf die Vorgabe zurückführt.
function _legendItem(key, checked, label, toggleAttr) {
  const farbe       = kalFarbe(key);
  const cbId        = 'kal-cb-' + kalKeyCss(key);
  const hasOverride = !!kalFarbenUser[key];
  const resetBtn = hasOverride
    ? `<button type="button" class="kal-legend-reset" title="Eigene Farbe löschen – zurück zur Vorgabe"
        onclick="return resetKalFarbe(event, '${key}')">↺</button>`
    : '';
  return `<span class="kal-legend-item">
    <input type="checkbox" id="${cbId}" ${checked ? 'checked' : ''} ${toggleAttr}>
    <input type="color" class="kal-legend-color${hasOverride ? ' has-override' : ''}" value="${farbe}"
      title="Kalenderfarbe für dich ändern${hasOverride ? ' · Rechtsklick: auf Vorgabe zurücksetzen' : ''}"
      onchange="setKalFarbe('${key}', this.value)"
      oncontextmenu="return resetKalFarbe(event, '${key}')">
    ${resetBtn}
    <label for="${cbId}" class="kal-legend-name">${escapeHtml(label)}</label>
  </span>`;
}

function _renderKalLegend() {
  const kf      = state.kalFilter;
  const gruppen = state.meineGruppen || [];
  let items;
  if (!gruppen.length) {
    items = [
      _legendItem('teamplan',  kf && kf.teamplan  !== false, 'Teamplan',   `onchange="toggleKalPlan('teamplan', this.checked)"`),
      _legendItem('meinplan',  !kf || kf.meinPlan  !== false, 'Mein Plan',  `onchange="toggleKalPlan('meinPlan', this.checked)"`),
      _legendItem('wettkampf', !kf || kf.wettkampf !== false, 'Wettkämpfe', `onchange="toggleKalPlan('wettkampf', this.checked)"`),
    ];
  } else {
    items = gruppen.map(g =>
      _legendItem('g' + g.id, !!(kf && kf.gruppen.has(g.id)), g.name,
        `onchange="toggleKalPlan('gruppe', ${g.id}, this.checked)"`));
    items.push(
      _legendItem('meinplan',  !kf || kf.meinPlan  !== false, 'Mein Plan',  `onchange="toggleKalPlan('meinPlan', false, this.checked)"`),
      _legendItem('wettkampf', !kf || kf.wettkampf !== false, 'Wettkämpfe', `onchange="toggleKalPlan('wettkampf', this.checked)"`),
    );
  }
  return `<div class="kal-legend">${items.join('')}</div>`;
}

// ── Persönliche Kalenderfarbe setzen / zurücksetzen ──────
// Legende an Ort und Stelle neu zeichnen (Swatch-Wert + ↺-Knopf aktualisieren).
function _refreshKalLegend() {
  document.querySelectorAll('.kal-legend').forEach(el => { el.outerHTML = _renderKalLegend(); });
}
let _kalFarbenSaveTimer = null;
function setKalFarbe(key, hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  kalFarbenUser[key] = hex.toLowerCase();
  applyKalenderFarben((state.meineGruppen || []).map(g => 'g' + g.id));
  _saveKalFarben();
  _refreshKalLegend();
}
function resetKalFarbe(ev, key) {
  if (ev) ev.preventDefault();
  if (kalFarbenUser[key]) {
    delete kalFarbenUser[key];
    applyKalenderFarben((state.meineGruppen || []).map(g => 'g' + g.id));
    _saveKalFarben();
    _refreshKalLegend();
  }
  return false;
}
function _saveKalFarben() {
  if (!state.user) return;
  clearTimeout(_kalFarbenSaveTimer);
  _kalFarbenSaveTimer = setTimeout(async () => {
    try { await apiPut('kal/farben', kalFarbenUser); } catch (_) {}
  }, 600);
}

// ── Filter-Toggle (aus Checkbox-onchange aufgerufen) ─────
let _kalPrefsSaveTimer = null;
function toggleKalPlan(type, idOrChecked, checkedMaybe) {
  if (!state.kalFilter) return;
  if (type === 'teamplan') {
    state.kalFilter.teamplan = !!idOrChecked;
  } else if (type === 'gruppe') {
    const checked = !!checkedMaybe;
    if (checked) state.kalFilter.gruppen.add(idOrChecked);
    else         state.kalFilter.gruppen.delete(idOrChecked);
  } else if (type === 'meinPlan') {
    const checked = checkedMaybe !== undefined ? !!checkedMaybe : !!idOrChecked;
    state.kalFilter.meinPlan = checked;
  } else if (type === 'wettkampf') {
    state.kalFilter.wettkampf = !!idOrChecked;
  }
  renderPage();
  clearTimeout(_kalPrefsSaveTimer);
  _kalPrefsSaveTimer = setTimeout(_saveKalPrefs, 1000);
}

async function _saveKalPrefs() {
  if (!state.user || !state.kalFilter) return;
  try {
    const f = state.kalFilter;
    await apiPut('kal/prefs', {
      gruppen:   [...f.gruppen],
      teamplan:  f.teamplan,
      meinPlan:  f.meinPlan,
      wettkampf: f.wettkampf !== false,
    });
  } catch (_) {}
}

function _osmStaticMapHtml(lat, lng) {
  const zoom = 14, TILE = 256, GRID = 3;
  const n    = Math.pow(2, zoom);
  const cx   = (lng + 180) / 360 * n;
  const latR = lat * Math.PI / 180;
  const cy   = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
  const tx0  = Math.floor(cx) - 1;
  const ty0  = Math.floor(cy) - 1;
  const mx   = Math.round((cx - tx0) * TILE);
  const my   = Math.round((cy - ty0) * TILE);
  let tiles  = '';
  for (let dy = 0; dy < GRID; dy++)
    for (let dx = 0; dx < GRID; dx++) {
      const tx = tx0 + dx, ty = ty0 + dy;
      tiles += `<img src="https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png" `
             + `style="position:absolute;left:${dx*TILE}px;top:${dy*TILE}px;width:${TILE}px;height:${TILE}px" `
             + `draggable="false" alt="">`;
    }
  return `<div class="heute-karte-map">
    <div style="position:absolute;width:${GRID*TILE}px;height:${GRID*TILE}px;left:calc(50% - ${mx}px);top:calc(50% - ${my}px);pointer-events:none">
      ${tiles}
      <div style="position:absolute;left:${mx-8}px;top:${my-21}px;width:16px;height:21px">
        <svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 7.75 12 20 12 20S24 19.75 24 12C24 5.37 18.63 0 12 0z" fill="#cc0000"/>
          <circle cx="12" cy="12" r="5" fill="#fff"/>
        </svg>
      </div>
    </div>
  </div>`;
}

function _renderHeuteMap(tp) {
  const lat = parseFloat(tp.lat);
  const lng = parseFloat(tp.lng);
  if (isNaN(lat) || isNaN(lng)) return '';
  const gUrl = escapeHtml(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  const aUrl = escapeHtml(`https://maps.apple.com/?daddr=${lat},${lng}`);
  return `<div class="heute-card-map">
    ${_osmStaticMapHtml(lat, lng)}
    <div class="heute-map-nav">
      <a href="${gUrl}" target="_blank" rel="noopener">Google Maps</a>
      <a href="${aUrl}" target="_blank" rel="noopener">Apple Maps</a>
    </div>
  </div>`;
}

function renderHeuteSektionHtml(items, privatItems = [], heading = 'Heute') {
  // ── Öffentliche / Team-Einheiten ────────────────────────
  const oeffentlichHtml = items.map(e => {
    const typLabel = getTypLabel(e.typ);
    const zeitStr = e.uhrzeit ? ` · ${escapeHtml(e.uhrzeit)} Uhr` : '';
    const abgesagt = e.status === 'abgesagt';
    const intern = e.sichtbarkeit === 'intern';
    const tp = e.treffpunkt;
    const treffpunktName = tp ? (tp.name || null) : null;
    // Karte nur wenn Koordinaten vorhanden UND kein Komoot-Link vorhanden
    const hasMap = !e.komoot_url && !!(tp && tp.lat && tp.lng);
    return `
      <div class="heute-card kal-cal-${kalKeyFor(e)}${abgesagt ? ' is-cancelled' : ''}${hasMap ? ' heute-card-has-map' : ''}">
        <div class="heute-card-main">
          <div class="heute-card-eyebrow">
            <span class="heute-typ-label">${escapeHtml(typLabel)}${zeitStr}</span>
            ${abgesagt ? '<span class="heute-badge heute-badge-abgesagt">Abgesagt</span>' : ''}
            ${intern ? '<span class="heute-badge heute-badge-intern">Intern</span>' : ''}
          </div>
          <div class="heute-card-titel">${escapeHtml(e.titel)}</div>
          ${treffpunktName ? `<div class="heute-card-info heute-treffpunkt">${escapeHtml(treffpunktName)}</div>` : ''}
          ${e.bemerkung    ? `<div class="heute-card-info">${escapeHtml(e.bemerkung)}</div>` : ''}
          <div id="heute-segs-${e.id}" class="heute-segs"></div>
        </div>
        ${hasMap ? _renderHeuteMap(tp) : ''}
        <div id="heute-komoot-${e.id}" class="heute-card-komoot"></div>
      </div>`;
  }).join('');

  // ── Eigene private Einheiten (nicht aus Teamplan übernommen) ─
  const privatHtml = privatItems.map(e => {
    const typLabel = getTypLabel(e.typ);
    const zeitStr  = e.uhrzeit ? ` · ${escapeHtml(e.uhrzeit)} Uhr` : '';
    const km       = e.distanz_km != null ? e.distanz_km : null;
    return `
      <div class="heute-card kal-cal-${kalKeyFor({ ...e, _privat: true })} is-privat" onclick="MEINPLAN.bearbeitePrivat(${e.id})" style="cursor:pointer">
        <div class="heute-card-main">
          <div class="heute-card-eyebrow">
            <span class="heute-typ-label">${escapeHtml(typLabel)}${zeitStr}</span>
            <span class="heute-badge heute-badge-privat">Mein Plan</span>
          </div>
          <div class="heute-card-titel">${escapeHtml(e.titel)}</div>
          ${km ? `<div class="heute-card-info">${km % 1 === 0 ? km : parseFloat(km).toFixed(1)}km</div>` : ''}
          ${e.bemerkung ? `<div class="heute-card-info">${escapeHtml(e.bemerkung)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const cardsHtml = oeffentlichHtml + privatHtml;
  if (!cardsHtml) return '';
  const count    = items.length + privatItems.length;
  const countCls = count === 1 ? ' heute-cards-1' : count === 2 ? ' heute-cards-2' : '';
  return `<div class="heute-sektion"><div class="heute-heading">${heading}</div><div class="heute-cards${countCls}">${cardsHtml}</div></div>`;
}

async function ladeGlobalePaceWarnung(containerId) {
  const el = document.getElementById(containerId);
  if (!el || !state.user) return;

  let html = '';

  // Pace-Warnung
  try {
    const paceData = await PACE.load();
    const hatKeinePace = !paceData || !paceData.distanzen || Object.keys(paceData.distanzen).length === 0;
    if (hatKeinePace) {
      html += `<div class="pace-warn-global">
        ⚠ Persönliche Pace noch nicht konfiguriert –
        <button class="btn-link" onclick="PROFIL.open()">jetzt im Athletenprofil einrichten</button>
      </div>`;
    }
  } catch (e) { /* ignorieren */ }

  // Trainingsgruppen-Warnung
  try {
    const meineGruppen = await GRUPPEN.ladeMeine();
    if (!meineGruppen.gruppen_ids || meineGruppen.gruppen_ids.length === 0) {
      // Nur anzeigen wenn überhaupt Gruppen existieren
      const alleGruppen = await GRUPPEN.laden();
      if (alleGruppen && alleGruppen.length > 0) {
        html += `<div class="pace-warn-global">
          ⚠ Noch keiner Trainingsgruppe zugeordnet –
          <button class="btn-link" onclick="PROFIL.open()">jetzt im Profil einrichten</button>
        </div>`;
      }
    }
  } catch (e) { /* ignorieren */ }

  el.innerHTML = html;
}

async function ladeHeuteSektionInto(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const todayD   = new Date();
  const morgenD  = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate() + 1);
  const today    = ymd(todayD);
  const morgen   = ymd(morgenD);
  try {
    const angemeldet = !!state.user;
    const d = angemeldet
      ? await apiGet(`mein-plan/einheiten?von=${today}&bis=${morgen}`, { silent: true })
      : await apiGet(`einheiten?von=${today}&bis=${morgen}`, { silent: true });

    // Adoptionsstatus: öffentliche EinheitID → private EinheitID
    if (angemeldet) {
      state._heuteAdoptedMap = {};
      (d.privat || []).forEach(p => {
        if (p.ref_einheit_id) state._heuteAdoptedMap[p.ref_einheit_id] = p.id;
      });
    }

    const allPublic = (d.einheiten || []).filter(e => !istKeinTraining(e.typ));
    const allPrivat = angemeldet
      ? (d.privat || []).filter(p => !p.ref_einheit_id && !istKeinTraining(p.typ))
      : [];

    const todayItems   = allPublic.filter(e => e.datum === today);
    const todayPrivat  = allPrivat.filter(e => e.datum === today);
    const morgenItems  = allPublic.filter(e => e.datum === morgen);
    const morgenPrivat = allPrivat.filter(e => e.datum === morgen);

    const htmlHeute  = (todayItems.length  + todayPrivat.length)  ? renderHeuteSektionHtml(todayItems,  todayPrivat,  'Heute')  : '';
    const htmlMorgen = (morgenItems.length + morgenPrivat.length) ? renderHeuteSektionHtml(morgenItems, morgenPrivat, 'Morgen') : '';
    let html = '';
    if (htmlHeute && htmlMorgen) {
      html = `<div class="heute-morgen-wrap">${htmlHeute}${htmlMorgen}</div>`;
    } else {
      html = htmlHeute + htmlMorgen;
    }
    el.innerHTML = html;

    const allItems = [...todayItems, ...morgenItems];
    if (allItems.length) ladHeuteDetails(allItems);
  } catch (e) {
    el.innerHTML = '';
  }
}

async function ladeWettkampfSektionInto(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  let serien = [];
  try { serien = await _ladeWettkampfDaten(); } catch (_) { return; }

  const _now       = new Date();
  const heute      = ymd(_now);
  // Ab 12:00 Uhr: heutigen Tag nicht mehr anzeigen
  const minDatum   = _now.getHours() >= 12
    ? ymd(new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() + 1))
    : heute;
  const angemeldet = !!state.user;
  const mitDatum   = serien
    .filter(s => s.aktiv !== 0 && s.aktiv !== false)
    .map(s => {
      let datum = null, modus = 'prognose';
      const _heuteS = ymd(new Date());
      if (s.naechstes_datum && s.naechstes_datum >= _heuteS) {
        datum = s.naechstes_datum; modus = 'manuell';
      } else if (typeof ADMIN_WETTKAMPF !== 'undefined') {
        datum = ADMIN_WETTKAMPF.predictNextDate(s.letztes_datum);
      }
      return { s, datum, modus };
    })
    .filter(e => e.datum && e.datum >= minDatum)
    .sort((a, b) => a.datum.localeCompare(b.datum))
    .slice(0, 3);

  if (!mitDatum.length) return;

  const cards = mitDatum.map(({ s, datum, modus }) => {
    const datumFmt = new Date(datum + 'T00:00:00').toLocaleDateString('de-DE',
      { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    const isFest = modus === 'manuell';
    const name   = escapeHtml(s.name || s.kuerzel || '?');

    // Disziplinen ermitteln
    const ausgeschlossen = new Set(s.disziplinen_ausgeschlossen || []);
    const diszSet = new Set();
    (s.disziplinen || []).forEach(d => { if (!ausgeschlossen.has(d)) diszSet.add(d); });
    (s.disziplinen_extra || []).forEach(d => diszSet.add(d));
    const disziplinen = [...diszSet];

    // Meine Anmeldung (formale Tabelle) + privater Plan-Eintrag (gleiche Logik wie Popover)
    const meineAnmId     = s.meine_anmeldung_id  || null;
    const meineDisziplin = s.meine_disziplin      || null;  // null = ohne Disziplin
    // Nur Einträge dieser Serie (Titelprefix), nicht alle Wettkämpfe an dem Datum
    const _serieNorm  = _decodeHtml(s.name || s.kuerzel || '');
    const privatListe = (_wkPrivatMap[datum] || []).filter(ev =>
      (ev.titel || '').startsWith('🏆 ' + _serieNorm)
    );

    // ── Disziplin-Buttons (identisch mit Kalender-Popover) ───
    let diszHtml = '';
    if (angemeldet) {
      const liste = disziplinen.length ? disziplinen : [null]; // null = allgemeine Teilnahme
      const btns = liste.map(d => {
        const normD   = d || null;
        const label   = escapeHtml(d || 'Teilnahme eintragen');
        const priv    = privatListe.find(ev => (ev.bemerkung || null) === normD) || null;
        const anmId   = (meineAnmId && (meineDisziplin || null) === normD) ? meineAnmId : null;
        const isAktiv = !!(priv || anmId);
        if (isAktiv) {
          return `<button class="wk-pop-btn wk-pop-btn--active" onclick="_wkKarteAb(${s.id},${priv ? priv.id : 'null'},${anmId || 'null'})">✓ ${label}</button>`;
        }
        return `<button class="wk-pop-btn" onclick="_wkKarteAn(${s.id},${escapeHtml(JSON.stringify(d || ''))})">${label}</button>`;
      }).join('');
      diszHtml = `<div class="wk-disz-buttons">${btns}</div>`;
    } else if (disziplinen.length) {
      // Gäste: Disziplinen nur anzeigen, nicht klickbar
      const pills = disziplinen.map(d =>
        `<span class="wk-pop-btn wk-disz-static">${escapeHtml(d)}</span>`).join('');
      diszHtml = `<div class="wk-disz-buttons">${pills}</div>`;
    }

    // ── Teilnehmer-Liste ─────────────────────────────────────
    const anmeldungen = (s.anmeldungen || []).slice();
    const myId = state.user ? (state.user.id || 0) : 0;
    const myName = state.user
      ? (state.user.vorname && state.user.nachname
          ? state.user.vorname + ' ' + state.user.nachname
          : state.user.vorname || state.user.name || state.user.benutzername || '')
      : '';
    // Legacy: eigener Eintrag existiert nur als privater Plan-Eintrag (ohne formale Anmeldung) → ergänzen
    if (myId && privatListe.length && !anmeldungen.some(a => a.benutzer_id === myId)) {
      anmeldungen.push({ id: 0, benutzer_id: myId, name: myName || null, disziplin: privatListe[0].bemerkung || '' });
    }
    let teilnehmerHtml = '';
    if (anmeldungen.length) {
      const namen = anmeldungen.map(a => {
        const isMe = myId && (a.benutzer_id === myId);
        const name = isMe && myName ? myName : (a.name || a.benutzername || '?');
        const d    = a.disziplin ? ` · ${escapeHtml(a.disziplin)}` : '';
        const cls  = isMe ? ' wk-tl-name--ich' : '';
        return `<span class="wk-tl-name${cls}">${escapeHtml(name)}${d}</span>`;
      }).join('');
      teilnehmerHtml = `<div class="wk-teilnehmer">${namen}</div>`;
    }

    return `<div class="wk-card kal-cal-wettkampf">
      <div class="wk-card-eyebrow">
        <span class="wk-datum">${escapeHtml(datumFmt)}</span>
        ${isFest
          ? ''
          : '<span class="heute-badge wk-badge-prognose">Prognose</span>'}
      </div>
      <div class="wk-card-name">${name}</div>
      ${diszHtml}
      ${teilnehmerHtml}
    </div>`;
  }).join('');

  const count    = mitDatum.length;
  const countCls = count === 1 ? ' heute-cards-1' : count === 2 ? ' heute-cards-2' : '';
  el.innerHTML   = `<div class="wettkampf-sektion">
    <div class="heute-heading">Nächste Wettkämpfe</div>
    <div class="heute-cards${countCls}">${cards}</div>
  </div>`;
}

// Karte: Anmelden – identisch zum Popover (privater Plan-Eintrag + formale Anmeldung)
async function _wkKarteAn(serieId, disziplin) {
  await _wkEintragen(serieId, disziplin || '');
}

// Karte: Abmelden – entfernt beide Einträge (privater Plan + formale Anmeldung)
async function _wkKarteAb(serieId, privatId, anmId) {
  try {
    if (anmId)    await apiDel(`wettkampf/anmeldungen/${anmId}`);
    if (privatId) await apiDel(`mein-plan/einheiten/${privatId}`);
    _wettkampfCache = null;
    renderPage();
  } catch (e) {
    benachrichtigen('Fehler: ' + (e.message || ''), 'err');
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

      let html = '';
      if (seg.length) {
        html += renderSegmentBlocksHtml(seg, paceData, einheit.typ);
      }
      const actions = [];
      // ── "Ich bin dabei!"-Button ──
      if (state.user && einheit.status !== 'abgesagt') {
        const privatId = state._heuteAdoptedMap && state._heuteAdoptedMap[einheit.id];
        if (privatId) {
          actions.push(`<button class="btn btn-sm heute-dabei-btn is-dabei" onclick="toggleHeuteDabei(${einheit.id}, ${privatId}, null, null)">☑ Ich bin dabei!</button>`);
        } else {
          const eJson = escapeHtml(JSON.stringify({ id: einheit.id, datum: einheit.datum, uhrzeit: einheit.uhrzeit || null, typ: einheit.typ, titel: einheit.titel }));
          const sJson = escapeHtml(JSON.stringify(seg.map(s => ({ wiederholungen: s.wiederholungen, distanz_m: s.distanz_m, pause_m: s.pause_m }))));
          actions.push(`<button class="btn btn-ghost btn-sm heute-dabei-btn" onclick="toggleHeuteDabei(${einheit.id}, null, JSON.parse(this.dataset.e), JSON.parse(this.dataset.s))" data-e="${eJson}" data-s="${sJson}">☐ Ich bin dabei?</button>`);
        }
      }
      if (seg.length) {
        actions.push(`<a class="btn btn-ghost btn-sm" href="api/index.php?p=fit/einheit/${einheit.id}.fit" download title="Garmin Workout-Datei">⌚ FIT für Garmin</a>`);
      }
      if (einheit.komoot_url) {
        actions.push(`<a class="btn btn-ghost btn-sm" href="${escapeHtml(einheit.komoot_url)}" target="_blank" rel="noopener">Auf Komoot ↗</a>`);
      }
      if (actions.length) {
        html += `<div class="heute-card-actions">${actions.join('')}</div>`;
      }

      areaEl.innerHTML = html;

      // Komoot-Strecke in rechte Spalte
      const komootEl = document.getElementById(`heute-komoot-${einheit.id}`);
      if (komootEl && einheit.komoot_url) {
        const embedUrl = komootEmbedUrl(einheit.komoot_url);
        if (embedUrl) {
          komootEl.innerHTML = `<iframe src="${escapeHtml(embedUrl)}" frameborder="0" scrolling="no" allow="fullscreen" loading="lazy"></iframe>`;
          komootEl.closest('.heute-card').classList.add('heute-card-split');
        }
      }
    } catch (_) {
      // Segmente bleiben leer bei Fehler
    }
  }
}

async function toggleHeuteDabei(einheitId, privatId, einheitData, segmente) {
  if (privatId) {
    // Aus persönlichem Plan entfernen (ohne confirm)
    try {
      await apiDel(`mein-plan/einheiten/${privatId}`);
      if (state._heuteAdoptedMap) delete state._heuteAdoptedMap[einheitId];
      // Button direkt umschalten ohne Seiten-Reload
      const btn = document.querySelector(`.heute-dabei-btn[onclick*="${einheitId}"]`);
      if (btn) {
        // Segment-Daten aus state holen falls vorhanden
        const cached = state._heuteEinheiten && state._heuteEinheiten[einheitId];
        const seg = cached ? cached.segmente || [] : [];
        const e   = cached ? cached.einheit   : { id: einheitId };
        const eJson = escapeHtml(JSON.stringify({ id: e.id, datum: e.datum, uhrzeit: e.uhrzeit || null, typ: e.typ, titel: e.titel }));
        const sJson = escapeHtml(JSON.stringify(seg.map(s => ({ wiederholungen: s.wiederholungen, distanz_m: s.distanz_m, pause_m: s.pause_m }))));
        btn.className = 'btn btn-ghost btn-sm heute-dabei-btn';
        btn.textContent = '☐ Ich bin dabei?';
        btn.setAttribute('onclick', `toggleHeuteDabei(${einheitId}, null, JSON.parse(this.dataset.e), JSON.parse(this.dataset.s))`);
        btn.dataset.e = eJson;
        btn.dataset.s = sJson;
      }
      renderPage(); // Kalender aktualisieren
    } catch (err) {
      benachrichtigen('Fehler: ' + (err.message || ''), 'err');
    }
  } else {
    // In persönlichen Plan übernehmen
    try {
      const km = typeof MEINPLAN !== 'undefined'
        ? MEINPLAN.berechneKm(einheitData, segmente || [])
        : null;
      const resp = await apiPost('mein-plan/einheiten', {
        datum:          einheitData.datum,
        uhrzeit:        einheitData.uhrzeit || null,
        typ:            einheitData.typ,
        titel:          einheitData.titel,
        distanz_km:     km,
        ref_einheit_id: einheitData.id,
      });
      const neuId = resp && resp.id ? resp.id : null;
      if (state._heuteAdoptedMap && neuId) state._heuteAdoptedMap[einheitId] = neuId;
      // Button direkt umschalten
      const btn = document.querySelector(`.heute-dabei-btn[onclick*="${einheitId}"]`) ||
                  document.querySelector(`.heute-dabei-btn[data-e*='"id":${einheitId}']`);
      if (btn && neuId) {
        btn.className = 'btn btn-sm heute-dabei-btn is-dabei';
        btn.textContent = '☑ Ich bin dabei!';
        btn.setAttribute('onclick', `toggleHeuteDabei(${einheitId}, ${neuId}, null, null)`);
        btn.removeAttribute('data-e');
        btn.removeAttribute('data-s');
      }
      renderPage(); // Kalender aktualisieren
    } catch (err) {
      benachrichtigen('Fehler: ' + (err.message || ''), 'err');
    }
  }
}

async function oeffneTerminModal(einheit) {
  if (!einheit) return;
  // Akzeptiere sowohl flaches Einheit-Objekt als auch {einheit, segmente}-Wrapper
  if (einheit.einheit) einheit = einheit.einheit;
  const id = einheit.id;

  // Serien-Kontext für den Speichern-Schritt merken
  state._terminEdit = { id: id, serieId: einheit.serie_id || null, datum: einheit.datum || null };

  // Slim-Modal: nur Termin-Felder (Datum, Uhrzeit, Treffpunkt, Sichtbarkeit)
  let tpListe = [];
  try { tpListe = await TREFFPUNKTE.laden(); } catch (_) {}
  const curTpId = einheit.treffpunkt ? einheit.treffpunkt.id : null;
  const tpOptionen = '<option value="">— kein Treffpunkt —</option>' +
    tpListe.map(t => '<option value="' + t.id + '"' + (t.id === curTpId ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>').join('');

  const cont = document.getElementById('modal-container');
  cont.innerHTML = '<div class="modal-overlay" onclick="schliesseModal(event)">' +
    '<div class="modal-card" onclick="event.stopPropagation()">' +
      '<div class="modal-head">' +
        '<div>' +
          '<div class="modal-eyebrow">Kalendereintrag bearbeiten' + (einheit.serie_id ? ' <span class="serie-badge">↺ Serie</span>' : '') + '</div>' +
          '<div class="modal-title">' + escapeHtml(einheit.titel || '') + '</div>' +
        '</div>' +
        '<button class="modal-close" onclick="schliesseModal()" aria-label="Schließen">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="ed-grid">' +
          '<div class="ed-fg">' +
            '<label>Datum</label>' +
            '<input type="date" id="hte-datum" value="' + escapeHtml(einheit.datum || '') + '">' +
          '</div>' +
          '<div class="ed-fg">' +
            '<label>Uhrzeit</label>' +
            '<input type="time" id="hte-uhrzeit" value="' + escapeHtml(einheit.uhrzeit || '') + '">' +
          '</div>' +
          '<div class="ed-fg">' +
            '<label>Treffpunkt</label>' +
            '<select id="hte-treffpunkt-id">' + tpOptionen + '</select>' +
          '</div>' +
          '<div class="ed-fg">' +
            '<label>Sichtbarkeit</label>' +
            '<select id="hte-sichtbarkeit">' +
              '<option value="oeffentlich"' + (einheit.sichtbarkeit === 'oeffentlich' ? ' selected' : '') + '>Öffentlich</option>' +
              '<option value="intern"' + (einheit.sichtbarkeit === 'intern' ? ' selected' : '') + '>Intern (nur eingeloggt)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="ed-footer">' +
          '<button class="btn btn-danger" onclick="loescheTermin(' + id + ')">Löschen</button>' +
          '<div class="ed-footer-right">' +
            '<button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>' +
            '<button class="btn btn-primary" onclick="speichereTermin(' + id + ')">Speichern</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

async function bearbeiteHeuteEinheit(id) {
  const data = state._heuteEinheiten && state._heuteEinheiten[id];
  await oeffneTerminModal(data);
}

async function speichereTermin(id) {
  const ctx = state._terminEdit || { id: id, serieId: null, datum: null };
  // Serien-Einheit: erst Geltungsbereich abfragen
  if (ctx.serieId) {
    function valD(elId) { const el = document.getElementById(elId); return el ? (el.value || '').trim() : ''; }
    if (!valD('hte-datum')) { benachrichtigen('Datum fehlt.', 'err'); return; }
    zeigeTerminSerienScope();
    return;
  }
  await terminSpeichernMitScope('einzel');
}

async function terminSpeichernMitScope(scope) {
  function val(elId) {
    const el = document.getElementById(elId);
    return el ? (el.value || '').trim() : '';
  }
  const ctx = state._terminEdit || {};
  const tpIdStr = val('hte-treffpunkt-id');
  const datum = val('hte-datum');
  if (!datum) { benachrichtigen('Datum fehlt.', 'err'); return; }
  // Für Serien-Scopes wird das Datum nicht übernommen (je Termin individuell)
  const basis = {
    treffpunkt_id: tpIdStr !== '' ? parseInt(tpIdStr, 10) : null,
    uhrzeit:       val('hte-uhrzeit') || null,
    sichtbarkeit:  val('hte-sichtbarkeit'),
  };
  try {
    if (scope === 'alle') {
      await apiPut('serien/' + ctx.serieId, basis);
    } else if (scope === 'abjetzt') {
      await apiPut('serien/' + ctx.serieId + '/ab/' + ctx.datum, basis);
    } else {
      await apiPut('einheiten/' + ctx.id, { ...basis, datum: datum });
    }
    schliesseModal();
    benachrichtigen('Gespeichert.', 'ok');
    renderPage();
  } catch (e) {
    benachrichtigen('Fehler: ' + (e.message || ''), 'err');
  }
}

function zeigeTerminSerienScope() {
  const footer = document.querySelector('#modal-container .ed-footer');
  if (!footer) return;
  const id = (state._terminEdit && state._terminEdit.id) || 0;
  footer.innerHTML =
    '<div class="serie-del-frage">Änderungen auf welche Termine anwenden?</div>' +
    '<div class="serie-del-btns">' +
      '<button class="btn btn-ghost btn-sm" onclick="terminSpeichernMitScope(\'einzel\')">Nur dieser Termin</button>' +
      '<button class="btn btn-warning btn-sm" onclick="terminSpeichernMitScope(\'abjetzt\')">Dieser und alle folgenden</button>' +
      '<button class="btn btn-primary btn-sm" onclick="terminSpeichernMitScope(\'alle\')">Gesamte Serie</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="terminSerienScopeAbbrechen(' + id + ')">Abbrechen</button>' +
    '</div>';
}

function terminSerienScopeAbbrechen(id) {
  const footer = document.querySelector('#modal-container .ed-footer');
  if (!footer) return;
  footer.innerHTML =
    '<button class="btn btn-danger" onclick="loescheTermin(' + id + ')">Löschen</button>' +
    '<div class="ed-footer-right">' +
      '<button class="btn btn-ghost" onclick="schliesseModal()">Abbrechen</button>' +
      '<button class="btn btn-primary" onclick="speichereTermin(' + id + ')">Speichern</button>' +
    '</div>';
}

async function loescheTermin(id, scope) {
  const ctx = state._terminEdit || { id: id, serieId: null, datum: null };
  // Serien-Einheit: Geltungsbereich abfragen
  if (ctx.serieId && !scope) {
    const footer = document.querySelector('#modal-container .ed-footer');
    if (footer) {
      footer.innerHTML =
        '<div class="serie-del-frage">Welche Termine löschen?</div>' +
        '<div class="serie-del-btns">' +
          '<button class="btn btn-ghost btn-sm" onclick="loescheTermin(' + id + ',\'einzel\')">Nur dieser Termin</button>' +
          '<button class="btn btn-warning btn-sm" onclick="loescheTermin(' + id + ',\'abjetzt\')">Dieser und alle folgenden</button>' +
          '<button class="btn btn-danger btn-sm" onclick="loescheTermin(' + id + ',\'alle\')">Gesamte Serie</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="terminSerienScopeAbbrechen(' + id + ')">Abbrechen</button>' +
        '</div>';
    }
    return;
  }
  if (!ctx.serieId && !confirm('Diesen Kalendereintrag löschen?')) return;
  try {
    if (scope === 'alle') {
      await apiDel('serien/' + ctx.serieId);
    } else if (scope === 'abjetzt') {
      await apiDel('serien/' + ctx.serieId + '/ab/' + ctx.datum);
    } else {
      await apiDel('einheiten/' + ctx.id);
    }
    schliesseModal();
    benachrichtigen('Gelöscht.', 'ok');
    renderPage();
  } catch (e) {
    benachrichtigen('Fehler: ' + (e.message || ''), 'err');
  }
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
    const distStr  = s.distanz_m >= 1000 ? (s.distanz_m / 1000) + 'km' : s.distanz_m + 'm';
    const PAUSE_LABEL = { TP: 'Trabbpause', GP: 'Gehpause', BP: 'Bergpause', frei: 'Pause' };
    for (let i = 0; i < wdh; i++) {
      const tip = `${wdh > 1 ? (i + 1) + ' / ' + wdh + ' · ' : ''}${distStr}${s.pace_referenz ? ' · ' + s.pace_referenz : ''}${paceStr ? ' · ' + paceStr : ''}`;
      blocksHtml += `<div class="seg-blk seg-blk-work ${typClass}" style="flex:${s.distanz_m};height:${h}px" title="${escapeHtml(tip)}"></div>`;
      if (s.pause_m) {
        const pH  = Math.round(16 + (s.pause_m / maxDist) * 40);
        const pLbl = PAUSE_LABEL[s.pause_typ] || 'Pause';
        blocksHtml += `<div class="seg-blk seg-blk-pause" style="flex:${s.pause_m};height:${pH}px" title="${s.pause_m}m ${pLbl}"></div>`;
      }
    }
  });

  const PAUSE_LBL = { TP: 'Trabpause', GP: 'Gehpause', BP: 'Blockpause', frei: 'Pause' };
  const summaryHtml = seg.map(s => {
    const wdh     = s.wiederholungen || 1;
    const distStr = s.distanz_m >= 1000 ? (s.distanz_m / 1000) + 'km' : s.distanz_m + 'm';
    let line = (wdh > 1 ? wdh + ' × ' : '') + distStr;

    // Pace: entweder berechnete Pace oder Referenz-Label
    const sekProKm = paceData ? PACE.paceSekProKm(paceData, s.pace_referenz) : null;
    if (sekProKm != null) {
      const m  = Math.floor(sekProKm / 60);
      const sc = String(Math.round(sekProKm % 60)).padStart(2, '0');
      line += ` (@ ${m}:${sc}min/km)`;
    } else if (s.pace_referenz) {
      const refLabel = PACE.fmtDistLabel(s.pace_referenz);
      line += ` (@ ${escapeHtml(refLabel)}-Pace)`;
    }

    // Pause
    if (s.pause_m) {
      const pLbl = PAUSE_LBL[s.pause_typ] || 'Pause';
      line += ` · ${s.pause_m}m ${pLbl}`;
    }

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

// ── Gemeinsame Datenbasis für Kalender- und Listenansicht ───
// Lädt Team-/Privat-Einheiten, Feiertage, Filter-Prefs und Wettkämpfe,
// wendet den Kalender-Filter an und liefert die abgeleiteten Maps.
// Wird sowohl vom Monatskalender (indirekt) als auch von der Liste genutzt,
// damit beide Ansichten dieselben Einträge zeigen.
async function _buildPlanData(von, bis) {
  const angemeldet = !!state.user;
  const needPrefs  = angemeldet && state.kalFilter === null;
  const [d1, d2, d3, d4, d5] = await Promise.all([
    angemeldet
      ? apiGet(`mein-plan/einheiten?von=${von}&bis=${bis}`, { silent: true })
      : apiGet(`einheiten?von=${von}&bis=${bis}`, { silent: true }),
    apiGet(`feiertage?von=${von}&bis=${bis}`, { silent: true }).catch(() => ({ feiertage: [] })),
    needPrefs ? apiGet('kal/prefs', { silent: true }).catch(() => ({ prefs: null })) : Promise.resolve({ prefs: null }),
    _ladeWettkampfDaten().catch(() => []),
    _ladeWettkampfTermine(von, bis).catch(() => ({ termine: [], statistikportal_url: '' })),
  ]);
  const oeffentlich  = d1.einheiten || [];
  const privat       = angemeldet ? (d1.privat || []) : [];
  const feiertage    = d2.feiertage || [];
  const wettkampfRaw = Array.isArray(d4) ? d4 : [];
  const termineRaw   = d5.termine || [];
  const statistikUrl = d5.statistikportal_url || _statistikportalUrl || '';
  _dragPrivat = privat;
  if (angemeldet) {
    MEINPLAN.setAbo(d1.abo_typen || []);
    state.meineGruppen = d1.meine_gruppen || [];
    if (state.kalFilter === null) {
      state.kalFilter = _initKalFilter(state.meineGruppen.map(g => g.id), d3.prefs);
    }
    if (d3.farben && typeof d3.farben === 'object') kalFarbenUser = d3.farben;
    applyKalenderFarben(state.meineGruppen.map(g => 'g' + g.id));
  }
  // WEG vorladen, damit _effektivKm die Anreise-km einrechnen kann
  if (angemeldet && typeof WEG !== 'undefined') await WEG.load();

  const adoptedIds = new Set(privat.filter(p => p.ref_einheit_id != null).map(p => p.ref_einheit_id));
  const kf         = state.kalFilter;
  const hatGruppen = angemeldet && state.meineGruppen.length > 0;
  const oeffentlichGefiltert = oeffentlich.filter(e => {
    if (!angemeldet || !kf) return true;
    if (hatGruppen) {
      if (e.gruppe_id == null) return kf.gruppen.size > 0;
      return kf.gruppen.has(e.gruppe_id);
    }
    return kf.teamplan !== false;
  });
  const privatGefiltert = (!angemeldet || !kf || kf.meinPlan !== false) ? privat : [];

  const byDate = {};
  oeffentlichGefiltert.forEach(e => {
    if (adoptedIds.has(e.id)) return;
    (byDate[e.datum] = byDate[e.datum] || []).push({ ...e, _privat: false });
  });
  privatGefiltert.forEach(e => { (byDate[e.datum] = byDate[e.datum] || []).push({ ...e, _privat: true }); });
  Object.values(byDate).forEach(arr =>
    arr.sort((a, b) => a._privat !== b._privat ? (a._privat ? 1 : -1) : (a.uhrzeit || '99:99').localeCompare(b.uhrzeit || '99:99'))
  );

  const feiertageByDate = {};
  feiertage.forEach(f => {
    const start = new Date(f.datum + 'T00:00:00');
    const end   = new Date((f.datum_bis || f.datum) + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = ymd(d);
      (feiertageByDate[k] = feiertageByDate[k] || []).push(f);
    }
  });

  _wkPrivatMap = {};
  privatGefiltert.filter(e => e.typ === 'wettkampf').forEach(e => {
    (_wkPrivatMap[e.datum] = _wkPrivatMap[e.datum] || []).push({ id: e.id, bemerkung: e.bemerkung || null, titel: e.titel || '' });
  });
  const wettkampfBeiDatum = {};
  const wkSerieDatumMap   = {};
  if (typeof ADMIN_WETTKAMPF !== 'undefined') {
    const _heuteListe = ymd(new Date());
    wettkampfRaw.forEach(s => {
      if (s.aktiv === 0) return;
      const manuellL = s.naechstes_datum && s.naechstes_datum >= _heuteListe ? s.naechstes_datum : null;
      const datum    = manuellL || ADMIN_WETTKAMPF.predictNextDate(s.letztes_datum);
      if (datum) (wkSerieDatumMap[datum] = wkSerieDatumMap[datum] || []).push(s);
      // Doppeleintrag nur unterdrücken wenn privater Eintrag für genau diese Serie existiert
      const sNormL = _decodeHtml(s.name || s.kuerzel || '');
      if ((_wkPrivatMap[datum] || []).some(ev => (ev.titel || '').startsWith('🏆 ' + sNormL))) return;
      if (datum && datum >= von && datum <= bis) {
        (wettkampfBeiDatum[datum] = wettkampfBeiDatum[datum] || []).push(s);
      }
    });
  }

  // Historische Wettkampf-Termine
  const _heuteB = ymd(new Date());
  const histByDate = {};
  termineRaw.forEach(t => {
    if (t.datum <= _heuteB) (histByDate[t.datum] = histByDate[t.datum] || []).push(t);
  });

  return { angemeldet, byDate, feiertageByDate, wettkampfBeiDatum, wkSerieDatumMap, kf, histByDate, statistikUrl };
}

async function renderListe(main, quarterArg) {
  const { year, quarter } = parseQuarterArg(quarterArg);
  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd   = new Date(year, quarter * 3, 0);
  const angemeldet = !!state.user;

  const QUARTALS_MONATE_LABEL = [
    'Jan. – März', 'Apr. – Jun.', 'Jul. – Sep.', 'Okt. – Dez.'
  ];
  const prevQ = quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
  const nextQ = quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`;

  main.innerHTML = `
    <div class="liste-wrap">
      <div id="pace-warn-sektion"></div>
      <div id="heute-sektion"></div>
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
            <button class="btn btn-ghost" onclick="navigateKalenderHeute()" title="Kalenderansicht (aktueller Monat)">▦ Kalender</button>
            <button class="btn btn-ghost view-active" title="Quartalsplan">☰ Liste</button>
          </div>
        </div>
      </div>
      <div id="liste-legend"></div>
      <div id="liste-content" class="liste-loading">Lade Trainingsplan…</div>
      <div id="wettkampf-sektion"></div>
    </div>`;

  ladeGlobalePaceWarnung('pace-warn-sektion');
  ladeHeuteSektionInto('heute-sektion');
  ladeWettkampfSektionInto('wettkampf-sektion');

  let plan;
  try {
    plan = await _buildPlanData(ymd(qStart), ymd(qEnd));
  } catch (e) {
    document.getElementById('liste-content').innerHTML =
      `<div class="liste-error">Trainingsplan konnte nicht geladen werden: ${escapeHtml(e.message || '')}</div>`;
    return;
  }
  const { byDate, wettkampfBeiDatum, kf, histByDate: listHistByDate, statistikUrl: listStatistikUrl } = plan;

  // Filter-Legende (gleiche Checkboxen wie im Kalender)
  if (angemeldet) {
    const leg = document.getElementById('liste-legend');
    if (leg) leg.innerHTML = _renderKalLegend();
  }

  const showWk = !kf || kf.wettkampf !== false;

  const WOCHENTAG_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MONAT_KURZ = ['Jan.','Feb.','März','Apr.','Mai','Jun.','Jul.','Aug.','Sep.','Okt.','Nov.','Dez.'];
  const todayKey    = ymd(new Date());
  const _todayDate  = new Date();
  const currentKW   = isoWeek(_todayDate);
  const currentKWY  = isoWeekYear(_todayDate);

  // Nach ISO-Kalenderwoche gruppieren (nur Tage innerhalb des Quartals)
  const byWeek = new Map(); // "YYYY-WW" → { weekNum, weekStart, days:[], kmSum }
  for (let d = new Date(qStart); d <= qEnd; d.setDate(d.getDate() + 1)) {
    const k    = ymd(new Date(d));
    const kw   = isoWeek(new Date(d));
    const wy   = isoWeekYear(new Date(d));
    const wKey = `${wy}-${String(kw).padStart(2, '0')}`;

    if (!byWeek.has(wKey)) {
      const mon = new Date(d);
      const dow = (mon.getDay() + 6) % 7;
      mon.setDate(mon.getDate() - dow);
      byWeek.set(wKey, { weekNum: kw, weekStart: new Date(mon), days: [], kmSum: 0 });
    }
    const w        = byWeek.get(wKey);
    const dayItems = byDate[k] || [];
    const dayWk   = showWk ? (wettkampfBeiDatum[k] || []) : [];
    const dayHist = showWk ? (listHistByDate[k] || []) : [];
    if (dayItems.length || dayWk.length || dayHist.length) {
      w.days.push({ datum: k, items: dayItems, wk: dayWk, hist: dayHist });
    }
    // Wochenkilometer: nur private Einträge (identisch zum Kalender)
    if (angemeldet) {
      w.kmSum += dayItems.filter(e => e._privat)
        .reduce((s, e) => { const km = _effektivKm(e); return s + (km !== null ? km : 0); }, 0);
    }
  }

  const dayLabel = (datum) => {
    const o = new Date(datum + 'T00:00:00');
    return `${WOCHENTAG_KURZ[o.getDay()]}, ${o.getDate()}. ${MONAT_KURZ[o.getMonth()]}`;
  };
  const dateCell = (datum) => {
    const lbl = escapeHtml(dayLabel(datum));
    return datum === todayKey
      ? `<span class="liste-date"><span class="liste-date-today">${lbl}</span></span>`
      : `<span class="liste-date">${lbl}</span>`;
  };

  // Zeile für eine (Team- oder Privat-)Einheit
  const rowEinheit = (e, datum) => {
    const isCancelled    = e.status === 'abgesagt';
    const isKeinTraining = istKeinTraining(e.typ);
    const istPrivat      = !!e._privat;
    const treffpunktName = e.treffpunkt ? (e.treffpunkt.name || e.treffpunkt) : '';
    const typLabel       = getTypLabel(e.typ);

    const rowCls = [
      'liste-row', `kal-cal-${kalKeyFor(e)}`,
      datum === todayKey ? 'is-today' : '',
      isCancelled ? 'is-cancelled' : '',
      isKeinTraining ? 'is-kein-training' : '',
      istPrivat ? 'is-privat' : '',
    ].filter(Boolean).join(' ');

    let clickAttr = '';
    if (!isKeinTraining) {
      if (istPrivat) {
        clickAttr = e.ref_einheit_id
          ? ` onclick="zeigeEinheit(${e.ref_einheit_id})"`
          : ` onclick="MEINPLAN.bearbeitePrivat(${e.id})"`;
      } else {
        clickAttr = ` onclick="zeigeEinheit(${e.id})"`;
      }
    }

    // km-Badge für private Einträge; sonst Treffpunkt in letzter Spalte
    let lastCell = escapeHtml(treffpunktName);
    if (istPrivat) {
      const ekm = _effektivKm(e);
      const isFallback = ekm !== null && (e.distanz_km === null || e.distanz_km === undefined);
      if (ekm !== null && ekm > 0) {
        lastCell = `<span class="liste-km${isFallback ? ' is-fallback-km' : ''}">${ekm % 1 === 0 ? ekm : ekm.toFixed(1)}km</span>`;
      }
    }
    const meinDot = istPrivat ? '<span class="liste-mein-dot" title="Mein Plan"></span>' : '';

    return `<div class="${rowCls}"${clickAttr}>
      ${dateCell(datum)}
      <span class="liste-time">${e.uhrzeit ? escapeHtml(e.uhrzeit) : '–'}</span>
      <span class="liste-typ-badge liste-typ-${e.typ}">${escapeHtml(typLabel)}</span>
      <span class="liste-title-text">${meinDot}${escapeHtml(e.titel)}</span>
      <span class="liste-ort">${lastCell}</span>
    </div>`;
  };

  // Zeile für eine historische Veranstaltung aus dem Statistikportal
  const rowHistWettkampf = (t, datum) => {
    const name = _decodeHtml(t.serie_name || '');
    const href = listStatistikUrl ? `${listStatistikUrl}/#veranstaltung/${t.id}` : null;
    const rowAttrs = href
      ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener" title="Im Statistikportal öffnen"`
      : '';
    const tag = href ? 'a' : 'div';
    return `<${tag} class="liste-row liste-row-wettkampf wk-hist-item${datum === todayKey ? ' is-today' : ''}"${rowAttrs}>
      ${dateCell(datum)}
      <span class="liste-time">–</span>
      <span class="liste-typ-badge liste-typ-wettkampf">Wettkampf</span>
      <span class="liste-title-text">🏆 ${escapeHtml(name)}${href ? ' <span class="wk-hist-arrow">↗</span>' : ''}</span>
      <span class="liste-ort">${t.ort ? escapeHtml(t.ort) : ''}</span>
    </${tag}>`;
  };

  // Zeile für einen Wettkampf-Forecast (Serie)
  const rowWettkampf = (s, datum) => {
    const name   = _decodeHtml(s.name || s.kuerzel || '');
    const isFest = !!(s.naechstes_datum && s.naechstes_datum >= ymd(new Date()));
    const emoji  = isFest ? '🏆' : '❓';
    const canAdd = !!state.user;
    const clickAttr = canAdd ? ` onclick="_wkPopoverToggle(${s.id}, this)"` : '';
    const prognose  = isFest ? '' : ' <span class="liste-wk-prognose">~ Prognose</span>';
    return `<div class="liste-row liste-row-wettkampf kal-cal-wettkampf${datum === todayKey ? ' is-today' : ''}"${clickAttr} data-serie-id="${s.id}">
      ${dateCell(datum)}
      <span class="liste-time">–</span>
      <span class="liste-typ-badge liste-typ-wettkampf">Wettkampf</span>
      <span class="liste-title-text">${emoji} ${escapeHtml(name)}${prognose}</span>
      <span class="liste-ort"></span>
    </div>`;
  };

  let html = '';
  for (const [, week] of byWeek) {
    if (!week.days.length) continue;

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

    const rowsHtml = week.days.map(day =>
      (day.hist || []).map(t => rowHistWettkampf(t, day.datum)).join('') +
      day.items.map(e => rowEinheit(e, day.datum)).join('') +
      day.wk.map(s => rowWettkampf(s, day.datum)).join('')
    ).join('');

    const km = Math.round(week.kmSum * 10) / 10;
    const kmBadge = (angemeldet && km > 0)
      ? `<span class="liste-kw-km" title="Wochenkilometer (Mein Plan)">${km % 1 === 0 ? km : km.toFixed(1)}km</span>`
      : '';

    const isCurrentKW = week.weekNum === currentKW && isoWeekYear(week.weekStart) === currentKWY;
    html += `<div class="liste-week-block${isCurrentKW ? ' is-current-kw' : ''}">
      <div class="liste-kw-head">
        <span class="liste-kw-badge">KW ${week.weekNum}</span>
        <span class="liste-kw-range">${escapeHtml(rangeStr)}</span>
        ${kmBadge}
      </div>
      <div class="liste-rows">${rowsHtml}</div>
    </div>`;
  }

  if (!html) {
    html = '<div class="liste-empty">Keine Trainingseinheiten in diesem Quartal eingetragen.</div>';
  }

  document.getElementById('liste-content').outerHTML =
    `<div id="liste-content" class="liste-content">${html}</div>`;

  // Neu rendern, nachdem _wkPrivatMap befüllt ist → korrekte Aktiv-Zustände der Karten-Buttons
  ladeWettkampfSektionInto('wettkampf-sektion');
}

async function zeigeEinheit(id) {
  const cont = document.getElementById('modal-container');
  cont.innerHTML = `<div class="modal-overlay" onclick="schliesseModal(event)"><div class="modal-card"><div class="loading">Lade…</div></div></div>`;
  try {
    const data = await apiGet(`einheiten/${id}`, { silent: true });
    const e = data.einheit;
    const seg = data.segmente || [];
    state._lastEinheit = { einheit: e, segmente: seg };

    // Pace und Weg laden wenn eingeloggt
    let paceData = null;
    const hatPaceRef = seg.some(s => s.pace_referenz);
    if (state.user && hatPaceRef) {
      paceData = await PACE.load();
    }
    let wegKm = null;
    if (state.user && typeof WEG !== 'undefined') {
      await WEG.load();
      wegKm = WEG.wegKm(e);
    }
    const datum = new Date(e.datum + 'T00:00:00');
    const wochentag = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][datum.getDay()];
    const datStr = `${wochentag}, ${datum.getDate()}. ${MONATSNAMEN[datum.getMonth()]} ${datum.getFullYear()}`;

    const segHtml = seg.length ? `
      <div class="modal-row modal-row-block">
        <span class="modal-label">Segmente</span>
        ${renderSegmentBlocksHtml(seg, paceData, e.typ)}
      </div>` : '';

    // km-Zeile: Trainings-km aus Segmenten + Anfahrt-km
    const trainingsKm = seg.reduce((s, b) => {
      const wdh = parseInt(b.wiederholungen) || 1;
      return s + ((parseFloat(b.distanz_m) || 0) + (parseFloat(b.pause_m) || 0)) * wdh;
    }, 0) / 1000;
    let kmHtml = '';
    if (trainingsKm > 0 || wegKm != null) {
      const fmtKm = km => km.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'km';
      if (wegKm != null && trainingsKm > 0) {
        const total = trainingsKm + wegKm;
        kmHtml = `<div class="modal-row"><span class="modal-label">Kilometer</span>
          <div class="modal-km-row">
            <div class="modal-km-chip"><span class="modal-km-chip-val">${fmtKm(trainingsKm)}</span><span class="modal-km-chip-lbl">Training</span></div>
            <span class="modal-km-plus">+</span>
            <div class="modal-km-chip"><span class="modal-km-chip-val">${fmtKm(wegKm)}</span><span class="modal-km-chip-lbl">Weg hin+zurück</span></div>
            <span class="modal-km-plus">=</span>
            <div class="modal-km-chip is-total"><span class="modal-km-chip-val">${fmtKm(total)}</span><span class="modal-km-chip-lbl">Gesamt</span></div>
          </div></div>`;
      } else if (trainingsKm > 0) {
        kmHtml = `<div class="modal-row"><span class="modal-label">Kilometer</span><span>${fmtKm(trainingsKm)}</span></div>`;
      }
    }

    cont.innerHTML = `
      <div class="modal-overlay" onclick="schliesseModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-head">
            <div>
              <div class="modal-eyebrow">${escapeHtml(getTypLabel(e.typ))}${e.uhrzeit ? ' · ' + escapeHtml(e.uhrzeit) : ''}</div>
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
              if (!embedUrl) return '';
              return `<div class="modal-row modal-row-block">
                <span class="modal-label">Strecke</span>
                <div class="komoot-embed"><iframe src="${escapeHtml(embedUrl)}" frameborder="0" scrolling="no" allow="fullscreen" loading="lazy"></iframe></div>
              </div>`;
            })()}
            ${e.bemerkung ? `<div class="modal-row"><span class="modal-label">Bemerkung</span><span>${escapeHtml(e.bemerkung)}</span></div>` : ''}
            ${e.sichtbarkeit === 'intern' ? `<div class="modal-row"><span class="modal-label">Sichtbarkeit</span><span>Nur intern</span></div>` : ''}
            ${e.status === 'abgesagt' ? `<div class="modal-row"><span class="modal-label">Status</span><span style="color:var(--primary);font-weight:600">Abgesagt</span></div>` : ''}
            ${kmHtml}
            ${segHtml}
            <div class="modal-actions">
              ${seg.length ? `<a class="btn btn-ghost" href="api/index.php?p=fit/einheit/${e.id}.fit" download title="Garmin Workout-Datei">⌚ FIT für Garmin</a>` : ''}
              ${e.komoot_url ? `<a class="btn btn-ghost" href="${escapeHtml(e.komoot_url)}" target="_blank" rel="noopener">Auf Komoot ↗</a>` : ''}
              ${state.user ? `<button class="btn btn-ghost" onclick="oeffneTerminModal(state._lastEinheit)">Bearbeiten</button>` : ''}
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

// ── Drag & Drop Handler (private Einheiten im Kalender verschieben) ────────────

function _kalDragStart(id, evt) {
  _dragPrivatId = id;
  evt.dataTransfer.effectAllowed = 'move';
  evt.dataTransfer.setData('text/plain', String(id));
  // Dragging-Klasse per rAF setzen, damit das Ghost-Bild die originale Optik zeigt
  const el = evt.currentTarget;
  requestAnimationFrame(() => { if (el) el.classList.add('kal-item-dragging'); });
}

function _kalDragEnd(evt) {
  evt.currentTarget.classList.remove('kal-item-dragging');
  document.querySelectorAll('.kal-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
  // _dragPrivatId wird beim Drop gecleart; hier nur Fallback (z.B. Abbruch)
  _dragPrivatId = null;
}

function _kalDragOver(evt) {
  if (!_dragPrivatId) return;
  evt.preventDefault();
  evt.dataTransfer.dropEffect = 'move';
  const cell = evt.currentTarget;
  if (!cell.classList.contains('drag-over')) {
    document.querySelectorAll('.kal-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
    cell.classList.add('drag-over');
  }
}

function _kalDragLeave(evt) {
  // Nur entfernen wenn wir die Zelle wirklich verlassen (nicht in ein Kind-Element)
  if (!evt.currentTarget.contains(evt.relatedTarget)) {
    evt.currentTarget.classList.remove('drag-over');
  }
}

async function _kalDrop(evt) {
  evt.preventDefault();
  const cell = evt.currentTarget;
  cell.classList.remove('drag-over');
  document.querySelectorAll('.kal-cell.drag-over').forEach(c => c.classList.remove('drag-over'));

  const datum = cell.dataset.datum;
  const id    = _dragPrivatId;
  _dragPrivatId = null;
  if (!id || !datum) return;

  const e = _dragPrivat.find(x => x.id === id);
  if (!e || e.datum === datum) return;

  // DOM-optimistisch: Element sofort in die Zielzelle verschieben
  const dragEl     = document.querySelector(`.kal-item[data-privat-id="${id}"]`);
  const targetList = cell.querySelector('.kal-cell-items');
  if (dragEl && targetList) {
    dragEl.classList.remove('kal-item-dragging');
    targetList.appendChild(dragEl);
  }

  try {
    await apiPut(`mein-plan/einheiten/${id}`, {
      datum,
      uhrzeit:        e.uhrzeit     || null,
      typ:            e.typ,
      titel:          e.titel,
      distanz_km:     e.distanz_km  != null ? e.distanz_km : null,
      bemerkung:      e.bemerkung   || null,
      ref_einheit_id: e.ref_einheit_id || null,
    });
    renderPage(); // Vollständiges Re-Render (KW-Summen, Filter etc.)
  } catch (err) {
    benachrichtigen('Verschieben fehlgeschlagen.', 'err');
    renderPage(); // Originalzustand wiederherstellen
  }
}

// Globale Toast-Benachrichtigung (in 02_app.js verfügbar; Module nutzen eigene IIFE-Variante)
function benachrichtigen(text, art) {
  const cont = document.getElementById('notification-container');
  if (!cont) { console.log(text); return; }
  const cls = art === 'err' ? 'notif-err' : (art === 'warn' ? 'notif-warn' : 'notif-ok');
  const div = document.createElement('div');
  div.className = `notif ${cls}`;
  div.textContent = text;
  cont.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

// Extrahiert die Tour-ID aus einer Komoot-URL und gibt die Embed-URL zurück.
// Unterstützt: komoot.com/tour/ID, komoot.com/de-de/tour/ID, etc.
function komootEmbedUrl(url) {
  if (!url) return null;
  const m = String(url).match(/\/tour\/(\d+)/);
  if (!m) return null;
  let token = null;
  try { token = new URL(url).searchParams.get('share_token'); } catch (_) {}
  const qs = token ? '?share_token=' + encodeURIComponent(token) : '';
  return 'https://www.komoot.com/tour/' + m[1] + '/embed' + qs;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// HTML-Entities aus DB-Strings dekodieren (z.B. &quot; → ")
function _decodeHtml(s) {
  if (!s) return '';
  const el = document.createElement('textarea');
  el.innerHTML = String(s);
  return el.value;
}

// Wettkampf-Serien laden (5-Minuten-Cache)
function _histHtml(termine, statistikUrl) {
  if (!termine || !termine.length) return '';
  return termine.map(t => {
    const name = _decodeHtml(t.serie_name || '');
    const href = statistikUrl ? `${statistikUrl}/#veranstaltung/${t.id}` : null;
    const tag  = href ? 'a' : 'div';
    const attrs = href
      ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener" title="Im Statistikportal öffnen"`
      : '';
    return `<${tag} class="kal-item wk-hist-item"${attrs}>
      <span class="kal-item-title">🏆 ${escapeHtml(name)}${href ? ' <span class="wk-hist-arrow">↗</span>' : ''}</span>
    </${tag}>`;
  }).join('');
}

async function _ladeWettkampfDaten() {
  const CACHE_MS = 5 * 60 * 1000;
  if (_wettkampfCache && (Date.now() - _wettkampfCache.ts) < CACHE_MS) {
    return _wettkampfCache.data;
  }
  const resp = await apiGet('wettkampf', { silent: true });
  _wettkampfCache = { ts: Date.now(), data: resp.serien || [] };
  return _wettkampfCache.data;
}

let _wkTermineCache     = {}; // 'YYYY-MM' → { ts, termine, statistikportal_url }
let _statistikportalUrl = '';

async function _ladeWettkampfTermine(von, bis) {
  const CACHE_MS = 5 * 60 * 1000;
  const key = von.slice(0, 7); // Monat als Cache-Schlüssel
  const hit = _wkTermineCache[key];
  if (hit && (Date.now() - hit.ts) < CACHE_MS) return hit;
  try {
    const resp = await apiGet(`wettkampf/termine?von=${von}&bis=${bis}`, { silent: true });
    const entry = {
      ts: Date.now(),
      termine: resp.termine || [],
      statistikportal_url: resp.statistikportal_url || '',
    };
    _wkTermineCache[key] = entry;
    if (entry.statistikportal_url) _statistikportalUrl = entry.statistikportal_url;
    return entry;
  } catch (_) {
    return { termine: [], statistikportal_url: '' };
  }
}

// ── Wettkampf: Schnelleintrag-Popover ────────────────────────────────────

let _wkPopSerie   = null; // ID der aktuell geöffneten Serie
let _wkHideTimer  = null; // Verzögerungs-Timer für Hover-Hide
let _wkPrivatMap  = {};   // datum → [{id, bemerkung, titel}] – befüllt von renderKalender/renderListeData

// Tap-Toggle (Listenansicht / Touch): erneutes Antippen schließt das Popover
function _wkPopoverToggle(serieId, anchorEl) {
  if (_wkPopSerie === serieId) { _wkPopoverHide(); return; }
  _wkPopoverShow(serieId, anchorEl);
}

function _wkPopoverShow(serieId, anchorEl) {
  const serien = _wettkampfCache?.data || [];
  const serie  = serien.find(s => s.id === serieId);
  if (!serie || !state.user) return;

  clearTimeout(_wkHideTimer);
  if (_wkPopSerie === serieId) return; // bereits offen, kein Flackern
  _wkPopoverHide();
  // Detail-Tooltip verstecken, wenn der Disziplin-Popover aufgeht
  if (typeof KAL_POPOVER !== 'undefined') KAL_POPOVER.hide();
  _wkPopSerie = serieId;

  const _heuteStr = ymd(new Date());
  const manuell = serie.naechstes_datum && serie.naechstes_datum >= _heuteStr ? serie.naechstes_datum : null;
  const datum   = manuell
    || (typeof ADMIN_WETTKAMPF !== 'undefined' ? ADMIN_WETTKAMPF.predictNextDate(serie.letztes_datum) : null);
  if (!datum) { _wkNotify('Kein Termin berechenbar.', false); return; }

  const isFest   = !!manuell;
  const name     = _decodeHtml(serie.name || serie.kuerzel || '');
  const datumFmt = new Date(datum + 'T00:00:00').toLocaleDateString('de-DE',
    { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

  // Disziplinen ermitteln
  const ausgeschlossen = new Set(serie.disziplinen_ausgeschlossen || []);
  const diszSet = new Set();
  (serie.disziplinen || []).forEach(d => { if (!ausgeschlossen.has(d)) diszSet.add(d); });
  (serie.disziplinen_extra || []).forEach(d => diszSet.add(d));
  const disziplinen = [...diszSet];

  // Popover-Element aufbauen
  const pop = document.createElement('div');
  pop.id        = 'wk-popover';
  pop.className = 'wk-popover kal-cal-wettkampf';

  const nameEl = document.createElement('div');
  nameEl.className   = 'wk-pop-name';
  nameEl.textContent = '🏆 ' + name;
  pop.appendChild(nameEl);

  const datumEl = document.createElement('div');
  datumEl.className = 'wk-pop-datum';
  datumEl.textContent = datumFmt;
  if (!isFest) {
    const badge = document.createElement('span');
    badge.className   = 'wk-pop-badge';
    badge.textContent = '~ Prognose';
    datumEl.appendChild(badge);
  }
  pop.appendChild(datumEl);

  const diszDiv = document.createElement('div');
  diszDiv.className = 'wk-pop-disz';

  // Disziplin-Buttons als Toggle: aktiv = bereits eingetragen, inaktiv = noch nicht
  // Nur Einträge dieser Serie filtern (Titelprefix) – verhindert Überschneidungen bei gleichen Datum
  const vorhandene  = (_wkPrivatMap[datum] || []).filter(ev => (ev.titel || '').startsWith('🏆 ' + name));
  const serieDaten  = (_wettkampfCache?.data || []).find(s => s.id === serieId) || null;
  const buttons = disziplinen.length ? disziplinen : [null];
  buttons.forEach(d => {
    const normD      = d || null; // null für „ohne Disziplin"
    const existEintrag = vorhandene.find(ev => (ev.bemerkung || null) === normD) || null;
    // auch formale Anmeldung prüfen (Card-Sign-up)
    const formalAnmId = (serieDaten?.meine_anmeldung_id &&
                          (serieDaten.meine_disziplin || null) === normD)
                        ? serieDaten.meine_anmeldung_id : null;
    const isAktiv = !!(existEintrag || formalAnmId);

    const btn = document.createElement('button');
    btn.className   = 'wk-pop-btn' + (isAktiv ? ' wk-pop-btn--active' : '');
    btn.textContent = (isAktiv ? '✓ ' : '') + (d || 'Teilnahme eintragen');
    if (isAktiv) {
      // Noch mal klicken → direkt löschen (kein Confirm-Dialog, Toggle-UX)
      btn.addEventListener('click', async () => {
        _wkPopoverHide();
        try {
          const delAnmId = formalAnmId || serieDaten?.meine_anmeldung_id || null;
          await Promise.all([
            existEintrag ? apiDel(`mein-plan/einheiten/${existEintrag.id}`) : Promise.resolve(),
            delAnmId     ? apiDel(`wettkampf/anmeldungen/${delAnmId}`)      : Promise.resolve(),
          ]);
        } catch (_) { /* optional */ }
        _wettkampfCache = null;
        renderPage();
      });
    } else {
      btn.addEventListener('click', () => _wkEintragen(serieId, d || ''));
    }
    diszDiv.appendChild(btn);
  });
  pop.appendChild(diszDiv);

  // Hover-Keep-alive: Maus über Popover → Timer stoppen
  pop.addEventListener('mouseenter', () => clearTimeout(_wkHideTimer));
  pop.addEventListener('mouseleave', () => { _wkHideTimer = setTimeout(_wkPopoverHide, 180); });

  document.body.appendChild(pop);
  _wkPopPosition(pop, anchorEl.getBoundingClientRect());

  // Escape schließt den Popover
  document.addEventListener('keydown', _wkEscHide);
}

function _wkEscHide(e) {
  if (e.key === 'Escape') _wkPopoverHide();
}

function _wkPopoverHide() {
  clearTimeout(_wkHideTimer);
  document.removeEventListener('keydown', _wkEscHide);
  const pop = document.getElementById('wk-popover');
  if (pop) pop.remove();
  _wkPopSerie = null;
}

function _wkPopPosition(pop, rect) {
  const popW   = pop.offsetWidth  || 220;
  const popH   = pop.offsetHeight || 140;
  const margin = 8;
  const viewW  = window.innerWidth;
  const viewH  = window.innerHeight;
  // Rechts vom Element, falls Platz – sonst links
  let left = rect.right + margin;
  if (left + popW > viewW - margin) left = rect.left - popW - margin;
  if (left < margin) left = margin;
  // Bündig mit Oberkante des Elements, nach oben klappen falls nötig
  let top = rect.top;
  if (top + popH > viewH - margin) top = Math.max(margin, rect.bottom - popH);
  pop.style.left = left + 'px';
  pop.style.top  = top  + 'px';
}

async function _wkEintragen(serieId, disziplin) {
  _wkPopoverHide();

  const serien = _wettkampfCache?.data || [];
  const serie  = serien.find(s => s.id === serieId);
  if (!serie) return;

  const _heuteWk = ymd(new Date());
  const manuellWk = serie.naechstes_datum && serie.naechstes_datum >= _heuteWk ? serie.naechstes_datum : null;
  const datum = manuellWk
    || (typeof ADMIN_WETTKAMPF !== 'undefined' ? ADMIN_WETTKAMPF.predictNextDate(serie.letztes_datum) : null);
  if (!datum) return;

  const name  = _decodeHtml(serie.name || serie.kuerzel || '');
  const titel = ('🏆 ' + name + (disziplin ? ` – ${disziplin}` : '')).slice(0, 200);
  // Distanz: zuerst aus disziplin_distanzen-Map der API (DB-Wert), Fallback: Name-Parsing
  const distMap = serie.disziplin_distanzen || {};
  const distM   = disziplin && distMap[disziplin] != null ? distMap[disziplin] : null;
  const km      = distM !== null ? Math.round(distM) / 1000 : _disziplinKm(disziplin);

  try {
    await apiPost('mein-plan/einheiten', {
      datum,
      typ:        'wettkampf',
      titel,
      distanz_km: km,
      bemerkung:  disziplin || null,
    });
    // auch formale Anmeldung anlegen → erscheint in Teilnehmerliste der Karte
    try {
      await apiPost(`wettkampf/${serieId}/anmeldungen`, { disziplin: disziplin || '' });
    } catch (_) { /* optional – kein Fehler wenn Anmeldung nicht möglich */ }
    _wettkampfCache = null;
    ladeWettkampfSektionInto('wettkampf-sektion');
    _wkNotify('Wettkampfteilnahme eingetragen.', true);
    renderPage();
  } catch (e) {
    _wkNotify('Fehler: ' + (e.message || ''), false);
  }
}

// Wettkampfdistanz aus Disziplinname ableiten (für Wochenkilometer)
function _disziplinKm(disziplin) {
  if (!disziplin) return null;
  const s = disziplin.toLowerCase();
  if (/marathon/.test(s) && !/halb|half/.test(s)) return 42.195;
  if (/halb.?marathon|half.?marathon/.test(s))     return 21.098;
  // "X,X km" oder "X km"
  const km = s.match(/(\d+(?:[,\.]\d+)?)\s*km/);
  if (km) return parseFloat(km[1].replace(',', '.'));
  // Laufdistanzen in Metern: "3.000m", "1500m", "5000 m" (dt. Tausenderpunkt normalisieren)
  const sNorm = s.replace(/(\d)\.(\d{3})(?=\s*m)/, '$1$2');
  const m = sNorm.match(/(\d+)\s*m(?![a-z])/);
  if (m) { const v = parseInt(m[1], 10); return v >= 60 ? Math.round(v) / 1000 : null; }
  return null;
}

function _wkNotify(text, ok) {
  const cont = document.getElementById('notification-container');
  if (!cont) return;
  const d = document.createElement('div');
  d.className = 'notif ' + (ok ? 'notif-ok' : 'notif-err');
  d.textContent = text;
  cont.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}
