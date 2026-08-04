// ============================================================
// Trainingsportal – Apple-Workout-Download
// ============================================================
// Die .workout-Datei wird ganz normal heruntergeladen und landet in
// der Dateiablage; von dort öffnet ein Tippen sie in der Fitness-App.
// Am schnellsten geht das über das ⬇︎-Symbol in Safari direkt nach
// dem Download – ohne Umweg über die Dateien-App.
//
// Zwei Versuche, das abzukürzen, sind an der Plattform gescheitert:
//   - navigator.share(): Die Datei wird korrekt als Workout erkannt,
//     aber Fitness ist nur Dokumenthandler (CFBundleDocumentTypes)
//     und keine Share-Extension. Die App-Reihe im Teilen-Sheet listet
//     ausschließlich Share-Extensions, Fitness kann dort nicht
//     erscheinen.
//   - URL mit echter Dateiendung + Content-Disposition: inline, damit
//     Safari selbst typisiert: brachte nur eine zusätzliche Rückfrage
//     vor dem Download.
// ============================================================

const APPLEWORKOUT = (() => {

  // Der Button hat nur auf Apple-Plattformen einen Sinn – anderswo
  // gibt es keine App, die .workout öffnen kann.
  function istApplePlattform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    // iPadOS meldet sich seit Version 13 als Macintosh
    if (/Macintosh|Mac OS X/.test(ua)) return true;
    return /^Mac/.test(navigator.platform || '');
  }

  function url(einheitId) {
    return `api/index.php?p=workout/einheit/${einheitId}.workout`;
  }

  // Leerer String, wenn die Plattform nichts damit anfangen kann
  function buttonHtml(einheitId, titel, klasse) {
    if (!istApplePlattform()) return '';
    const cls = 'btn btn-ghost' + (klasse ? ' ' + klasse : '');
    return `<a class="${cls}" href="${url(einheitId)}" download
      title="Apple Watch: am iPhone öffnen und in der Fitness-App importieren">⌚ Apple Watch</a>`;
  }

  return { buttonHtml, url, istApplePlattform };
})();
