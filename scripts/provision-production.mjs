import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (!process.argv.includes("--confirm-production") || !process.argv.includes("--create-resources")) {
  console.error("Refusing to create Cloudflare resources without --confirm-production --create-resources");
  process.exit(1);
}

const siteUrl = process.env.PUBLIC_SITE_URL || "";
try {
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
} catch {
  console.error("PUBLIC_SITE_URL must be an HTTPS origin, for example https://global-songbook.pages.dev");
  process.exit(1);
}

const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || "global-songbook";
const nodePath = process.execPath;
const wranglerPath = resolve("node_modules/wrangler/bin/wrangler.js");
const configPath = resolve("wrangler.toml");

function run(label, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(nodePath, [wranglerPath, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    console.error(output.trim());
    throw new Error(`${label} failed with status ${result.status ?? "unknown"}`);
  }
  if (output.trim()) console.log(output.trim());
  return output;
}

let config = await readFile(configPath, "utf8");
const configuredId = config.match(/database_id\s*=\s*"([^"]+)"/)?.[1] || "";
const hasRealDatabase = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configuredId);
if (!hasRealDatabase) {
  run("Create the production D1 database", [
    "d1", "create", "music-db", "--binding", "DB", "--update-config", "--use-remote", "--location", "apac"
  ]);
  config = await readFile(configPath, "utf8");
  const createdId = config.match(/database_id\s*=\s*"([^"]+)"/)?.[1] || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdId)) {
    throw new Error("D1 creation did not write a real database_id to wrangler.toml");
  }
  console.log(`Configured production D1 database ${createdId}.`);
} else {
  console.log(`Using the configured production D1 database ${configuredId}.`);
}

const projectList = run("Check Pages projects", ["pages", "project", "list"]);
const escapedProjectName = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
if (new RegExp(`(?:^|[│\\s])${escapedProjectName}(?:[│\\s]|$)`, "m").test(projectList)) {
  console.log(`Pages project ${projectName} already exists.`);
} else {
  run(`Create the Pages project ${projectName}`, [
    "pages", "project", "create", projectName, "--production-branch", "main"
  ]);
}

console.log(`\nCloudflare resources are ready for ${siteUrl}. Run pnpm run deploy:production -- --confirm-production after reviewing the generated configuration.`);
