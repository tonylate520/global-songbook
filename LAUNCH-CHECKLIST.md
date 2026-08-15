# Production Launch Checklist

## Verified locally

- Catalogue: 3,361 songs, 32,483 artists, 110,061 song-performer relationships, 132 represented countries.
- Local D1 import matches `data/generated/quality-report.json`.
- `pnpm run check`, `pnpm run build`, `pnpm run release:check` pass locally.
- `pnpm audit --audit-level high` reports no known vulnerabilities.
- Pages Functions, search, song detail, country APIs, dynamic sitemap, robots.txt, SEO metadata, and security headers were exercised against the local Wrangler runtime.

## Required confirmation

Before provisioning, confirm:

1. The public HTTPS origin to use as `PUBLIC_SITE_URL` (the default Pages origin is acceptable).
2. Permission to create the free-tier D1 database and Pages project.

## Provision and deploy after confirmation

PowerShell:

```powershell
$env:PUBLIC_SITE_URL = "https://global-songbook.pages.dev"
pnpm run provision:production -- --confirm-production --create-resources
pnpm run deploy:production -- --confirm-production
```

The provisioning command reuses matching existing resources, and the deployment command refuses to run without the explicit confirmation flag. Neither command is run as part of local validation.
