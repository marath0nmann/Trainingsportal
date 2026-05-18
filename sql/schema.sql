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

-- ── Trainingseinheit (Kalendereintrag) ─────────────────────────
CREATE TABLE IF NOT EXISTS training_einheiten (
  id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  datum         DATE               NOT NULL,
  uhrzeit       TIME               NULL,
  typ           ENUM('intervall','dauerlauf','funktionell','runde','event','frei','kein_training')
                                   NOT NULL DEFAULT 'frei',
  titel         VARCHAR(200)       NOT NULL,
  treffpunkt_id INT UNSIGNED       NULL,
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
-- Beispiel: "12 x 400m (100GP)" = 1 Segment (wiederholungen=12, distanz=400, pause=100, pause_typ=GP)
-- Beispiel: "400/600/800/1000/800/600/400" = 7 Segmente mit gleicher block_id
CREATE TABLE IF NOT EXISTS training_segmente (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  einheit_id      INT UNSIGNED    NOT NULL,
  reihenfolge     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  block_id        SMALLINT UNSIGNED NULL,
  wiederholungen  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  distanz_m       INT UNSIGNED    NOT NULL,
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
  gruppen_id      SMALLINT UNSIGNED NULL,
  wiederholungen  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  distanz_m       INT UNSIGNED    NOT NULL,
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
