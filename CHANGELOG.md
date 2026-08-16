# Changelog

## v322
- Admin → Wettkämpfe: neue (sortierbare) Spalte „Kategorie" zeigt die Import-Kategorie je Serie an.
- Admin-Modal: unter „Disziplinen" werden bei gesetzter Import-Kategorie nur noch die Distanzen angeboten, die zu dieser Disziplin-Kategorie gehören (live nachgefiltert beim Wechsel der Kategorie). `GET /wettkampf/disziplinen` liefert dafür die Kategorie(n) je Disziplin mit.

## v321
- Wettkampfname: der Ort wird aus dem Namen ausgeblendet, wenn er dort als vollständiges, eigenständiges Wort vorkommt (z. B. „Citylauf Korschenbroich" → „Citylauf"); Bindestrich-Komposita bleiben erhalten. Gilt in Admin → Wettkämpfe, Wettkampfplanung (Tabelle/Karte/PDF) und „Nächste Wettkämpfe".
- Startseite „Nächste Wettkämpfe": Ort wird jetzt unter dem Namen angezeigt.
- Ort-Anzeige mit Admin-Fallback (`ort_id` → `orte.name`) jetzt auch in Admin → Wettkämpfe und „Nächste Wettkämpfe" (GET /wettkampf `ort_letzter`).

## v320
- Fix: Ort eines Wettkampfs blieb leer, wenn keine genehmigte Veranstaltung im Statistikportal vorlag (z. B. Ruhr Trail Run) – die Wettkampfplanung nutzt jetzt zusätzlich den im Admin gesetzten Ort (`ort_id` → `orte.name`) als Fallback zum zuletzt bekannten Veranstaltungsort.

## v319
- Wettkampfplanung: neue Spalte „📊" mit der Anzahl der bereits im Statistikportal vorliegenden Ergebnisse je Wettkampf (sortierbar); Klick verlinkt auf die Serienseite im Statistikportal (…/#veranstaltungen/serie/ID). `GET /wettkampfplanung` liefert `anz_ergebnisse` je Serie + `statistikportal_url`.

## v318
- Einmaliger Import (DB-Migration 37): Import-Kategorie je regelmäßiger Veranstaltung wird aus den absolvierten Wettkämpfen im Statistikportal abgeleitet (häufigste Kategorie der Ergebnisse: `ergebnisse` → `disziplin_mapping.kategorie_id` → `disziplin_kategorien.tbl_key`). Bereits manuell gepflegte Kategorien bleiben unangetastet.

## v317
- Wettkampfplanung: Karte (Leaflet/OpenStreetMap) unter der Tabelle mit allen georeferenzierten Wettkämpfen der aktuellen Ansicht – aktualisiert sich mit jedem Filter; Marker-Popup mit Name/Datum/Ort/Kategorie/Link.
- Wettkampfplanung: neue Filter „Disziplin" und „Kategorie" (Dropdowns in der Toolbar) sowie neue, sortierbare Spalte „Kategorie" (aus der serienweiten Import-Kategorie / Statistikportal-Disziplinkategorien).
- `GET /wettkampfplanung` liefert jetzt `lat`/`lon` und `import_kategorie` je Serie.

## v316
- Wettkampfplanung: eigene Spalte „👥" mit Teilnehmeranzahl (sortierbar); bei Mouseover werden die angemeldeten Teilnehmer (Name · Disziplin, eigener Eintrag markiert) angezeigt – analog Admin → Wettkämpfe. Die bisherigen Inline-Teilnehmer-Chips unter dem Namen sind entfallen.

## v315
- Wettkampfplanung-PDF: keine Teilnehmerinformationen mehr – der Export enthält nur noch Datum/KW, Veranstaltung (+Ort) und Disziplinen.

## v314
- Wettkampfplanung: Man sieht jetzt pro Wettkampf, wer sonst noch angemeldet ist (Teilnehmerliste mit Disziplin, eigener Eintrag grün hervorgehoben). `GET /wettkampfplanung` liefert `teilnehmer` je Serie.
- Wettkampfplanung: Neuer Button „📄 PDF" – exportiert die aktuelle (gefilterte/sortierte) Ansicht als neutrales PDF ohne persönlichen Status (Datum/KW, Veranstaltung, Disziplinen, angemeldete Teilnehmer).

## v313
- Admin → Wettkämpfe: „Neuer Wettkampf" bietet jetzt dieselben Felder wie das Bearbeiten – Nächster Termin (fester Termin), Import-Kategorie und Wettkampf-URL (Anmeldung & Ergebnisse) sind bei der Anlage verfügbar. (Absage bleibt Edit-only, da sie eine bestehende Austragung betrifft.) `POST /wettkampf` speichert `import_kategorie` + `ergebnis_url`.

## v312
- **Wettkämpfe:** Anmelde-URL und Ergebnis-URL sind zu **einer** Wettkampf-URL pro Ausgabe zusammengeführt – in der Praxis ist es dieselbe Event-Seite. Im Admin-Modal gibt es nur noch ein Feld „Wettkampf-URL (Anmeldung & Ergebnisse)". In der Athleten-Ansicht zeigt derselbe Link vor dem Wettkampf „Jetzt anmelden ↗", danach „🏁 Ergebnisse ↗". Backend: `ergebnis_url` bleibt die kanonische Spalte (Statistikportal-Vertrag), `anmelde_url` wird stillgelegt und vorhandene Werte werden hineingemergt (Migration 36).

## v311
- Disziplin-Quelle vereinheitlicht: Der Picker (Admin → Wettkämpfe & „Wettkampf vorschlagen") und die Distanzen kommen jetzt ausschließlich aus der Statistikportal-Disziplinverwaltung (`disziplin_mapping`), nicht mehr aus rohen Ergebnis-Bezeichnungen. Alles Auswählbare ist damit 1:1 im Statistikportal vorhanden (z. B. „1 Meile").
- Admin → Wettkämpfe: Disziplin-Chips (Tabelle + Bearbeiten-Modal) nach gepflegter Distanz (Meter) aufsteigend sortiert; `GET /wettkampf/disziplinen` liefert Namen distanzsortiert inkl. `distanzen`-Map.
- Distanz-Parser erkennt zusätzlich „Meile"/„mile" (1 Meile = 1,609 km) für die namensbasierte Sortierung in der Wettkampfplanung.

## v310
- **Wettkämpfe:** In der Planung lässt sich jetzt pro Wettkampf ein **Ausgabe-Jahr** wählen (Selektor in der Ausgabe-Box). Damit können Anmelde- und Ergebnis-URL auch für eine bereits **vergangene** Ausgabe nachgetragen werden – vorher ließ sich nur die (prognostizierte) kommende Ausgabe bearbeiten.
- **Wettkämpfe:** Die **Import-Kategorie gilt jetzt serienweit** (für alle Ausgaben), nicht mehr pro Jahr – eine Straßenlauf-Serie ist schließlich jedes Jahr „Straße". Gespeichert in `training_wettkampf_planung.import_kategorie` (Migration 35, mit Backfill aus den bisherigen pro-Jahr-Werten). Anmelde-/Ergebnis-URL bleiben pro Ausgabe.

## v309
- **Wettkämpfe:** Die hartkodierte Ersatzliste für das „Import-Kategorie"-Dropdown wurde komplett entfernt. Einzige Quelle ist jetzt die geteilte Tabelle `disziplin_kategorien` (Endpunkt `GET /wettkampf/kategorien`). Schlägt der Abruf fehl, erscheint nur noch „— keine —" statt evtl. ungültiger Kategorien, die es im Statistikportal gar nicht gibt.

## v308
- **Wettkämpfe:** Das Dropdown „Import-Kategorie" lädt seine Einträge jetzt dynamisch aus der geteilten DB (Statistikportal-Tabelle `disziplin_kategorien`, neuer Endpunkt `GET /wettkampf/kategorien`) statt aus einer fest verdrahteten Liste. Neue oder umbenannte Kategorien im Statistikportal erscheinen damit automatisch; die bekannte Liste bleibt nur noch als Fallback.

## v307
- **Wettkämpfe:** Das Dropdown „Import-Kategorie" verwendet jetzt exakt die `tbl_key`-Werte des Statistikportals (`strasse`, `sprint`, `mittelstrecke`, `sprungwurf`, `bahn`, `halle`) – damit funktioniert der Ein-Klick-Import dort ohne Kategorie-Nachfrage. Die vorher geratenen Slugs (`cross`, `trail`, `mehrkampf`) wurden entfernt.

## v306
- **Wettkämpfe:** Pro Ausgabe (Serie + Jahr) lassen sich jetzt eine **Anmelde-URL**, eine **Ergebnis-URL** und eine **Import-Kategorie** hinterlegen (Admin-Modal „Planung bearbeiten"). Die Ergebnis-URL liest das Statistikportal nach dem Wettkampf zum Ergebnis-Import; die Import-Kategorie ermöglicht dort den Ein-Klick-Import. Neue Tabelle `training_wettkampf_ergebnis` (Migration 34).
- **Wettkampfplanung (Athleten):** Wettkämpfe mit hinterlegter Anmelde-URL zeigen einen **„Jetzt anmelden ↗"**-Button; nach dem Wettkampf erscheint bei hinterlegter Ergebnis-URL ein **„🏁 Ergebnisse ↗"**-Link.

## v305
- Wettkampfplanung: Disziplin-Badges in der Spalte „Disziplinen" jetzt nach Distanz aufsteigend sortiert (unbekannte Distanz ans Ende).

## v304
- **Nächste Wettkämpfe:** Abgesagte Wettkämpfe zeigen jetzt gar keine Badges mehr. Bei allen übrigen Wettkämpfen sind die Disziplin-Badges nach Wettkampfdistanz (m) sortiert.

## v303
- **Nächste Wettkämpfe: abgesagte Wettkämpfe** zeigen jetzt statt „Keine Anmeldung möglich" ihre Disziplinen als Badges – sortiert nach Wettkampfdistanz (m).

## v302
- **Block-Editor: Titel steht jetzt oben** – als erstes Feld im Modal, hervorgehoben und größer. Vorher lag er ganz unten unter den Segmenten.
- Direkt daneben der Button **„⚡ Segmente aus Titel"**: Kurzschrift eintippen, klicken, fertig – Klammern werden zu verschachtelten Blöcken (`3 x (4 x 400, 100 TP), BP 400 TP`). Bisher versteckte sich die Funktion als unscheinbarer Button in der Segment-Kopfzeile.
- Darunter drei anklickbare Beispiel-Kurzschriften, die das Titelfeld füllen und sofort die Segmente erzeugen.
- Nach dem Parsen meldet das Portal, wie viel Gesamtdistanz erkannt wurde; bei leerem oder unverständlichem Titel gibt es einen klaren Hinweis statt eines stummen Klicks.

## v301
- Der Garmin-Button heißt jetzt nur noch „⌚ Garmin" statt „⌚ FIT für Garmin" – kürzer und passend zum „⌚ Apple Watch" daneben.
- Buttons, die als Link umgesetzt sind (Garmin, Apple Watch, GPX, Komoot), werden nicht mehr unterstrichen: `.btn` setzte kein `text-decoration`, sodass der Standard-Linkstil durchschlug.

## v300
- **Apple-Watch-Export wieder als einfacher Download.** Die Route mit Dateiendung im Pfad (v299) brachte auf dem iPhone nur eine zusätzliche Rückfrage vor dem Download, ohne dass Fitness dadurch erreichbar wurde. Auslieferung deshalb wieder als `attachment` über `api/index.php?p=workout/einheit/{id}.workout`, Rewrite-Regel entfernt.
- Der Button „⌚ Apple Watch" erscheint jetzt nur noch auf Apple-Plattformen (iOS, iPadOS, macOS) – anderswo gibt es keine App, die `.workout` öffnen kann.
- Der Dateiname bleibt der Titel der Einheit (z. B. `3 x (4 x 400, 100 TP), BP 400 TP.workout`), damit die Datei in der Dateiablage wiederzufinden ist.

## v299
- **Apple-Watch-Export über eine URL mit echter Dateiendung.** `com.apple.workout` ist im System ausschließlich über `public.filename-extension` deklariert – ohne MIME-Typ. Steht die Endung nur in der Query (`api/index.php?p=…workout`), kann Safari den Typ nicht bestimmen. Neue Route `/workout/{id}.workout` per `.htaccess`, ausgeliefert als `inline` statt `attachment`, damit Safari die Datei selbst typisiert.
- Der Dateiname kommt jetzt aus dem Titel der Einheit (mit RFC-5987-Kodierung für Umlaute) statt `training-2026-08-05-42.workout` – er ist in der iOS-Vorschau sichtbar.
- Der Weg über das Teilen-Sheet (`navigator.share`) ist entfallen: Fitness ist nur als Dokumenthandler registriert (`CFBundleDocumentTypes`), und die App-Reihe im Teilen-Sheet listet ausschließlich Share-Extensions. Die Datei wurde dort korrekt als Workout erkannt, Fitness kann dort aber grundsätzlich nicht erscheinen.

## v298
- **Apple-Watch-Export: Fitness fehlte im Teilen-Sheet.** Der Systemtyp `com.apple.workout` ist ausschließlich über die Dateiendung deklariert (`UTTypeTagSpecification` kennt nur `public.filename-extension`, keinen MIME-Typ). Der bisher gesetzte Typ `application/octet-stream` bildete deshalb auf `public.data` ab und überstimmte die Endung – iOS konnte die zuständige App nicht mehr ermitteln. Die geteilte Datei wird jetzt ohne MIME-Typ gebaut, damit die Endung greift; `application/octet-stream` bleibt nur als Rückfall, falls der Browser eine Datei ohne Typ ablehnt.

## v297
- **Apple-Watch-Export öffnet sich direkt.** Auf dem iPhone landete die `.workout`-Datei bisher als Download in „Dateien" und musste dort von Hand gesucht und geöffnet werden. Auf Touch-Geräten öffnet der Button jetzt das native Teilen-Sheet, in dem „Fitness" direkt als Ziel steht – ein Tipp, und das Training ist auf der Uhr.
- Die Datei wird dafür beim Öffnen der Ansicht im Hintergrund geladen (wenige hundert Byte), weil iOS `navigator.share()` nur unmittelbar im Klick-Ereignis erlaubt. Ohne Web-Share-API und am Desktop bleibt es beim gewohnten Download.

## v296
- **Apple-Watch-Export: Pausen laufen jetzt offen** statt über eine feste Distanz – der Erholungsschritt endet erst, wenn man an der Uhr weiterdrückt (Garmin-Pendant: „bis Drücken der LAP-Taste"). Die vorgesehene Pausendistanz steht weiterhin in der Bezeichnung des Schritts, z. B. „Trabpause 100m".

## v295
- **Startseite zeigt Heute/Morgen wieder an.** Die Kilometer-Berechnung für übernommene Einheiten (neu in v293) hat die Einheitenliste der API überschrieben – die Antwort enthielt statt der Trainings deren Segmentzeilen. Dadurch blieb der Heute/Morgen-Bereich leer und der Kalender ohne Team-Einheiten.

## v294
- Fehler beim Laden der Heute/Morgen-Sektion landen jetzt in der Browser-Konsole. Bisher wurde der Bereich bei einem Fehler kommentarlos geleert – von außen nicht von „keine Einheit geplant" zu unterscheiden.

## v293
- **Verschachtelte Intervallblöcke.** Trainingsblöcke können jetzt Blöcke enthalten – damit lässt sich z. B. „3 x (4 x 400, 100 TP), BP 400 TP" so planen, wie Trainer es aufschreiben: ein 3er-Block, der einen 4er-Block und die Blockpause enthält. Bisher musste jede Wiederholung von Hand ausgeschrieben werden.
- Neuer Segment-Editor mit Baumstruktur: „+ Block" legt einen Wiederholungsblock an (auch innerhalb eines Blocks), „+ Tempo"/„+ Pause" einzelne Abschnitte. Abschnitte lassen sich sortieren (↑/↓), per „⤵" in einen eigenen Wiederholungsblock umwandeln und zwischen Tempo und Pause umschalten. Block- und Einheiten-Editor nutzen jetzt denselben Editor.
- **Titel-Kurzschrift** wird aus der Struktur erzeugt und wieder eingelesen: „Aus Titel parsen" versteht geklammerte Wiederholungen inklusive Blockpausen („3 x (4 x 400, 100 TP), BP 400 TP").
- Kalender-Tooltip und Detailansicht zeigen die Struktur statt einer ausgerollten Segmentliste: Balkengrafik über den echten Ablauf, darunter eingerückt „3 ×" → „4 ×" → Abschnitte. Die falschen Zeilen („3 × 400m" acht Mal) sind damit weg.
- Gesamtdistanz, „Mein Plan"-Kilometer, ICS-Beschreibung sowie Garmin-FIT- und Apple-Watch-Export berücksichtigen die Verschachtelung. Für die Uhren wird nur die innerste Wiederholung kompakt übertragen, äußere Blöcke werden ausgerollt (beide Formate kennen keine geschachtelten Wiederholungen).
- Bestehende Blöcke und Einheiten bleiben unverändert nutzbar: die alte flache Segmentablage wird beim Öffnen automatisch als Baum gelesen.

## v292
- Apple-Watch-Export jetzt auch auf der „Heute"-Karte – der Button „⌚ Apple Watch" steht überall dort, wo es schon den FIT-Export für Garmin gibt (Heute-Karte und Termin-Detailansicht).

## v291
- **Apple-Watch-Export**: Trainingseinheiten mit Segmenten lassen sich als `.workout`-Datei herunterladen und am iPhone in die Fitness-App importieren – dort landen sie als eigenes Training auf der Apple Watch. Neuer Button „⌚ Apple Watch" in der Detailansicht, direkt neben dem FIT-Export für Garmin.
- Jedes Segment wird zu einem Wiederholungsblock (z. B. „8 x 600m") mit Trainings- und Erholungsschritt; die Pause erscheint als eigener Schritt mit Distanz und Bezeichnung (Trabpause/Gehpause/Blockpause).
- Für angemeldete Nutzer enthält der Trainingsschritt eine **Pace-Vorgabe** als Korridor (Zielpace ±5 s/km), berechnet aus den persönlichen Pace-Referenzen – dieselbe Auflösung wie im Portal (manuell → 12 Monate → Bestzeit).
- Neuer Endpunkt `GET workout/einheit/{id}.workout` und Encoder `includes/apple_workout.php`. Das Dateiformat (Protobuf ohne öffentliches Schema) wurde aus einer von iOS exportierten Referenzdatei abgeleitet; der Encoder reproduziert diese byte-identisch.

## v290
- **Wettkampfplanung: keine versehentliche Anmeldung für eine bereits gelaufene Ausgabe.** Die Jahresansicht startet im laufenden Jahr – wer sich im August für einen Wettkampf im März anmeldet, hat sonst unbemerkt die Ausgabe des Vorjahres gebucht. Liegt der Termin des angezeigten Jahres in der Vergangenheit, fragt das Portal jetzt nach und bietet die nächste Ausgabe an (OK = Folgejahr, Abbrechen = trotzdem das angezeigte Jahr).
- Die Anmeldung, der Kalendereintrag in „Mein Plan" und die Jahresansicht beziehen sich danach einheitlich auf die tatsächlich gewählte Ausgabe.

## v289
- **Kartenhintergrund im Kalender-Tooltip**: Die Streckenvorschau liegt jetzt auf echten OpenStreetMap-Kacheln statt auf leerem Grund. Umgesetzt als kleiner statischer Kachel-Renderer (Web-Mercator, ohne Leaflet) – Kacheln und Linie teilen sich dasselbe Pixelsystem und liegen exakt übereinander. Die Zoomstufe wird automatisch so gewählt, dass die Strecke komplett hineinpasst. Im dunklen Theme werden die Kacheln invertiert; die rote Linie liegt im SVG darüber und bleibt davon unberührt.
- Kalenderübersicht: Karten-Emoji entfernt, die Distanz steht jetzt in einer eigenen Zeile unter dem Titel – im Monatsraster war es neben dem Titel zu eng und wurde abgeschnitten.
- Ohne geladene Strecken-Liste (z. B. Gastansicht) entfällt der Marker ganz, statt eine Marke ohne Zahl zu zeigen.

## v288
- **Admin → Strecken: bereits geplante Runden nachträglich zuordnen.** Ein Trainingsblock gibt seine Strecke nur beim Einplanen weiter – schon vorhandene Termine blieben leer. Der neue Abschnitt „Geplante Runden ohne Streckenverlauf" listet sie nach Titel gruppiert (mit Anzahl, Anteil zurückliegender Termine und Zeitraum), schlägt automatisch die Strecke des gleichnamigen Blocks vor und ordnet sie per Klick zu – einzeln oder alle Vorschläge auf einmal.
- Zurückliegende Termine werden dabei standardmäßig mit zugeordnet (abschaltbar über „Auch zurückliegende Termine zuordnen"), damit auch der Rückblick die Strecke zeigt.
- Neue Endpunkte `GET strecken/zuordnung` (Vorschläge) und `POST strecken/zuordnung` (anwenden, optional ab Datum). Zugeordnet wird über (Titel, Typ) und nur dort, wo noch keine Strecke hinterlegt ist – bestehende Zuordnungen bleiben unangetastet.

## v287
- Strecken werden jetzt überall dort angezeigt, wo sie gebraucht werden: 🗺-Marker mit Distanz in Kalender- und Listenansicht, Vorschau in der Termin-Detailansicht, auf der Heute-Karte und auf der Trainingsblock-Karte.
- **Hover-Tooltip im Kalender**: zeigt die Runde jetzt direkt als Streckenvorschau mit Name, Länge/Höhenmetern sowie Buttons „🗺 Auf Karte" und „GPX". Das Popover wird dafür breiter (320 px) und positioniert sich an seiner tatsächlichen Breite statt an einem festen Wert.
- Neue **Kartenansicht**: Klick auf jede Streckenvorschau (oder „🗺 Auf Karte") zeigt den Verlauf auf einer OpenStreetMap-Karte mit Start-/Ziel-Markern. Die Geometrie kommt weiterhin ausschließlich aus der eigenen Datenbank – von außen kommen nur die Kartenkacheln (wie beim Treffpunkt-Picker).
- **GPX-Download** an allen diesen Stellen (Detailansicht, Heute-Karte, Blockkarte, Kartenansicht, Editor) – für Uhr/Navi.
- Neue Seite **Admin → Strecken**: Übersicht aller importierten Strecken mit Vorschau, Länge/Höhenmetern, Verwendungszähler, Punktzahl und Herkunft; Import per Drag & Drop direkt dort, plus Umbenennen, Löschen und GPX-Download.

## v286
- Trainingsplanung → Runde: Der **Streckenverlauf** kann jetzt importiert werden (GPX, TCX, KML, GeoJSON – per Datei-Upload, Drag & Drop oder Adresse einer Streckendatei). Die Geometrie liegt vollständig in der eigenen Datenbank; zur Anzeige wird nichts von Garmin/Komoot nachgeladen. Vorschau ist ein Inline-SVG (Start-/Ziel-Marker, Rundkurs-Erkennung) in Einheiten-Editor, Block-Editor, Detail-Modal, Heute-Karte und Planungs-Popover.
- Beim Import werden Länge, Höhenmeter (↗/↘ mit 3-m-Hysterese gegen GPS-Rauschen) und Bounding-Box berechnet; sehr dichte Aufzeichnungen werden per Douglas-Peucker auf max. 3.000 Punkte ausgedünnt (Längenabweichung < 0,1 %).
- Einmal importierte Strecken sind wiederverwendbar (Auswahlliste je Runde), umbenennbar, löschbar (nur wenn nirgends verwendet) und als GPX exportierbar – auch aus Detail-Modal und Heute-Karte („🗺 Strecke als GPX" für Uhr/Navi).
- Hinweis zu Garmin Connect: Aktivitäts- und Streckendaten werden dort nur an angemeldete Nutzer herausgegeben (auch bei Freigabe-Links). Ein Link auf `connect.garmin.com` erzeugt daher eine erklärende Meldung mit dem Weg über „Exportieren nach GPX"; gleiches gilt für Komoot.
- DB-Migration 32: neue Tabelle `training_strecken` (Geometrie als JSON-Punktliste) sowie Spalte `strecke_id` auf `training_einheiten` und `training_bloecke`. Neue Endpunkte `GET/POST/PUT/DELETE strecken[/{id}]` und `GET strecken/{id}/gpx`. Blöcke geben ihre Strecke beim Einplanen (auch als Serie) an die Einheit weiter.

## v285
- Wettkampf-Anmeldungen sind jetzt jahresgebunden: jede Anmeldung wird für ein konkretes Jahr gespeichert (`jahr`). Nach dem Jahreswechsel zeigt eine abgelaufene, bereits fürs Folgejahr terminierte Veranstaltung nicht mehr die Vorjahres-Anmeldungen – überall (Admin-Tabelle, Startseiten-Karte/Liste, Popover, Wettkampfplanung) wird nur die Ausgabe des jeweils angezeigten Jahres gezählt.
- DB-Migration 31: Spalte `jahr` auf `training_wettkampf_anmeldungen` (Backfill aus `erstellt_am`), Eindeutigkeit jetzt pro (Planung, Nutzer, Jahr); `POST /wettkampf/{id}/anmeldungen` nimmt `jahr` entgegen (Default: laufendes Jahr).

## v284
- Admin → Wettkämpfe: Tooltip der Spalte „Anmeldungen" listet jetzt die angemeldeten Personen (Name · Disziplin) auf.

## v283
- Admin → Wettkämpfe: neue (sortierbare) Spalte „Anmeldungen" – zeigt pro Wettkampf die Anzahl der Anmeldungen (👥) an.

## v282
- Fix: „Wettkampf vorschlagen" schlug ab dem zweiten Vorschlag fehl (SQLSTATE 23000 „Duplicate entry '' for key 'kuerzel'") – der Endpoint `POST /wettkampf/vorschlag` leitet jetzt wie der Admin-Endpoint ein eindeutiges `kuerzel` aus dem Namen ab.

## v281
- Wettkampf-Absage: Admins/Trainer können eine einzelne Ausgabe absagen (Modal Admin → Wettkämpfe, Abschnitt „Absage"). Der Wettkampf bleibt in allen Übersichten sichtbar, wird aber durchgestrichen + rot „Abgesagt" markiert; eine Anmeldung ist nicht mehr möglich (Kalender, Liste, „Nächste Wettkämpfe", Wettkampfplanung, Popover – sowie serverseitig blockiert).
- Abgrenzung Absage ↔ Deaktivierung: Absage ist einmalig (nächstes Jahr findet der Wettkampf wieder statt – sobald das abgesagte Datum vergangen ist, greift die Prognose normal weiter); Deaktivierung (●/◯) bedeutet, der Wettkampf findet generell nicht mehr statt und verschwindet aus aktueller und kommender Planung.
- DB-Migration 30: Spalte `abgesagt_datum` auf `training_wettkampf_planung`; `PUT /wettkampf/{id}/planung` akzeptiert `abgesagt_datum`; `POST /wettkampf/{id}/anmeldungen` blockt abgesagte Ausgaben (HTTP 409).

## v280
- Wettkampfplanung: Button „+ Wettkampf vorschlagen" – Nutzer können bisher unbekannte Wettkämpfe (Name, Datum, Website, Disziplinen) zur Planungsliste hinzufügen
- Vorschläge erscheinen sofort in der eigenen Planung und laufen unter Admin → Wettkämpfe mit orangem „Vorschlag"-Badge (inkl. Name des Vorschlagenden) zur Prüfung auf
- Admin: beim ersten Speichern eines Vorschlags wird das Badge entfernt (als geprüft markiert); Zähler „N Vorschläge zur Prüfung" im Kopf der Wettkampf-Tabelle
- Admin → Wettkämpfe: Button „+ Neuer Wettkampf" – Admins/Trainer legen Wettkämpfe direkt an (Name & Datum frei editierbar); manuelle/Statistik-lose Serien sind im Planungs-Modal jetzt voll editierbar
- DB-Migration 29: Spalten `vorschlag_von` / `vorschlag_am` auf `veranstaltung_serien`; neue Endpoints `POST /wettkampf/vorschlag` (Nutzer) und `POST /wettkampf` (Admin)

## v279
- Gastansicht: neuer Button „📄 PDF" in der Gastansicht-Leiste (neben „Anmelden") – speichert die aktuelle Ansicht (Monat bzw. Quartal) als sachliches Trainingsplan-PDF im bewährten Tabellenformat (Datum/Uhrzeit/Runde/Bemerkungen, Wochen durch Leerzeilen getrennt, Dauerläufe grau, Wettkämpfe/Events fett). Öffnet ein druckoptimiertes Dokument und den „Als PDF speichern"-Dialog.

## v278
- Fix: Teilnehmerzahl wurde in der Gastansicht nicht angezeigt – Anmeldungen werden jetzt auch für Gäste geladen (Namen werden serverseitig entfernt, nur die Anzahl bleibt sichtbar).
- Wettkampf-Zeilen (Liste): externer Link zur Wettkampf-Webseite (↗) bei zukünftigen Terminen; vergangene Veranstaltungen mit Ergebnissen verlinken weiterhin ins Statistikportal (auch für Gäste).
- Gastansicht: „Nächste Wettkämpfe"-Abschnitt am Seitenende endgültig entfernt – die unbewachten Re-Render-Aufrufe sind jetzt in `ladeWettkampfSektionInto()` selbst per `!state.user`-Guard abgefangen.

## v277
- Gastansicht (Share-Link): keine Prognose-Termine mehr – es werden nur noch feststehende Wettkampftermine angezeigt (eingeloggte Nutzer sehen Prognosen weiterhin).
- Wettkampf-Zeilen in der Listenansicht zeigen jetzt die Disziplin-Chips und die Teilnehmerzahl (👥) in der letzten Spalte.

## v276
- Gastansicht (Share-Link): kein eigener Abschnitt „Nächste Wettkämpfe" mehr; stattdessen werden die Wettkämpfe direkt in Kalender bzw. Liste integriert – immer vollständig (Vergangene und „passt nicht" werden in der Gastansicht nicht ausgeblendet). Wettkampfdaten werden dafür auch für Gäste geladen.

## v275
- Teilen/Gast-Links: beim Erstellen werden jetzt zusätzlich Ansicht (Kalender/Liste) und Monat bzw. Quartal gewählt – Voreinstellung ist die aktuell geöffnete Ansicht + Zeitraum. Bestehende Links können nachträglich bearbeitet werden (✏️). Gäste landen auf der festgelegten Ansicht/Zeitraum; Navigation und Ansichtswechsel sind für sie ausgeblendet. DB-Migration 28 (Spalten `ansicht`/`zeitraum`), neue API `PUT share/tokens/{token}`. Der bestehende Link …85e6 wurde auf Liste/Q3 2026 gesetzt.
- Wochenziele: km-Vorgaben pro Woche im eigenen Plan und im Athletenplan (Trainer); Klick auf KW-Zelle → Inline-Eingabe; Ist/Ziel in Farbe (grün/orange)
- Fix: "Vergangene ausblenden" ignorierte historische Statistikportal-Einträge (`histByDate`) in Kalender- und Listenansicht – der Filter gilt jetzt auch für vergangene Veranstaltungen aus dem Statistikportal
- Refactor: `runPendingMigrations()` nutzt jetzt den gemeinsamen `Migrations::run('training_db_version', _migrationStmts())` aus `includes/migrate.php`. ~30 LOC Boilerplate raus.

## v270
- Modernisierung (PHP 8): `strpos(...) !== false` → `str_contains(...)` in `api/index.php` (ICS-Parser) und `shared.php` (`str_starts_with` für Path-Prefix-Check). Identisches Verhalten, lesbarer.

## v269
- Re-Refactor (nach v268-Revert): `includes/{db,settings,totp,passkey}.php` sind jetzt robuste Stubs auf das Statistikportal-Schwesterverzeichnis (`../../statistik.tus-oedt.de/includes/`). Funktioniert ohne Eingriff in die Production-`config.php`. Optional per `STATISTIKPORTAL_INCLUDES_PATH` überschreibbar.

## v267
- Tagesnotizen im Hauptkalender (Startseite): werden jetzt parallel zu den Einheiten geladen und in Kalenderfarbe mit Autorenname angezeigt; Absage-Autor im Hauptkalender sichtbar
- Autorenname in Tagesnotizen: wird in beiden Kalendern (Haupt + Planung) neben dem Notiztext angezeigt
- Fix: Neue Modals (Tagesnotiz, Absagen, Wiederherstellen) waren transparent – falsche CSS-Klassen `modal-box`/`modal-header` durch `modal-card`/`modal-head` ersetzt
- Tagesnotizen jetzt in Gruppenkalenderfarbe eingefärbt statt hartcodiertem Amber; `applyKalenderFarben()` erzeugt `.kal-notiz.kal-cal-{key}`-Regeln mit `--cf`; Basis-CSS neutral (Fallback auf `--border`)
- Absagegrund im Hauptkalender und Heute/Morgen: abgesagte Trainings zeigen den Grund mit Autor; Heute/Morgen-Karte: Titel durchgestrichen, Absagegrund + Autor statt Treffpunkt; Hauptkalender: Absagegrund unter durchgestrichenem Titel; DB-Migration 25 (abgesagt_von auf training_einheiten), API gibt abgesagt_von_name zurück
- Training absagen: Trainer können ein Training sichtbar absagen statt löschen – ⚠-Button am Kalendereintrag öffnet Dialog mit optionalem Absagegrund; abgesagte Trainings bleiben durchgestrichen im Kalender und zeigen den Grund; ↩-Button stellt wieder her; Serien-Scope (einzel/ab jetzt/alle); ICS-Abo enthält Absagegrund in DESCRIPTION + COMMENT; DB-Migration 24 (absage_notiz auf training_einheiten)
- Tagesnotizen: Trainer/Admins können pro Tag (optional gruppenspezifisch) Notizen im Planungskalender hinterlegen; Notizen erscheinen für alle Athleten gelb hinterlegt und landen im ICS-Abo als ganztägiger Termin (📋); DB-Migration 23 (training_tagesnotizen); API GET/POST/PUT/DELETE /tagesnotizen
- Fix: `replaceBlockGruppen()` war aufgerufen aber nie definiert → "Call to undefined function"-Serverfehler beim Speichern eines Trainingsblocks; Funktion ergänzt (DELETE + INSERT IGNORE in training_block_gruppen)
- Admin: neuer Subtab „Gruppen" – Trainingsgruppen anlegen (POST /trainingsgruppen) und umbenennen (PUT /trainingsgruppen/{id}); Inline-Edit mit Enter/Escape, Duplikat-Prüfung, GRUPPEN-Cache-Invalidierung nach jeder Änderung
- Fix: Untermenü-Position Gruppen-Tab exakt an Athleten-Tab angeglichen – section-nav kompensiert jetzt die vollständige Summe aus main-Padding (24px/28px) + base-nav-Padding (14px/18px) = 38px oben / 46px links (nur Desktop >900px wo Viewport-Lock greift); gruppen-bar-Tabs linksbündig mit Pill-Buttons
- Trainingsplanung: Untermenü auf Admin-Stil umgestellt – Pill-Buttons (`.subtab`/`.subtabs`) statt weißem Balken, konsistente Position in allen Sektionen; Athleten-Ansicht mit Panel-Boxen (`.panel`-Header + Tabelle, Kalender als Box); Athleten-Content im max-width-Container
- Trainingsplanung: Untermenüpunkt „Wettkämpfe" vollständig entfernt – Abschnitt existiert nur noch mit „Gruppen" und „Athleten"
- favicon.ico via .htaccess auf favicon.php?size=32 umgeleitet; ICO-Link aus index.html entfernt – Browser nutzen jetzt einheitlich das dynamische PNG-Favicon
- Favicon vereinheitlicht: dynamischer Fallback-Buchstabe aus `login_portal_apps` (Hostname-Abgleich) statt hardcoded 'T'
- Tabellengestaltung überall vereinheitlicht: alle Tabellen (Wettkampfplanung, Admin-Wettkampf, Admin-Trainings, Admin-System, Athleten-Plan) in `<div class="panel">` gewrappt – Box/Shadow/Border-Radius wie im Statistikportal
- Inline-`_thStyle()`-Funktionen in `16_admin_wettkampf.js` und `14_admin_system.js` entfernt; `thBase`-String in `12_admin_trainings.js` entfernt – globale `th/td`-Regeln aus shared `app.css` greifen jetzt überall direkt
- `addons.css`: redundante Box-Stile von `.athleten-table` und `.wkp-table` entfernt (werden von `.panel` + globaler `app.css` abgedeckt)

## v224
- Fix: SQL-Fehler "Unknown column b.vorname" in GET mein-plan/uebersicht und profil/freigaben (vorname/nachname liegen in athleten-Tabelle, nicht in benutzer; JOIN via athlet_id)
- Wettkampfplanung: Tabellengestaltung auf globale app.css-Regeln (th/td) umgestellt – inline-`_thStyle()` entfernt, `<table class="wkp-table">` statt inline-Styles; Kopfzeilen jetzt mit Barlow Condensed 12px, korrektem letter-spacing, `var(--surf2)`-Hintergrund wie im Statistikportal
- CSS: fehlende Stile fuer Athleten-Karten-Sidebar und athlet-plan-subhead ergaenzt

## v223
- Fix (Ursache "Lade Trainingsplan…"): ADMIN_WETTKAMPF-IIFE warf beim Laden einen ReferenceError, weil das return-Objekt drei in v217 entfernte Funktionen (_toggleDisz, _removeExtra, _addExtra) noch referenzierte → const blieb in der TDZ → typeof ADMIN_WETTKAMPF warf im Kalender. Tote Referenzen entfernt.

## v222
- Untermenü-Buttons (Admin-Seite, Trainingsplanung-Sektionsleiste) auf `.subtab`/`.subtabs` umgestellt – identisches Look & Feel wie im Statistikportal (Barlow Condensed uppercase, aktiver Tab mit Primärfarbe gefüllt)
- Tabellen-Kopfzeilen (`.athleten-table th`) an Statistikportal angeglichen: Barlow Condensed 12px, 2px border-bottom, letter-spacing 1px

## v221
- Render-Fehler werden jetzt sichtbar angezeigt (statt dauerhaftem "Lade Trainingsplan…"): renderKalender/renderListe-Aufrufe mit .catch + _showRenderError, Fehler zusätzlich in der Konsole
- Fix: SHARE._copy nutzte undefiniertes showNotification → jetzt _wkNotify

## v220
- Fix: "Lade Trainingsplan…" blieb stehen wenn bei parallelen Render-Aufrufen kal-grid/liste-content nicht mehr im DOM war (Race-Condition-Guard + Fehler-Fallback auf main)

## v219
- Trainingsplanung: Untermenü im Admin-Stil mit drei Bereichen „Gruppen", „Athleten" und „Wettkämpfe" (Pill-Buttons). Die einzelnen Gruppen-Tabs liegen jetzt als zweite Ebene unter „Gruppen".

## v218
- Plan-Freigabe: Athleten können ihren persönlichen Trainingsplan im Profil für einzelne Trainer/Admins freigeben (nicht / lesend / Vollzugriff). Neue Tabelle `training_plan_freigaben` (Migration 19) + Endpunkte `GET/PUT profil/freigaben`.
- Trainingsplanung: neuer Tab „👥 Athleten" mit Übersicht aller persönlichen Trainingspläne (auch ohne Zugriff sichtbar). Freigegebene Pläne öffnen sich im Monatskalender – lesend schreibgeschützt, bei Vollzugriff mit Hinzufügen/Bearbeiten/Löschen.
- API: `GET mein-plan/uebersicht` (Trainer/Admin) listet alle Athleten mit privatem Plan; `mein-plan/einheiten` akzeptiert `?fuer=<benutzerId>` für den Zugriff auf freigegebene Pläne (lesend = GET, voll = Schreibzugriff).

## v217
- Wettkampfplanung: referenz_datum aus Notion-Export – 115 Serien erhalten ihr letztes bekanntes Datum; letztes_datum per GREATEST(Statistikportal, Notion) – Prognose jetzt auch ohne Statistikportal-Eintrag möglich
- Gäste ohne Share-Token sehen keine Daten mehr (Login-Hinweis-Seite)
- Neuer "Teilen"-Button: Trainer/Admins können kryptische Gast-Links für Gruppen-Trainingspläne generieren und verwalten
- "Abonnieren" und "Teilen" unter den Kalender/die Liste verschoben
- "Heute"-Button links neben die Monatsauswahl / Quartalsauswahl verschoben
- DB-Migration 16: Tabelle training_share_tokens
- API: GET/POST/DELETE share/tokens, GET share/resolve/{token}
- API: GET /einheiten akzeptiert ?share_token= für authentifizierte Gastansicht

## v212

- Smartphone-Header zeigt jetzt den Namen der aktiven Seite an (wie im Statistikportal): `_fillMobileNav` schreibt den Tab-Label in `#mobile-page-title`; das CSS-Styling kommt bereits aus der gemeinsamen `app.css`.

## v211
- Anmelden-/Registrieren-Buttons jetzt wirklich pixelgleich zum Statistikportal: Die `addons.css`-Overrides für `.btn` (Schriftart `inherit` statt `Barlow Condensed`, `font-size 13px`, abweichendes Padding) und für `.btn.btn-sm` (fehlende fixe Höhe 30px) wurden für die Header-Buttons im `.anon-btn-wrap` mit den Originalwerten aus der gemeinsamen `app.css` zurückgesetzt.

## v210
- Header/Burger-Menü: Button „Registrieren" neben „Anmelden" ergänzt. Beide Buttons übernehmen exakt die Gestaltung aus dem Statistikportal (`btn btn-primary btn-sm` für Anmelden, `btn btn-ghost btn-sm anon-reg-btn` für Registrieren im `anon-btn-wrap`). „Registrieren" leitet zum Login-Portal mit `?register=1` weiter.

## v209
- Trainingsplanung: Auto-Scroll beim Ziehen – kommt der Zeiger nahe an den oberen/unteren Bildschirmrand, scrollt die Seite mit. Dadurch lassen sich Blöcke aus der unten liegenden Sidebar in den oben stehenden Kalender ziehen (v. a. auf dem Smartphone). Geschwindigkeit skaliert mit der Nähe zum Rand.

## v208
- Trainingsplanung auf dem Smartphone benutzbar gemacht: Viewport-Lock (100vh/overflow-hidden) wird auf Bildschirmen ≤900px deaktiviert, sodass die Seite normal scrollt. Der Kalender bekommt wieder natürliche Zeilenhöhen (statt kollabierender Flex-Zeilen), die Trainingsblöcke stehen ohne künstliche Höhenbegrenzung darunter.

## v207
- Wettkampfplanung: Filter (Freitext + Statusfilter mit Mehrfachauswahl), Sortierung per Spaltenklick (Name/Datum/Status), Multiselect + Bulk-Edit-Bar

## v202- Fix: Wettkampf-Einträge in Heute/Morgen zeigten Distanz und Disziplin doppelt (sind bereits im Titel enthalten)

## v201
- Menüpunkt "Planung" in "Trainingsplanung" umbenannt (Desktop-Nav + Mobile-Drawer)

## v198
- Planungs-Tabs: Gruppenfarbe wird im Dark-Mode per _farbeFuerDark() aufgehellt – aktives Tab ist jetzt lesbar; inaktive Tabs bekommen transparente Border (Hover via CSS)

## v197
- Planungskalender: Kalender-Spalte bekommt Mindestbreite von 560px – schrumpft nicht mehr ungewöhnlich schmal wenn keine Einträge vorhanden sind (auf Mobilgeräten weiterhin flexibel)
- Planungs-Tabs: Box-Tab-Design durch Underline-Tabs ersetzt – kein hartes Background/Border mehr, passt zu Light- und Dark-Theme

## v196
- Treffpunkte als Untermenü unter Admin verschoben (nicht mehr eigener Nav-Punkt)- Fix: Zwei Wettkämpfe am gleichen Tag – Kalender zeigte nur einen; "Nächste Wettkämpfe" zeigte Teilnahmedaten der falschen Serie. _wkPrivatMap speichert jetzt den Titel; Zuordnung erfolgt per Serienname-Prefix statt nur per Datum.
- Prognose-Wettkämpfe: Emoji von "🏆?" auf "❓" geändert

## v194
- Fix `GET /wettkampf/disziplinen`: `COALESCE(anzeige_name, disziplin)` – `anzeige_name` ist ein optionales Override-Feld (meist NULL); Fallback auf `disziplin` damit alle gemappten Disziplinen erscheinen
- Heute & Morgen: Spalten strecken sich auf gleiche Höhe (align-items: stretch + flex-Kette)
- Heute & Morgen stehen nebeneinander (2-Spalten-Layout); unter 900px werden sie wieder gestapelt

## v192
- Admin Wettkämpfe: Freitext-Eingabe für Disziplinen ersetzt durch durchsuchbare Liste aller Disziplinen aus dem Statistikportal (disziplin_mapping + Rohdaten). Neuer API-Endpunkt `GET /wettkampf/disziplinen`. Bereits aktive Disziplinen werden grün markiert; ausgeblendete lassen sich per Klick wieder einschließen.
- Fix: Kalender-Legende wurde bei jedem Render-Aufruf doppelt eingefügt – `outerHTML` ersetzte nur `#kal-grid`, nicht dessen `.kal-legend`-Geschwister; vorherige Legendenelemente werden jetzt vor dem Neuzeichnen entfernt

## v191
- Footer aus dem Statistikportal übernommen: „Powered by Trainingsportal © 2026 Daniel Weyers" plus Rechtslinks (Datenschutz · Nutzungsbedingungen · Impressum). Datengetrieben über die gemeinsamen `footer_*`-Keys der `einstellungen`-Tabelle – Rechtstexte werden mit beiden Portalen geteilt; Admins können sie auch hier per Markdown bearbeiten.
- Fix: Pause-Distanz in Segment-Beschreibung (z. B. „100m Gehpause") hatte noch Leerzeichen vor „m"

## v180
- Legende: Eine selbst gewählte Kalenderfarbe lässt sich jetzt per ↺-Knopf wieder löschen und auf die Vorgabe zurücksetzen (der Knopf erscheint neben dem Farbpunkt, sobald eine eigene Farbe gesetzt ist; Rechtsklick auf den Farbpunkt funktioniert weiterhin).
- Wettkampf-Popover: Disziplin deaktivieren entfernt den Wettkampf sofort aus dem persönlichen Kalender – kein Bestätigungs-Dialog mehr, direktes Löschen (Plan-Eintrag + formale Anmeldung) + Kalender-Refresh
- Wettkampf-Teilnahmen gehören zum persönlichen Kalender: Wettkämpfe, in die sich der Athlet einträgt, werden jetzt in der „Mein Plan"-Farbe dargestellt (statt der Wettkampf-Farbe). Die Wettkampf-Farbe bleibt für die öffentlichen/prognostizierten Wettkampf-Chips reserviert.
- Kalenderfarben statt Trainingstypen-Farben: Einheiten werden jetzt nach Kalender eingefärbt (je Trainingsgruppe, „Mein Plan", „Wettkämpfe", „Teamplan"). Standardfarben legt der Trainer direkt an den Tabs unter „Planung" fest; jeder Athlet kann die Farben für sich in der Legende per Klick auf den Farbpunkt überschreiben (Rechtsklick = zurücksetzen). Der Farbwähler für Trainingstypen in den Einstellungen entfällt.
- Wettkampf-Farbe vollständig dynamisch: Popover-Buttons (Disziplin-Auswahl), Kalender-Chip, Listenzeile und Legende-Punkt folgen jetzt der konfigurierten Typ-Farbe (Admin → Einstellungen) statt hartcodiertem Grün (#27ae60)
- Fix: Team-Einheiten, die nicht im persönlichen Plan sind, erhalten keine farbige Hintergrund-Markierung mehr – nur eigene Plan-Einträge werden farbig hervorgehoben (Border-Akzent bleibt für alle sichtbar)
- Fix: Kalender-km stimmt jetzt mit dem Modal überein – Gehpausen (`pause_m`) wurden beim Übernehmen in den persönlichen Plan nicht mitgezählt (4,8 statt 5,6 km bei 8×600m+100m); API berechnet Distanz für adoptierte Einheiten jetzt dynamisch aus den Segmenten
- „Nächste Wettkämpfe": heutiger Tag wird ab 12:00 Uhr Mittags nicht mehr angezeigt

## v172
- Dark Mode: Akzentfarbe als Text aufgehellt (`--accent-light`) – Wochenkilometer-Badges (KW-Kopf, Kalender + Liste) und eigener Wettkampf-Teilnehmer-Chip sind jetzt lesbar statt dunkelblau auf dunkel
- Dark Mode: zu dunkle Typ-Farben werden für Border/Text automatisch aufgehellt (kontrast-gesteuert gegen die dunkle Fläche, analog `--accent-light` im Statistikportal) – Kalender, Listen, Blöcke & Wettkampf-Karten bleiben lesbar; bereits helle Farben unverändert
- Favicons: echtes TuS-Oedt-Logo statt generischem T

## v168
- Fix: Disziplin-Buttons unter „Nächste Wettkämpfe" sind jetzt klickbar – `JSON.stringify` im `onclick` brach das Attribut (literale Anführungszeichen); jetzt via `escapeHtml` korrekt kodiert
- „Nächste Wettkämpfe": Badge „✓ Termin" entfernt – nur noch „Prognose" wird angezeigt (bei nicht bestätigtem Termin)

## v166
- Wettkämpfe ohne Login sichtbar: „Nächste Wettkämpfe" und die Kalender-Chips werden jetzt auch für Gäste angezeigt
- Gäste sehen Disziplinen als nicht klickbare Pillen (`.wk-disz-static`) und keine Teilnehmer-Info
- API: `GET /wettkampf` ohne Login erlaubt (nur Lesen); Schreiboperationen (Anmeldung/Planung) erfordern weiterhin Login; Teilnehmer-Abfrage entfällt für Gäste

## v165
- Wettkampf-Karte: Disziplin-Buttons nutzen jetzt 1:1 die `.wk-pop-btn`-Klasse des Kalender-Popovers (grüne Pille, aktiv = vollflächig grün + weiße Schrift) – Optik exakt identisch
- Wettkampf-Karte: Aktiv-Zustand wird aus BEIDEN Quellen erkannt (privater Plan-Eintrag `_wkPrivatMap` + formale Anmeldung) – Datenstand jetzt deckungsgleich mit Popover
- Wettkampf-Karte: An-/Abmelden nutzt dieselbe Logik wie das Popover (`_wkEintragen`); Abmelden entfernt beide Einträge (Plan + Anmeldung)
- Wettkampf-Karte: Karte wird nach Befüllen von `_wkPrivatMap` erneut gerendert (korrekte Aktiv-Zustände beim ersten Laden)
- Teilnehmerliste: Legacy-Einträge (nur privater Plan, ohne formale Anmeldung) zeigen den eigenen Namen ergänzend an

## v164
- Wettkampf-Sign-up: Popover und Karte synchronisiert – Popover-Anmeldung schreibt auch formale Anmeldung; ☐-Präfix bei inaktiven Karten-Buttons entfernt

## v163
- Wettkampf-Karte: erster Angleich der Disziplin-Buttons an das Popover; eigener Teilnehmer-Eintrag hervorgehoben; API-Abfrage `ORDER BY a.id`

## v162
- Konfig: Seitentitel + Versionssichtbarkeit; Favicons erstellt
- „Nächste Wettkämpfe": unter den Kalender verschoben (nach dem Grid/Liste-Content)
- „Nächste Wettkämpfe": Farbschema grün (#27ae60) wie Kalender-Wettkampfeinträge
- „Nächste Wettkämpfe": Disziplin-Buttons zum An-/Abmelden (☐/✓); allgemeine Teilnahme wenn keine Disziplinen vorhanden
- „Nächste Wettkämpfe": Teilnehmerliste unter jeder Karte (nur sichtbar wenn Anmeldungen vorhanden)
- API: `POST wettkampf/{id}/anmeldungen` akzeptiert jetzt leere Disziplin (= allgemeine Teilnahme)
- Kalender/Liste: neue Sektion „Nächste Wettkämpfe" unterhalb von „Heute" – zeigt die 3 nächsten aktiven Wettkampf-Serien mit Datum (bestätigt/Prognose) und Disziplinen

## v159
- Fix Admin → System auf dem Smartphone: lange Werte (Datenbank-Server-String, E-Mail) brachen aus dem Bildschirm aus – Statistik-Tabellen nutzen jetzt `table-layout: fixed` mit Wortumbruch, sodass die roten Abschnitts-Header und Werte nicht mehr überlaufen

## v156
- Startseite startet auf dem Smartphone jetzt konsequent in der Listenansicht (Quartalsplan): zentraler `startHash()`-Helfer, der bei Bildschirmbreite < 720 px die Liste wählt – greift beim Laden, beim Klick auf das Logo/Startseite und bei allen internen Umleitungen
- Admin → System für Smartphones optimiert: Statistik- und Detailspalten brechen auf eine Spalte um, breite Tabellen (Gäste, letzte Logins) horizontal scrollbar (`.admin-sys-stats`, `.admin-sys-cols`, `.admin-sys-table`)

## v163
- Listenansicht (Quartalsplan, Startseite mobil) zeigt jetzt dieselben Einträge wie der Kalender: persönliche Trainings (Mein Plan, mit Punkt-Markierung), Wochenkilometer-Badge pro KW, Wettkampf-Termine (🏆/🏆? mit Tap-Popover zum Eintragen) sowie die Gruppen-/Plan-/Wettkampf-Filter (gemeinsamer Datenlader `_buildPlanData`)
- Umschaltung Liste ⇄ Kalender springt jetzt immer auf das aktuelle Quartal bzw. den aktuellen Monat (statt den gerade betrachteten Zeitraum beizubehalten)
- Mobile-Optimierung: km-Badges & Mein-Plan-Markierung in der Liste, Touch-Geräte zeigen Löschen/Hinzufügen-Buttons dauerhaft, Modals nahezu bildschirmfüllend mit größeren Tap-Flächen, breite Admin-Tabellen horizontal scrollbar (`.table-scroll`)

## v154
- Header: Profil-Button (user-badge) identisch mit Statistikportal – ganzer Badge klickbar (öffnet Profileinstellungen), Avatar-Bild wird korrekt angezeigt, Initialen VN-Format, Online-Dot außerhalb des Kreises positioniert

## v150
- Kalender: Wettkampf-Chips mit `🏆?` für Prognose-Termine (nicht bestätigtes Datum), `🏆` für fest eingetragene Termine
- Kalender: Klick auf Wettkampf-Chip öffnet Modal zum Eintragen in den persönlichen Kalender – mit Disziplin-Auswahl (Dropdown wenn Disziplinen bekannt, sonst Freitextfeld)
- Fix: Kalender lud nicht mehr (Startseite zeigte dauerhaft „Lade Trainingsplan…"): `d4` war mit `const` im `try`-Block deklariert und außerhalb nicht erreichbar → `ReferenceError`; jetzt als `let wettkampfRaw` außerhalb des Blocks
- Admin → Wettkämpfe: Disziplinen-Verwaltung überarbeitet – extrahierte Disziplinen als Toggle-Chips (grün = aktiv, gestrichen = ausgeblendet), manuell hinzugefügte als entfernbare Tags, Eingabefeld für neue Disziplinen; ausgeblendete Disziplinen werden als `disziplinen_ausgeschlossen` gespeichert und beim nächsten Laden wiederhergestellt
- Admin → Wettkämpfe: Termine inline im Detail-Panel editierbar (Datumsfeld + ✓ OK + ↺ Zurücksetzen) – kein Modal mehr nötig
- Admin → Wettkämpfe: Aktiv/Inaktiv-Toggle (●/◯) pro Serie – inaktive Wettkämpfe erscheinen ausgegraut und werden im Kalender ausgeblendet
- Planung → neuer Tab „🏆 Wettkämpfe": Monatskalender mit Wettkämpfen auf ihren prognostizierten/manuellen Terminen; Wettkämpfe per Drag & Drop auf anderen Tag verschieben (setzt `naechstes_datum`); × entfernt manuelles Datum (Prognose wird wieder verwendet); Sidebar zeigt alle Serien als Karten mit nächstem Termin
- API: `wettkampf`-Endpunkt gibt `aktiv`-Feld zurück; PUT-Handler unterstützt `aktiv`-Parameter; DB-Migration #14 für `aktiv`-Spalte in `training_wettkampf_planung`
- DB-Migration #13: `disziplinen_ausgeschlossen TEXT NULL` in `training_wettkampf_planung`

## v137
- Kalender-Popover: Browser-Tooltip (title) auf Kalendereinträgen entfernt – kein doppelter Hinweis mehr wenn Popover sichtbar
- Kalender-Popover: Bei übernommenen Einheiten (abonniert/manuell) erscheint jetzt „Aus meinem Plan entfernen" + Abo-Checkbox statt gar keiner Aktion

## v136
- Kalender: Private Einheiten lassen sich per Drag & Drop auf einen anderen Tag verschieben (übernommene Team-Einheiten bleiben fest); Drop-Zelle wird farblich hervorgehoben

## v135
- Planung: Kein Gruppenfilter aktiv → Kalender zeigt keine Einheiten (erleichtert Prüfung ob alle Einheiten korrekt zugeordnet sind)
- Planung: Bearbeitungs-Modal zeigt Gruppen-Dropdown – bestehende Einheiten können einer Trainingsgruppe zugeordnet werden
- Planung: `PUT serien/{id}` und `PUT serien/{id}/ab/{datum}` übernehmen jetzt auch `gruppe_id`-Änderungen

## v131
- Profil: Trainingsgruppen direkt im Statistikportal änderbar – Auswahl im Profil-Modal schreibt jetzt direkt in `athlet_gruppen` (Statistikportal-Tabelle); für Nutzer ohne Athletenverknüpfung weiterhin `training_benutzer_gruppen`
- Profil: Gruppen-Checkboxen alle interaktiv (kein read-only-Badge mehr)
- DB-Migration #11: erstellt `training_benutzer_gruppen`, `training_planung_gruppen`, `training_block_gruppen` (Statistikportal-verknüpfte Tabellen)
- `mein-plan/einheiten` liefert `meine_gruppen` jetzt aus `athlet_gruppen` + `training_benutzer_gruppen` statt `training_gruppen_mitglieder`

## v126
- Fix: PHP-Parse-Fehler in `handleGruppen` – schließende `)` des SQL-Subqueries lag außerhalb des PHP-Strings (seit v123, verursachte HTTP 500 bei JEDEM API-Aufruf inkl. /ping)

## v125
- Fix: HTTP 500 in `GET mein-plan/einheiten` behoben – SELECT verwendete `COLUMN_EXISTS()` (nicht in MariaDB verfügbar); ersetzt durch `SELECT e.*`
- Fix: `15_trainingsgruppen.js` (GRUPPEN-Modul) fehlte in `index.html` und verursachte „GRUPPEN is not defined"-Fehler

## v124
- Fix: „Mein Plan"-Legende-Dot zeigt jetzt korrekten Stil (getönte Hintergrundfläche + solider linker Streifen statt Dashed-Kreis)
- Heute-Sektion: Button „☑ Ich bin dabei!" / „☐ Ich bin dabei?" zum schnellen Ein-/Austragen aus dem persönlichen Plan

## v123
- Trainingsgruppen: neue DB-Tabellen, Admin-CRUD und Mitgliederverwaltung; Kalender-Legende zeigt Checkboxen pro Gruppe statt „Teamplan"; Gruppen-Bezeichnung statt Hardcode; Filter-Zustand wird serverseitig pro Benutzer gespeichert

## v119
- „Alle künftigen in meinen Plan" entfernt (war fehlerhaft); ersetzt durch Checkbox „[Typ] abonnieren" im Kalender-Popover – neu erstellte Einheiten dieses Typs werden automatisch in den persönlichen Plan übernommen

## v117
- Serientermine: Löschen-Button jetzt auch im Kalender- und Planung-Editor (bisher nur im Admin-Editor); bei Serien erscheint die Auswahl „Nur dieser / Dieser und alle folgenden / Gesamte Serie"
- Fix: globale `benachrichtigen()`-Funktion ergänzt – Speichern/Löschen im Kalender-Slim-Modal lief zuvor in einen ReferenceError (Daten gespeichert, aber Kalender wurde nicht aktualisiert)

## v114
- Serientermine lassen sich jetzt für die gesamte Serie bearbeiten: Beim Speichern einer Serien-Einheit erscheint die Auswahl „Nur dieser Termin / Dieser und alle folgenden / Gesamte Serie" (analog zum Löschen) – in Kalender-, Planung- und Admin-Editor
- Neue API-Endpunkte `PUT serien/{id}` und `PUT serien/{id}/ab/{datum}` (Teil-Update; jeder Termin behält sein eigenes Datum)
- Fix: „Bearbeiten" aus dem Detail-Modal entpackt jetzt korrekt das `{einheit, segmente}`-Objekt (zuvor leeres Formular möglich)

## v113
- Fix: Planungskalender zeigte keine Einträge mehr – Ursache war ein fehlendes DB-Schema für das Serien-Feature (`training_serien` + Spalte `einheiten.serie_id`), wodurch `GET /einheiten` mit HTTP 500 fehlschlug; Migration #9 ergänzt
- Planung: API-Fehler werden nicht mehr still verschluckt, sondern in der Konsole protokolliert

## v111
- Fix: Admin → Trainings: Typ-Bezeichnungen (Badge + Filter-Dropdown) werden jetzt aus den konfigurierbaren Trainingstypen gelesen – kein hardcodiertes „Funkt. Tr." mehr

## v110
- Fix: PHP-Syntaxfehler in GET /config (escapte \$r-Variablen) behoben → HTTP 500 beim Laden behoben

## v109
- Alle hardcodierten Trainingstypen entfernt: neue DB-Flags `ist_kein_training` und `hat_strecke` in `training_typen`; globale Helpers `getTypen()`, `getTypLabel()`, `hatStrecke()`, `istKeinTraining()` in allen Modulen; Admin-UI erlaubt Konfiguration der Flags; API-Migration 8 setzt Defaults

## v108
- Fix: Typ-Bezeichnungen überall aus appConfig.typen (Admin-Einstellungen) gelesen – keine hardcodierten Abkürzungen mehr (z. B. "Funkt. Tr." → "Funktionelles Training")

## v107
- Fix: Pausendistanzen (GP/TP/BP) werden zur Trainingsdistanz addiert (z. B. 10 × 500 m + 100 m GP = 6 km statt 5 km)

## v106
- Fix: Anreise-km im Kalender werden jetzt auch für übernommene private Einheiten berücksichtigt (API liefert treffpunkt_id via JOIN; WEG-Matching nutzt jetzt auch treffpunkt_id direkt)

## v105
- Fix: Trainingsdistanz im Modal korrekt berechnet (Wiederholungen werden jetzt multipliziert, z. B. 12 × 400 m = 4,8 km)
- Fix: Kalender-KW-Summe und km-Badges berücksichtigen jetzt die Anreise-km aus den Weg-Einstellungen

## v104
- Hinweis-Toasts erscheinen jetzt am unteren Bildschirmrand (statt oben rechts)

## v100
- Weg zum Training: Eingabe einfache Strecke, Hin+Rückweg wird × 2 berechnet; „Kein Training" aus Typ-Auswahl ausgeblendet; Text auf „Anreisekilometer" korrigiert
- Fix: „Alle Künftigen in meinen Plan" übernimmt jetzt die angeklickte Einheit sofort und abonniert dann den Trainingstyp – zuvor wurde die konkret angezeigte Einheit nicht hinzugefügt

## v95
- Hover-Popover für abonnierte Einheiten identisch zum Team-Eintrag (gleicher Popover über ref_einheit_id); „In meinen Plan"-Buttons werden dabei ausgeblendet
- Segmente im Popover als grafische Blöcke (TrainingPeaks-Stil) statt Text-Chips

## v94
- Seitenstreifen privater Kalendereinträge ist jetzt durchgehend (nicht mehr gestrichelt)

## v93
- Fix: km-Badge bei privaten Einheiten wird ausgeblendet, wenn der Wert 0 km beträgt

## v92
- Fallback-km aus der Typ-Konfiguration wird bei privaten Einheiten ohne Distanzangabe angezeigt (kursiv/gedimmt) und in die Wochenkilometer aufaddiert; explizit auf 0 km gesetzte Einheiten sind davon ausgenommen

## v91
- Fix: Uhrzeit bei abonnierten Trainings (DB-Migration #7 füllt uhrzeit für bestehende Abo-Einheiten nach, die vor Migration #6 angelegt wurden)

## v90
- Uhrzeit wird beim Übernehmen in den privaten Plan gespeichert und im Kalender angezeigt (sowohl bei „In meinen Plan" als auch beim Abo-Sync); Edit-Modal zeigt Uhrzeit-Feld

## v89
- Abo ist jetzt typ-spezifisch: „Alle künftigen in meinen Plan" abonniert nur Einheiten des gleichen Trainingstyps; „Alle künftigen aus meinem Plan entfernen" löscht alle künftigen Abo-Einheiten dieses Typs (vergangene bleiben erhalten) und beendet das Abo für diesen Typ

## v88
- Übernommene Team-Einheiten werden im Kalender ausgeblendet – nur die private Kopie (gestrichelt) bleibt sichtbar; Klick darauf öffnet das normale Detail-Modal
- Legende „Teamplan / Mein Plan" unter den Kalender verschoben (auf Mobilgeräten ausgeblendet)

## v87
- „In meinen Plan" übernimmt Einheiten direkt ohne Zwischendialog; km wird automatisch aus Segmenten berechnet oder aus der Typ-Fallback-Distanz (konfigurierbar unter Admin → Einstellungen → Trainingstypen) übernommen
- „Alle künftigen in meinen Plan": Abo-Button im Hover-Popover übernimmt alle künftigen öffentlichen Einheiten sofort und hält den Plan per Auto-Sync aktuell; einzelne Einheiten lassen sich trotzdem entfernen (werden beim nächsten Sync übersprungen); Abo-Beenden-Button erscheint, wenn Abo bereits aktiv

## v86
- Mein Plan in Hauptkalender integriert: separate Ansicht entfernt; öffentliche und private Einheiten werden direkt im Monatskalender angezeigt; KW-Spalte und „In meinen Plan"-Button im Hover-Popover erscheinen auf der Startseite

## v85
- Auto-Migration: DB-Migrationen werden beim ersten API-Aufruf automatisch ausgeführt (training_db_version in einstellungen); manuelle SQL-Skripte auf dem Server entfallen

## v84
- Mein Plan: privater Trainingskalender für jeden eingeloggten Nutzer; öffentliche Einheiten per Hover-Popover mit einem Klick übernehmen; private Einheiten farblich invertiert (getönter Hintergrund + gestrichelter Rahmen); Wochenkilometer-Spalte (KW-Nummer + km-Summe) direkt im Kalender

## v83
- Kalender-Detail-Modal: „Bearbeiten"-Button öffnet ebenfalls das schlanke Modal „Kalendereintrag bearbeiten" (Datum, Uhrzeit, Treffpunkt, Sichtbarkeit) – gilt jetzt im gesamten Kalenderbereich, nicht nur in der Heute-Sektion

## v82
- Heute-Sektion: „Bearbeiten"-Button öffnet schlankes Modal „Kalendereintrag bearbeiten" mit nur Datum, Uhrzeit, Treffpunkt und Sichtbarkeit (kein Trainingsblock-Editor)

## v81
- Kalender: heutiger Tag ohne farbige Zellhinterlegung – nur der Kreis um die Tageszahl bleibt farbig

## v75
- Pace-Warnung und Heute-Sektion innerhalb von `.kal-wrap` / `.liste-wrap` verschoben – gleiche Breite wie Kalender/Liste

## v74
- Pace-Warnung „Persönliche Pace noch nicht konfiguriert" wird über der Heute-Sektion angezeigt, unabhängig vom heutigen Training; per-Einheit-Warnung entfernt
- Fix: Link-Farbe in Warnhinweisen nutzt jetzt `color: inherit` – immer lesbar unabhängig von der Theme-Farbe

## v81
- Versionsnummer korrigiert: Sprung auf v73 nach Versions-Regression durch fehlerhafte Squash-Merges (main war zwischenzeitlich bei v71, dann auf v60 zurückgefallen)

## v57
- Heute-Sektion wird oberhalb der gesamten Kalender-/Listenansicht angezeigt (über Toolbar und Date-Picker)

## v56
- „Planung"-Button aus Kalender-Toolbar entfernt (Planung ist über die Navigation erreichbar)

## v55
- Heute-Sektion: zweispaltiges Layout – Trainingsinfos links, Komoot-Strecken-iFrame rechts (nur wenn Strecke hinterlegt); Komoot-Embed-URL auf `de-de`-Locale korrigiert; auf Mobile einspaltig gestapelt

## v54
- Heute-Sektion erscheint in Kalender- und Listenansicht gleichermaßen, unabhängig vom angezeigten Monat/Quartal (eigener API-Call für heute)

## v53
- Quartalsplan (Listenansicht): neue Ansicht `#liste/YYYY-QN` zeigt alle Einheiten eines Quartals nach Kalenderwochen gruppiert; Typ-Farbakzente, Heute-Markierung, Kein-Training-Styling; View-Toggle-Buttons in Kalender- und Listenansicht; auf Mobilgeräten ist Listenansicht Standard-Ansicht beim ersten Aufruf

## v52
- Fix: Pace-Warnhinweis erscheint jetzt korrekt, wenn Segmente Pace-Referenzen enthalten, die nicht konfiguriert sind (prüft `paceSekProKm` statt `!paceData`)

## v51
- Fix: Pausenblock nach der letzten Wiederholung eines Segments wird jetzt ebenfalls angezeigt

## v50
- Segmente als grafische Blöcke (TrainingPeaks-Stil): Wiederholungen einzeln dargestellt, proportionale Breite nach Distanz, Pausenblöcke zwischen Wdh, Farbe nach Trainingstyp; „Persönliche Pace"-Header aus Detail-Modal entfernt

## v49
- Heute-Sektion: Warnhinweis „Persönliche Pace noch nicht konfiguriert" mit Link zum Athletenprofil, wenn Segmente Pace-Referenzen enthalten aber keine Pace eingestellt ist

## v48
- Fix: Komoot-Link – `p[0]` als leerer Platzhalter nötig, damit `p[1][loc]` als Ziel (nicht Start) interpretiert wird
- Heute-Sektion: Segmente und persönliche Pace direkt inline angezeigt (kein „Details anzeigen"-Link mehr); FIT- und Bearbeiten-Button am unteren Rand der Karte
- Komoot-Link: Treffpunkt wird als Ziel gesetzt (`p[1][loc]`), kein Startpunkt vorbelegt
- Fix: Komoot-Link setzt jetzt Startpunkt via `p[0][loc]` und nutzt korrektes URL-Format (`/de-de/plan/@lat,lng,16z`)
- Fix: Kartenausschnitt in Treffpunkt-Karte korrekt zentriert (left/top via CSS calc statt fixer Pixelrechnung)
- Treffpunkte-Übersicht: statisches Kartenbild statt interaktivem OSM-Iframe (OSM-Tiles, SVG-Pin, nicht verschiebbar, kein Attribution-Overlay)

## v45
- Fix: Verschieben/Löschen im Planung-Kalender sofort sichtbar (optimistisches DOM-Update statt re-fetch)
- Fix: Nach Einplanen eines Blocks von der Planung-Seite bleibt man auf Planung (kein ungewollter Wechsel zum Kalender)
- Trainingsblöcke Typ „Runde / Strecke": Segmente-Sektion durch Komoot-Streckenfeld ersetzt; URL wird beim Einplanen auf die Kalendereinheit übertragen und im Kalender-Detail-Modal als Link angezeigt; DB-Migration: komoot_url in training_bloecke und training_einheiten

## v43
- Fix: Kalender in Planung aktualisiert nach Verschieben/Löschen sofort (cache:no-store verhindert gecachte GET-Antwort)
- Fix: Heute-Sektion zeigte „[object Object]" statt Treffpunktname – `e.treffpunkt` ist jetzt Objekt, Zugriff via `.name`
- Komoot-Link zu Treffpunkten; Kartenvorschau (OpenStreetMap-Embed) in jeder Treffpunkt-Karte auf der Übersichtsseite
- Planung: Kalendereinheiten per Drag & Drop auf einen anderen Tag verschieben (nur Trainer/Admin); Kalendereinträge per ×-Button (erscheint beim Hover) löschen – der zugehörige Trainingsblock bleibt erhalten

## v39
- Treffpunkte als eigene Entität: neuer Menüpunkt „Treffpunkte" (Trainer/Admin), CRUD mit Name, GPS-Koordinaten (Leaflet-Kartenpicker, OpenStreetMap) und automatisch generierten Links zu Google Maps und Apple Maps; Treffpunkt-Freitext aus Trainingsblöcken entfernt; beim Einplanen eines Blocks (Apply) und im Einheits-Editor wird Treffpunkt aus der gepflegten Liste gewählt (treffpunkt_id FK); Kalendermodal zeigt Treffpunktname mit Maps-Links; DB-Migration: neue Tabelle training_treffpunkte, treffpunkt_id in training_einheiten

## v37
- Planung-Sidebar: Segmentanzahl aus Block-Karten entfernt; Typ-Überschriften kleiner und linksbündig
- Heute-Sektion über dem Kalender: erscheint automatisch, wenn heute ein Training eingetragen ist; zeigt Typ, Uhrzeit, Titel, Treffpunkt, Bemerkung sowie Status-Badges; Klick öffnet Detail-Modal

## v36
- Seite „Trainingsblöcke" entfernt; Block-Verwaltung vollständig in Planung-Sidebar integriert: „+ Neu"-Button (Trainer/Admin), Bearbeiten-Button (✎) erscheint beim Hover über jede Karte, Sidebar lädt nach Speichern/Löschen automatisch neu
- `#bloecke` leitet auf `#planung` um; Kalender-Button „Trainingsblöcke" heißt jetzt „Planung"

## v34
- Trainingstypen in Einstellungen konfigurierbar: Neue Tabelle `training_typen` (Slug, Bezeichnung, Farbe, Reihenfolge, Aktiv); SQL-Migration `migration_v30_typen.sql`
- Admin-Panel „Trainingstypen": Typen anlegen, umbenennen, Farbe/Reihenfolge/Aktiv-Status ändern, löschen (nur wenn keine Blöcke zugeordnet); Spalte „Blöcke" zeigt Anzahl pro Typ
- Neue API-Endpunkte: `GET /typen` (öffentlich), `GET|POST|PUT|DELETE admin/typen/{slug}`
- `GET /config` liefert jetzt `typen`-Array → Editor und Blöcke-Seite verwenden dynamische Typen ohne Extra-Request
- Trainingsblöcke-Seite gruppiert Blöcke nach Trainingstyp (statt Global/Privat als Primärgruppe); Anzahl-Badge pro Typ-Abschnitt
- Typ-Auswahl in Block-Editor und Trainingseinheits-Editor liest Typen aus `appConfig.typen`; Fallback auf hardcodierte Werte
- `typ`-Spalten in `training_bloecke` und `training_einheiten` von ENUM auf VARCHAR(40) migriert

## v33
- Fix: `.settings-row-label` bekommt `flex-shrink:0; min-width:180px` – verhindert Schrumpfen der Label-Spalte auf Wortbreite

## v22
- Profileinstellungen: Klick auf Avatar öffnet Modal mit Pace-Referenz-Konfiguration pro Distanz (5 km, 10 km, HM, Marathon) – Quelle wählbar: Bestzeit gesamt, Bestzeit letzte 12 Monate (je nur wenn im Statistikportal vorhanden) oder manuelle Eingabe; gespeichert in `benutzer.prefs`
- Neuer API-Endpunkt `GET/PUT pace/prefs` – löst Pace-Referenzen per Distanz auf
- Pace-Engine (`05_pace.js`) nutzt jetzt `pace/prefs` statt globalem Modus; `PACE.invalidate()` ergänzt
- Detail-Modal: Modus-Dropdown durch „⚙ Profil"-Button ersetzt
- Fix: Notification-Stil `notif-err` ergänzt

## v21
- Fix: settings-row-label Spalte zu schmal – `min-width:0` auf `.settings-row-input`

## v18
- Migration: `POST admin/migrate_einheiten_zu_bloecken` liest alle Kalendereinträge und legt pro eindeutigem Titel einen globalen Trainingsblock an (mit Segmenten, idempotent)
- Migrationsbutton auf der Einstellungen-Seite (Admin)
- `POST einheiten` deaktiviert (405) – neue Kalendereinträge nur noch via `POST bloecke/{id}/apply`
- Kalender: „+ Neue Einheit"-Button ersetzt durch Link zur Trainingsblöcke-Seite; Tages-„+"-Button entfernt

## v17
- Fix: `INSERT IGNORE INTO rollen` ohne `beschreibung`-Spalte (Spalte existiert nicht in der geteilten DB)

## v16
- Fix: `training_bloecke`/`training_block_segmente` werden beim ersten API-Aufruf automatisch angelegt (`CREATE TABLE IF NOT EXISTS`); Trainer-/Editor-Rolle ebenfalls per `INSERT IGNORE` – kein manuelles SQL-Deployment mehr nötig

## v15
- Neue Rolle **Trainer**: eigener Eintrag in der `rollen`-Tabelle mit Rechten `training_bloecke_verwalten` + `training_bearbeiten`; `Auth::isTrainer()` / `requireTrainer()` in `auth.php`
- **Trainingsblöcke** (`#bloecke`): datumsunabhängige Vorlagen für Trainingseinheiten
  - DB: neue Tabellen `training_bloecke` und `training_block_segmente`
  - API: `GET/POST/PUT/DELETE bloecke`, `POST bloecke/{id}/apply` (Block auf Kalender-Datum legen)
  - Globale Blöcke erstellen/bearbeiten/löschen: nur Trainer und Admins
  - Private Blöcke: jeder eingeloggte User
  - Alle eingeloggten User können Blöcke per „Im Kalender planen" als konkrete Einheit eintragen
- Navigation: Tab „Trainingsblöcke" für alle eingeloggten User; Einstellungen-Tab weiterhin nur für Admins
- `POST/PUT/DELETE einheiten` prüft jetzt Recht `training_bearbeiten` (statt TODO-Kommentar)
- Migration: `sql/migration_v15_trainer.sql` (idempotent, `INSERT IGNORE`)

## v14
- Einstellungen-Seite verwendet jetzt 1:1 die Statistikportal-Optik
- Feiertage-Loader: cURL-Fallback, erweiterte Fehlermeldungen
- Neuer Diagnose-Endpoint `GET admin/feiertage_test`

## v13
- Fix: Header-Logo/Badge-Links korrigiert; Fallback für unbekannte Routes auf `#kalender`
- Fix: Vereinslogo und Avatar über `shared.php` ausgeliefert

## v12
- 1:1-Optik mit Statistikportal via `shared.php?file=app.css`
- `applyConfig()` übernommen; Backend `GET config` ergänzt

## v9
- Einstellungen-Seite für Admins: Feiertage-/Ferien-Feeds und Standard-Dauer

## v8
- Optik aus Statistikportal (Farben, Logo, Theme-Color)
- Feiertage/Ferien als konfigurierbare ICS-Feeds

## v7
- Bugfix: Query-String-Handling in API-Aufrufen

## v6
- FIT-Workout-Export für Garmin Connect

## v5
- ICS-Export (öffentlich + persönlich mit Token)

## v4
- Pace-Anreicherung für eingeloggte Athleten

## v3
- Einheit-Detail-Modal mit Segmenten

## v2
- Kalender: öffentliche + interne Einheiten, Login-Portal-Integration

## v1
- Projekt-Grundgerüst, Monatskalender (öffentlich), DB-Schema, Auth-Integration