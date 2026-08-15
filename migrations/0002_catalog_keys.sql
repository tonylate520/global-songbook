ALTER TABLE artists ADD COLUMN catalog_key TEXT;
ALTER TABLE songs ADD COLUMN catalog_key TEXT;

CREATE UNIQUE INDEX idx_artists_catalog_key
  ON artists(catalog_key);

CREATE UNIQUE INDEX idx_songs_catalog_key
  ON songs(catalog_key);
