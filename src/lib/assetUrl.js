/**
 * Build the URL for a file in the public/ folder (resume PDFs, screenshots).
 *
 * The site runs at "/" during local development but at "/nate/" on GitHub
 * Pages. Writing "/resume/file.pdf" directly would break on GitHub Pages, so
 * every public file URL goes through this helper.
 *
 * @param {string} path - path inside public/, e.g. "resume/Nathanael_Haig_Resume_Network.pdf"
 * @param {string} [base] - defaults to Vite's BASE_URL ("/" locally, "/nate/" on Pages)
 * @returns {string}
 */
export function assetUrl(path, base = import.meta.env.BASE_URL) {
  if (!path) return "";
  // Already a full URL (https:, mailto:, data:) or protocol-relative: leave it alone.
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) return path;

  const safeBase = base || "/";
  const normalizedBase = safeBase.endsWith("/") ? safeBase : `${safeBase}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}
