import { type Env } from "./_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const origin = new URL(request.url).origin;
  const pageSize = 10000;
  const total = await env.DB.prepare("SELECT COUNT(*) AS count FROM songs").first<{ count: number }>();
  const pageCount = Math.ceil((total?.count || 0) / pageSize);
  const sitemaps = Array.from({ length: pageCount }, (_, index) =>
    `  <sitemap><loc>${origin}/sitemap-songs/${index + 1}</loc></sitemap>`
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>`;
  return new Response(xml, { headers: {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
  }});
};
