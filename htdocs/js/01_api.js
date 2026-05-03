// ============================================================
// Trainingsportal – API-Helper
// ============================================================
// Konvention identisch zum Statistikportal:
//   apiGet('endpoint?query=…')
//   apiPost('endpoint', { … })
//   apiPut('endpoint/42', { … })
//   apiDel('endpoint/7')
// ============================================================

const API_BASE = 'api/index.php?p=';

async function apiCall(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(API_BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch (e) { /* ignore */ }

  if (r.status === 401) {
    handleUnauthorized(data);
    throw new Error('Nicht angemeldet');
  }
  if (!r.ok) {
    const msg = (data && data.fehler) || ('HTTP ' + r.status);
    throw new Error(msg);
  }
  return data;
}

const apiGet  = (path)        => apiCall('GET',    path);
const apiPost = (path, body)  => apiCall('POST',   path, body || {});
const apiPut  = (path, body)  => apiCall('PUT',    path, body || {});
const apiDel  = (path)        => apiCall('DELETE', path);

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
