import { error, json, normalizeSearch, publicCacheHeaders, type Env } from "../_lib/http";

const resultQuery = `
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
`;

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const query = normalizeSearch(new URL(request.url).searchParams.get("q") || "");
  if (query.length < 2) return error("Search query must contain at least 2 characters", 400);
  if (query.length > 100) return error("Search query is too long", 400);
  const upperBound = `${query}\uffff`;

  try {
    const [songMatches, artistMatches] = await env.DB.batch([
      env.DB.prepare(`${resultQuery}
        WHERE s.normalized_title >= ?1 AND s.normalized_title < ?2
        ORDER BY CASE WHEN s.normalized_title = ?1 THEN 0 ELSE 1 END, s.normalized_title
        LIMIT 30
      `).bind(query, upperBound),
      env.DB.prepare(`${resultQuery}
        WHERE a.normalized_name >= ?1 AND a.normalized_name < ?2
        ORDER BY CASE WHEN a.normalized_name = ?1 THEN 0 ELSE 1 END, a.normalized_name
        LIMIT 30
      `).bind(query, upperBound)
    ]);

    const unique = new Map<number, unknown>();
    for (const item of [...songMatches.results, ...artistMatches.results]) {
      const relationId = Number((item as { relationId: number }).relationId);
      if (!unique.has(relationId)) unique.set(relationId, item);
      if (unique.size === 50) break;
    }

    if (unique.size < 10) {
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      const wordPrefix = `% ${escaped}%`;
      const [songWordMatches, artistWordMatches] = await env.DB.batch([
        env.DB.prepare(`${resultQuery}
          WHERE s.normalized_title LIKE ?1 ESCAPE '\\'
          ORDER BY s.normalized_title
          LIMIT 30
        `).bind(wordPrefix),
        env.DB.prepare(`${resultQuery}
          WHERE a.normalized_name LIKE ?1 ESCAPE '\\'
          ORDER BY a.normalized_name
          LIMIT 30
        `).bind(wordPrefix)
      ]);

      for (const item of [...songWordMatches.results, ...artistWordMatches.results]) {
        const relationId = Number((item as { relationId: number }).relationId);
        if (!unique.has(relationId)) unique.set(relationId, item);
        if (unique.size === 50) break;
      }
    }

    return json({ query, items: [...unique.values()] }, { headers: publicCacheHeaders });
  } catch (cause) {
    console.error(cause);
    return error("Unable to search");
  }
};
