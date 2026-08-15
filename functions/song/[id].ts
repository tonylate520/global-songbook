import { error, publicCacheHeaders, type Env } from "../_lib/http";

interface SongRow { id: number; title: string; releaseYear: number | null }
interface PerformerRow { artist: string; countryName: string | null }

async function notFound(request: Request, assets: Fetcher) {
  const asset = await assets.fetch(new URL("/404.html", request.url));
  const headers = new Headers(asset.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(asset.body, { status: 404, headers });
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = Number.parseInt(String(params.id || ""), 10);
  if (!Number.isInteger(id) || id < 1) return notFound(request, env.ASSETS);

  try {
    const song = await env.DB.prepare(`
      SELECT id, title, release_year AS releaseYear FROM songs WHERE id = ?1
    `).bind(id).first<SongRow>();
    if (!song) return notFound(request, env.ASSETS);

    const performers = await env.DB.prepare(`
      SELECT a.name AS artist, c.name_en AS countryName
      FROM song_artists sa
      JOIN artists a ON a.id = sa.artist_id
      LEFT JOIN countries c ON c.id = a.country_id
      WHERE sa.song_id = ?1
      ORDER BY CASE sa.role WHEN 'original' THEN 0 WHEN 'cover' THEN 1 ELSE 2 END, a.name
    `).bind(id).all<PerformerRow>();

    const origin = new URL(request.url).origin;
    const songUrl = `${origin}/song/${song.id}/`;
    const pageTitle = `${song.title} performers and cover artists - Global Song Index`;
    const description = `Performers, original recording, and cover artists for ${song.title}.`;
    const structuredData = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      name: song.title,
      url: songUrl,
      ...(song.releaseYear ? { datePublished: String(song.releaseYear) } : {}),
      byArtist: performers.results.map((performer: PerformerRow) => ({
        "@type": "MusicGroup",
        name: performer.artist,
        ...(performer.countryName ? { nationality: performer.countryName } : {})
      })),
      isPartOf: { "@type": "WebSite", name: "Global Song Index", url: origin }
    }).replace(/</g, "\\u003c");

    const asset = await env.ASSETS.fetch(new URL("/song/index.html", request.url));
    let schemaReplaced = false;
    const transformed = new HTMLRewriter()
      .on("title", { element(element) { element.setInnerContent(pageTitle); } })
      .on('meta[name="description"]', { element(element) { element.setAttribute("content", description); } })
      .on('meta[name="robots"]', { element(element) { element.setAttribute("content", "index,follow,max-image-preview:large"); } })
      .on('meta[name="googlebot"]', { element(element) { element.setAttribute("content", "index,follow,max-image-preview:large"); } })
      .on('meta[property="og:title"]', { element(element) { element.setAttribute("content", pageTitle); } })
      .on('meta[property="og:description"]', { element(element) { element.setAttribute("content", description); } })
      .on('meta[property="og:url"]', { element(element) { element.setAttribute("content", songUrl); } })
      .on('meta[name="twitter:title"]', { element(element) { element.setAttribute("content", pageTitle); } })
      .on('meta[name="twitter:description"]', { element(element) { element.setAttribute("content", description); } })
      .on('link[rel="canonical"]', { element(element) { element.setAttribute("href", songUrl); } })
      .on("#page-schema", { text(text) {
        if (!schemaReplaced) {
          text.replace(structuredData);
          schemaReplaced = true;
        }
      } })
      .transform(asset);
    const headers = new Headers(transformed.headers);
    headers.set("Cache-Control", publicCacheHeaders["Cache-Control"]);
    return new Response(transformed.body, { status: transformed.status, headers });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load song", 500);
  }
};
