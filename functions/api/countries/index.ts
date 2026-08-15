import { error, json, publicCacheHeaders, type Env } from "../../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare(`
      SELECT
        c.iso_code AS code,
        c.name_en AS name,
        COUNT(sa.id) AS songCount
      FROM countries c
      LEFT JOIN artists a ON a.country_id = c.id
      LEFT JOIN song_artists sa ON sa.artist_id = a.id
      GROUP BY c.id
      ORDER BY c.name_en
    `).all();
    return json({ items: result.results }, { headers: publicCacheHeaders });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load countries");
  }
};
