import { type Env } from "./_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${origin}/sitemap-songs/1</loc></sitemap>\n</sitemapindex>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
    }
  });
};
