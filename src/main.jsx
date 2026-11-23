import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts (bundled with the site; no requests to font CDNs).
import "@fontsource/orbitron/latin-700.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";

import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
