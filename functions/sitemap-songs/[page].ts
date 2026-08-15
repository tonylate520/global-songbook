import { error, type Env } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const page = Number.parseInt(String(params.page || ""), 10);
  if (!Number.isInteger(page) || page < 1) return error("Invalid sitemap page", 404);

  const pageSize = 10000;
  const offset = (page - 1) * pageSize;
  const songs = await env.DB.prepare(`
    SELECT id FROM songs ORDER BY id LIMIT ?1 OFFSET ?2
  `).bind(pageSize, offset).all<{ id: number }>();
  if (!songs.results.length) return error("Sitemap page not found", 404);

  const origin = new URL(request.url).origin;
  const urls = songs.results
    .map((song) => `  <url><loc>${origin}/song/${song.id}/</loc></url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  return new Response(xml, { headers: {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
  }});
};
