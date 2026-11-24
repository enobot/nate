import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

// Self-hosted fonts (bundled with the site; no requests to font CDNs).
import "@fontsource/orbitron/latin-700.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";

import "./index.css";
import App from "./App.jsx";

const container = document.getElementById("root");
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Production pages arrive pre-rendered (scripts/prerender.mjs), so React only
// needs to attach event handlers to the existing HTML ("hydrate").
// In `npm run dev` the page starts empty, so React renders it from scratch.
if (container.hasChildNodes()) hydrateRoot(container, app);
else createRoot(container).render(app);
