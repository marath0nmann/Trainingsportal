// ============================================================
// Trainingsportal – Apple-Workout teilen
// ============================================================
// Auf dem iPhone landet ein normaler Download in „Dateien" und muss
// dort von Hand gesucht und geöffnet werden. Über die Web-Share-API
// öffnet sich stattdessen direkt das Teilen-Sheet, in dem „Fitness"
// als Ziel steht – von dort ist das Training sofort auf der Uhr.
//
// iOS verlangt, dass navigator.share() im selben Klick-Ereignis
// aufgerufen wird. Ein `await fetch()` davor bricht diese Kette und
// führt zu NotAllowedError. Die Datei wird deshalb beim Rendern der
// Ansicht im Hintergrund geholt (wenige hundert Byte) und der Klick
// teilt nur noch das fertige File-Objekt.
//
// Ohne Web-Share-API (Desktop) bleibt es beim normalen Download.
// ============================================================

const APPLEWORKOUT = (() => {

  // einheit_id → File (vorgeladen), 'pending' während des Ladens
  const cache = {};

  function url(einheitId) {
    return `api/index.php?p=workout/einheit/${einheitId}.workout`;
  }

  // Kann der Browser Dateien teilen? (iOS/iPadOS Safari, Android Chrome)
  // Am Desktop bleibt es beim Download – dort ist ein Teilen-Sheet unnötig.
  function kannTeilen() {
    if (!navigator.share || !navigator.canShare) return false;
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return false;
    try {
      // Probe-Objekt: manche Browser melden share() ohne Datei-Unterstützung
      return navigator.canShare({ files: [new File([new Uint8Array(1)], 'p.workout')] });
    } catch (e) {
      return false;
    }
  }

  function dateiname(titel) {
    const t = (titel || 'Training')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    return (t || 'Training') + '.workout';
  }

  // Datei im Hintergrund holen, damit der Klick ohne await auskommt
  async function vorladen(einheitId, titel) {
    if (!kannTeilen() || cache[einheitId]) return;
    cache[einheitId] = 'pending';
    try {
      const r = await fetch(url(einheitId), { credentials: 'same-origin' });
      if (!r.ok) { delete cache[einheitId]; return; }
      const blob = await r.blob();
      const file = new File([blob], dateiname(titel), { type: 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) cache[einheitId] = file;
      else delete cache[einheitId];
    } catch (e) {
      delete cache[einheitId];
    }
  }

  // Klick auf „Apple Watch"
  function teilen(einheitId) {
    const file = cache[einheitId];
    if (!file || file === 'pending') {
      // Noch nicht geladen → normaler Download als Rückfallebene
      window.location.href = url(einheitId);
      return;
    }
    navigator.share({ files: [file] }).catch(err => {
      // Abbruch durch den Nutzer ist kein Fehler
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      window.location.href = url(einheitId);
    });
  }

  // Button-Markup – teilt wenn möglich, lädt sonst herunter
  function buttonHtml(einheitId, titel, klasse) {
    const cls = 'btn btn-ghost' + (klasse ? ' ' + klasse : '');
    if (kannTeilen()) {
      return `<button class="${cls}" onclick="APPLEWORKOUT.teilen(${einheitId})"
        title="Training teilen und in der Fitness-App öffnen">⌚ Apple Watch</button>`;
    }
    return `<a class="${cls}" href="${url(einheitId)}" download
      title="Apple Watch: am iPhone öffnen und in der Fitness-App importieren">⌚ Apple Watch</a>`;
  }

  return { buttonHtml, vorladen, teilen, kannTeilen, url };
})();
