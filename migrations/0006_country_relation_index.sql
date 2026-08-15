ALTER TABLE song_artists ADD COLUMN country_id INTEGER REFERENCES countries(id);

UPDATE song_artists
SET country_id = (
  SELECT artists.country_id
  FROM artists
  WHERE artists.id = song_artists.artist_id
);

CREATE INDEX idx_song_artists_country_cursor
  ON song_artists(country_id, id);
