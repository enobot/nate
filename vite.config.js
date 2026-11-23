import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  buildRobotsTxt,
  buildSitemapXml,
  normalizeBasePath,
  normalizeSiteUrl,
} from "./config/seo.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * Writes robots.txt and sitemap.xml into dist/ during `npm run build`,
 * using the same site URL as the canonical and Open Graph tags.
 * @param {string} siteUrl
 * @returns {import("vite").Plugin}
 */
function seoFiles(siteUrl) {
  return {
    name: "seo-files",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: buildRobotsTxt(siteUrl) });
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: buildSitemapXml(siteUrl) });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Values from .env, overridden by real environment variables (the CI workflow sets them).
  const env = loadEnv(mode, projectRoot, "VITE_");
  const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL);

  return {
    // "/" for local development; the deploy workflow sets BASE_PATH to "/nate/"
    // (or whatever the repository is called) so asset URLs work on GitHub Pages.
    base: normalizeBasePath(process.env.BASE_PATH || "/"),
    plugins: [react(), tailwindcss(), seoFiles(siteUrl)],
    build: {
      // Writes the licenses of every bundled package (React, Motion, Lucide,
      // fonts, ...) to dist/third-party-licenses.txt, linked from the footer.
      license: { fileName: "third-party-licenses.txt" },
    },
    define: {
      // Makes the cleaned-up URL available to index.html as %VITE_SITE_URL%.
      "import.meta.env.VITE_SITE_URL": JSON.stringify(siteUrl),
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.js"],
      include: ["src/**/*.test.{js,jsx}", "config/**/*.test.js"],
    },
  };
});
