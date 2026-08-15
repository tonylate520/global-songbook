DROP INDEX IF EXISTS idx_artists_catalog_key;
DROP INDEX IF EXISTS idx_songs_catalog_key;

CREATE UNIQUE INDEX idx_artists_catalog_key ON artists(catalog_key);
CREATE UNIQUE INDEX idx_songs_catalog_key ON songs(catalog_key);
