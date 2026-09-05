import { getJson, renderSongRows, type SongListItem } from "./ui";

interface SearchResponse {
  query: string;
  items: SongListItem[];
}

const form = document.querySelector<HTMLFormElement>("#search-form");
const input = document.querySelector<HTMLInputElement>("#search-input");
const loading = document.querySelector<HTMLElement>("#search-loading");
const empty = document.querySelector<HTMLElement>("#search-empty");
const results = document.querySelector<HTMLElement>("#search-results");
const rows = document.querySelector<HTMLElement>("#search-rows");
const summary = document.querySelector<HTMLElement>("#search-summary");
const suggestions = [...document.querySelectorAll<HTMLButtonElement>(".suggestion-btn")];

async function search(query: string) {
  if (!rows || query.length < 2) return;
  loading?.classList.remove("hidden");
  empty?.classList.add("hidden");
  results?.classList.add("hidden");
  if (summary) summary.textContent = `Searching for “${query}”...`;

  try {
    const data = await getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`);
    loading?.classList.add("hidden");
    if (summary) {
      summary.textContent = `Found ${data.items.length} recording${data.items.length === 1 ? "" : "s"} for “${query}”`;
    }

    if (data.items.length === 0) {
      empty?.classList.remove("hidden");
      const message = empty?.querySelector("p");
      if (message) message.textContent = `No songs or artists found matching “${query}”`;
      return;
    }

    renderSongRows(rows, data.items, true);
    results?.classList.remove("hidden");
  } catch {
    loading?.classList.add("hidden");
    empty?.classList.remove("hidden");
    if (summary) summary.textContent = "Search is temporarily unavailable";
    const message = empty?.querySelector("p");
    if (message) message.textContent = "Please check your network and try again";
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = input?.value.trim() || "";
  if (query.length < 2) return;
  history.replaceState(null, "", `/search/?q=${encodeURIComponent(query)}`);
  void search(query);
});

suggestions.forEach((btn) => {
  btn.addEventListener("click", () => {
    const query = btn.dataset.query || "";
    if (input && query) {
      input.value = query;
      history.replaceState(null, "", `/search/?q=${encodeURIComponent(query)}`);
      void search(query);
    }
  });
});

const initialQuery = new URLSearchParams(location.search).get("q")?.trim() || "";
if (initialQuery && input) {
  input.value = initialQuery;
  void search(initialQuery);
}
