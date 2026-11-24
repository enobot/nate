import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App.jsx";

// Used only at build time by scripts/prerender.mjs: renders a page to HTML so
// GitHub Pages can serve real content for every route. In the browser,
// src/main.jsx then "hydrates" that HTML (attaches the interactivity).

/** @param {string} url - site path, e.g. "/" or "/projects/campus-network-lab/" */
export function render(url) {
  return renderToString(
    <StrictMode>
      <App url={url} />
    </StrictMode>,
  );
}

/** The public site URL the build was made for (set in .env / the deploy workflow). */
export function siteUrl() {
  return import.meta.env.VITE_SITE_URL;
}

export { headFor, headTags, matchRoute, prerenderRoutes } from "./lib/routes.js";
