-- ============================================================
-- Migration v30: Trainingstypen als konfigurierbare Tabelle
-- ============================================================
-- Erstellt training_typen-Tabelle und befüllt sie mit den
-- bisherigen ENUM-Werten. Danach werden die ENUM-Spalten in
-- training_bloecke und training_einheiten auf VARCHAR migriert.
-- Idempotent (CREATE IF NOT EXISTS / INSERT IGNORE / MODIFY nur
-- wenn ENUM noch vorhanden).
-- ============================================================

CREATE TABLE IF NOT EXISTS training_typen (
  slug        VARCHAR(40)        NOT NULL,
  bezeichnung VARCHAR(100)       NOT NULL,
  farbe       VARCHAR(20)        NULL,
  reihenfolge SMALLINT UNSIGNED  NOT NULL DEFAULT 0,
  aktiv       TINYINT(1)         NOT NULL DEFAULT 1,
  PRIMARY KEY (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO training_typen (slug, bezeichnung, reihenfolge) VALUES
  ('intervall',     'Intervall',              1),
  ('dauerlauf',     'Dauerlauf',              2),
  ('funktionell',   'Funktionelles Training',  3),
  ('runde',         'Runde / Strecke',         4),
  ('event',         'Event / Wettkampf',       5),
  ('frei',          'Sonstiges',              6),
  ('kein_training', 'Kein Training',           7);

-- Spalte typ in training_einheiten von ENUM auf VARCHAR migrieren
ALTER TABLE training_einheiten
  MODIFY COLUMN typ VARCHAR(40) NOT NULL DEFAULT 'frei';

-- Spalte typ in training_bloecke von ENUM auf VARCHAR migrieren
ALTER TABLE training_bloecke
  MODIFY COLUMN typ VARCHAR(40) NOT NULL DEFAULT 'intervall';
