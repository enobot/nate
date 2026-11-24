// Interactive tools that a project page can show. A project opts in with
// `interactive: "<key>"` in src/data/projects.js.
//
// Each tool is loaded only in the browser, and only on its project's page,
// so its code and data never slow down the rest of the site.

export const INTERACTIVES = {
  "campus-policy-explorer": {
    title: "Policy explorer",
    // The section's id on the project page, used by "Try it" links.
    anchor: "policy-explorer",
    cta: "Try the policy explorer",
    cardCta: "Try it live",
    loadingText: "Loading the policy explorer. It runs in your browser and needs JavaScript.",
    errorText: "The policy explorer couldn't load. Reload the page to try again.",
    load: () => import("./campus-network/PolicyExplorer.jsx"),
  },
};

export const interactiveFor = (project) => (project.interactive ? INTERACTIVES[project.interactive] ?? null : null);
