import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://kugou9.com",
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
