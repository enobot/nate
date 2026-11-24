import { describe, expect, it } from "vitest";
import { profile } from "./data/profile.js";
import { projects } from "./data/projects.js";
import { headFor, matchRoute, prerenderRoutes, render } from "./entry-server.jsx";

// The build renders every page with this function (scripts/prerender.mjs).
// These tests make sure each page renders to real HTML without errors.

// React escapes text in HTML output, e.g. "&" becomes "&amp;".
const asHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");

describe("server rendering", () => {
  it.each(prerenderRoutes().map((route) => [route.path]))("renders %s to HTML", (path) => {
    const html = render(path);
    expect(html.length).toBeGreaterThan(1000);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    const route = matchRoute(path);
    if (route.name === "project") expect(html).toContain(asHtml(route.project.title));
    if (route.name === "home") expect(html).toContain(asHtml(profile.hero.headline));
    if (route.name === "notFound") expect(html).toContain("Page not found");
    expect(headFor(route).title.length).toBeGreaterThan(0);
  });

  it("puts the hero text in the HTML fully visible (no hidden starting state)", () => {
    const html = render("/");
    const tagline = html.indexOf(asHtml(profile.hero.tagline));
    expect(tagline).toBeGreaterThan(-1);
    // Motion's hidden starting styles would appear inline as opacity:0.
    const heroSection = html.slice(html.indexOf('id="home"'), html.indexOf('id="about"'));
    expect(heroSection).not.toMatch(/opacity:\s*0/);
  });

  it("renders each project's details into its page", () => {
    for (const project of projects) {
      const html = render(`/projects/${project.id}/`);
      for (const detail of project.details ?? []) expect(html).toContain(asHtml(detail));
    }
  });
});
