import { profile } from "../data/profile.js";
import { projects } from "../data/projects.js";

// Every page on the site and its <head> details (title, description, URLs).
// Used by the app (to set document.title while navigating), by the build-time
// pre-renderer (scripts/prerender.mjs), and by the sitemap.

export const HOME_TITLE = `${profile.name} | IT Support & Networking Portfolio`;
export const HOME_DESCRIPTION =
  "Nathanael Haig is an Information Systems student at Cal State Fullerton supporting the CSUF IT Telecommunications network analyst team: switch port activation, VLAN assignment, connectivity troubleshooting, and ServiceNow tickets.";

/** Site path of a project's detail page, e.g. "/projects/campus-network-lab/". */
export function projectPath(project) {
  return `/projects/${project.id}/`;
}

/**
 * Work out which page a path belongs to.
 * @param {string} path - normalized site path ("/", "/projects/x/", ...)
 * @returns {{ name: "home" } | { name: "project", project: object } | { name: "notFound" }}
 */
export function matchRoute(path) {
  if (path === "/") return { name: "home" };
  const match = /^\/projects\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/.exec(path);
  if (match) {
    const project = projects.find((item) => item.id === match[1]);
    if (project) return { name: "project", project };
  }
  return { name: "notFound" };
}

/**
 * <head> details for a route.
 * @returns {{ title: string, description: string, path: string | null, type: string, index: boolean }}
 */
export function headFor(route) {
  if (route.name === "project") {
    const { project } = route;
    return {
      title: `${project.title} | ${profile.name}`,
      description: `${project.status}: ${project.summary}`,
      path: projectPath(project),
      type: "article",
      index: true,
    };
  }
  if (route.name === "notFound") {
    return {
      title: `Page not found | ${profile.name}`,
      description: "This page doesn't exist. Head back to Nathanael Haig's portfolio.",
      path: null,
      type: "website",
      index: false,
    };
  }
  return { title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/", type: "profile", index: true };
}

/** Pages written to disk at build time, plus the GitHub Pages 404 page. */
export function prerenderRoutes() {
  return [
    { path: "/", file: "index.html" },
    ...projects.map((project) => ({ path: projectPath(project), file: `projects/${project.id}/index.html` })),
    { path: "/404/", file: "404.html" },
  ];
}

/** Paths listed in sitemap.xml (every indexable page). */
export function sitemapPaths() {
  return ["/", ...projects.map(projectPath)];
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for use inside HTML attributes and elements. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * The route-specific <head> tags as an HTML string.
 * @param {ReturnType<typeof headFor>} head
 * @param {string} siteUrl - absolute site URL without a trailing slash
 */
export function headTags(head, siteUrl) {
  const title = escapeHtml(head.title);
  const description = escapeHtml(head.description);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${head.index ? "index, follow" : "noindex"}" />`,
    `<meta property="og:type" content="${head.type}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];
  if (head.path) {
    const url = escapeHtml(`${siteUrl}${head.path}`);
    tags.push(`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`);
  }
  return tags.join("\n    ");
}
