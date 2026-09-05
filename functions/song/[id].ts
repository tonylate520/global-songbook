import { error, publicCacheHeaders, type Env } from "../_lib/http";

interface SongRow {
  id: number;
  title: string;
  releaseYear: number | null;
}

interface PerformerRow {
  artist: string;
  countryName: string | null;
  countryCode: string | null;
  role: "original" | "cover" | "unknown";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

    const performersResult = await env.DB.prepare(`
      SELECT
        a.name AS artist,
        c.name_en AS countryName,
        LOWER(c.iso_code) AS countryCode,
        sa.role
      FROM song_artists sa
      JOIN artists a ON a.id = sa.artist_id
      LEFT JOIN countries c ON c.id = a.country_id
      WHERE sa.song_id = ?1
      ORDER BY CASE sa.role WHEN 'original' THEN 0 WHEN 'cover' THEN 1 ELSE 2 END, a.name
    `).bind(id).all<PerformerRow>();

    const performers = performersResult.results;
    const origin = new URL(request.url).origin;
    const songUrl = `${origin}/song/${song.id}/`;

    const original = performers.find((p) => p.role === "original");
    const covers = performers.filter((p) => p.role === "cover");
    const countryNames = Array.from(new Set(performers.map((p) => p.countryName).filter(Boolean))) as string[];

    // Long-tail high-intent SEO metadata
    const pageTitle = `${song.title} - Who Sang It First? Original Artist & Cover Versions | Global Song Index`;
    const description = original
      ? `Who originally sang "${song.title}"? Originally recorded by ${original.artist}${original.countryName ? ` (${original.countryName})` : ""}${song.releaseYear ? ` in ${song.releaseYear}` : ""}. Explore ${covers.length} recorded cover version${covers.length !== 1 ? "s" : ""} across ${countryNames.length} countr${countryNames.length === 1 ? "y" : "ies"} on Global Song Index.`
      : `Who sang "${song.title}"? Browse ${performers.length} recorded performers, original recordings, and global cover versions across ${countryNames.length} countr${countryNames.length === 1 ? "y" : "ies"} on Global Song Index.`;

    const keywords = [
      `${song.title} who sang it first`,
      `${song.title} original singer`,
      `${song.title} cover versions`,
      `who covered ${song.title}`,
      `${song.title} original artist`,
      `${song.title} all versions`,
      `who recorded ${song.title} first`
    ].join(", ");

    const faqQ1 = `Who originally sang "${song.title}"?`;
    const faqA1 = original
      ? `"${song.title}" was originally recorded by ${original.artist}${original.countryName ? ` from ${original.countryName}` : ""}${song.releaseYear ? ` and released in ${song.releaseYear}` : ""}.`
      : `The original recording artist for "${song.title}" is currently listed as unconfirmed in this catalogue.`;

    const faqQ2 = `How many artists have covered "${song.title}"?`;
    const faqA2 = covers.length > 0
      ? `Global Song Index currently catalogues ${covers.length} recorded cover version${covers.length !== 1 ? "s" : ""} of "${song.title}" by artists around the world.`
      : `There are currently no additional cover recordings documented for "${song.title}" in this index.`;

    const faqQ3 = `Which countries have recorded versions of "${song.title}"?`;
    const faqA3 = countryNames.length > 0
      ? `Performers from ${countryNames.length} countr${countryNames.length === 1 ? "y" : "ies"} (including ${countryNames.slice(0, 5).join(", ")}${countryNames.length > 5 ? ", among others" : ""}) have recorded versions of "${song.title}".`
      : `Country attributions for performers of "${song.title}" are being researched.`;

    // Breadcrumbs Schema
    const breadcrumbList: { "@type": string; position: number; name: string; item: string }[] = [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Countries", item: `${origin}/countries/` }
    ];
    if (original?.countryCode && original?.countryName) {
      breadcrumbList.push({
        "@type": "ListItem",
        position: 3,
        name: original.countryName,
        item: `${origin}/country/${original.countryCode}/`
      });
      breadcrumbList.push({
        "@type": "ListItem",
        position: 4,
        name: song.title,
        item: songUrl
      });
    } else {
      breadcrumbList.push({
        "@type": "ListItem",
        position: 3,
        name: song.title,
        item: songUrl
      });
    }

    const structuredData = JSON.stringify([
      {
        "@context": "https://schema.org",
        "@type": "MusicRecording",
        name: song.title,
        url: songUrl,
        ...(song.releaseYear ? { datePublished: String(song.releaseYear) } : {}),
        byArtist: performers.map((p) => ({
          "@type": "MusicGroup",
          name: p.artist,
          ...(p.countryName ? { nationality: p.countryName } : {})
        })),
        isPartOf: { "@type": "WebSite", name: "Global Song Index", url: origin }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbList
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: faqQ1,
            acceptedAnswer: { "@type": "Answer", text: faqA1 }
          },
          {
            "@type": "Question",
            name: faqQ2,
            acceptedAnswer: { "@type": "Answer", text: faqA2 }
          },
          {
            "@type": "Question",
            name: faqQ3,
            acceptedAnswer: { "@type": "Answer", text: faqA3 }
          }
        ]
      }
    ]).replace(/</g, "\\u003c");

    // Pre-generate SSR HTML for search engines and instant display
    const metaText = `${song.releaseYear ? `First released in ${song.releaseYear}` : "First release year not recorded"} &bull; ${performers.length} recorded performance${performers.length !== 1 ? "s" : ""}`;

    const highlightHtml = `
      <div class="highlight-header">
        <span class="highlight-badge">
          <i data-lucide="check-circle-2"></i> Verified Original Recording
        </span>
        <span class="meta-item">
          <i data-lucide="disc-3"></i> ${song.releaseYear ? `Release Year: ${song.releaseYear}` : "Year not recorded"}
        </span>
      </div>
      <h2 class="highlight-question">Who originally sang "${escapeHtml(song.title)}"?</h2>
      <p class="highlight-answer">
        ${original ? `
          <strong>${escapeHtml(song.title)}</strong> was originally recorded by
          <strong>${escapeHtml(original.artist)}</strong>
          ${original.countryCode && original.countryName ? `
            (<a href="/country/${escapeHtml(original.countryCode)}/" class="country-chip" title="Browse songs from ${escapeHtml(original.countryName)}"><strong>${escapeHtml(original.countryCode.toUpperCase())}</strong> ${escapeHtml(original.countryName)}</a>)
          ` : (original.countryName ? `(${escapeHtml(original.countryName)})` : "")}
          ${song.releaseYear ? ` in <strong>${song.releaseYear}</strong>` : ""}.
        ` : `
          The original artist for <strong>${escapeHtml(song.title)}</strong> is currently being verified.
        `}
      </p>
    `;

    const performerListHtml = performers.map((p) => {
      const isOriginal = p.role === "original";
      const countryHtml = p.countryCode && p.countryName
        ? `<a href="/country/${escapeHtml(p.countryCode)}/" class="country-chip" title="Browse ${escapeHtml(p.countryName)} songs"><strong>${escapeHtml(p.countryCode.toUpperCase())}</strong> ${escapeHtml(p.countryName)}</a>`
        : (p.countryName ? `<span class="country-chip">${escapeHtml(p.countryName)}</span>` : `<span class="country-chip">Country not recorded</span>`);

      return `
        <div class="performer-row ${isOriginal ? "is-original" : ""}" data-role="${escapeHtml(p.role)}" data-search="${escapeHtml(p.artist)} ${escapeHtml(p.countryName || "")}">
          <div class="performer-avatar">
            <i data-lucide="${isOriginal ? "disc-3" : "mic-2"}"></i>
          </div>
          <div class="performer-details">
            <span class="performer-name">${escapeHtml(p.artist)}</span>
            <div class="performer-sub">${countryHtml}</div>
          </div>
          <span class="role-badge ${escapeHtml(p.role)}">
            ${isOriginal ? '<i data-lucide="check-circle-2"></i> Original' : (p.role === "cover" ? "Cover" : "Unconfirmed")}
          </span>
          ${p.countryCode ? `
            <a href="/country/${escapeHtml(p.countryCode)}/" class="button" aria-label="View more from ${escapeHtml(p.countryName || "this country")}">
              Country <i data-lucide="arrow-right"></i>
            </a>
          ` : ""}
        </div>
      `;
    }).join("");

    const faqSectionHtml = `
      <div class="faq-grid">
        <div class="faq-card">
          <h3 class="faq-question"><i data-lucide="help-circle"></i> ${escapeHtml(faqQ1)}</h3>
          <p class="faq-answer">${escapeHtml(faqA1)}</p>
        </div>
        <div class="faq-card">
          <h3 class="faq-question"><i data-lucide="help-circle"></i> ${escapeHtml(faqQ2)}</h3>
          <p class="faq-answer">${escapeHtml(faqA2)}</p>
        </div>
        <div class="faq-card">
          <h3 class="faq-question"><i data-lucide="help-circle"></i> ${escapeHtml(faqQ3)}</h3>
          <p class="faq-answer">${escapeHtml(faqA3)}</p>
        </div>
        <div class="faq-card">
          <h3 class="faq-question"><i data-lucide="help-circle"></i> How are original recordings differentiated from covers?</h3>
          <p class="faq-answer">The original recording refers to the very first commercially released recording of the composition by the credited artist. Later performances by other musicians in different genres, countries, or languages are documented as cover versions.</p>
        </div>
      </div>
    `;

    const asset = await env.ASSETS.fetch(new URL("/song/index.html", request.url));
    let schemaReplaced = false;

    const transformed = new HTMLRewriter()
      .on("title", { element(e) { e.setInnerContent(pageTitle); } })
      .on('meta[name="description"]', { element(e) { e.setAttribute("content", description); } })
      .on('meta[name="keywords"]', { element(e) { e.setAttribute("content", keywords); } })
      .on('meta[name="robots"]', { element(e) { e.setAttribute("content", "index,follow,max-image-preview:large"); } })
      .on('meta[name="googlebot"]', { element(e) { e.setAttribute("content", "index,follow,max-image-preview:large"); } })
      .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", pageTitle); } })
      .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", description); } })
      .on('meta[property="og:url"]', { element(e) { e.setAttribute("content", songUrl); } })
      .on('meta[name="twitter:title"]', { element(e) { e.setAttribute("content", pageTitle); } })
      .on('meta[name="twitter:description"]', { element(e) { e.setAttribute("content", description); } })
      .on('link[rel="canonical"]', { element(e) { e.setAttribute("href", songUrl); } })
      .on("#page-schema", {
        text(text) {
          if (!schemaReplaced) {
            text.replace(structuredData);
            schemaReplaced = true;
          }
        }
      })
      .on("#song-loading", { element(e) { e.remove(); } })
      .on("#song-content", { element(e) { e.removeAttribute("class"); } })
      .on("#song-title", { element(e) { e.setInnerContent(escapeHtml(song.title)); } })
      .on("#song-meta", { element(e) { e.setInnerContent(metaText, { html: true }); } })
      .on("#song-highlight", { element(e) { e.setInnerContent(highlightHtml, { html: true }); } })
      .on("#performer-count", { element(e) { e.setInnerContent(`${performers.length} versions`); } })
      .on("#performer-list", { element(e) { e.setInnerContent(performerListHtml, { html: true }); } })
      .on("#song-faq-content", { element(e) { e.setInnerContent(faqSectionHtml, { html: true }); } })
      .transform(asset);

    const headers = new Headers(transformed.headers);
    headers.set("Cache-Control", publicCacheHeaders["Cache-Control"]);
    return new Response(transformed.body, { status: transformed.status, headers });
  } catch (cause) {
    console.error(cause);
    // Graceful fallback to static song template so visitors never see 500 errors
    try {
      const fallbackAsset = await env.ASSETS.fetch(new URL("/song/index.html", request.url));
      const headers = new Headers(fallbackAsset.headers);
      headers.set("Cache-Control", "public, max-age=60, s-maxage=300");
      return new Response(fallbackAsset.body, { status: 200, headers });
    } catch {
      return notFound(request, env.ASSETS);
    }
  }
};
