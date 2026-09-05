import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const origin = site?.toString().replace(/\/$/, "") || "https://kugou9.com";
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    `Sitemap: ${origin}/sitemap-index.xml`,
    `Sitemap: ${origin}/sitemap-songs.xml`,
    ""
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
};
