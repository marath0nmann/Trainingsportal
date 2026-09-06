// ============================================================
// Trainingsportal – Dashboard (Startseite)
// ============================================================
// Bisher landete man direkt im Monatsraster bzw. Quartalsplan – dem
// dichtesten Bildschirm der Anwendung – mit vier nachgeladenen Bloecken
// darueber. Diese Seite beantwortet stattdessen in einem Blick: Was ist
// als Naechstes dran, wo stehe ich diese Woche, was wartet auf eine
// Entscheidung.
//
// Die vier Zusatzsektionen des Kalenders wohnen jetzt hier:
//   ladeGlobalePaceWarnung()   → Hinweise
//   ladeHeuteSektionInto()     → Heute / Morgen
//   ladeWettkampfSektionInto() → Naechste Wettkaempfe
//   _renderKalActions()        → Abonnieren / Teilen
//
// Analog `renderDashboard()` im Statistikportal.
// ============================================================

const DASHBOARD = (() => {

  // Nachkommastelle nur, wenn sie etwas aussagt (12 km, 12,4 km).
  function _fmtKm(v) {
    if (v == null) return '–';
    return (v % 1 === 0 ? String(v) : v.toFixed(1).replace('.', ',')) + ' km';
  }

  async function render(main) {
    if (!main) return;

    // Gaeste (Share-Link) haben keine persoenlichen Daten – sie gehoeren
    // direkt in die freigegebene Ansicht, nicht auf ein leeres Dashboard.
    if (!state.user) { location.replace(_gastZiel()); return; }

    const istTrainer = state.user.rolle === 'admin' || state.user.rolle === 'trainer';

    const jetzt = new Date();
    const gruss = jetzt.getHours() < 11 ? 'Guten Morgen'
                : jetzt.getHours() < 18 ? 'Guten Tag'
                : 'Guten Abend';
    const name = state.user.vorname || state.user.name || state.user.benutzername || '';

    main.innerHTML = `
      <div class="dash-wrap">
        <div class="dash-kopf">
          <h1 class="dash-titel">${escapeHtml(gruss)}${name ? ', ' + escapeHtml(name) : ''}</h1>
          <div class="dash-datum">${_heuteLang()}</div>
        </div>

        <div id="dash-hinweise"></div>

        <div class="dash-kacheln">
          ${istTrainer ? `
            <div id="dash-planung" class="panel dash-kachel">
              <div class="dash-kachel-lade">Lade Planungsstand…</div>
            </div>` : ''}
          <div id="dash-woche" class="panel dash-kachel">
            <div class="dash-kachel-lade">Lade Wochenbilanz…</div>
          </div>
          <div id="dash-entscheidungen" class="panel dash-kachel">
            <div class="dash-kachel-lade">Lade Wettkampf-Status…</div>
          </div>
        </div>

        <div id="dash-heute"></div>
        <div id="dash-wettkampf"></div>
        <div id="dash-actions" class="kal-actions"></div>
      </div>`;

    // Die Bloecke laden unabhaengig voneinander – ein Fehler in einem
    // darf die uebrigen nicht verhindern.
    ladeGlobalePaceWarnung('dash-hinweise');
    ladeHeuteSektionInto('dash-heute');
    _renderKalActions('dash-actions');
    _renderWoche();
    _renderEntscheidungen();
    if (istTrainer) _renderPlanungsstand();

    // Die Wettkampfkarten lesen _wkPrivatMap für den Aktiv-Zustand ihrer
    // Disziplin-Buttons. Kalender und Liste füllen die Map beim Rendern –
    // die Übersicht rendert keinen Plan und muss sie selbst holen.
    const heute = new Date();
    const in35  = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + 35);
    await ladeWkPrivatMap(ymd(heute), ymd(in35));
    await ladeWettkampfSektionInto('dash-wettkampf');
  }

  /** Ziel fuer Gaeste mit Share-Token, sonst die Liste. */
  function _gastZiel() {
    if (typeof _shareTargetHash === 'function' && state.shareToken) return _shareTargetHash();
    return '#liste';
  }

  function _heuteLang() {
    return new Date().toLocaleDateString('de-DE',
      { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  // ── Kachel: Diese Woche ────────────────────────────────────
  // Zaehlt dieselben Einheiten wie die KW-Spalte im Quartalsplan: nur den
  // eigenen Plan (privat), inklusive Anreise-km ueber _effektivKm().
  async function _renderWoche() {
    const el = document.getElementById('dash-woche');
    if (!el) return;

    const heute  = new Date();
    const montag = _isoMonday(heute);
    const so     = new Date(montag + 'T00:00:00');
    so.setDate(so.getDate() + 6);
    const sonntag = ymd(so);

    let einheiten = [], ziel = null;
    try {
      // WEG liefert die Anreise-km, die _effektivKm() mitrechnet.
      if (typeof WEG !== 'undefined') await WEG.load();
      const [d1, d2] = await Promise.all([
        apiGet(`mein-plan/einheiten?von=${montag}&bis=${sonntag}`, { silent: true }),
        apiGet(`wochenziele?von=${montag}&bis=${sonntag}`, { silent: true })
          .catch(() => ({ ziele: {} })),
      ]);
      einheiten = (d1.privat || []).filter(e => !istKeinTraining(e.typ));
      ziel = (d2.ziele || {})[montag] ?? null;
    } catch (e) {
      el.innerHTML = `<div class="settings-panel-body" style="color:var(--text2);font-size:13px">
        Wochenbilanz konnte nicht geladen werden.</div>`;
      return;
    }

    const heuteStr = ymd(heute);
    const summe = (liste) => Math.round(liste.reduce((s, e) => {
      const km = _effektivKm(e);
      return s + (km !== null ? km : 0);
    }, 0) * 10) / 10;

    const gesamt   = summe(einheiten);
    const bisHeute = summe(einheiten.filter(e => e.datum <= heuteStr));
    const offen    = Math.round((gesamt - bisHeute) * 10) / 10;
    const kw       = _isoWeek(heute);

    const hatZiel = ziel !== null && ziel > 0;
    const anteil  = hatZiel ? Math.min(100, Math.round(gesamt / ziel * 100)) : 0;
    const erfuellt = hatZiel && gesamt >= ziel;

    const balken = hatZiel ? `
      <div class="dash-balken" role="img"
           aria-label="${anteil} Prozent des Wochenziels von ${_fmtKm(ziel)} geplant">
        <div class="dash-balken-fuellung${erfuellt ? ' is-erfuellt' : ''}"
             style="width:${anteil}%"></div>
      </div>
      <div class="dash-balken-text">
        ${anteil}&nbsp;% von ${_fmtKm(ziel)}${erfuellt ? ' · erreicht' : ''}
      </div>` : `
      <div class="dash-kein-ziel">
        Kein Wochenziel gesetzt –
        <button class="btn-link" onclick="navigate('liste')">im Quartalsplan festlegen</button>
      </div>`;

    el.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">&#x1F3C3; Diese Woche</div>
        <span class="panel-count">KW ${kw}</span>
      </div>
      <div class="settings-panel-body">
        <div class="dash-woche-zahlen">
          <div class="dash-zahl">
            <span class="dash-zahl-wert">${_fmtKm(bisHeute)}</span>
            <span class="dash-zahl-label">bis heute</span>
          </div>
          <div class="dash-zahl">
            <span class="dash-zahl-wert dash-zahl-schwach">${_fmtKm(offen)}</span>
            <span class="dash-zahl-label">noch geplant</span>
          </div>
          <div class="dash-zahl">
            <span class="dash-zahl-wert">${einheiten.length}</span>
            <span class="dash-zahl-label">${einheiten.length === 1 ? 'Einheit' : 'Einheiten'}</span>
          </div>
        </div>
        ${balken}
      </div>`;
  }

  // ── Kachel: Wettkampf-Entscheidungen ───────────────────────
  // Zeigt, was auf eine Entscheidung wartet – dieselbe Menge, die das
  // Nav-Badge zaehlt, hier aber mit Namen und Datum.
  async function _renderEntscheidungen() {
    const el = document.getElementById('dash-entscheidungen');
    if (!el) return;

    let serien = [];
    try {
      const r = await apiGet('wettkampfplanung?jahr=' + new Date().getFullYear(), { silent: true });
      serien = r.serien || [];
    } catch (e) {
      el.innerHTML = `<div class="settings-panel-body" style="color:var(--text2);font-size:13px">
        Wettkampf-Status konnte nicht geladen werden.</div>`;
      return;
    }

    const heute = ymd(new Date());
    const OFFEN = ['offen', 'in_klaerung', 'anmeldung_erforderlich'];
    const wartend = serien
      .filter(s => s.aktiv !== 0 && OFFEN.includes(s.status || 'offen'))
      .map(s => ({ s, datum: s.naechstes_datum || null }))
      .filter(e => e.datum && e.datum >= heute)
      .sort((a, b) => a.datum.localeCompare(b.datum));

    if (!wartend.length) {
      el.innerHTML = `
        <div class="panel-header"><div class="panel-title">&#x1F3C5; Wettkampfplanung</div></div>
        <div class="settings-panel-body">
          <div class="dash-alles-klar">
            &#x2713; Alles entschieden – für die kommenden Wettkämpfe steht dein Status.
          </div>
        </div>`;
      return;
    }

    const ST_LABEL = {
      offen:                  'offen',
      in_klaerung:            'in Klärung',
      anmeldung_erforderlich: 'Anmeldung erforderlich',
    };

    const zeilen = wartend.slice(0, 4).map(({ s, datum }) => {
      const d = new Date(datum + 'T00:00:00').toLocaleDateString('de-DE',
        { day: '2-digit', month: '2-digit' });
      const tage = Math.round((new Date(datum + 'T00:00:00') - new Date(heute + 'T00:00:00')) / 86400000);
      const frist = tage <= 14 ? `<span class="dash-frist">in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}</span>` : '';
      return `<li class="dash-entscheidung">
        <span class="dash-ent-datum">${d}</span>
        <span class="dash-ent-name">${escapeHtml(_decodeHtml(s.name || ''))}</span>
        <span class="dash-ent-status">${ST_LABEL[s.status] || 'offen'}</span>
        ${frist}
      </li>`;
    }).join('');

    const rest = wartend.length > 4
      ? `<div class="dash-ent-rest">… und ${wartend.length - 4} weitere</div>` : '';

    el.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">&#x1F3C5; Warten auf dich</div>
        <span class="panel-count">${wartend.length}</span>
      </div>
      <div class="settings-panel-body">
        <ul class="dash-entscheidungen">${zeilen}</ul>
        ${rest}
        <button class="btn btn-primary btn-sm" style="margin-top:12px"
          onclick="navigate('wettkampfplanung')">Zur Wettkampfplanung</button>
      </div>`;
  }

  // ── Kachel: Planungsstand (nur Trainer und Admins) ─────────
  // Beantwortet die Trainerfrage "was fehlt in der Planung": kommende Wochen
  // ohne Training und Termine ohne Treffpunkt.
  async function _renderPlanungsstand() {
    const el = document.getElementById('dash-planung');
    if (!el) return;

    const heute = new Date();
    const bis   = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + 28);
    let einheiten = [];
    try {
      const d = await apiGet(`einheiten?von=${ymd(heute)}&bis=${ymd(bis)}`, { silent: true });
      einheiten = (d.einheiten || []).filter(e => e.status !== 'abgesagt');
    } catch (e) {
      el.innerHTML = `<div class="settings-panel-body" style="color:var(--text2);font-size:13px">
        Planungsstand konnte nicht geladen werden.</div>`;
      return;
    }

    // Kommende vier Wochen: welche haben ueberhaupt ein Training?
    const wochenMitTraining = new Set(einheiten.map(e => _isoMonday(new Date(e.datum + 'T00:00:00'))));
    const wochen = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + i * 7);
      const mo = _isoMonday(d);
      if (!wochen.includes(mo)) wochen.push(mo);
    }
    const leereWochen  = wochen.filter(mo => !wochenMitTraining.has(mo));
    const ohneTreffpkt = einheiten.filter(e => !e.treffpunkt || !e.treffpunkt.id).length;

    const zeile = (ok, text, aktion) => `
      <li class="dash-pruefung${ok ? ' is-ok' : ''}">
        <span class="dash-pruefung-icon">${ok ? '&#x2713;' : '&#x26A0;&#xFE0E;'}</span>
        <span class="dash-pruefung-text">${text}</span>
        ${!ok && aktion ? aktion : ''}
      </li>`;

    el.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">&#x1F4CB; Planungsstand</div>
        <span class="panel-count">4 Wochen</span>
      </div>
      <div class="settings-panel-body">
        <ul class="dash-pruefungen">
          ${zeile(!leereWochen.length,
            leereWochen.length
              ? `<strong>${leereWochen.length}</strong> der nächsten vier Wochen ohne Training`
              : 'Alle vier kommenden Wochen sind geplant',
            `<button class="btn btn-ghost btn-sm" onclick="navigate('planung')">Planen</button>`)}
          ${zeile(!ohneTreffpkt,
            ohneTreffpkt
              ? `<strong>${ohneTreffpkt}</strong> ${ohneTreffpkt === 1 ? 'Termin' : 'Termine'} ohne Treffpunkt`
              : 'Alle Termine dieser Wochen haben einen Treffpunkt',
            `<button class="btn btn-ghost btn-sm" onclick="navigate('planung/liste')">Liste öffnen</button>`)}
        </ul>
      </div>`;
  }

  return { render };
})();
