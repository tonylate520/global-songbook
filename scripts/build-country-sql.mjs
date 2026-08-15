import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const load = createRequire(import.meta.url);
const countries = load("i18n-iso-countries");
const en = load("i18n-iso-countries/langs/en.json");

countries.registerLocale(en);

const outputPath = resolve(process.argv[2] || "data/generated/countries.sql");
const escapeSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const rows = Object.keys(countries.getAlpha2Codes())
  .map((code) => ({ code, name: countries.getName(code, "en") || code }))
  .sort((a, b) => a.code.localeCompare(b.code));

const statements = rows.map(({ code, name }) =>
  `INSERT INTO countries (iso_code, name_zh, name_en) VALUES (${escapeSql(code)}, ${escapeSql(name)}, ${escapeSql(name)}) ` +
  `ON CONFLICT(iso_code) DO UPDATE SET name_en = excluded.name_en;`
);

const sql = [
  "PRAGMA foreign_keys = ON;",
  "BEGIN TRANSACTION;",
  ...statements,
  "COMMIT;",
  ""
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, "utf8");
console.log(`Wrote ${rows.length} countries to ${outputPath}`);
