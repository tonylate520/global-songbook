PRAGMA foreign_keys = ON;

CREATE TABLE countries (
  id INTEGER PRIMARY KEY,
  iso_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL
);

CREATE TABLE artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  country_id INTEGER,
  FOREIGN KEY (country_id) REFERENCES countries(id)
);

CREATE TABLE songs (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  release_year INTEGER CHECK (release_year IS NULL OR release_year BETWEEN 1000 AND 9999)
);

CREATE TABLE song_artists (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL,
  artist_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'unknown' CHECK (role IN ('original', 'cover', 'unknown')),
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  UNIQUE (song_id, artist_id, role)
);

CREATE INDEX idx_artists_normalized_name ON artists(normalized_name);
CREATE INDEX idx_artists_country ON artists(country_id);
CREATE INDEX idx_songs_normalized_title ON songs(normalized_title);
CREATE INDEX idx_song_artists_song ON song_artists(song_id);
CREATE INDEX idx_song_artists_artist ON song_artists(artist_id);
CREATE INDEX idx_song_artists_cursor ON song_artists(id, artist_id, song_id);
