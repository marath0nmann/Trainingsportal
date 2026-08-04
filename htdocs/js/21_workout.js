// ============================================================
// Trainingsportal – Apple-Workout verlinken
// ============================================================
// `com.apple.workout` ist im System ausschließlich über die
// Dateiendung deklariert (UTTypeTagSpecification kennt nur
// public.filename-extension, keinen MIME-Typ). Safari kann den Typ
// also nur bestimmen, wenn die URL selbst auf .workout endet – bei
// `api/index.php?p=…` steckt die Endung nur in der Query und wird
// nicht ausgewertet. Der Link zeigt deshalb auf die per .htaccess
// umgeschriebene Route /workout/{id}.workout.
//
// Kein `download`-Attribut: Safari soll die Datei selbst typisieren
// dürfen, statt sie ungefragt in die Dateiablage zu legen.
//
// Vorgeschichte: Der Weg über navigator.share() erreicht die
// Fitness-App nicht. Sie ist nur als Dokumenthandler registriert
// (CFBundleDocumentTypes), und die App-Reihe im Teilen-Sheet listet
// ausschließlich Share-Extensions – die Datei wird dort zwar korrekt
// als Workout erkannt, Fitness taucht aber grundsätzlich nicht auf.
// ============================================================

const APPLEWORKOUT = (() => {

  function url(einheitId) {
    return `workout/${einheitId}.workout`;
  }

  function buttonHtml(einheitId, titel, klasse) {
    const cls = 'btn btn-ghost' + (klasse ? ' ' + klasse : '');
    return `<a class="${cls}" href="${url(einheitId)}"
      title="Apple Watch: Training in der Fitness-App öffnen">⌚ Apple Watch</a>`;
  }

  return { buttonHtml, url };
})();
