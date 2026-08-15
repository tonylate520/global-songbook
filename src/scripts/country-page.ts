import { getJson, renderSongRows, type SongListItem } from "./ui";

interface CountrySongsResponse {
  country: { code: string; name: string };
  items: SongListItem[];
  nextCursor: number | null;
  total: number | null;
}

const page = document.querySelector<HTMLElement>("#country-page");
const code = page?.dataset.countryCode;
const loading = document.querySelector<HTMLElement>("#country-loading");
const error = document.querySelector<HTMLElement>("#country-error");
const empty = document.querySelector<HTMLElement>("#country-empty");
const table = document.querySelector<HTMLElement>("#song-table");
const rows = document.querySelector<HTMLElement>("#song-rows");
const pagination = document.querySelector<HTMLElement>("#pagination");
const previousButton = document.querySelector<HTMLButtonElement>("#previous-page");
const nextButton = document.querySelector<HTMLButtonElement>("#next-page");
const retryButton = document.querySelector<HTMLButtonElement>("#retry-button");
const count = document.querySelector<HTMLElement>("#song-count");

let cursor = 0;
let nextCursor: number | null = null;
let history: number[] = [];

async function loadSongs() {
  if (!code || !rows) return;
  loading?.classList.remove("hidden");
  error?.classList.add("hidden");
  empty?.classList.add("hidden");
  table?.classList.add("hidden");
  pagination?.classList.add("hidden");

  try {
    const query = new URLSearchParams({ cursor: String(cursor), limit: "50" });
    if (cursor === 0) query.set("includeTotal", "1");
    const data = await getJson<CountrySongsResponse>(`/api/countries/${code}/songs?${query}`);
    nextCursor = data.nextCursor;
    if (data.total !== null && count) count.textContent = `${data.total.toLocaleString()} performance credits`;
    loading?.classList.add("hidden");

    if (data.items.length === 0) {
      empty?.classList.remove("hidden");
      return;
    }

    renderSongRows(rows, data.items);
    table?.classList.remove("hidden");
    pagination?.classList.remove("hidden");
    if (previousButton) previousButton.disabled = history.length === 0;
    if (nextButton) nextButton.disabled = nextCursor === null;
  } catch {
    loading?.classList.add("hidden");
    error?.classList.remove("hidden");
    if (count) count.textContent = "Count unavailable";
  }
}

nextButton?.addEventListener("click", () => {
  if (nextCursor === null) return;
  history.push(cursor);
  cursor = nextCursor;
  window.scrollTo({ top: page?.offsetTop || 0, behavior: "smooth" });
  void loadSongs();
});

previousButton?.addEventListener("click", () => {
  const previousCursor = history.pop();
  if (previousCursor === undefined) return;
  cursor = previousCursor;
  window.scrollTo({ top: page?.offsetTop || 0, behavior: "smooth" });
  void loadSongs();
});

retryButton?.addEventListener("click", () => void loadSongs());
void loadSongs();
