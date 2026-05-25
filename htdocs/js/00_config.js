// ============================================================
// Trainingsportal – Config & Theming
// ============================================================
// Übernimmt 1:1 die Logik aus dem Statistikportal:
//   - Farbberechnungen (_hexToRgb, _lighten, _darken, _luminance, _onColor)
//   - applyConfig(cfg)         Setzt CSS-Variablen, Logo, Texte
//   - _updateBodyThemeColor()  Adressleiste je nach Setting
//
// Damit erbt das Trainingsportal die identische Optik, ohne CSS
// oder Theming-Code zu duplizieren.
// ============================================================

var appConfig = {};

// ── Farbhelfer ─────────────────────────────────────────────
function _hexToRgb(hex) {
  hex = (hex || '').replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(function(c){ return c+c; }).join('');
  var n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function _rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(function(v){
    return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
  }).join('');
}
function _lighten(hex, factor) {
  var c = _hexToRgb(hex);
  return _rgbToHex(c.r+(255-c.r)*factor, c.g+(255-c.g)*factor, c.b+(255-c.b)*factor);
}
function _darken(hex, factor) {
  var c = _hexToRgb(hex);
  return _rgbToHex(c.r*(1-factor), c.g*(1-factor), c.b*(1-factor));
}
function _luminance(hex) {
  var c = _hexToRgb(hex);
  return [c.r, c.g, c.b].reduce(function(lum, v, i) {
    var s = v / 255;
    s = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    return lum + s * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}
function _onColor(bgHex) {
  var lum = _luminance(bgHex);
  var contrastWhite = (1 + 0.05) / (lum + 0.05);
  var contrastBlack = (lum + 0.05) / (0 + 0.05);
  return contrastWhite >= contrastBlack ? '#ffffff' : '#111111';
}
// Hellt eine Farbe so weit auf, dass sie auf der dunklen Dark-Mode-Fläche
// (--surface ≈ #1a1f2e) als Border/Text sichtbar bleibt. Bereits helle
// Farben (z. B. Gelb) bleiben unverändert. Analog zu --accent-light im
// Statistikportal, aber kontrast-gesteuert statt mit festem Faktor.
function _farbeFuerDark(hex) {
  var DARK_SURFACE = '#1a1f2e';
  var MIN_KONTRAST = 3.5;
  function kontrast(a, b) {
    var la = _luminance(a), lb = _luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  var f = hex;
  for (var i = 0; i < 12 && kontrast(f, DARK_SURFACE) < MIN_KONTRAST; i++) {
    f = _lighten(f, 0.12);
  }
  return f;
}

function _updateBodyThemeColor() {
  var pref = (window.appConfig && window.appConfig.adressleiste_farbe) || 'aus';
  var metaTheme = document.getElementById('meta-theme-color');
  if (pref === 'aus') {
    document.body.style.removeProperty('background-color');
    if (metaTheme) metaTheme.removeAttribute('content');
    return;
  }
  var style = getComputedStyle(document.documentElement);
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
               (!document.documentElement.getAttribute('data-theme') &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);
  var color;
  if (pref === 'primary') {
    color = isDark
      ? style.getPropertyValue('--primary-dark').trim()
      : style.getPropertyValue('--primary3').trim();
  } else if (pref === 'accent') {
    color = style.getPropertyValue('--accent').trim();
  }
  if (!color) return;
  document.body.style.backgroundColor = color;
  if (metaTheme) metaTheme.setAttribute('content', color);
}

// ── Typ-Fallback-Farbe aus CSS berechnen ───────────────────
// Legt kurz ein unsichtbares Element mit der kal-typ-{slug}-Klasse an
// und liest die computed border-left-color aus (→ CSS-Fallback-Wert).
function getTypDefaultFarbe(slug) {
  var el = document.createElement('div');
  el.className = 'kal-item kal-typ-' + slug;
  el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;border-left-width:4px;border-left-style:solid';
  document.body.appendChild(el);
  var rgb = getComputedStyle(el).borderLeftColor;
  document.body.removeChild(el);
  var m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(function(n) {
    return parseInt(n, 10).toString(16).padStart(2, '0');
  }).join('');
}

// ── Dynamische Typ-Farben per <style>-Tag injizieren ───────
// Erzeugt .kal-typ-{slug}, .block-typ-{slug}, .liste-typ-{slug} etc.
// mit der in training_typen.farbe gespeicherten Farbe.
// Typen ohne farbe werden übersprungen → CSS-Fallback greift.
function applyTypenFarben(typen) {
  var el = document.getElementById('typen-farben-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'typen-farben-style';
    document.head.appendChild(el);
  }
  if (!Array.isArray(typen) || !typen.length) { el.textContent = ''; return; }
  var lines = [];
  typen.forEach(function(t) {
    if (!t.farbe) return;
    var s = t.slug.replace(/[^a-z0-9_-]/g, '_');
    var f = t.farbe;
    var fDark   = _farbeFuerDark(f); // im Dark Mode genutzte, aufgehellte Variante

    // Per-Typ-Farbvariablen. Alle Regeln referenzieren --tf statt der rohen
    // Farbe; im Dark Mode wird --tf auf die aufgehellte Variante umgeschaltet,
    // damit Border/Text auf dunklem Grund sichtbar bleiben (analog zu
    // --accent-light im Statistikportal). --tf-d (dunklere Variante für
    // aktive Buttons) und --tf-on (Textfarbe auf gefüllter Fläche) folgen mit.
    var allSel = '.kal-typ-' + s + ',.block-typ-' + s + ',.liste-typ-' + s;
    function scoped(scope) {
      return scope + ' .kal-typ-' + s + ',' + scope + ' .block-typ-' + s + ',' + scope + ' .liste-typ-' + s;
    }
    // Hell (Standard)
    lines.push(allSel + ' { --tf: ' + f + '; --tf-d: ' + _darken(f, 0.15) + '; --tf-on: ' + _onColor(f) + '; }');
    // Dark Mode (manuell gesetzt)
    lines.push(scoped('[data-theme="dark"]') + ' { --tf: ' + fDark + '; --tf-d: ' + _darken(fDark, 0.15) + '; --tf-on: ' + _onColor(fDark) + '; }');
    // Dark Mode (OS-Präferenz, sofern nicht manuell auf hell gestellt)
    lines.push('@media (prefers-color-scheme: dark) { ' + scoped(':root:not([data-theme="light"])') + ' { --tf: ' + fDark + '; --tf-d: ' + _darken(fDark, 0.15) + '; --tf-on: ' + _onColor(fDark) + '; } }');

    // Kalender (Monat + Heute-Card + Hover-Popover + Listenansicht)
    lines.push('.kal-item.kal-typ-'          + s + ' { border-left-color: var(--tf) !important; background: color-mix(in srgb, var(--tf) 10%, var(--surface)) !important; }');
    lines.push('.kal-item.is-privat.kal-typ-' + s + ' { background: color-mix(in srgb, var(--tf) 14%, var(--surface)) !important; }');
    lines.push('.heute-card.kal-typ-'         + s + ' { border-left-color: var(--tf) !important; }');
    lines.push('.kal-pop-typ.kal-typ-'        + s + ' { color: var(--tf) !important; }');
    lines.push('.liste-row.kal-typ-'          + s + ' { border-left-color: var(--tf) !important; }');
    lines.push('.liste-typ-'                  + s + ' { background: color-mix(in srgb, var(--tf) 14%, var(--surface)); color: var(--tf) !important; }');
    // Nächste Wettkämpfe – wk-card trägt kal-typ-{slug} (via ladeWettkampfSektionInto)
    lines.push('.wk-card.kal-typ-'            + s + ' { border-left-color: var(--tf) !important; }');
    lines.push('.wk-card.kal-typ-'            + s + ':hover { background: color-mix(in srgb, var(--tf) 8%, var(--surface)) !important; }');
    lines.push('.wk-card.kal-typ-'            + s + ' .wk-pop-btn { border-color: var(--tf) !important; background: color-mix(in srgb, var(--tf) 12%, var(--surface)) !important; }');
    lines.push('.wk-card.kal-typ-'            + s + ' .wk-pop-btn:hover { background: color-mix(in srgb, var(--tf) 28%, var(--surface)) !important; }');
    lines.push('.wk-card.kal-typ-'            + s + ' .wk-pop-btn--active { background: var(--tf) !important; border-color: var(--tf-d) !important; color: var(--tf-on) !important; }');
    lines.push('.wk-card.kal-typ-'            + s + ' .wk-pop-btn--active:hover { background: var(--tf-d) !important; }');
    // Planung-Sidebar
    lines.push('.pblock-gruppe-titel.block-typ-' + s + ' { border-bottom-color: var(--tf) !important; }');
    lines.push('.pblock-card.block-typ-'      + s + ' { border-left-color: var(--tf) !important; }');
    // Blöcke-Seite (Block-Karte oben + Gruppen-Titel)
    lines.push('.block-typ-'                  + s + ' { border-top-color: var(--tf) !important; }');
    lines.push('.bloecke-gruppe-typ.block-typ-' + s + ' { border-left-color: var(--tf); color: var(--tf); }');
  });
  el.textContent = lines.join('\n');
}

// ── Hauptlogik ─────────────────────────────────────────────
function applyConfig(cfg) {
  appConfig = cfg || {};
  window.appConfig = appConfig;

  var root = document.documentElement;
  var p  = cfg.farbe_primary || '#cc0000';
  var a  = cfg.farbe_accent  || '#003087';
  var p2 = _lighten(p, 0.12);
  var p3 = _lighten(p, 0.28);
  var a2 = _lighten(a, 0.18);
  var pDark  = _darken(p, 0.35);
  var pLight = _lighten(p, 0.45);
  var aLight = _lighten(a, 0.45);
  var aRgb = _hexToRgb(a);
  var aRgbStr = aRgb ? aRgb.r + ',' + aRgb.g + ',' + aRgb.b : '0,48,135';

  root.style.setProperty('--primary',      p);
  root.style.setProperty('--primary2',     p2);
  root.style.setProperty('--primary3',     p3);
  root.style.setProperty('--primary-dark', pDark);
  root.style.setProperty('--primary-light',pLight);
  root.style.setProperty('--accent',       a);
  root.style.setProperty('--accent2',      a2);
  root.style.setProperty('--accent-light', aLight);
  root.style.setProperty('--accent-rgb',   aRgbStr);
  root.style.setProperty('--btn-bg',       a);
  root.style.setProperty('--btn-bg2',      a2);
  root.style.setProperty('--on-primary', _onColor(p));
  root.style.setProperty('--on-accent',  _onColor(a));
  root.style.setProperty('--on-btn',     _onColor(a));

  _updateBodyThemeColor();

  // ── Texte ──
  var name      = cfg.verein_name    || 'Mein Verein e.V.';
  var kuerzel   = cfg.verein_kuerzel || name;
  var untertitel= cfg.app_untertitel || 'Trainingsportal';
  var logoFile  = cfg.logo_datei || '';
  // Logos und sonstige Uploads liegen im Statistikportal-htdocs.
  // shared.php liefert sie unter unserer Domain aus.
  var logoUrl   = logoFile
    ? (logoFile.startsWith('http') ? logoFile : 'shared.php?file=' + encodeURI(logoFile))
    : '';

  var seitentitel = (cfg.training_seitentitel || '').trim() || 'Trainingsplan';

  document.title = name + ' – ' + seitentitel;

  var elMain = document.querySelector('.logo-main span');
  if (elMain) elMain.textContent = kuerzel;
  var elSub  = document.querySelector('.logo-sub span:first-child');
  if (elSub)  elSub.textContent  = seitentitel;

  var elLT = document.querySelector('.login-title');
  if (elLT) elLT.textContent = name;
  var elLS = document.querySelector('.login-sub');
  if (elLS) elLS.textContent = seitentitel + ' · Bitte einloggen';

  var elFoot = document.querySelector('.mobile-nav-footer');
  if (elFoot) elFoot.textContent = seitentitel;

  // Logos
  document.querySelectorAll('.logo-img, .login-logo').forEach(function(img) {
    if (logoUrl) {
      img.src = logoUrl;
      img.alt = name;
      img.style.display = '';
    } else {
      img.src = '';
      img.style.display = 'none';
    }
  });

  // ── Typ-Farben injizieren ──
  applyTypenFarben(cfg.typen || []);
}

// ── Versionssichtbarkeit steuern ───────────────────────────
// Wird nach jedem Auth-State-Wechsel aufgerufen.
// Setting "training_version_anzeigen" = '1' → nur Admins sehen die Version.
// Setting leer/0 (Standard) → Version für alle sichtbar.
function applyVersionVisibility(user) {
  var cfg     = window.appConfig || {};
  var nurAdmin = (cfg.training_version_anzeigen === '1' ||
                  cfg.training_version_anzeigen === 1   ||
                  cfg.training_version_anzeigen === true);
  var isAdmin  = !!(user && user.rolle === 'admin');
  var vis      = !nurAdmin || isAdmin;
  var display  = vis ? '' : 'none';
  var el1 = document.getElementById('header-version');
  var el2 = document.getElementById('mobile-header-ver');
  if (el1) el1.style.display = display;
  if (el2) el2.style.display = display;
}

// ── Asset-URL aus Statistikportal-uploads über shared.php ──
function assetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return 'shared.php?file=' + encodeURI(path);
}

// ── Loader: holt die Settings vom Backend ──────────────────
const CONFIG = (() => {
  let loaded = null;
  async function load() {
    if (loaded) return loaded;
    try {
      const r = await apiGet('config', { silent: true });
      loaded = r.config || r.data || {};
      applyConfig(loaded);
    } catch (e) {
      loaded = {};
    }
    return loaded;
  }
  function get(key) { return loaded ? loaded[key] : undefined; }
  function clear() { loaded = null; }
  return { load, get, clear };
})();
