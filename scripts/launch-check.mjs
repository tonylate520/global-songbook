import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const production = process.argv.includes("--production");
const checks = [];
const failures = [];
const pass = (name) => checks.push(`PASS ${name}`);
const fail = (name) => failures.push(`FAIL ${name}`);

const wrangler = await readFile(resolve("wrangler.toml"), "utf8");
const databaseId = wrangler.match(/database_id\s*=\s*"([^"]+)"/i)?.[1] || "";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)) {
  if (production) fail("wrangler.toml has a real D1 database_id");
  else checks.push("WARN D1 database_id is still a placeholder; production check will reject it");
} else pass("wrangler.toml has a real D1 database_id");

const siteUrl = process.env.PUBLIC_SITE_URL || "";
if (production) {
  try {
    const parsed = new URL(siteUrl);
    if (!/^https:$/.test(parsed.protocol)) throw new Error("HTTPS required");
    pass("PUBLIC_SITE_URL is an HTTPS production URL");
  } catch {
    fail("PUBLIC_SITE_URL is an HTTPS production URL");
  }
} else {
  checks.push("WARN production URL check skipped; pass --production for deployment validation");
}

for (const file of [
  "data/generated/catalog/manifest.json",
  "data/generated/quality-report.json",
  "dist/index.html",
  "dist/sitemap-index.xml",
  "dist/robots.txt",
  "dist/_headers",
  "dist/_routes.json"
]) {
  try {
    await access(resolve(file));
    pass(`${file} exists`);
  } catch {
    fail(`${file} exists`);
  }
}

try {
  const headers = await readFile(resolve("dist/_headers"), "utf8");
  if (headers.includes("Content-Security-Policy:") && headers.includes("Strict-Transport-Security:") && headers.includes("X-Content-Type-Options: nosniff")) {
    pass("dist/_headers contains production security headers");
  } else {
    fail("dist/_headers contains production security headers");
  }
} catch {
  fail("dist/_headers contains production security headers");
}

if (production) {
  try {
    const robots = await readFile(resolve("dist/robots.txt"), "utf8");
    const origin = new URL(siteUrl).toString().replace(/\/$/, "");
    if (!robots.includes(`Sitemap: ${origin}/sitemap-index.xml`) || !robots.includes(`Sitemap: ${origin}/sitemap-songs.xml`)) {
      fail("dist/robots.txt points to PUBLIC_SITE_URL");
    } else {
      pass("dist/robots.txt points to PUBLIC_SITE_URL");
    }
  } catch {
    fail("dist/robots.txt points to PUBLIC_SITE_URL");
  }
}

try {
  const report = JSON.parse(await readFile(resolve("data/generated/quality-report.json"), "utf8"));
  if (report.errors?.length) fail("catalogue quality report has no errors");
  else pass(`catalogue quality report passes (${report.counts.songs} songs, ${report.counts.relationships} relationships)`);
} catch {
  fail("catalogue quality report is readable");
}

console.log([...checks, ...failures].join("\n"));
if (failures.length) process.exit(1);
console.log(production ? "Release checks passed." : "Local release checks passed; run with --production before deploy.");
