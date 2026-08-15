import { createIcons, UserRound } from "lucide";
import { getJson, roleNames, type SongListItem } from "./ui";

interface SongResponse {
  song: { id: number; title: string; releaseYear: number | null };
  performers: SongListItem[];
}

const loading = document.querySelector<HTMLElement>("#song-loading");
const error = document.querySelector<HTMLElement>("#song-error");
const content = document.querySelector<HTMLElement>("#song-content");
const title = document.querySelector<HTMLElement>("#song-title");
const meta = document.querySelector<HTMLElement>("#song-meta");
const count = document.querySelector<HTMLElement>("#performer-count");
const list = document.querySelector<HTMLElement>("#performer-list");

function songIdFromPath() {
  const segments = location.pathname.split("/").filter(Boolean);
  const candidate = segments[0] === "song" ? segments[1] : "";
  return /^\d+$/.test(candidate || "") ? candidate : null;
}

async function loadSong() {
  const id = songIdFromPath();
  if (!id || !list) {
    loading?.classList.add("hidden");
    error?.classList.remove("hidden");
    return;
  }

  try {
    const data = await getJson<SongResponse>(`/api/songs/${id}`);
    if (title) title.textContent = data.song.title;
    document.title = `${data.song.title} - Global Song Index`;
    if (meta) meta.textContent = data.song.releaseYear ? `First released ${data.song.releaseYear}` : "Release year not recorded";
    if (count) count.textContent = `${data.performers.length} performers`;

    list.replaceChildren();
    data.performers.forEach((performer) => {
      const row = document.createElement("div");
      row.className = "performer-row";

      const icon = document.createElement("span");
      icon.className = "performer-icon";
      icon.innerHTML = '<i data-lucide="user-round"></i>';

      const info = document.createElement("span");
      info.className = "performer-info";
      const name = document.createElement("strong");
      name.textContent = performer.artist;
      const country = document.createElement("small");
      country.textContent = performer.countryName || "Country not recorded";
      info.appendChild(name);
      info.appendChild(country);

      const role = document.createElement("span");
      role.className = `role-badge ${performer.role}`;
      role.textContent = roleNames[performer.role] || roleNames.unknown;
      row.appendChild(icon);
      row.appendChild(info);
      row.appendChild(role);
      list.appendChild(row);
    });
    createIcons({ icons: { UserRound } });
    loading?.classList.add("hidden");
    content?.classList.remove("hidden");
  } catch {
    loading?.classList.add("hidden");
    error?.classList.remove("hidden");
  }
}

void loadSong();
