
// ── Admin System-Dashboard ───────────────────────────────────

async function renderAdminSystem(contentEl) {
  contentEl.innerHTML = '<div class="loading" style="padding:32px;text-align:center"><div class="spinner"></div> Lade System-Informationen&hellip;</div>';
  var r = await apiGet('admin-dashboard');
  if (!r || !r.ok) { contentEl.innerHTML = '<div style="color:var(--accent);padding:20px">Fehler beim Laden.</div>'; return; }
  var d = r.data;
  var s = d.stats || {};

  function fmtDate(iso) {
    if (!iso) return '–';
    return new Date(iso).toLocaleString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function fmtDateOnly(iso) {
    if (!iso) return '–';
    return new Date(iso).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function timeSince(iso) {
    if (!iso) return '–';
    var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'gerade eben';
    if (diff < 3600) return Math.floor(diff/60) + ' Min. her';
    if (diff < 86400) return Math.floor(diff/3600) + ' Std. her';
    return new Date(iso).toLocaleDateString('de-DE');
  }
  function badge(rolle) {
    var colors = { admin: 'var(--accent)', trainer: 'var(--primary)', athlet: '#2ecc71', leser: 'var(--text2)' };
    var c = colors[rolle] || 'var(--text2)';
    return '<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;background:' + c + '22;color:' + c + '">' + (rolle||'–') + '</span>';
  }
  function avatarInitials(name, size) {
    size = size || 32;
    var parts = (name || '?').trim().split(/\s+/);
    var ini = parts.length >= 2 ? parts[0][0] + parts[parts.length-1][0] : (parts[0]||'?')[0];
    ini = ini.toUpperCase();
    var fs = Math.round(size * 0.42);
    return '<span style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:var(--accent);color:#fff;font-size:' + fs + 'px;font-weight:700">' + escapeHtml(ini) + '</span>';
  }

  // phpBB-style stat row
  function srow(label, val, bold) {
    return '<tr>' +
      '<td style="padding:7px 12px;border-bottom:1px solid var(--border);color:var(--text2);font-size:13px">' + label + '</td>' +
      '<td style="padding:7px 12px;border-bottom:1px solid var(--border);font-size:13px;' + (bold!==false?'font-weight:700':'') + '">' + val + '</td>' +
    '</tr>';
  }
  function shead(label) {
    return '<tr><th colspan="2" style="padding:8px 12px;background:var(--primary);color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">' + label + '</th></tr>';
  }
  function stable(rows) {
    return '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden"><table style="width:100%;border-collapse:collapse"><colgroup><col><col></colgroup>' + rows + '</table></div>';
  }

  // Left column
  var leftRows =
    shead('System') +
    srow('Portal-Version', (function(){ var sc = document.querySelector('script[src*="02_app.js"]'); if (!sc) return '–'; var m = sc.src.match(/v=(\d+)/); return m ? 'v' + m[1] : '–'; })()) +
    srow('Portal in Betrieb seit', fmtDate(s.portalSeit)) +
    srow('Datenbank-Server', d.dbVersion || '–') +
    srow('Datenbank-Gr&ouml;&szlig;e', d.dbSize !== null ? d.dbSize + ' MB' : '–') +
    srow('PHP-Version', d.phpVersion || '–') +
    shead('Benutzer') +
    srow('Anzahl Benutzer (aktiv)', s.benutzer || 0) +
    srow('Neuester Benutzer', (s.neusterBenutzer || '–') + (s.neusterBenutzerDatum ? ' <span style="font-weight:400;color:var(--text2);font-size:11px">(' + fmtDateOnly(s.neusterBenutzerDatum) + ')</span>' : '')) +
    shead('Seitenaufrufe') +
    srow('Heute', (d.aufrufe && d.aufrufe.heute) || 0) +
    srow('Gestern', (d.aufrufe && d.aufrufe.gestern) || 0) +
    srow('Letzte 7 Tage', (d.aufrufe && d.aufrufe['7tage']) || 0);

  // Right column
  var rightRows =
    shead('Trainingseinheiten') +
    srow('Einheiten gesamt', s.einheiten || 0) +
    srow('Einheiten dieses Jahr', s.einheitenJahr || 0) +
    srow('N&auml;chste Einheit', fmtDateOnly(s.naechsteEinheit)) +
    srow('Abgesagte Einheiten', s.abgesagt || 0) +
    shead('Trainingsbl&ouml;cke &amp; Planung') +
    srow('Globale Bl&ouml;cke', s.bloeckeGlobal || 0) +
    srow('Private Einheiten (Mein Plan)', s.privatEinheiten || 0) +
    srow('Aktive Abos', s.abos || 0) +
    shead('Wartung') +
    srow('DB-Migrationsstand', s.dbVersion ? 'v' + s.dbVersion : '–');

  // Active users table
  var aktiveRows = (d.aktiveBenutzer || []).map(function(u) {
    var av = avatarInitials(u.name || '?', 32);
    return '<tr><td style="padding:7px 10px"><div style="display:flex;align-items:center;gap:8px">' + av +
      '<span style="font-weight:600">' + escapeHtml(u.name||u.email||'?') + '</span></div></td>' +
      '<td style="padding:7px 10px">' + badge(u.rolle) + '</td>' +
      '<td style="padding:7px 10px;font-size:12px;color:var(--text2)">' + timeSince(u.seit) + '</td></tr>';
  }).join('') || '<tr><td colspan="3" style="padding:14px;text-align:center;color:var(--text2);font-size:13px">Niemand aktiv</td></tr>';

  var loginRows = (d.letzteLogins || []).map(function(l) {
    var cc = (l.countryCode || '').toUpperCase();
    var flag = cc.length===2 ? String.fromCodePoint(0x1F1E6+cc.charCodeAt(0)-65)+String.fromCodePoint(0x1F1E6+cc.charCodeAt(1)-65) : '';
    var geoStr = (flag?flag+' ':'') + (l.country || '');
    var ok = l.erfolg;
    var failRed = '#c0392b';
    return '<tr style="' + (ok?'':'background:rgba(192,57,43,.07)') + '">' +
      '<td style="padding:6px 10px">' +
      '<span style="font-weight:600">' + escapeHtml(l.anzeigeName || l.benutzername || '–') + '</span>' +
      (l.rolle ? ' ' + badge(l.rolle) : '') +
      ((l.benutzername && l.benutzername !== l.anzeigeName) ? '<br><span style="font-size:11px;color:var(--text2)">' + escapeHtml(l.benutzername) + '</span>' : '') +
    '</td>' +
      '<td style="padding:6px 10px;font-size:12px;white-space:nowrap">' +
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(ok?'#27ae60':failRed)+';margin-right:5px"></span>' +
        '<span style="color:'+(ok?'inherit':failRed)+';font-weight:'+(ok?'400':'700')+'">' + (ok?'Erfolg':'Fehlschlag') + '</span>' +
        (l.methode ? ' <span style="font-size:10px;opacity:.7;margin-left:4px">' + ({'password':'&#x1F511;','email':'&#x1F4E7;','passkey':'&#x1F5DD;️','totp':'&#x1F4F1;'}[l.methode] || '') + ' ' + l.methode + '</span>' : '') +
      '</td>' +
      '<td style="padding:6px 10px;font-size:11px;color:var(--text2)">' + escapeHtml(geoStr||'–') + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;font-family:monospace;color:var(--text2)">' + escapeHtml(l.ip||'–') + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;color:var(--text2)">' + fmtDate(l.datum) + '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--text2);font-size:13px">Keine Eintr&auml;ge</td></tr>';

  var gaesteRows = (d.gaeste || []).map(function(g) {
    var cc = (g.countryCode||'').toUpperCase();
    var flag = cc.length===2 ? String.fromCodePoint(0x1F1E6+cc.charCodeAt(0)-65)+String.fromCodePoint(0x1F1E6+cc.charCodeAt(1)-65)+' ' : '';
    return '<tr>' +
      '<td style="padding:6px 10px;font-family:monospace;font-size:12px">' + escapeHtml(g.ip||'–') + '</td>' +
      '<td style="padding:6px 10px;font-size:12px;color:var(--text2)">' + flag + escapeHtml(g.country || '–') + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;color:var(--text2);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml((g.user_agent||'').replace(/^Mozilla\/5\.0 /,'').slice(0,70)) + '</td>' +
      '<td style="padding:6px 10px;font-size:12px;color:var(--text2)">' + timeSince(g.zuletzt) + '</td>' +
      '<td style="padding:6px 10px;font-size:12px;text-align:right">' + g.aufrufe + '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--text2);font-size:13px">Keine Gast-Besucher</td></tr>';

  function thStyle(t, extra) { return '<th' + (extra ? ' style="' + extra.replace(/^;/,'') + '"' : '') + '>' + t + '</th>'; }

  contentEl.innerHTML =
    '<h2 style="margin-bottom:18px">&#x1F5A5;&#xFE0E; System-Dashboard</h2>' +

    // phpBB-style two-column stat tables
    '<div class="admin-sys-stats">' +
      '<div>' + stable(leftRows) + '</div>' +
      '<div>' + stable(rightRows) + '</div>' +
    '</div>' +

    // Gäste
    '<div class="panel" style="margin-bottom:24px"><div class="panel-header"><div class="panel-title">&#x1F465; G&auml;ste <span style="font-size:12px;font-weight:400;opacity:.6">(letzte 15 Min.)</span></div></div>' +
      '<div class="table-scroll"><table class="admin-sys-table" style="width:100%"><thead><tr>' +
        thStyle('IP-Adresse') + thStyle('Land') + thStyle('Browser') + thStyle('Zuletzt') + thStyle('Aufrufe', ';text-align:right') +
      '</tr></thead><tbody>' + gaesteRows + '</tbody></table></div></div>' +

    // Aktive Benutzer + Letzte Logins
    '<div class="admin-sys-cols">' +
      '<div class="panel"><div class="panel-header"><div class="panel-title">&#x1F7E2; Aktiv <span style="font-size:12px;font-weight:400;opacity:.6">(letzte 10 Min.)</span></div></div>' +
        '<table style="width:100%"><thead><tr>' + thStyle('Benutzer') + thStyle('Rolle') + thStyle('Aktiv seit') + '</tr></thead>' +
        '<tbody>' + aktiveRows + '</tbody></table></div>' +
      '<div class="panel"><div class="panel-header"><div class="panel-title">&#x1F550; Letzte Logins</div></div>' +
        '<div class="table-scroll"><table class="admin-sys-table" style="width:100%;table-layout:fixed;border-collapse:collapse"><thead><tr>' + thStyle('Benutzer', ';width:28%') + thStyle('Status', ';width:22%') + thStyle('Land', ';width:14%') + thStyle('IP', ';width:16%') + thStyle('Zeitpunkt', ';width:20%') + '</tr></thead>' +
        '<tbody>' + loginRows + '</tbody></table></div></div>' +
    '</div>';
}
