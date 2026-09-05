import {
  createIcons,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Disc3,
  HelpCircle,
  Mic2,
  Music2,
  UserRound
} from "lucide";
import { getJson, roleNames, type SongListItem } from "./ui";

interface SongResponse {
  song: { id: number; title: string; releaseYear: number | null };
  performers: SongListItem[];
}

const loading = document.querySelector<HTMLElement>("#song-loading");
const error = document.querySelector<HTMLElement>("#song-error");
const content = document.querySelector<HTMLElement>("#song-content");
const title = document.querySelector<HTMLElement>("#song-title");
const breadcrumbTitle = document.querySelector<HTMLElement>("#breadcrumb-song-title");
const meta = document.querySelector<HTMLElement>("#song-meta");
const highlight = document.querySelector<HTMLElement>("#song-highlight");
const count = document.querySelector<HTMLElement>("#performer-count");
const list = document.querySelector<HTMLElement>("#performer-list");
const emptyFilter = document.querySelector<HTMLElement>("#performer-empty");
const filterInput = document.querySelector<HTMLInputElement>("#performer-filter");
const tabs = [...document.querySelectorAll<HTMLButtonElement>("#performer-tabs .tab-btn")];
const badgeAll = document.querySelector<HTMLElement>("#tab-badge-all");
const badgeOriginal = document.querySelector<HTMLElement>("#tab-badge-original");
const badgeCover = document.querySelector<HTMLElement>("#tab-badge-cover");
const faqContent = document.querySelector<HTMLElement>("#song-faq-content");

let allPerformers: SongListItem[] = [];
let currentRoleFilter = "all";
let currentSearchQuery = "";

function songIdFromPath(): string | null {
  const segments = location.pathname.split("/").filter(Boolean);
  const candidate = segments[0] === "song" ? segments[1] : "";
  return /^\d+$/.test(candidate || "") ? candidate : null;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderPerformers() {
  if (!list) return;

  const filtered = allPerformers.filter((item) => {
    const matchesRole =
      currentRoleFilter === "all" ||
      (currentRoleFilter === "original" && item.role === "original") ||
      (currentRoleFilter === "cover" && item.role === "cover");

    const query = currentSearchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      item.artist.toLowerCase().includes(query) ||
      (item.countryName && item.countryName.toLowerCase().includes(query)) ||
      (item.countryCode && item.countryCode.toLowerCase().includes(query));

    return matchesRole && matchesSearch;
  });

  list.replaceChildren();

  filtered.forEach((p) => {
    const isOriginal = p.role === "original";
    const row = document.createElement("div");
    row.className = `performer-row ${isOriginal ? "is-original" : ""}`;

    const avatar = document.createElement("div");
    avatar.className = "performer-avatar";
    avatar.innerHTML = `<i data-lucide="${isOriginal ? "disc-3" : "mic-2"}"></i>`;

    const details = document.createElement("div");
    details.className = "performer-details";

    const name = document.createElement("span");
    name.className = "performer-name";
    name.textContent = p.artist;

    const sub = document.createElement("div");
    sub.className = "performer-sub";

    if (p.countryCode && p.countryName) {
      const countryLink = document.createElement("a");
      countryLink.href = `/country/${p.countryCode.toLowerCase()}/`;
      countryLink.className = "country-chip";
      countryLink.title = `Browse songs from ${p.countryName}`;
      countryLink.innerHTML = `<strong>${p.countryCode.toUpperCase()}</strong> ${escapeHtml(p.countryName)}`;
      sub.appendChild(countryLink);
    } else if (p.countryName) {
      const chip = document.createElement("span");
      chip.className = "country-chip";
      chip.textContent = p.countryName;
      sub.appendChild(chip);
    } else {
      const chip = document.createElement("span");
      chip.className = "country-chip";
      chip.textContent = "Country not recorded";
      sub.appendChild(chip);
    }

    details.appendChild(name);
    details.appendChild(sub);

    const badge = document.createElement("span");
    badge.className = `role-badge ${p.role}`;
    if (isOriginal) {
      badge.innerHTML = '<i data-lucide="check-circle-2"></i> Original';
    } else {
      badge.textContent = roleNames[p.role] || roleNames.unknown;
    }

    row.appendChild(avatar);
    row.appendChild(details);
    row.appendChild(badge);

    if (p.countryCode) {
      const btn = document.createElement("a");
      btn.href = `/country/${p.countryCode.toLowerCase()}/`;
      btn.className = "button";
      btn.innerHTML = 'Country <i data-lucide="arrow-right"></i>';
      row.appendChild(btn);
    }

    list.appendChild(row);
  });

  if (emptyFilter) {
    emptyFilter.classList.toggle("hidden", filtered.length > 0);
  }

  createIcons({
    icons: { ArrowRight, CheckCircle2, ChevronRight, Disc3, HelpCircle, Mic2, Music2, UserRound }
  });
}

function updateTabsAndCount() {
  const originalCount = allPerformers.filter((p) => p.role === "original").length;
  const coverCount = allPerformers.filter((p) => p.role === "cover").length;

  if (badgeAll) badgeAll.textContent = String(allPerformers.length);
  if (badgeOriginal) badgeOriginal.textContent = String(originalCount);
  if (badgeCover) badgeCover.textContent = String(coverCount);
  if (count) count.textContent = `${allPerformers.length} recorded versions`;
}

function renderHighlightAndFaq(song: SongResponse["song"], performers: SongListItem[]) {
  const original = performers.find((p) => p.role === "original");
  const covers = performers.filter((p) => p.role === "cover");
  const countries = Array.from(new Set(performers.map((p) => p.countryName).filter(Boolean)));

  if (highlight) {
    highlight.innerHTML = `
      <div class="highlight-header">
        <span class="highlight-badge">
          <i data-lucide="check-circle-2"></i> Verified Original Recording
        </span>
        <span class="meta-item">
          <i data-lucide="disc-3"></i> ${song.releaseYear ? `Release Year: ${song.releaseYear}` : "Year not recorded"}
        </span>
      </div>
      <h2 class="highlight-question">Who originally sang "${escapeHtml(song.title)}"?</h2>
      <p class="highlight-answer">
        ${original ? `
          <strong>${escapeHtml(song.title)}</strong> was originally recorded by
          <strong>${escapeHtml(original.artist)}</strong>
          ${original.countryCode && original.countryName ? `
            (<a href="/country/${escapeHtml(original.countryCode)}/" class="country-chip" title="Browse songs from ${escapeHtml(original.countryName)}"><strong>${escapeHtml(original.countryCode.toUpperCase())}</strong> ${escapeHtml(original.countryName)}</a>)
          ` : (original.countryName ? `(${escapeHtml(original.countryName)})` : "")}
          ${song.releaseYear ? ` in <strong>${song.releaseYear}</strong>` : ""}.
        ` : `
          The original recording artist for <strong>${escapeHtml(song.title)}</strong> is currently being verified.
        `}
      </p>
    `;
  }

  if (faqContent) {
    const faqQ1 = `Who originally sang "${song.title}"?`;
    const faqA1 = original
      ? `"${song.title}" was originally recorded by ${original.artist}${original.countryName ? ` from ${original.countryName}` : ""}${song.releaseYear ? ` and released in ${song.releaseYear}` : ""}.`
      : `The original recording artist for "${song.title}" is currently listed as unconfirmed in this catalogue.`;

    const faqQ2 = `How many artists have covered "${song.title}"?`;
    const faqA2 = covers.length > 0
      ? `Global Song Index currently catalogues ${covers.length} recorded cover version${covers.length !== 1 ? "s" : ""} of "${song.title}" by artists around the world.`
      : `There are currently no additional cover recordings documented for "${song.title}" in this index.`;

    const faqQ3 = `Which countries have recorded versions of "${song.title}"?`;
    const faqA3 = countries.length > 0
      ? `Performers from ${countries.length} countr${countries.length === 1 ? "y" : "ies"} (including ${countries.slice(0, 5).join(", ")}${countries.length > 5 ? ", among others" : ""}) have recorded versions of "${song.title}".`
      : `Country attributions for performers of "${song.title}" are being researched.`;

    faqContent.innerHTML = `
      <div class="faq-grid">
        <div class="faq-card">
          <h3 class="faq-question"><i data-lucide="help-circle"></i> ${escapeHtml(faqQ1)}</h3>
          <p class="faq-answer">${escapeHtml(faqA1)}</p>
        </div>
        <div class="faq-card">
          <h3 class="faq-question"><i data-lucide="help-circle"></i> ${escapeHtml(faqQ2)}</h3>
          <p class="faq-answer">${escapeHtml(faqA2)}</p>
        </div>
        <div class="faq-card">
          <h3 class="faq-question"><i data-lucide="help-circle"></i> ${escapeHtml(faqQ3)}</h3>
          <p class="faq-answer">${escapeHtml(faqA3)}</p>
        </div>
        <div class="faq-card">
          <h3 class="faq-question"><i data-lucide="help-circle"></i> How are original recordings differentiated from covers?</h3>
          <p class="faq-answer">The original recording refers to the very first commercially released recording of the composition by the credited artist. Later performances by other musicians in different genres, countries, or languages are documented as cover versions.</p>
        </div>
      </div>
    `;
  }
}

async function loadSong() {
  const id = songIdFromPath();
  if (!id) {
    loading?.classList.add("hidden");
    error?.classList.remove("hidden");
    return;
  }

  try {
    const data = await getJson<SongResponse>(`/api/songs/${id}`);
    allPerformers = data.performers;

    if (title) title.textContent = data.song.title;
    if (breadcrumbTitle) breadcrumbTitle.textContent = data.song.title;
    document.title = `${data.song.title} - Who Sang It First? Original Artist & Cover Versions | Global Song Index`;

    if (meta) {
      meta.innerHTML = `${data.song.releaseYear ? `First released in ${data.song.releaseYear}` : "First release year not recorded"} &bull; ${data.performers.length} recorded performance${data.performers.length !== 1 ? "s" : ""}`;
    }

    renderHighlightAndFaq(data.song, data.performers);
    updateTabsAndCount();
    renderPerformers();

    loading?.classList.add("hidden");
    content?.classList.remove("hidden");
  } catch {
    loading?.classList.add("hidden");
    error?.classList.remove("hidden");
  }
}

// Tab switcher
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentRoleFilter = tab.dataset.filter || "all";
    renderPerformers();
  });
});

// Live filter input
filterInput?.addEventListener("input", () => {
  currentSearchQuery = filterInput.value.trim();
  renderPerformers();
});

void loadSong();
