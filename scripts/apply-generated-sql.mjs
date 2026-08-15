import { createHash } from "node:crypto";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const remote = process.argv.includes("--remote");
const restart = process.argv.includes("--restart");
const verifyOnly = process.argv.includes("--verify-only");
const locationFlag = remote ? "--remote" : "--local";
const targetName = remote ? "remote" : "local";
const wranglerPath = resolve("node_modules/wrangler/bin/wrangler.js");
const catalogDir = resolve("data/generated/catalog");
const manifest = JSON.parse(await readFile(resolve(catalogDir, "manifest.json"), "utf8"));
const quality = JSON.parse(await readFile(resolve("data/generated/quality-report.json"), "utf8"));
const wranglerConfig = await readFile(resolve("wrangler.toml"), "utf8");
const databaseId = wranglerConfig.match(/database_id\s*=\s*"([^"]+)"/)?.[1] || "unknown";
const targetId = createHash("sha256").update(`${targetName}:${databaseId}`).digest("hex").slice(0, 16);
const statePath = resolve(`data/generated/import-state-${targetName}.json`);
const stateTempPath = `${statePath}.tmp`;
const catalogFiles = (await readdir(catalogDir))
  .filter((filename) => filename.endsWith(".sql"))
  .sort()
  .map((filename) => resolve(catalogDir, filename));
const files = [resolve("data/generated/countries.sql"), ...catalogFiles];

if (restart) await rm(statePath, { force: true });

let state = null;
try {
  state = JSON.parse(await readFile(statePath, "utf8"));
} catch {
  // A missing or invalid checkpoint starts a fresh import.
}

const checkpointMatches = state?.importKey === manifest.importKey && state?.targetId === targetId;
let startIndex = 0;
if (checkpointMatches && state.lastFile) {
  const checkpointIndex = files.findIndex((file) => basename(file) === state.lastFile);
  if (checkpointIndex >= 0) startIndex = checkpointIndex + 1;
}
if (verifyOnly) startIndex = files.length;

async function saveState(lastFile, completed = false) {
  const nextState = {
    generation: manifest.generation,
    importKey: manifest.importKey,
    target: targetName,
    targetId,
    lastFile,
    completed,
    updatedAt: new Date().toISOString()
  };
  await writeFile(stateTempPath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  await rename(stateTempPath, statePath);
  state = nextState;
}

function runWrangler(args, captureOutput = false) {
  const result = spawnSync(process.execPath, [wranglerPath, ...args], {
    encoding: captureOutput ? "utf8" : undefined,
    maxBuffer: 10 * 1024 * 1024,
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "pipe"]
  });
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim();
    if (detail) console.error(detail);
    throw new Error(`Wrangler exited with status ${result.status ?? "unknown"}`);
  }
  return result.stdout?.toString() || "";
}

if (verifyOnly) {
  console.log(`Verifying ${targetName} D1 without importing generated files.`);
} else if (startIndex > 0) {
  console.log(`Resuming ${targetName} D1 import after ${state.lastFile} (${startIndex}/${files.length} complete).`);
}

for (let index = startIndex; index < files.length; index += 1) {
  const file = files[index];
  console.log(`[${index + 1}/${files.length}] Importing ${basename(file)}`);
  try {
    runWrangler(["d1", "execute", "music-db", locationFlag, "--yes", `--file=${file}`]);
  } catch (error) {
    console.error(`Import stopped at ${basename(file)}. Re-run the same command to resume.`);
    console.error(error.message);
    process.exit(1);
  }
  await saveState(basename(file));
}

const verificationSql = [
  "SELECT",
  "(SELECT COUNT(*) FROM songs) AS songs,",
  "(SELECT COUNT(*) FROM artists) AS artists,",
  "(SELECT COUNT(*) FROM song_artists) AS relationships,",
  "(SELECT COUNT(DISTINCT country_id) FROM song_artists WHERE country_id IS NOT NULL) AS countries,",
  "(SELECT COUNT(*) FROM song_artists WHERE role = 'original') AS originals,",
  "(SELECT COUNT(*) FROM song_artists WHERE role = 'cover') AS covers,",
  "(SELECT COUNT(*) FROM song_artists WHERE role NOT IN ('original', 'cover')) AS unknown,",
  "(SELECT COUNT(*) FROM song_artists WHERE country_id IS NULL) AS missingCountries;"
].join(" ");

let verification;
try {
  const output = runWrangler([
    "d1", "execute", "music-db", locationFlag, "--command", verificationSql, "--json"
  ], true);
  verification = JSON.parse(output)?.[0]?.results?.[0];
} catch (error) {
  console.error(`Unable to verify the ${targetName} D1 import: ${error.message}`);
  process.exit(1);
}

const expected = {
  songs: quality.counts.songs,
  artists: quality.counts.artists,
  relationships: quality.counts.relationships,
  countries: quality.counts.countries,
  originals: quality.counts.roles.original,
  covers: quality.counts.roles.cover,
  unknown: quality.counts.roles.unknown,
  missingCountries: 0
};
const mismatches = Object.entries(expected)
  .filter(([key, value]) => verification?.[key] !== value)
  .map(([key, value]) => `${key}: expected ${value}, received ${verification?.[key] ?? "missing"}`);

if (mismatches.length) {
  console.error(`The ${targetName} D1 import did not match the quality report:`);
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  console.error("Re-run with --restart to rebuild the target from the first generated file.");
  process.exit(1);
}

await saveState(basename(files.at(-1)), true);
console.log(verifyOnly
  ? `Verified the ${targetName} D1 database against the generated quality report.`
  : `Imported and verified ${files.length} file(s) in the ${targetName} D1 database.`);
