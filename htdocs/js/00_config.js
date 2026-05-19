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
  el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;border-left:4px solid transparent';
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
    // Kalender (Monat + Heute-Card + Hover-Popover + Listenansicht)
    lines.push('.kal-item.kal-typ-'          + s + ' { border-left-color: '   + f + ' !important; }');
    lines.push('.heute-card.kal-typ-'         + s + ' { border-left-color: '   + f + ' !important; }');
    lines.push('.kal-pop-typ.kal-typ-'        + s + ' { color: '               + f + ' !important; }');
    lines.push('.liste-row.kal-typ-'          + s + ' { border-left-color: '   + f + ' !important; }');
    lines.push('.liste-typ-'                  + s + ' { background: color-mix(in srgb, ' + f + ' 14%, var(--surface)); color: ' + f + ' !important; }');
    // Planung-Sidebar
    lines.push('.pblock-gruppe-titel.block-typ-' + s + ' { border-bottom-color: ' + f + ' !important; }');
    lines.push('.pblock-card.block-typ-'      + s + ' { border-left-color: '   + f + ' !important; }');
    // Blöcke-Seite (Block-Karte oben + Gruppen-Titel)
    lines.push('.block-typ-'                  + s + ' { border-top-color: '    + f + ' !important; }');
    lines.push('.bloecke-gruppe-typ.block-typ-' + s + ' { border-left-color: ' + f + '; color: ' + f + '; }');
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

  document.title = name + ' – Trainingsplan';

  var elMain = document.querySelector('.logo-main span');
  if (elMain) elMain.textContent = kuerzel;
  var elSub  = document.querySelector('.logo-sub span:first-child');
  if (elSub)  elSub.textContent  = 'Trainingsplan';

  var elLT = document.querySelector('.login-title');
  if (elLT) elLT.textContent = name;
  var elLS = document.querySelector('.login-sub');
  if (elLS) elLS.textContent = 'Trainingsplan · Bitte einloggen';

  var elFoot = document.querySelector('.mobile-nav-footer');
  if (elFoot) elFoot.textContent = 'Trainingsplan';

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
