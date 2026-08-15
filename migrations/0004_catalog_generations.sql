ALTER TABLE artists ADD COLUMN catalog_generation TEXT;
ALTER TABLE songs ADD COLUMN catalog_generation TEXT;
ALTER TABLE song_artists ADD COLUMN catalog_generation TEXT;

CREATE INDEX idx_artists_catalog_generation ON artists(catalog_generation);
CREATE INDEX idx_songs_catalog_generation ON songs(catalog_generation);
CREATE INDEX idx_song_artists_catalog_generation ON song_artists(catalog_generation);

DELETE FROM song_artists
WHERE song_id IN (SELECT id FROM songs WHERE catalog_key IS NULL)
   OR artist_id IN (SELECT id FROM artists WHERE catalog_key IS NULL);
DELETE FROM songs WHERE catalog_key IS NULL;
DELETE FROM artists WHERE catalog_key IS NULL;
