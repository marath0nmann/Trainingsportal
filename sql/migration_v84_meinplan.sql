-- ============================================================
-- Migration v84: Privater Trainingsplan
-- ============================================================
-- Neue Tabelle training_privat_einheiten:
-- Jeder angemeldete Nutzer kann eigene Trainingseinheiten mit
-- optionaler Kilometer-Angabe pflegen (privat, nur für ihn sichtbar).
-- ref_einheit_id verweist optional auf eine öffentliche Einheit,
-- aus der der Eintrag übernommen wurde.
-- ============================================================

CREATE TABLE IF NOT EXISTS training_privat_einheiten (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  benutzer_id     INT UNSIGNED     NOT NULL,
  datum           DATE             NOT NULL,
  typ             VARCHAR(40)      NOT NULL DEFAULT 'dauerlauf',
  titel           VARCHAR(200)     NOT NULL,
  distanz_km      DECIMAL(6,2)     NULL,
  bemerkung       TEXT             NULL,
  ref_einheit_id  INT UNSIGNED     NULL,
  erstellt_am     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_benutzer_datum (benutzer_id, datum),
  CONSTRAINT fk_priv_benutzer FOREIGN KEY (benutzer_id)
    REFERENCES benutzer(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
