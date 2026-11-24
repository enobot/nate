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
import { headFor, headTags, sitemapPaths } from "./src/lib/routes.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * Writes robots.txt and sitemap.xml into dist/ during the browser build,
 * using the same site URL as the canonical and Open Graph tags.
 * @param {string} siteUrl
 * @returns {import("vite").Plugin}
 */
function seoFiles(siteUrl) {
  return {
    name: "seo-files",
    apply: (_config, env) => env.command === "build" && !env.isSsrBuild,
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: buildRobotsTxt(siteUrl) });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: buildSitemapXml(siteUrl, sitemapPaths()),
      });
    },
  };
}

/**
 * Fills the <!--app-head--> placeholder in index.html with the home page's
 * <head> tags (title, description, canonical, Open Graph). The build-time
 * pre-renderer later swaps in each page's own tags.
 * @param {string} siteUrl
 * @returns {import("vite").Plugin}
 */
function homeHeadTags(siteUrl) {
  return {
    name: "home-head-tags",
    transformIndexHtml(html) {
      const tags = headTags(headFor({ name: "home" }), siteUrl);
      return html.replace("<!--app-head-->", `<!--head:start-->\n    ${tags}\n    <!--head:end-->`);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Values from .env, overridden by real environment variables (the CI workflow sets them).
  const env = loadEnv(mode, projectRoot, "VITE_");
  const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL || env.VITE_SITE_URL);

  return {
    // "/" for local development. The deploy workflow sets BASE_PATH from GitHub
    // Pages: "/" on the custom domain, or "/<repository>/" on a github.io address.
    base: normalizeBasePath(process.env.BASE_PATH || "/"),
    plugins: [react(), tailwindcss(), seoFiles(siteUrl), homeHeadTags(siteUrl)],
    build: {
      // Writes the licenses of every bundled package (React, Motion, Lucide,
      // fonts, ...) to dist/third-party-licenses.txt, linked from the footer.
      license: { fileName: "third-party-licenses.txt" },
    },
    define: {
      // The cleaned-up public URL, used for canonical and Open Graph links.
      "import.meta.env.VITE_SITE_URL": JSON.stringify(siteUrl),
      // Copyright year, fixed at build time so the pre-rendered HTML and the
      // browser always agree.
      __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.js"],
      include: ["src/**/*.test.{js,jsx}", "config/**/*.test.js", "scripts/**/*.test.js"],
    },
  };
});
