import { getJson, renderSongRows, type SongListItem } from "./ui";

interface CountrySongsResponse {
  country: { code: string; name: string };
  items: SongListItem[];
  nextCursor: number | null;
  total: number | null;
}

const page = document.querySelector<HTMLElement>("#country-page");
const code = page?.dataset.countryCode;
const countryName = page?.dataset.countryName || "this country";
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
const roleTabs = [...document.querySelectorAll<HTMLButtonElement>("#role-tabs .tab-btn")];
const searchInput = document.querySelector<HTMLInputElement>("#country-song-filter");

let cursor = 0;
let nextCursor: number | null = null;
let history: number[] = [];
let currentRole = "";
let currentLoadedItems: SongListItem[] = [];

function filterVisibleRows() {
  if (!rows) return;
  const query = searchInput?.value.trim().toLowerCase() || "";
  const filtered = currentLoadedItems.filter((item) => {
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      item.artist.toLowerCase().includes(query)
    );
  });

  renderSongRows(rows, filtered);
  if (empty) empty.classList.toggle("hidden", filtered.length > 0);
  if (table) table.classList.toggle("hidden", filtered.length === 0);
}

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
    if (currentRole) query.set("role", currentRole);

    const data = await getJson<CountrySongsResponse>(`/api/countries/${code}/songs?${query}`);
    nextCursor = data.nextCursor;
    currentLoadedItems = data.items;

    if (data.total !== null && count) {
      const roleLabel = currentRole === "original" ? "original recordings" : (currentRole === "cover" ? "cover versions" : "performance credits");
      count.textContent = `${data.total.toLocaleString()} ${roleLabel}`;
    }
    loading?.classList.add("hidden");

    if (data.items.length === 0) {
      const emptyMsg = empty?.querySelector("p"); if (emptyMsg) emptyMsg.textContent = `No songs found for this selection in ${countryName}`; empty?.classList.remove("hidden");
      return;
    }

    if (searchInput) searchInput.value = "";
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

// Role tabs switcher
roleTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    roleTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentRole = tab.dataset.role || "";
    cursor = 0;
    history = [];
    nextCursor = null;
    void loadSongs();
  });
});

// Live in-page filter
searchInput?.addEventListener("input", () => {
  filterVisibleRows();
});

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
