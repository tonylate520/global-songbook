import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://global-song-index.pages.dev",
  output: "static",
  integrations: [sitemap({
    filter: (page) => {
      const pathname = new URL(page).pathname;
      return !pathname.startsWith("/search") && !pathname.startsWith("/song") && pathname !== "/404/";
    }
  })],
  build: {
    format: "directory"
  }
});
