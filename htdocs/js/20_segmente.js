// ============================================================
// Trainingsportal – Segment-Baum (verschachtelte Intervalle)
// ============================================================
// Segmente sind ein Baum aus drei Knotenarten:
//
//   { typ:'gruppe', wiederholungen:3, kinder:[ … ] }
//   { typ:'work',   distanz_m:400, pace_referenz:'5000', notiz:null }
//   { typ:'pause',  distanz_m:100, pause_typ:'TP' }
//
// Gruppen dürfen beliebig tief geschachtelt werden, damit z. B.
//   3 × (4 × 400, 100 TP), BP 400 TP
// als das abgebildet wird, was es ist: ein 3er-Block, der einen
// 4er-Block plus eine Blockpause enthält.
//
// Gespeichert/übertragen wird der Baum flach als Zeilenliste
// (knoten_id / eltern_id / reihenfolge / abschnitt_typ) – siehe
// baumAusRows() und rowsAusBaum(). Altbestand ohne knoten_id
// (Gruppierung über gruppen_id bzw. block_id, Pause als pause_m)
// wird beim Einlesen transparent konvertiert.
//
// Dieses Modul liefert:
//   - Konvertierung Baum ↔ Zeilen
//   - Titel-, Distanz- und Anzeige-Rendering (Kalender, Tooltips)
//   - den verschachtelten Segment-Editor (Blöcke + Einheiten)
// ============================================================

const SEG = (() => {

  const PAUSE_OPTIONS = [
    { value: 'TP',   label: 'TP – Trabpause' },
    { value: 'GP',   label: 'GP – Gehpause' },
    { value: 'BP',   label: 'BP – Blockpause' },
    { value: 'frei', label: '— frei —' },
  ];
  const PAUSE_LBL  = { TP: 'Trabpause', GP: 'Gehpause', BP: 'Blockpause', frei: 'Pause' };
  const PAUSE_KURZ = { TP: 'TP', GP: 'GP', BP: 'BP', frei: '' };

  function esc(s) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(s)
      : String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function fmtDist(m) {
    if (m == null) return '';
    if (m >= 1000) {
      const km = m / 1000;
      return (Number.isInteger(km) ? String(km) : km.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')) + 'km';
    }
    return m + 'm';
  }

  // ── Baum ← flache Zeilen ────────────────────────────────────
  function baumAusRows(rows) {
    const arr = (rows || []).filter(r => r && typeof r === 'object').map(r => ({ ...r }));
    if (!arr.length) return [];
    const neu = arr.some(r => r.knoten_id != null);
    return neu ? _baumNeuesFormat(arr) : _baumAltesFormat(arr);
  }

  function _baumNeuesFormat(rows) {
    const byId = new Map();
    rows.forEach(r => {
      const knoten = _knotenAusRow(r);
      byId.set(Number(r.knoten_id), { knoten, eltern: r.eltern_id != null ? Number(r.eltern_id) : null,
                                      ord: Number(r.reihenfolge || 0) });
    });
    const wurzel = [];
    const sortiert = [...byId.entries()].sort((a, b) => a[1].ord - b[1].ord);
    sortiert.forEach(([, eintrag]) => {
      const eltern = eintrag.eltern != null ? byId.get(eintrag.eltern) : null;
      if (eltern && eltern.knoten.typ === 'gruppe') eltern.knoten.kinder.push(eintrag.knoten);
      else wurzel.push(eintrag.knoten);
    });
    return wurzel;
  }

  function _knotenAusRow(r) {
    const typ = r.abschnitt_typ || r.typ || 'work';
    if (typ === 'gruppe') {
      return { typ: 'gruppe', wiederholungen: Math.max(1, parseInt(r.wiederholungen, 10) || 1), kinder: [] };
    }
    if (typ === 'pause') {
      return { typ: 'pause', distanz_m: _num(r.distanz_m), pause_typ: r.pause_typ || 'TP' };
    }
    return { typ: 'work', distanz_m: _num(r.distanz_m), pace_referenz: r.pace_referenz || null, notiz: r.notiz || null };
  }

  function _num(v) {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  // Altbestand: Gruppierung über gruppen_id/block_id, Pause als pause_m
  function _baumAltesFormat(rows) {
    const wurzel = [];
    const gruppen = new Map();
    rows.forEach((s, i) => {
      const gid = (s.gruppen_id != null) ? 'g' + s.gruppen_id
                : (s.block_id   != null) ? 'b' + s.block_id
                : null;
      const blaetter = [];
      if ((s.abschnitt_typ || 'work') === 'pause') {
        blaetter.push({ typ: 'pause', distanz_m: _num(s.distanz_m), pause_typ: s.pause_typ || 'TP' });
      } else {
        blaetter.push({ typ: 'work', distanz_m: _num(s.distanz_m), pace_referenz: s.pace_referenz || null, notiz: s.notiz || null });
        if (s.pause_m) blaetter.push({ typ: 'pause', distanz_m: _num(s.pause_m), pause_typ: s.pause_typ || 'TP' });
      }
      const wdh = Math.max(1, parseInt(s.wiederholungen, 10) || 1);

      if (gid !== null) {
        if (!gruppen.has(gid)) {
          const g = { typ: 'gruppe', wiederholungen: wdh, kinder: [] };
          gruppen.set(gid, g);
          wurzel.push(g);
        }
        const g = gruppen.get(gid);
        if (wdh > g.wiederholungen) g.wiederholungen = wdh;
        g.kinder.push(...blaetter);
      } else if (wdh > 1) {
        wurzel.push({ typ: 'gruppe', wiederholungen: wdh, kinder: blaetter });
      } else {
        wurzel.push(...blaetter);
      }
      void i;
    });
    return wurzel;
  }

  // ── Baum → flache Zeilen (für API/DB) ───────────────────────
  function rowsAusBaum(baum) {
    const rows = [];
    let next = 1;
    (function lauf(nodes, elternId) {
      (nodes || []).forEach((n, i) => {
        const id = next++;
        if (n.typ === 'gruppe') {
          rows.push({
            knoten_id: id, eltern_id: elternId, reihenfolge: rows.length,
            abschnitt_typ: 'gruppe', wiederholungen: Math.max(1, n.wiederholungen || 1),
            distanz_m: null, pause_typ: null, pace_referenz: null, notiz: null,
          });
          lauf(n.kinder || [], id);
        } else if (n.typ === 'pause') {
          rows.push({
            knoten_id: id, eltern_id: elternId, reihenfolge: rows.length,
            abschnitt_typ: 'pause', wiederholungen: 1,
            distanz_m: n.distanz_m ?? null, pause_typ: n.pause_typ || 'TP',
            pace_referenz: null, notiz: null,
          });
        } else {
          rows.push({
            knoten_id: id, eltern_id: elternId, reihenfolge: rows.length,
            abschnitt_typ: 'work', wiederholungen: 1,
            distanz_m: n.distanz_m ?? null, pause_typ: null,
            pace_referenz: n.pace_referenz || null, notiz: n.notiz || null,
          });
        }
        void i;
      });
    })(baum || [], null);
    return rows;
  }

  // ── Kennzahlen ──────────────────────────────────────────────
  function gesamtDistanz(nodes) {
    return (nodes || []).reduce((sum, n) => {
      if (n.typ === 'gruppe') return sum + Math.max(1, n.wiederholungen || 1) * gesamtDistanz(n.kinder);
      return sum + (n.distanz_m || 0);
    }, 0);
  }

  // Alle Blätter in Trainingsreihenfolge (Wiederholungen ausgerollt)
  function blaetter(nodes, tiefe) {
    const out = [];
    (nodes || []).forEach(n => {
      if (n.typ === 'gruppe') {
        const wdh = Math.max(1, n.wiederholungen || 1);
        for (let i = 0; i < wdh; i++) out.push(...blaetter(n.kinder, (tiefe || 0) + 1));
      } else {
        out.push(n);
      }
    });
    return out;
  }

  // Export-Blöcke für Uhren (FIT/Apple): Liste aus { wiederholungen, schritte[] }.
  // Innerste Wiederholung bleibt kompakt, äußere werden ausgerollt – Uhren
  // unterstützen keine verschachtelten Wiederholungen.
  function exportBloecke(nodes) {
    const out = [];
    let puffer = [];
    const puffernLeeren = () => {
      if (puffer.length) { out.push({ wiederholungen: 1, schritte: puffer }); puffer = []; }
    };
    (nodes || []).forEach(n => {
      if (n.typ !== 'gruppe') { puffer.push(n); return; }
      puffernLeeren();
      const wdh = Math.max(1, n.wiederholungen || 1);
      const nurBlaetter = (n.kinder || []).every(k => k.typ !== 'gruppe');
      if (nurBlaetter) {
        out.push({ wiederholungen: wdh, schritte: [...(n.kinder || [])] });
      } else {
        for (let i = 0; i < wdh; i++) out.push(...exportBloecke(n.kinder));
      }
    });
    puffernLeeren();
    return out;
  }

  // ── Titel-Kurzschrift ───────────────────────────────────────
  // 3 × (4 × (400, 100 TP), 400 BP)
  function titel(nodes) {
    return _titelTeile(nodes).join(', ');
  }

  function _titelTeile(nodes) {
    return (nodes || []).map(n => {
      if (n.typ === 'gruppe') {
        const inner = _titelTeile(n.kinder).join(', ');
        if (!inner) return null;
        const wdh = Math.max(1, n.wiederholungen || 1);
        return wdh > 1 ? `${wdh} × (${inner})` : inner;
      }
      if (n.distanz_m == null) return null;
      if (n.typ === 'pause') {
        const k = PAUSE_KURZ[n.pause_typ] || '';
        return k ? `${n.distanz_m} ${k}` : String(n.distanz_m);
      }
      return String(n.distanz_m);
    }).filter(Boolean);
  }

  // ── Anzeige (Kalender-Tooltip, Detailmodal) ─────────────────
  // Balkengrafik + verschachtelte Zusammenfassung.
  function ansichtHtml(rowsOderBaum, paceData, typ) {
    const baum = Array.isArray(rowsOderBaum) && rowsOderBaum.length && rowsOderBaum[0] && rowsOderBaum[0].typ
      ? rowsOderBaum
      : baumAusRows(rowsOderBaum);
    if (!baum.length) return '';

    const alle = blaetter(baum);
    if (!alle.length) return '';
    const maxDist = Math.max(...alle.map(l => l.distanz_m || 0), 1);
    const typClass = `seg-blk-typ-${typ || 'frei'}`;

    let balken = '';
    baum.forEach((n, i) => {
      if (i > 0) balken += `<div class="seg-blk-sep"></div>`;
      blaetter([n]).forEach(l => {
        const h = Math.round(16 + ((l.distanz_m || 0) / maxDist) * 40);
        if (l.typ === 'pause') {
          const lbl = PAUSE_LBL[l.pause_typ] || 'Pause';
          balken += `<div class="seg-blk seg-blk-pause" style="flex:${l.distanz_m || 1};height:${h}px" title="${esc(fmtDist(l.distanz_m) + ' ' + lbl)}"></div>`;
        } else {
          const sekProKm = paceData ? PACE.paceSekProKm(paceData, l.pace_referenz) : null;
          const split    = sekProKm != null ? PACE.formatTime(sekProKm * ((l.distanz_m || 0) / 1000)) : '';
          const tip = fmtDist(l.distanz_m) + (split ? ' · ' + split : '');
          balken += `<div class="seg-blk seg-blk-work ${typClass}" style="flex:${l.distanz_m || 1};height:${h}px" title="${esc(tip)}"></div>`;
        }
      });
    });

    return `<div class="seg-blocks-wrap">
      <div class="seg-blocks">${balken}</div>
      <div class="seg-blk-summary">${_summaryHtml(baum, paceData)}</div>
    </div>`;
  }

  function _summaryHtml(nodes, paceData) {
    return (nodes || []).map(n => {
      if (n.typ === 'gruppe') {
        const wdh = Math.max(1, n.wiederholungen || 1);
        const kopf = wdh > 1 ? `<div class="seg-blk-sum-row seg-sum-wdh">${wdh} ×</div>` : '';
        return `${kopf}<div class="seg-sum-gruppe">${_summaryHtml(n.kinder, paceData)}</div>`;
      }
      if (n.typ === 'pause') {
        const lbl = PAUSE_LBL[n.pause_typ] || 'Pause';
        return `<div class="seg-blk-sum-row seg-sum-pause">${fmtDist(n.distanz_m)} ${esc(lbl)}</div>`;
      }
      let line = fmtDist(n.distanz_m);
      const sekProKm = paceData ? PACE.paceSekProKm(paceData, n.pace_referenz) : null;
      if (sekProKm != null) {
        const m  = Math.floor(sekProKm / 60);
        const sc = String(Math.round(sekProKm % 60)).padStart(2, '0');
        line += ` (@ ${m}:${sc}min/km)`;
      } else if (n.pace_referenz) {
        line += ` (@ ${esc(PACE.fmtDistLabel(n.pace_referenz))}-Pace)`;
      }
      return `<div class="seg-blk-sum-row">${line}</div>`;
    }).join('');
  }

  // ============================================================
  // Verschachtelter Editor
  // ============================================================
  // Wird von Block- und Einheiten-Editor gemeinsam benutzt.
  // Adressierung der Knoten über Pfade ("0.2.1").

  let edBaum   = [];
  let edElId   = null;
  let edChange = null;

  function editorMount(elId, baum, onChange) {
    edElId   = elId;
    edBaum   = Array.isArray(baum) ? baum : [];
    edChange = typeof onChange === 'function' ? onChange : null;
    editorRender();
  }

  function editorBaum() { return edBaum; }

  function editorRender() {
    const wrap = edElId ? document.getElementById(edElId) : null;
    if (!wrap) return;
    wrap.innerHTML = edBaum.length
      ? `<div class="seged">${edBaum.map((n, i) => _edKnotenHtml(n, String(i))).join('')}</div>
         ${_edActionsHtml('')}`
      : `<div class="ed-segleer">Noch keine Segmente. „+ Block" legt einen Wiederholungsblock an.</div>
         ${_edActionsHtml('')}`;

    wrap.querySelectorAll('.seged-input').forEach(el => {
      el.addEventListener('change', _edOnInput);
      el.addEventListener('input',  _edOnInput);
    });
    if (edChange) edChange(edBaum);
  }

  function _edActionsHtml(pfad) {
    const p = pfad === '' ? '' : pfad;
    return `<div class="seged-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick="SEG.edAdd('${p}','gruppe')">+ Block</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="SEG.edAdd('${p}','work')">+ Tempo</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="SEG.edAdd('${p}','pause')">+ Pause</button>
    </div>`;
  }

  function _edKnotenHtml(n, pfad) {
    if (n.typ === 'gruppe') {
      const dist = gesamtDistanz([n]);
      return `
        <div class="seged-gruppe">
          <div class="seged-gruppe-head">
            <label class="seged-wdh">
              <span>Wdh</span>
              <input type="number" min="1" max="99" value="${n.wiederholungen ?? 1}"
                class="seged-input ed-seg-num" data-p="${pfad}" data-f="wiederholungen">
            </label>
            <span class="seged-gruppe-mal">×</span>
            <span class="seged-gruppe-info">${dist ? fmtDist(dist) : ''}</span>
            <div class="seged-gruppe-tools">
              <button type="button" class="btn-icon" title="Block nach oben" onclick="SEG.edMove('${pfad}',-1)">↑</button>
              <button type="button" class="btn-icon" title="Block nach unten" onclick="SEG.edMove('${pfad}',1)">↓</button>
              <button type="button" class="btn-icon" title="Block löschen" onclick="SEG.edDel('${pfad}')">×</button>
            </div>
          </div>
          <div class="seged-kinder">
            ${(n.kinder || []).map((k, i) => _edKnotenHtml(k, pfad + '.' + i)).join('')}
          </div>
          ${_edActionsHtml(pfad)}
        </div>`;
    }

    const detail = n.typ === 'work'
      ? `<select class="seged-input ed-seg-input" data-p="${pfad}" data-f="pace_referenz">
           ${PACE.getOptions().map(o => `<option value="${o.value}"${o.value === (n.pace_referenz || '') ? ' selected' : ''}>${o.label}</option>`).join('')}
         </select>`
      : `<select class="seged-input ed-seg-input" data-p="${pfad}" data-f="pause_typ">
           ${PAUSE_OPTIONS.map(o => `<option value="${o.value}"${o.value === (n.pause_typ || 'TP') ? ' selected' : ''}>${o.label}</option>`).join('')}
         </select>`;

    return `
      <div class="seged-zeile">
        <button type="button" class="ed-typ-btn ${n.typ === 'pause' ? 'ed-typ-pause' : 'ed-typ-work'}"
          title="Tempo/Pause umschalten" onclick="SEG.edToggle('${pfad}')">${n.typ === 'pause' ? 'Pause' : 'Tempo'}</button>
        <input type="number" min="10" step="50" value="${n.distanz_m ?? ''}" placeholder="m"
          class="seged-input ed-seg-input ed-seg-dist" data-p="${pfad}" data-f="distanz_m">
        ${detail}
        <div class="seged-zeile-tools">
          <button type="button" class="btn-icon" title="Nach oben" onclick="SEG.edMove('${pfad}',-1)">↑</button>
          <button type="button" class="btn-icon" title="Nach unten" onclick="SEG.edMove('${pfad}',1)">↓</button>
          <button type="button" class="btn-icon" title="In Block umwandeln" onclick="SEG.edGruppieren('${pfad}')">⤵</button>
          <button type="button" class="btn-icon" title="Löschen" onclick="SEG.edDel('${pfad}')">×</button>
        </div>
      </div>`;
  }

  // Pfad → { liste, index } bzw. { liste } für den Elternteil
  function _edListe(pfad) {
    if (pfad === '' || pfad == null) return edBaum;
    const teile = String(pfad).split('.').map(Number);
    let liste = edBaum;
    for (const idx of teile) {
      const n = liste[idx];
      if (!n) return null;
      if (n.typ !== 'gruppe') return null;
      liste = n.kinder = n.kinder || [];
    }
    return liste;
  }

  function _edKnoten(pfad) {
    const teile = String(pfad).split('.').map(Number);
    let liste = edBaum, node = null;
    for (const idx of teile) {
      node = liste ? liste[idx] : null;
      if (!node) return { node: null, liste: null, index: -1 };
      liste = node.kinder;
    }
    const elternPfad = teile.slice(0, -1).join('.');
    return { node, liste: _edListe(elternPfad), index: teile[teile.length - 1] };
  }

  function edAdd(pfad, art) {
    const liste = _edListe(pfad);
    if (!liste) return;
    if (art === 'gruppe') {
      liste.push({
        typ: 'gruppe', wiederholungen: 4,
        kinder: [
          { typ: 'work',  distanz_m: 400, pace_referenz: _letzteRef(liste) },
          { typ: 'pause', distanz_m: 100, pause_typ: 'TP' },
        ],
      });
    } else if (art === 'pause') {
      liste.push({ typ: 'pause', distanz_m: 100, pause_typ: _letzterPausenTyp(liste) });
    } else {
      liste.push({ typ: 'work', distanz_m: 400, pace_referenz: _letzteRef(liste) });
    }
    editorRender();
  }

  function _letzteRef(liste) {
    const w = [...liste].reverse().find(n => n.typ === 'work');
    return w ? (w.pace_referenz || null) : null;
  }

  function _letzterPausenTyp(liste) {
    const p = [...liste].reverse().find(n => n.typ === 'pause');
    return p ? (p.pause_typ || 'TP') : 'TP';
  }

  function edDel(pfad) {
    const { liste, index } = _edKnoten(pfad);
    if (!liste || index < 0) return;
    liste.splice(index, 1);
    editorRender();
  }

  function edMove(pfad, delta) {
    const { liste, index } = _edKnoten(pfad);
    if (!liste || index < 0) return;
    const ziel = index + delta;
    if (ziel < 0 || ziel >= liste.length) return;
    const [n] = liste.splice(index, 1);
    liste.splice(ziel, 0, n);
    editorRender();
  }

  function edToggle(pfad) {
    const { node, liste } = _edKnoten(pfad);
    if (!node || node.typ === 'gruppe') return;
    if (node.typ === 'work') {
      node.typ = 'pause';
      node.pause_typ = node.pause_typ || _letzterPausenTyp(liste || []);
      delete node.pace_referenz;
    } else {
      node.typ = 'work';
      node.pace_referenz = node.pace_referenz || _letzteRef(liste || []);
      delete node.pause_typ;
    }
    editorRender();
  }

  // Einzelnes Segment in einen Wiederholungsblock umwandeln
  function edGruppieren(pfad) {
    const { node, liste, index } = _edKnoten(pfad);
    if (!node || !liste || index < 0 || node.typ === 'gruppe') return;
    liste[index] = { typ: 'gruppe', wiederholungen: 2, kinder: [node] };
    editorRender();
  }

  function _edOnInput(ev) {
    const t = ev.target;
    const { node } = _edKnoten(t.dataset.p);
    if (!node) return;
    const f = t.dataset.f;
    if (f === 'wiederholungen') {
      node.wiederholungen = Math.max(1, parseInt(t.value, 10) || 1);
    } else if (f === 'distanz_m') {
      node.distanz_m = t.value === '' ? null : parseInt(t.value, 10);
    } else {
      node[f] = t.value === '' ? null : t.value;
    }
    // Live-Rückmeldung (Titel/Distanz) ohne Neuaufbau – Fokus bleibt erhalten
    const gruppeInfo = t.closest('.seged-gruppe')?.querySelector('.seged-gruppe-info');
    if (gruppeInfo) {
      const grPfad = String(t.dataset.p).split('.').slice(0, -1).join('.');
      const gr = grPfad ? _edKnoten(grPfad).node : null;
      if (gr && gr.typ === 'gruppe') gruppeInfo.textContent = fmtDist(gesamtDistanz([gr]));
    }
    if (edChange) edChange(edBaum);
  }

  return {
    PAUSE_OPTIONS, PAUSE_LBL, fmtDist,
    baumAusRows, rowsAusBaum, gesamtDistanz, blaetter, exportBloecke, titel,
    ansichtHtml,
    editorMount, editorRender, editorBaum,
    edAdd, edDel, edMove, edToggle, edGruppieren,
  };
})();
