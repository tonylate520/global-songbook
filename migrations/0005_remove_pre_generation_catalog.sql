DELETE FROM song_artists WHERE catalog_generation IS NULL;
DELETE FROM songs WHERE catalog_generation IS NULL;
DELETE FROM artists WHERE catalog_generation IS NULL;
