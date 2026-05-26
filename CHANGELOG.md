# Changelog

## v185
- Einheitenformatierung vereinheitlicht: Leerzeichen zwischen Zahl und Einheit entfernt – überall im Frontend (JS) und Backend (PHP) jetzt „600m" statt „600 m", „3km" statt „3 km" usw.

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
