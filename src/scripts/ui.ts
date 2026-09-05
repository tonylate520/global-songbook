import { CheckCircle2, ChevronRight, createIcons } from "lucide";

export interface SongListItem {
  relationId: number;
  songId: number;
  title: string;
  artist: string;
  countryCode: string | null;
  countryName: string | null;
  role: "original" | "cover" | "unknown";
}

export const roleNames: Record<SongListItem["role"], string> = {
  original: "Original",
  cover: "Cover",
  unknown: "Unconfirmed"
};

export function renderSongRows(container: HTMLElement, items: SongListItem[], showCountry = false) {
  container.replaceChildren();

  items.forEach((item) => {
    const link = document.createElement("a");
    link.className = "song-row";
    link.href = `/song/${item.songId}/`;

    const title = document.createElement("span");
    title.className = "song-title";
    title.textContent = item.title;

    const artist = document.createElement("span");
    artist.className = "artist-name";
    if (showCountry && item.countryName) {
      artist.innerHTML = `${escapeHtml(item.artist)} &bull; <small style="color: var(--navy); font-weight: 600;">${escapeHtml(item.countryName)}</small>`;
    } else {
      artist.textContent = item.artist;
    }

    const role = document.createElement("span");
    role.className = `role-badge ${item.role}`;
    if (item.role === "original") {
      role.innerHTML = '<i data-lucide="check-circle-2"></i> Original';
    } else {
      role.textContent = roleNames[item.role] || roleNames.unknown;
    }

    const icon = document.createElement("i");
    icon.dataset.lucide = "chevron-right";

    link.appendChild(title);
    link.appendChild(artist);
    link.appendChild(role);
    link.appendChild(icon);
    container.appendChild(link);
  });

  createIcons({ icons: { CheckCircle2, ChevronRight } });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
