// Small helpers used by vite.config.js at build time.
// They live in their own file so they can be unit tested.

export const DEFAULT_SITE_URL = "https://enobot.github.io/nate";

/**
 * Clean up the public site URL: trim spaces and remove trailing slashes.
 * Throws a clear error if the value is not an http(s) URL, so a typo in
 * .env or the workflow fails the build instead of shipping broken tags.
 * @param {string | undefined} value
 * @returns {string} e.g. "https://enobot.github.io/nate"
 */
export function normalizeSiteUrl(value) {
  const url = (value || DEFAULT_SITE_URL).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+/.test(url)) {
    throw new Error(
      `VITE_SITE_URL must be a full URL like "${DEFAULT_SITE_URL}", but got "${value}".`,
    );
  }
  return url;
}

/**
 * Turn BASE_PATH into the form Vite expects: leading and trailing slash.
 * "" -> "/", "nate" -> "/nate/", "/nate" -> "/nate/", "/nate/" -> "/nate/"
 * @param {string | undefined} value
 * @returns {string}
 */
export function normalizeBasePath(value) {
  // Git Bash on Windows silently rewrites "/nate/" into "C:/Program Files/Git/nate/".
  // Fail loudly instead of producing a site with broken asset links.
  if (/^\/?[A-Za-z]:[\\/]/.test((value || "").trim())) {
    throw new Error(
      `BASE_PATH "${value}" looks like a Windows file path. In Git Bash, run the command ` +
        `with MSYS_NO_PATHCONV=1 (e.g. MSYS_NO_PATHCONV=1 BASE_PATH=/nate/ npm run build) or use PowerShell.`,
    );
  }
  const trimmed = (value || "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

/**
 * Contents of robots.txt.
 * @param {string} siteUrl - normalized site URL (no trailing slash)
 */
export function buildRobotsTxt(siteUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

/**
 * Contents of sitemap.xml. The site is a single page, so it has one entry.
 * @param {string} siteUrl - normalized site URL (no trailing slash)
 * @param {Date} [date] - used for <lastmod>, defaults to the build date
 */
export function buildSitemapXml(siteUrl, date = new Date()) {
  const lastmod = date.toISOString().slice(0, 10);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${siteUrl}/</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    "  </url>",
    "</urlset>",
    "",
  ].join("\n");
}
