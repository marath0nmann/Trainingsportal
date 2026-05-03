// ============================================================
// Trainingsportal – Config-Loader
// ============================================================
// Lädt beim App-Start die Vereins-Einstellungen aus
// `einstellungen` (geteilte Tabelle mit Statistik-/Login-Portal)
// und mappt sie auf CSS-Variablen, Logo und App-Namen.
// ============================================================

const CONFIG = (() => {
  let data = null;

  async function load() {
    if (data) return data;
    try {
      const r = await apiGet('config', { silent: true });
      data = r.config || {};
    } catch (e) {
      data = {};
    }
    apply(data);
    return data;
  }

  function get(key) { return data ? data[key] : undefined; }

  function apply(cfg) {
    const root = document.documentElement;

    if (cfg.farbe_primary)  root.style.setProperty('--primary',  cfg.farbe_primary);
    if (cfg.farbe_primary2) root.style.setProperty('--primary2', cfg.farbe_primary2);
    if (cfg.farbe_primary3) root.style.setProperty('--primary3', cfg.farbe_primary3);
    if (cfg.farbe_accent)   root.style.setProperty('--accent',   cfg.farbe_accent);
    if (cfg.farbe_accent2)  root.style.setProperty('--accent2',  cfg.farbe_accent2);

    // --primary-dark wird vom CSS für Header-Gradient genutzt, ist aber
    // nicht in einstellungen → aus farbe_primary abgeleitet (~25 % dunkler)
    if (cfg.farbe_primary) {
      const dk = darken(cfg.farbe_primary, 0.25);
      root.style.setProperty('--primary-dark', dk);
    }

    // On-Color-Texte (weiß für dunkle Akzent-/Primary-Farben)
    if (cfg.farbe_primary) {
      root.style.setProperty('--on-primary', isLight(cfg.farbe_primary) ? '#1a2340' : '#ffffff');
    }
    if (cfg.farbe_accent) {
      root.style.setProperty('--on-accent', isLight(cfg.farbe_accent) ? '#1a2340' : '#ffffff');
      // Buttons nutzen den Akzent
      root.style.setProperty('--btn-bg',  cfg.farbe_accent);
      root.style.setProperty('--btn-bg2', cfg.farbe_accent2 || cfg.farbe_accent);
    }

    // Theme-Farbe für Browser/Safari
    const meta = document.getElementById('meta-theme-color');
    if (meta && cfg.farbe_primary) meta.setAttribute('content', cfg.farbe_primary);

    // Logo
    if (cfg.logo_datei || cfg.logo_url) {
      const src = cfg.logo_url || cfg.logo_datei;
      document.querySelectorAll('.logo-img, .login-logo').forEach(img => {
        img.src = src;
        img.style.display = '';
      });
    }

    // Vereinsname → Untertitel im Logo-Block
    if (cfg.verein_kuerzel) {
      const sub = document.querySelector('.logo-sub > span:first-child');
      if (sub) sub.textContent = cfg.verein_kuerzel;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : null;
  }
  function rgbToHex(r,g,b) {
    return '#' + [r,g,b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')).join('');
  }
  function darken(hex, amount) {
    const rgb = hexToRgb(hex); if (!rgb) return hex;
    return rgbToHex(rgb[0]*(1-amount), rgb[1]*(1-amount), rgb[2]*(1-amount));
  }
  function isLight(hex) {
    const rgb = hexToRgb(hex); if (!rgb) return false;
    // Wahrgenommene Helligkeit (ITU-R BT.601)
    const brightness = (rgb[0]*299 + rgb[1]*587 + rgb[2]*114) / 1000;
    return brightness > 165;
  }

  return { load, get };
})();
