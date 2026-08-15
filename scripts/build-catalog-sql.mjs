import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  args.set(key.slice(2), process.argv[index + 1]);
  index += 1;
}

const inputPath = resolve(args.get("input") || "data/catalog.ndjson");
const outputDir = resolve(args.get("output") || "data/generated/catalog");
const chunkSize = Number.parseInt(args.get("chunk-size") || "5000", 10);

if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 10000) {
  throw new Error("--chunk-size must be an integer between 1 and 10000");
}

const normalize = (value) => value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
const escapeSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const keyHash = (kind, value) => createHash("sha256").update(`${kind}:${value}`).digest("hex");

function validateRecord(record, lineNumber) {
  const fail = (message) => { throw new Error(`Line ${lineNumber}: ${message}`); };
  if (!record || typeof record !== "object") fail("record must be an object");
  if (typeof record.songKey !== "string" || !record.songKey.trim()) fail("songKey is required");
  if (typeof record.title !== "string" || !record.title.trim()) fail("title is required");
  if (record.year != null && (!Number.isInteger(record.year) || record.year < 1000 || record.year > 9999)) fail("year must be null or a four-digit integer");
  if (typeof record.artistKey !== "string" || !record.artistKey.trim()) fail("artistKey is required");
  if (typeof record.artist !== "string" || !record.artist.trim()) fail("artist is required");
  if (typeof record.countryCode !== "string" || !/^[A-Za-z]{2}$/.test(record.countryCode)) fail("countryCode must be a two-letter ISO code");
  if (!["original", "cover", "unknown"].includes(record.role)) fail("role must be original, cover, or unknown");
}

function keysFor(record) {
  const title = record.title.normalize("NFKC").trim();
  const artist = record.artist.normalize("NFKC").trim();
  const countryCode = record.countryCode.toUpperCase();
  const songKey = keyHash("song", record.songKey.trim());
  const artistKey = keyHash("artist", record.artistKey.trim());
  const year = record.year == null ? "NULL" : String(record.year);

  return { title, artist, countryCode, songKey, artistKey, year };
}

function songStatement(record, generation) {
  const { title, songKey, year } = keysFor(record);
  return `INSERT INTO songs (title, normalized_title, release_year, catalog_key, catalog_generation) VALUES (${escapeSql(title)}, ${escapeSql(normalize(title))}, ${year}, ${escapeSql(songKey)}, ${escapeSql(generation)}) ON CONFLICT(catalog_key) DO UPDATE SET title = excluded.title, normalized_title = excluded.normalized_title, release_year = COALESCE(excluded.release_year, songs.release_year), catalog_generation = excluded.catalog_generation;`;
}

function artistStatement(record, generation) {
  const { artist, countryCode, artistKey } = keysFor(record);
  return `INSERT INTO artists (name, normalized_name, country_id, catalog_key, catalog_generation) VALUES (${escapeSql(artist)}, ${escapeSql(normalize(artist))}, (SELECT id FROM countries WHERE iso_code = ${escapeSql(countryCode)}), ${escapeSql(artistKey)}, ${escapeSql(generation)}) ON CONFLICT(catalog_key) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name, country_id = COALESCE(excluded.country_id, artists.country_id), catalog_generation = excluded.catalog_generation;`;
}

function relationshipStatement(record, generation) {
  const { songKey, artistKey } = keysFor(record);
  return `INSERT INTO song_artists (song_id, artist_id, country_id, role, catalog_generation) SELECT s.id, a.id, a.country_id, ${escapeSql(record.role)}, ${escapeSql(generation)} FROM songs s CROSS JOIN artists a WHERE s.catalog_key = ${escapeSql(songKey)} AND a.catalog_key = ${escapeSql(artistKey)} AND true ON CONFLICT(song_id, artist_id, role) DO UPDATE SET country_id = excluded.country_id, catalog_generation = excluded.catalog_generation;`;
}

async function writeSqlFile(filename, statements) {
  const body = [
    "PRAGMA foreign_keys = ON;",
    "BEGIN TRANSACTION;",
    ...statements,
    "COMMIT;",
    ""
  ].join("\n");
  await writeFile(resolve(outputDir, filename), body, "utf8");
}

const contents = await readFile(inputPath, "utf8");
const generation = createHash("sha256").update(contents).digest("hex").slice(0, 24);
const records = [];
const songs = new Map();
const artists = new Map();
for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  let record;
  try {
    record = JSON.parse(line);
  } catch (error) {
    throw new Error(`Line ${index + 1}: invalid JSON (${error.message})`);
  }
  validateRecord(record, index + 1);
  records.push(record);
  if (!songs.has(record.songKey)) songs.set(record.songKey, record);
  if (!artists.has(record.artistKey)) artists.set(record.artistKey, record);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

let fileCount = 0;
const files = [];
for (const [label, entities, toStatement] of [
  ["songs", [...songs.values()], songStatement],
  ["artists", [...artists.values()], artistStatement],
  ["relationships", records, relationshipStatement]
]) {
  for (let offset = 0; offset < entities.length; offset += chunkSize) {
    const chunk = entities.slice(offset, offset + chunkSize);
    fileCount += 1;
    const filename = `${String(fileCount).padStart(5, "0")}-${label}.sql`;
    await writeSqlFile(filename, chunk.map((record) => toStatement(record, generation)));
    files.push(filename);
  }
}

const cleanupFilename = "99999-cleanup.sql";
const cleanupSql = [
  "PRAGMA foreign_keys = ON;",
  "BEGIN TRANSACTION;",
  `DELETE FROM song_artists WHERE catalog_generation IS NOT NULL AND catalog_generation <> ${escapeSql(generation)};`,
  `DELETE FROM songs WHERE catalog_generation IS NOT NULL AND catalog_generation <> ${escapeSql(generation)};`,
  `DELETE FROM artists WHERE catalog_generation IS NOT NULL AND catalog_generation <> ${escapeSql(generation)};`,
  "COMMIT;",
  ""
].join("\n");
await writeFile(resolve(outputDir, cleanupFilename), cleanupSql, "utf8");
files.push(cleanupFilename);

const formatVersion = 2;
const importKey = createHash("sha256")
  .update(JSON.stringify({ generation, formatVersion, chunkSize, files }))
  .digest("hex")
  .slice(0, 24);

const manifest = {
  generatedAt: new Date().toISOString(),
  input: inputPath,
  records: records.length,
  songs: songs.size,
  artists: artists.size,
  chunks: fileCount,
  chunkSize,
  generation,
  formatVersion,
  importKey,
  files,
  cleanupFile: cleanupFilename
};
await writeFile(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Validated ${records.length} records and wrote ${fileCount} SQL chunk(s) to ${outputDir}`);
