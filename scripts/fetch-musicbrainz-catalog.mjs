import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const load = createRequire(import.meta.url);
const countries = load("i18n-iso-countries");
const en = load("i18n-iso-countries/langs/en.json");
countries.registerLocale(en);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  if (key === "--") continue;
  if (key === "--restart") continue;
  args.set(key.slice(2), process.argv[index + 1]);
  index += 1;
}

const seedPath = resolve(args.get("seeds") || "data/musicbrainz-seeds.txt");
const outputPath = resolve(args.get("output") || "data/musicbrainz-catalog-latest.ndjson");
const cacheDir = resolve(args.get("cache") || "data/cache/musicbrainz");
const worksPerSeed = Number.parseInt(args.get("works-per-seed") || "10", 10);
const seedLimit = Number.parseInt(args.get("seed-limit") || "1000", 10);
const seedStart = Number.parseInt(args.get("seed-start") || "0", 10);
const globalPages = Number.parseInt(args.get("global-pages") || "0", 10);
const globalStart = Number.parseInt(args.get("global-start") || "0", 10);
const maxRecordingsPerWork = Number.parseInt(args.get("max-recordings") || "1000", 10);
const restart = process.argv.includes("--restart");
const userAgent = process.env.MUSICBRAINZ_USER_AGENT || "GlobalSongIndex/0.1 (https://global-song-index.pages.dev)";
const minIntervalMs = Number.parseInt(process.env.MUSICBRAINZ_INTERVAL_MS || "1100", 10);

if (!Number.isInteger(worksPerSeed) || worksPerSeed < 1 || worksPerSeed > 100) throw new Error("--works-per-seed must be 1..100");
if (!Number.isInteger(seedLimit) || seedLimit < 1 || seedLimit > 1000) throw new Error("--seed-limit must be 1..1000");
if (!Number.isInteger(seedStart) || seedStart < 0 || seedStart > 1000) throw new Error("--seed-start must be 0..1000");
if (!Number.isInteger(globalPages) || globalPages < 0 || globalPages > 100) throw new Error("--global-pages must be 0..100");
if (!Number.isInteger(globalStart) || globalStart < 0 || globalStart > 10000) throw new Error("--global-start must be 0..10000");
if (!Number.isInteger(maxRecordingsPerWork) || maxRecordingsPerWork < 1 || maxRecordingsPerWork > 10000) throw new Error("--max-recordings must be 1..10000");

await mkdir(cacheDir, { recursive: true });
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const cachePathFor = (url) => resolve(cacheDir, `${createHash("sha256").update(url).digest("hex")}.json`);
const normalizeArtistName = (value) => value
  .normalize("NFKD")
  .replace(/\p{Mark}/gu, "")
  .toLocaleLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
  .trim();

async function getJson(url) {
  const cachePath = cachePathFor(url);
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    // Cache miss: continue to the API.
  }

  const wait = minIntervalMs - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      lastRequestAt = Date.now();
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent,
          // MusicBrainz may keep API connections alive after the full body arrives.
          // Closing each response prevents fetch().json() from waiting indefinitely.
          Connection: "close",
        },
        signal: AbortSignal.timeout(45000),
      });
      if (response.ok) {
        const data = await response.json();
        await writeFile(cachePath, `${JSON.stringify(data)}\n`, "utf8");
        return data;
      }
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`MusicBrainz ${response.status} for ${url}`);
      }
    } catch (error) {
      if (attempt === 4) throw error;
    }
    await sleep(Math.min(30000, 2000 * (attempt + 1)));
  }
  throw new Error(`MusicBrainz request failed after retries: ${url}`);
}

const works = new Map();
if (globalPages > 0) {
  for (let page = 0; page < globalPages; page += 1) {
    const offset = (globalStart + page) * 100;
    const query = encodeURIComponent("type:Song AND rid:*");
    const url = `https://musicbrainz.org/ws/2/work?query=${query}&fmt=json&limit=100&offset=${offset}`;
    const data = await getJson(url);
    for (const work of data.works || []) {
      if (work.type && work.type !== "Song") continue;
      works.set(work.id, { id: work.id, title: work.title });
    }
    console.log(`Global page ${globalStart + page + 1}/${globalStart + globalPages}: ${data.works?.length || 0} works, ${works.size} unique total`);
  }
} else {
  const seeds = (await readFile(seedPath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!seeds.length) throw new Error(`No songwriter seeds found in ${seedPath}`);
  for (const seed of seeds.slice(seedStart, seedStart + seedLimit)) {
  const artistQuery = encodeURIComponent(`artist:"${seed}"`);
  const artistUrl = `https://musicbrainz.org/ws/2/artist?query=${artistQuery}&fmt=json&limit=10`;
  const artistData = await getJson(artistUrl);
  const normalizedSeed = normalizeArtistName(seed);
  const artist = (artistData.artists || []).find((candidate) =>
    normalizeArtistName(candidate.name || "") === normalizedSeed ||
    normalizeArtistName(candidate["sort-name"] || "") === normalizedSeed
  );
  if (!artist?.id) {
    console.warn(`Seed ${seed}: artist not found`);
    continue;
  }
  const query = encodeURIComponent(`arid:${artist.id} AND type:Song AND rid:*`);
  const url = `https://musicbrainz.org/ws/2/work?query=${query}&fmt=json&limit=${worksPerSeed}`;
  const data = await getJson(url);
  for (const work of data.works || []) {
    if (work.type && work.type !== "Song") continue;
    works.set(work.id, { id: work.id, title: work.title });
  }
    console.log(`Seed ${seed} (${artist.name}): ${data.works?.length || 0} works, ${works.size} unique total`);
  }
}

const rows = new Map();
const processedWorkIds = new Set();
if (!restart) {
  try {
    const checkpoint = await readFile(outputPath, "utf8");
    for (const rawLine of checkpoint.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const row = JSON.parse(line);
      if (!row.songKey?.startsWith("mb-work:") || !row.artistKey || !row.role) continue;
      rows.set(`${row.songKey}|${row.artistKey}|${row.role}`, JSON.stringify(row));
      processedWorkIds.add(row.songKey.slice("mb-work:".length));
    }
    if (processedWorkIds.size) {
      console.log(`Resuming from ${processedWorkIds.size} completed works and ${rows.size} relationships`);
    }
  } catch {
    // No usable checkpoint exists yet.
  }
}
const writeCheckpoint = async () => {
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${[...rows.values()].join("\n")}\n`, "utf8");
};
let workIndex = 0;
for (const work of works.values()) {
  workIndex += 1;
  if (processedWorkIds.has(work.id)) {
    console.log(`Work ${workIndex}/${works.size}: ${work.title} -> checkpoint`);
    continue;
  }
  const relationUrl = `https://musicbrainz.org/ws/2/work/${work.id}?inc=recording-rels&fmt=json`;
  const relationData = await getJson(relationUrl);
  const relationMeta = new Map((relationData.relations || [])
    .filter((relation) => relation.recording?.id)
    .map((relation) => [relation.recording.id, relation]));
  const total = Math.min(relationMeta.size, maxRecordingsPerWork);
  const performers = new Map();

  for (let offset = 0; offset < total; offset += 100) {
    const limit = Math.min(100, total - offset);
    const recordingUrl = `https://musicbrainz.org/ws/2/recording?work=${work.id}&inc=artist-credits&fmt=json&limit=${limit}&offset=${offset}`;
    const recordingData = await getJson(recordingUrl);
    for (const recording of recordingData.recordings || []) {
      const relation = relationMeta.get(recording.id);
      const date = recording["first-release-date"] || relation?.begin || null;
      const year = /^\d{4}/.test(date || "") ? Number(date.slice(0, 4)) : null;
      for (const credit of recording["artist-credit"] || []) {
        const artist = credit.artist;
        if (!artist?.id || !artist.name || !countries.isValid(artist.country)) continue;
        const explicitCover = relation?.attributes?.includes("cover") === true;
        const performer = performers.get(artist.id) || {
          artist,
          firstYear: null,
          firstNonCoverYear: null,
          hasCover: false,
          hasNonCover: false
        };
        if (year && (!performer.firstYear || year < performer.firstYear)) performer.firstYear = year;
        if (explicitCover) {
          performer.hasCover = true;
        } else {
          performer.hasNonCover = true;
          if (year && (!performer.firstNonCoverYear || year < performer.firstNonCoverYear)) performer.firstNonCoverYear = year;
        }
        performers.set(artist.id, performer);
      }
    }
  }

  const firstYear = Math.min(...[...performers.values()].map((performer) => performer.firstYear).filter(Boolean));
  const hasExplicitCovers = [...performers.values()].some((performer) => performer.hasCover);
  const nonCoverYears = [...performers.values()].map((performer) => performer.firstNonCoverYear).filter(Boolean);
  const firstNonCoverYear = Math.min(...nonCoverYears);
  const canIdentifyNonCoverOriginal = hasExplicitCovers && Number.isFinite(firstNonCoverYear);
  const fallbackOriginalId = performers.values().find((performer) => performer.hasNonCover)?.artist.id
    || performers.values().next().value?.artist.id;
  for (const performer of performers.values()) {
    const role = canIdentifyNonCoverOriginal
      ? (performer.hasNonCover && performer.firstNonCoverYear === firstNonCoverYear ? "original" : "cover")
      : (Number.isFinite(firstYear)
        ? (performer.firstYear === firstYear ? "original" : "cover")
        : (performer.artist.id === fallbackOriginalId ? "original" : "cover"));
    const songKey = `mb-work:${work.id}`;
    const artistKey = `mb-artist:${performer.artist.id}`;
    rows.set(`${songKey}|${artistKey}|${role}`, JSON.stringify({
      songKey,
      title: work.title,
      year: Number.isFinite(firstYear) ? firstYear : null,
      artistKey,
      artist: performer.artist.name,
      countryCode: performer.artist.country,
      role
    }));
  }
  console.log(`Work ${workIndex}/${works.size}: ${work.title} -> ${performers.size} performers`);
  if (workIndex % 25 === 0) {
    await writeCheckpoint();
    console.log(`Checkpoint: ${rows.size} relationships written`);
  }
}

await writeCheckpoint();
console.log(`Wrote ${rows.size} unique relationships to ${outputPath}`);
