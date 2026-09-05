import { error, json, parseBoundedInteger, publicCacheHeaders, type Env } from "../../../_lib/http";

interface CountryRow {
  id: number;
  code: string;
  name: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const code = String(params.code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return error("Invalid country code", 400);

  const url = new URL(request.url);
  const cursor = parseBoundedInteger(url.searchParams.get("cursor"), 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 50);
  const includeTotal = url.searchParams.get("includeTotal") === "1";
  const roleParam = url.searchParams.get("role");
  const role = roleParam === "original" || roleParam === "cover" ? roleParam : null;

  try {
    const country = await env.DB.prepare(`
      SELECT id, iso_code AS code, name_en AS name
      FROM countries WHERE iso_code = ?1
    `).bind(code).first<CountryRow>();
    if (!country) return error("Country not found", 404);

    let query: string;
    let bindings: unknown[];

    if (role) {
      query = `
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
        JOIN countries c ON c.id = a.country_id
        WHERE sa.country_id = ?1 AND sa.id > ?2 AND sa.role = ?3
        ORDER BY sa.id
        LIMIT ?4
      `;
      bindings = [country.id, cursor, role, limit + 1];
    } else {
      query = `
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
        JOIN countries c ON c.id = a.country_id
        WHERE sa.country_id = ?1 AND sa.id > ?2
        ORDER BY sa.id
        LIMIT ?3
      `;
      bindings = [country.id, cursor, limit + 1];
    }

    const itemsResult = await env.DB.prepare(query).bind(...bindings).all();
    const allItems = itemsResult.results;
    const hasMore = allItems.length > limit;
    const items = hasMore ? allItems.slice(0, limit) : allItems;
    const lastItem = items.at(-1) as { relationId?: number } | undefined;

    let total: number | null = null;
    if (includeTotal) {
      if (role) {
        const totalRow = await env.DB.prepare(`
          SELECT COUNT(sa.id) AS total
          FROM song_artists sa
          WHERE sa.country_id = ?1 AND sa.role = ?2
        `).bind(country.id, role).first<{ total: number }>();
        total = totalRow?.total ?? 0;
      } else {
        const totalRow = await env.DB.prepare(`
          SELECT COUNT(sa.id) AS total
          FROM song_artists sa
          WHERE sa.country_id = ?1
        `).bind(country.id).first<{ total: number }>();
        total = totalRow?.total ?? 0;
      }
    }

    return json({
      country: { code: country.code.toLowerCase(), name: country.name },
      items,
      nextCursor: hasMore ? lastItem?.relationId ?? null : null,
      total
    }, { headers: publicCacheHeaders });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load songs");
  }
};
