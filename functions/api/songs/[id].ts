import { error, json, parseBoundedInteger, publicCacheHeaders, type Env } from "../../_lib/http";

interface SongRow {
  id: number;
  title: string;
  releaseYear: number | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = parseBoundedInteger(String(params.id || ""), 0, 1, Number.MAX_SAFE_INTEGER);
  if (!id) return error("Invalid song id", 400);

  try {
    const song = await env.DB.prepare(`
      SELECT id, title, release_year AS releaseYear FROM songs WHERE id = ?1
    `).bind(id).first<SongRow>();
    if (!song) return error("Song not found", 404);

    const performers = await env.DB.prepare(`
      SELECT
        sa.id AS relationId,
        s.id AS songId,
        s.title,
        a.name AS artist,
        LOWER(c.iso_code) AS countryCode,
        c.name_en AS countryName,
        sa.role
      FROM song_artists sa
      JOIN songs s ON s.id = sa.song_id
      JOIN artists a ON a.id = sa.artist_id
      LEFT JOIN countries c ON c.id = a.country_id
      WHERE sa.song_id = ?1
      ORDER BY CASE sa.role WHEN 'original' THEN 0 WHEN 'cover' THEN 1 ELSE 2 END, a.name
    `).bind(id).all();

    return json({ song, performers: performers.results }, { headers: publicCacheHeaders });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load song");
  }
};
