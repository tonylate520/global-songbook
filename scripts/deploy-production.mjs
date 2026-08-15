import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

if (!process.argv.includes("--confirm-production")) {
  console.error("Refusing to deploy without --confirm-production");
  process.exit(1);
}

const siteUrl = process.env.PUBLIC_SITE_URL || "";
try {
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
} catch {
  console.error("PUBLIC_SITE_URL must be an HTTPS origin, for example https://songs.example.com");
  process.exit(1);
}

const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || "global-songbook";
const wranglerPath = resolve("node_modules/wrangler/bin/wrangler.js");
const astroPath = resolve("node_modules/astro/astro.js");

function run(label, executable, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(executable, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("Generate countries", process.execPath, ["scripts/build-country-sql.mjs"]);
run("Merge catalogue batches", process.execPath, ["scripts/merge-catalogs.mjs"]);
run("Validate catalogue", process.execPath, ["scripts/validate-catalog.mjs"]);
run("Generate catalogue SQL", process.execPath, ["scripts/build-catalog-sql.mjs", "--input", "data/generated/catalog.ndjson"]);
run("Build production site", process.execPath, [astroPath, "build"]);
run("Run production preflight", process.execPath, ["scripts/launch-check.mjs", "--production"]);
run("Apply remote D1 migrations", process.execPath, [wranglerPath, "d1", "migrations", "apply", "music-db", "--remote"]);
run("Import catalogue into remote D1", process.execPath, ["scripts/apply-generated-sql.mjs", "--remote"]);
run("Deploy Cloudflare Pages", process.execPath, [wranglerPath, "pages", "deploy", "dist", `--project-name=${projectName}`]);

console.log(`\nProduction deployment completed for ${siteUrl}`);
