// ============================================================
// Trainingsportal – App-Bootstrap (Skeleton)
// ============================================================
// Aufgaben (initial):
//   - auth/me beim Laden prüfen, sonst zum Login-Portal weiterleiten
//   - Header mit Benutzerdaten füllen
//   - Mobile-Burger-Menü
//   - Platzhalter-Routing (renderPage)
// ============================================================

const state = {
  user: null,
  tab:  'dashboard',
};

window.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const r = await apiGet('auth/me');
    state.user = r.user;
    showApp();
  } catch (e) {
    // apiGet leitet bei 401 selbst zum Login-Portal weiter
  }
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = '';
  fillUserBadge();
  renderPage();
}

function fillUserBadge() {
  const u = state.user || {};
  const userBtn = document.getElementById('user-btn');
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

function navigate(tab) {
  state.tab = tab;
  renderPage();
}

function renderPage() {
  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div style="padding:32px;max-width:880px;margin:0 auto">
      <h1 style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:32px;letter-spacing:.5px">
        Trainingsportal
      </h1>
      <p style="color:var(--text2);margin-top:8px">
        Skelett angelegt. Inhalte folgen.
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
