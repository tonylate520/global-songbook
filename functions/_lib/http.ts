export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export const publicCacheHeaders = {
  "Cache-Control": "public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800"
};

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function error(message: string, status = 500) {
  return json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function parseBoundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function normalizeSearch(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
