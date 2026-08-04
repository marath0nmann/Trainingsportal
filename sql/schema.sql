-- ============================================================
-- Trainingsportal – Datenbankschema
-- ============================================================
-- Hinweis: Die Tabellen `benutzer`, `rollen`, `einstellungen`,
-- `passkeys`, `login_versuche` etc. werden gemeinsam mit dem
-- Statistik-/Login-Portal genutzt und sind dort bereits angelegt.
--
-- Trainingsportal-spezifische Tabellen tragen den Präfix `training_*`.
-- Falls in `config.php` ein TABLE_PREFIX gesetzt ist, muss er hier
-- händisch ergänzt werden (Standardfall: leerer Präfix).
-- ============================================================

-- ── Treffpunkte (werden beim Einplanen einer Einheit gewählt) ──
CREATE TABLE IF NOT EXISTS training_treffpunkte (
  id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  name          VARCHAR(200)       NOT NULL,
  lat           DECIMAL(10,7)      NULL COMMENT 'GPS-Breitengrad',
  lng           DECIMAL(10,7)      NULL COMMENT 'GPS-Längengrad',
  erstellt_von  INT UNSIGNED       NULL,
  erstellt_am   TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am  TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Strecken (Streckenverlauf für Runden) ──────────────────────
-- Die Geometrie liegt vollständig hier: Beim Import (GPX/TCX/KML/GeoJSON)
-- wird die Datei einmalig geparst und als JSON-Punktliste gespeichert.
-- Es wird bewusst NICHT auf Garmin/Komoot verlinkt oder nachgeladen.
CREATE TABLE IF NOT EXISTS training_strecken (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name         VARCHAR(200)  NOT NULL,
  herkunft     VARCHAR(200)  NULL COMMENT 'Nur Info: Dateiname/Quelle des Imports',
  distanz_m    INT UNSIGNED  NOT NULL DEFAULT 0,
  aufstieg_m   INT UNSIGNED  NULL,
  abstieg_m    INT UNSIGNED  NULL,
  punkte       INT UNSIGNED  NOT NULL DEFAULT 0,
  start_lat    DECIMAL(10,7) NULL,
  start_lng    DECIMAL(10,7) NULL,
  min_lat      DECIMAL(10,7) NULL,
  max_lat      DECIMAL(10,7) NULL,
  min_lng      DECIMAL(10,7) NULL,
  max_lng      DECIMAL(10,7) NULL,
  ist_rundkurs TINYINT(1)    NOT NULL DEFAULT 0,
  geometrie    MEDIUMTEXT    NOT NULL COMMENT 'JSON [[lat,lng,ele|null], ...]',
  erstellt_von INT UNSIGNED  NULL,
  erstellt_am  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Trainingseinheit (Kalendereintrag) ─────────────────────────
CREATE TABLE IF NOT EXISTS training_einheiten (
  id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  datum         DATE               NOT NULL,
  uhrzeit       TIME               NULL,
  typ           ENUM('intervall','dauerlauf','funktionell','runde','event','frei','kein_training')
                                   NOT NULL DEFAULT 'frei',
  titel         VARCHAR(200)       NOT NULL,
  treffpunkt_id INT UNSIGNED       NULL,
  komoot_url    VARCHAR(500)       NULL COMMENT 'Optionaler Komoot-Streckenlink (v. a. für typ=runde)',
  strecke_id    INT UNSIGNED       NULL COMMENT 'Streckenverlauf aus training_strecken',
  bemerkung     TEXT               NULL,
  sichtbarkeit  ENUM('oeffentlich','intern')
                                   NOT NULL DEFAULT 'oeffentlich',
  status        ENUM('geplant','abgesagt')
                                   NOT NULL DEFAULT 'geplant',
  erstellt_von  INT UNSIGNED       NULL,
  erstellt_am   TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am  TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_datum (datum),
  KEY idx_sichtbarkeit (sichtbarkeit, datum),
  CONSTRAINT fk_einh_treffpunkt FOREIGN KEY (treffpunkt_id)
      REFERENCES training_treffpunkte(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Strukturierte Segmente (Intervalle, Pyramiden, Blöcke) ─────
-- Die Zeilen bilden einen Baum: abschnitt_typ='gruppe' ist ein Wiederholungs-
-- block, eltern_id verweist auf dessen knoten_id. Damit sind verschachtelte
-- Intervalle abbildbar, z. B. "3 x (4 x 400, 100 TP), BP 400 TP":
--   gruppe(3) → [ gruppe(4) → [work 400, pause 100 TP], pause 400 BP ]
-- Zeilen ohne knoten_id stammen aus der flachen Ablage davor (Gruppierung
-- über block_id/gruppen_id, Pause in pause_m) und werden beim Lesen konvertiert.
CREATE TABLE IF NOT EXISTS training_segmente (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  einheit_id      INT UNSIGNED    NOT NULL,
  reihenfolge     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  abschnitt_typ   VARCHAR(10)     NOT NULL DEFAULT 'work' COMMENT 'work | pause | gruppe (Wiederholungsblock)',
  knoten_id       SMALLINT UNSIGNED NULL COMMENT 'Knoten-Nr. innerhalb der Einheit',
  eltern_id       SMALLINT UNSIGNED NULL COMMENT 'knoten_id des umschließenden Blocks',
  block_id        SMALLINT UNSIGNED NULL COMMENT 'Altbestand: flache Gruppierung',
  wiederholungen  SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'nur bei abschnitt_typ=gruppe',
  distanz_m       INT UNSIGNED    NULL COMMENT 'NULL bei Gruppenknoten',
  pause_m         INT UNSIGNED    NULL,
  pause_typ       ENUM('TP','GP','BP','frei') NULL,
  pace_referenz   VARCHAR(40)     NULL COMMENT 'z.B. 10km, 5km, marathon, frei',
  notiz           VARCHAR(200)    NULL,
  PRIMARY KEY (id),
  KEY idx_einheit (einheit_id, reihenfolge),
  CONSTRAINT fk_segm_einheit FOREIGN KEY (einheit_id)
      REFERENCES training_einheiten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Wiederverwendbare Trainingsblöcke (datumsunabhängig) ──────
-- Globale Blöcke werden von Trainern erstellt und dienen als Vorlage.
-- Private Blöcke sind nur für den Ersteller sichtbar.
CREATE TABLE IF NOT EXISTS training_bloecke (
  id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  titel         VARCHAR(200)       NOT NULL,
  typ           ENUM('intervall','dauerlauf','funktionell','runde','event','frei','kein_training')
                                   NOT NULL DEFAULT 'intervall',
  komoot_url    VARCHAR(500)       NULL COMMENT 'Optionaler Komoot-Streckenlink (v. a. für typ=runde)',
  strecke_id    INT UNSIGNED       NULL COMMENT 'Streckenverlauf aus training_strecken',
  bemerkung     TEXT               NULL,
  sichtbarkeit  ENUM('global','privat')
                                   NOT NULL DEFAULT 'global',
  erstellt_von  INT UNSIGNED       NULL,
  erstellt_am   TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am  TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sichtbarkeit (sichtbarkeit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Segmente für Trainingsblöcke ──────────────────────────────
CREATE TABLE IF NOT EXISTS training_block_segmente (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  block_id        INT UNSIGNED    NOT NULL,
  reihenfolge     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  abschnitt_typ   VARCHAR(10)     NOT NULL DEFAULT 'work' COMMENT 'work | pause | gruppe (Wiederholungsblock)',
  knoten_id       SMALLINT UNSIGNED NULL COMMENT 'Knoten-Nr. innerhalb des Blocks',
  eltern_id       SMALLINT UNSIGNED NULL COMMENT 'knoten_id des umschließenden Blocks',
  gruppen_id      SMALLINT UNSIGNED NULL COMMENT 'Altbestand: flache Gruppierung',
  wiederholungen  SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'nur bei abschnitt_typ=gruppe',
  distanz_m       INT UNSIGNED    NULL COMMENT 'NULL bei Gruppenknoten',
  pause_m         INT UNSIGNED    NULL,
  pause_typ       ENUM('TP','GP','BP','frei') NULL,
  pace_referenz   VARCHAR(40)     NULL COMMENT 'z.B. 10km, 5km, HM, M',
  notiz           VARCHAR(200)    NULL,
  PRIMARY KEY (id),
  KEY idx_block (block_id, reihenfolge),
  CONSTRAINT fk_bsegm_block FOREIGN KEY (block_id)
      REFERENCES training_bloecke(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bestzeiten werden nicht eigenständig gepflegt: das Trainingsportal
-- liest sie direkt aus den `ergebnisse`-/`athleten`-Tabellen des
-- Statistikportals (gemeinsame DB).
