# Global Song Index

An English-language catalogue of songs, original performers, cover artists, and performer countries.

## Stack

- Astro static output for the public site
- Cloudflare Pages for hosting
- Cloudflare Pages Functions for search, song detail rendering, and the dynamic song sitemap
- Cloudflare D1 for songs, artists, countries, and relationships

The first version is designed for Cloudflare's free tier. Country and navigation pages are generated at build time; song pages are enriched at request time from D1.

## Local development

Requires Node.js 22.12 or newer (Astro 7 requirement).

```bash
pnpm install
pnpm run db:migrate:local
pnpm run data:build
pnpm run data:import:local
pnpm run build
pnpm run pages:dev
```

Use the URL printed by Wrangler. `pnpm run dev` previews the static Astro pages only; use `pages:dev` to include Pages Functions and local D1.

## Cloudflare deployment

1. Create the database: `npx wrangler d1 create music-db`
2. Put the returned database ID in `wrangler.toml`.
3. Apply migrations: `npx wrangler d1 migrations apply music-db --remote`
4. Generate import files: `pnpm run data:build`
5. Import them: `pnpm run data:import:remote`
6. Build with the production URL: `PUBLIC_SITE_URL=https://your-domain.example pnpm run build`
7. Deploy: `npx wrangler pages deploy dist --project-name=global-songbook`

After the D1 ID and Pages project are configured, the guarded production workflow can run all generation, validation, migration, import, build, and deployment steps:

```bash
PUBLIC_SITE_URL=https://your-domain.example pnpm run deploy:production -- --confirm-production
```

After explicit approval, the optional guarded provisioning command can create the missing free-tier resources and update `wrangler.toml`:

```bash
PUBLIC_SITE_URL=https://global-songbook.pages.dev pnpm run provision:production -- --confirm-production --create-resources
```

It refuses to run unless both confirmation flags are present, reuses existing resources, and does not configure a custom domain automatically.

Set `CLOUDFLARE_PAGES_PROJECT` when the Pages project name is not `global-songbook`. The command refuses to run without the explicit confirmation flag and a root HTTPS origin.

On PowerShell, set the variables for the current terminal before running the guarded commands:

```powershell
$env:PUBLIC_SITE_URL = "https://global-songbook.pages.dev"
pnpm run provision:production -- --confirm-production --create-resources
pnpm run deploy:production -- --confirm-production
```

Run `pnpm run release:check` locally. Before deployment, set `PUBLIC_SITE_URL` and run `node scripts/launch-check.mjs --production`; it will fail until the real D1 ID and HTTPS domain are configured. `robots.txt` is generated during the build, so its sitemap URLs always follow `PUBLIC_SITE_URL`.

`PUBLIC_SITE_URL` is used for canonical URLs, Open Graph metadata, JSON-LD, and the generated `robots.txt` and sitemap URLs. Set it before the production build so those values are generated for the real site origin.

## SEO behavior

- Country pages expose unique titles, descriptions, canonical URLs, `CollectionPage`, and breadcrumb JSON-LD.
- Song detail responses expose per-song metadata and `MusicRecording` JSON-LD through a Pages Function.
- Search and the generic `/song/` shell are `noindex,follow`.
- `/sitemap-songs.xml` lists D1-backed song URLs and is referenced by `robots.txt`.

When the catalogue grows beyond 50,000 songs, split the dynamic song sitemap into a sitemap index and paginated child sitemaps.

## Data model

Performer country is stored through `artists.country_id`; `song_artists.country_id` is maintained as a query index for country pagination. `song_artists.role` accepts `original`, `cover`, or `unknown`. Normalize titles and names during import using the same rules as the search function.

## Catalogue imports

Put manually reviewed song-performer relationships in `data/manual-catalog.ndjson`. Automatically collected relationships can be stored in any `data/musicbrainz-catalog-*.ndjson` batch; `pnpm run data:merge` combines all batches before SQL generation.

```json
{"songKey":"work:yesterday","title":"Yesterday","year":1965,"artistKey":"artist:the-beatles","artist":"The Beatles","countryCode":"GB","role":"original"}
```

`songKey` and `artistKey` must be stable within the input catalogue. They are SHA-256 hashed before storage, so upstream identifiers are not exposed by the runtime data model. Reimporting a record updates its names, year, and country without duplicating its relationship.

`pnpm run data:build` validates the input, writes all 250 country records, and creates D1-compatible SQL chunks of 5,000 unique songs, artists, or relationships. Songs and artists are upserted once per catalogue generation instead of once per relationship, which keeps initial D1 writes close to the actual row count. Change the chunk size when needed:

The default production quality gate requires at least 1,000 songs, 30,000 song-performer relationships, and 80 represented countries, with an original performer for every song.

```bash
node scripts/build-catalog-sql.mjs --input data/generated/catalog.ndjson --chunk-size 5000
```

Run `pnpm run data:import:local` for local D1 or `pnpm run data:import:remote` after configuring the production database ID. Imports checkpoint after every SQL file and automatically resume after an interrupted run. The checkpoint is tied to the generated catalogue generation and target database; use `--restart` to intentionally rebuild from the first file, or `--verify-only` to check the target without importing.

If a Cloudflare free-tier daily write limit interrupts the initial remote import, run the same remote import or guarded deployment command after the quota resets. The matching import checkpoint resumes at the next SQL file and the final verification prevents a partial catalogue from being treated as complete.

The cached MusicBrainz collector can add more batches without replacing earlier files. The command-line separator after the script name is supported:

```bash
pnpm run data:fetch:musicbrainz -- --seed-limit 10 --works-per-seed 10 --output data/musicbrainz-catalog-3.ndjson
pnpm run data:fetch:musicbrainz -- --global-pages 3 --output data/musicbrainz-catalog-global-1.ndjson
pnpm run data:build
pnpm run data:import:local
```

The collector resolves exact artist IDs, honors the public API rate limit, caches every response, removes non-country pseudo-codes, and uses explicit cover relationships before date-based original-performer inference. All `musicbrainz-catalog-*.ndjson` files are merged and deduplicated by song, artist, and role.

`pnpm run data:fetch:international` collects the separate international seed list. Long collection runs reuse their NDJSON checkpoints automatically; pass `--restart` only when an existing output file should be rebuilt from scratch.
