import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const inputs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const outputPath = resolve(outputArg?.slice("--output=".length) || "data/generated/catalog.ndjson");
const discoveredMusicbrainz = (await readdir("data"))
  .filter((filename) => /^musicbrainz-catalog(?:-.+)?\.ndjson$/.test(filename))
  .sort();
const defaultInputs = ["data/manual-catalog.ndjson", ...discoveredMusicbrainz.map((filename) => `data/${filename}`)];
const inputPaths = (inputs.length ? inputs : defaultInputs).map((inputPath) => resolve(inputPath));
const records = [];
const songs = new Map();

for (const inputPath of inputPaths) {
  let contents;
  try {
    contents = await readFile(inputPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`Skipping missing input ${inputPath}`);
      continue;
    }
    throw error;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const record = JSON.parse(line);
    records.push(record);
    const current = songs.get(record.songKey);
    const earlier = record.year != null && (current?.year == null || record.year < current.year);
    if (!current || earlier) songs.set(record.songKey, { title: record.title, year: record.year });
  }
  console.log(`Merged ${inputPath}`);
}

const relationships = new Map();
for (const record of records) {
  const song = songs.get(record.songKey);
  const canonical = { ...record, title: song.title, year: song.year };
  const key = `${record.songKey}|${record.artistKey}`;
  const current = relationships.get(key);
  const canonicalYear = song.year;
  const recordMatchesYear = record.year === canonicalYear;
  const currentMatchesYear = current?.sourceYear === canonicalYear;
  const shouldReplace = !current
    || (recordMatchesYear && !currentMatchesYear)
    || (recordMatchesYear === currentMatchesYear && record.role === "original" && current.record.role !== "original");
  if (shouldReplace) relationships.set(key, { record: canonical, sourceYear: record.year });
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${[...relationships.values()].map(({ record }) => JSON.stringify(record)).join("\n")}\n`, "utf8");
console.log(`Wrote ${relationships.size} relationships to ${outputPath}`);
