-- ============================================================
-- Migration v15: Trainer-Rolle + Trainingsblöcke
-- ============================================================
-- Einzuspielen auf der gemeinsam genutzten Datenbank.
-- Voraussetzung: schema.sql wurde bereits ausgeführt (training_einheiten
-- und training_segmente existieren).
-- ============================================================

-- 1. Trainer-Rolle in der rollen-Tabelle anlegen
--    IGNORE, falls schon vorhanden.
INSERT IGNORE INTO rollen (name, beschreibung, rechte) VALUES
  ('trainer',
   'Trainer – darf globale Trainingsblöcke erstellen und verwalten',
   '["training_bloecke_verwalten","training_bearbeiten"]'),
  ('editor',
   'Editor – darf Trainingseinheiten anlegen und bearbeiten',
   '["training_bearbeiten"]');

-- 2. benutzer.rolle: Wert 'trainer' hinzufügen
--    Falls die Spalte ein ENUM ist, muss er hier ergänzt werden.
--    Den folgenden Befehl anpassen, falls der aktuelle ENUM-Wert-Satz abweicht.
--    Sicher ignorierbar, wenn 'rolle' bereits ein VARCHAR ist.
--
--    ALTER TABLE benutzer
--      MODIFY COLUMN rolle
--        ENUM('admin','editor','athlet','leser','trainer')
--        NOT NULL DEFAULT 'leser';

-- 3. Tabellen anlegen (idempotent – CREATE TABLE IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS training_bloecke (
  id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  titel         VARCHAR(200)       NOT NULL,
  typ           ENUM('intervall','dauerlauf','funktionell','runde','event','frei','kein_training')
                                   NOT NULL DEFAULT 'intervall',
  treffpunkt    VARCHAR(200)       NULL,
  bemerkung     TEXT               NULL,
  sichtbarkeit  ENUM('global','privat')
                                   NOT NULL DEFAULT 'global',
  erstellt_von  INT UNSIGNED       NULL,
  erstellt_am   TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am  TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sichtbarkeit (sichtbarkeit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS training_block_segmente (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  block_id        INT UNSIGNED    NOT NULL,
  reihenfolge     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  gruppen_id      SMALLINT UNSIGNED NULL,
  wiederholungen  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  distanz_m       INT UNSIGNED    NOT NULL,
  pause_m         INT UNSIGNED    NULL,
  pause_typ       ENUM('TP','GP','BP','frei') NULL,
  pace_referenz   VARCHAR(40)     NULL,
  notiz           VARCHAR(200)    NULL,
  PRIMARY KEY (id),
  KEY idx_block (block_id, reihenfolge),
  CONSTRAINT fk_bsegm_block FOREIGN KEY (block_id)
      REFERENCES training_bloecke(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
