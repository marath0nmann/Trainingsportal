// ============================================================
// Trainingsportal – API-Helper
// ============================================================
// Konvention identisch zum Statistikportal:
//   apiGet('endpoint?query=…')
//   apiPost('endpoint', { … })
//   apiPut('endpoint/42', { … })
//   apiDel('endpoint/7')
//
// Optionen-Objekt als letztes Argument:
//   { silent: true }  → bei 401 NICHT zum Login-Portal weiterleiten
// ============================================================

const API_BASE = 'api/index.php?p=';

async function apiCall(method, path, body, opts) {
  const options = opts || {};
  const init = {
    method,
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const r = await fetch(API_BASE + path, init);
  let data = null;
  try { data = await r.json(); } catch (e) { /* ignore */ }

  if (r.status === 401) {
    if (!options.silent) handleUnauthorized(data);
    const err = new Error('Nicht angemeldet');
    err.status = 401;
    err.data = data;
    throw err;
  }
  if (!r.ok) {
    const msg = (data && data.fehler) || ('HTTP ' + r.status);
    const err = new Error(msg);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

const apiGet  = (path, opts)        => apiCall('GET',    path, undefined, opts);
const apiPost = (path, body, opts)  => apiCall('POST',   path, body || {}, opts);
const apiPut  = (path, body, opts)  => apiCall('PUT',    path, body || {}, opts);
const apiDel  = (path, opts)        => apiCall('DELETE', path, undefined, opts);

function handleUnauthorized(data) {
  if (data && data.login_portal_aktiv && data.login_portal_url) {
    const ret = encodeURIComponent(window.location.href);
    window.location.href = data.login_portal_url.replace(/\/$/, '') + '/?return=' + ret;
    return;
  }
  // Standalone-Fallback
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function goToLoginPortal() {
  apiGet('auth/me').catch(() => {});
}
