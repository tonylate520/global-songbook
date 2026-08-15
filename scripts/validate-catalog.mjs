import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const load = createRequire(import.meta.url);
const countries = load("i18n-iso-countries");
const en = load("i18n-iso-countries/langs/en.json");
countries.registerLocale(en);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  if (!process.argv[index].startsWith("--")) continue;
  args.set(process.argv[index].slice(2), process.argv[index + 1]);
  index += 1;
}

const inputPath = resolve(args.get("input") || "data/generated/catalog.ndjson");
const reportPath = resolve(args.get("report") || "data/generated/quality-report.json");
const minimums = {
  songs: Number.parseInt(args.get("min-songs") || "1000", 10),
  relationships: Number.parseInt(args.get("min-relationships") || "30000", 10),
  countries: Number.parseInt(args.get("min-countries") || "80", 10)
};
const errors = [];
const warnings = [];
const songs = new Map();
const artists = new Map();
const relationships = new Map();
const countryCodes = new Set();
const roleCounts = { original: 0, cover: 0, unknown: 0 };
const normalize = (value) => value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");

const contents = await readFile(inputPath, "utf8");
for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  let record;
  try {
    record = JSON.parse(line);
  } catch (error) {
    errors.push(`Line ${index + 1}: invalid JSON (${error.message})`);
    continue;
  }

  const countryCode = String(record.countryCode || "").toUpperCase();
  if (!countries.isValid(countryCode)) errors.push(`Line ${index + 1}: invalid country code ${countryCode || "(empty)"}`);
  else countryCodes.add(countryCode);
  if (!Object.hasOwn(roleCounts, record.role)) errors.push(`Line ${index + 1}: invalid role ${record.role}`);
  else roleCounts[record.role] += 1;

  const song = songs.get(record.songKey) || { title: record.title, year: record.year, originals: new Set(), performers: new Set() };
  if (song.title !== record.title || song.year !== record.year) errors.push(`Song key ${record.songKey} has conflicting title or year`);
  song.performers.add(record.artistKey);
  if (record.role === "original") song.originals.add(record.artistKey);
  songs.set(record.songKey, song);

  const artist = artists.get(record.artistKey);
  if (artist && (artist.name !== record.artist || artist.countryCode !== countryCode)) errors.push(`Artist key ${record.artistKey} has conflicting name or country`);
  else artists.set(record.artistKey, { name: record.artist, countryCode });

  const relationKey = `${record.songKey}|${record.artistKey}`;
  const existingRole = relationships.get(relationKey);
  if (existingRole && existingRole !== record.role) errors.push(`Relationship ${relationKey} has conflicting roles ${existingRole} and ${record.role}`);
  relationships.set(relationKey, record.role);
}

for (const [songKey, song] of songs) {
  if (!song.originals.size) errors.push(`Song ${songKey} (${song.title}) has no original performer`);
}

const titleYears = new Map();
for (const [songKey, song] of songs) {
  const key = `${normalize(song.title)}|${song.year ?? ""}`;
  const keys = titleYears.get(key) || [];
  keys.push(songKey);
  titleYears.set(key, keys);
}
for (const [titleYear, keys] of titleYears) {
  if (keys.length > 1) warnings.push(`Possible duplicate title/year ${titleYear}: ${keys.join(", ")}`);
}

if (songs.size < minimums.songs) errors.push(`Catalogue has ${songs.size} songs; minimum is ${minimums.songs}`);
if (relationships.size < minimums.relationships) errors.push(`Catalogue has ${relationships.size} relationships; minimum is ${minimums.relationships}`);
if (countryCodes.size < minimums.countries) errors.push(`Catalogue represents ${countryCodes.size} countries; minimum is ${minimums.countries}`);

const report = {
  generatedAt: new Date().toISOString(),
  input: inputPath,
  counts: {
    songs: songs.size,
    artists: artists.size,
    relationships: relationships.size,
    countries: countryCodes.size,
    roles: roleCounts
  },
  minimums,
  errors,
  warnings
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.counts, null, 2));
if (warnings.length) console.warn(`${warnings.length} warning(s); see ${reportPath}`);
if (errors.length) {
  console.error(`${errors.length} catalogue quality error(s); see ${reportPath}`);
  process.exit(1);
}
console.log(`Catalogue quality checks passed. Report: ${reportPath}`);
