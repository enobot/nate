import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App.jsx";
import { profile } from "../data/profile.js";
import { projects } from "../data/projects.js";
import { withBase } from "../lib/router.jsx";
import { projectPath } from "../lib/routes.js";

const renderPage = (project) => render(<App url={projectPath(project)} />);

describe("project pages", () => {
  it.each(projects)("$title page shows its title, status, summary and technologies", (project) => {
    renderPage(project);
    expect(screen.getByRole("heading", { level: 1, name: project.title })).toBeInTheDocument();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    const page = screen.getByRole("article", { name: project.title });
    expect(within(page).getAllByText(project.status).length).toBeGreaterThan(0);
    expect(within(page).getByText(project.summary)).toBeInTheDocument();
    const tech = within(page).getAllByRole("list", { name: "Technologies" })[0];
    project.tech.forEach((item) => expect(within(tech).getByText(item)).toBeInTheDocument());
  });

  it.each(projects)("$title page only shows sections that have content", (project) => {
    renderPage(project);
    const page = screen.getByRole("article", { name: project.title });
    const sections = [
      ["overview", "Overview"],
      ["problem", "Problem"],
      ["solution", "Solution"],
      ["architecture", "Architecture"],
      ["testing", "Testing"],
      ["images", "Screenshots & diagrams"],
      ["lessons", "Lessons learned"],
    ];
    for (const [field, heading] of sections) {
      const value = project[field];
      const filled = Array.isArray(value) ? value.length > 0 : Boolean(value);
      const found = within(page).queryByRole("heading", { level: 2, name: heading });
      if (filled) expect(found, `${project.id}: ${heading}`).not.toBeNull();
      else expect(found, `${project.id}: ${heading}`).toBeNull();
    }
  });

  it("labels unfinished projects clearly and their bullet list as goals", () => {
    for (const project of projects.filter((item) => item.status === "In Development")) {
      const { unmount } = renderPage(project);
      expect(screen.getByText("In development.")).toBeInTheDocument();
      if (project.details?.length) expect(screen.getByRole("heading", { level: 2, name: "Goals" })).toBeInTheDocument();
      unmount();
    }
  });

  it("does not show the in-development notice on completed projects", () => {
    for (const project of projects.filter((item) => item.status === "Completed")) {
      const { unmount } = renderPage(project);
      expect(screen.queryByText("In development.")).toBeNull();
      unmount();
    }
  });

  it("links back to the project list and to the neighbouring projects", () => {
    const project = projects[1];
    renderPage(project);
    expect(screen.getByRole("link", { name: "All projects" })).toHaveAttribute("href", withBase("/#projects"));
    const more = screen.getByRole("navigation", { name: "More projects" });
    expect(within(more).getByRole("link", { name: new RegExp(projects[0].title) })).toHaveAttribute(
      "href",
      withBase(projectPath(projects[0])),
    );
    expect(within(more).getByRole("link", { name: new RegExp(projects[2].title) })).toHaveAttribute(
      "href",
      withBase(projectPath(projects[2])),
    );
  });

  it("shows real images with their captions", () => {
    const project = projects.find((item) => item.images?.length);
    renderPage(project);
    for (const image of project.images) {
      const shown = screen.getAllByRole("img", { name: image.alt });
      expect(shown.length).toBeGreaterThan(0);
      if (image.caption) expect(screen.getByText(image.caption)).toBeInTheDocument();
    }
  });

  it("highlights Projects in the navigation", () => {
    renderPage(projects[0]);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
  });
});

describe("not-found page", () => {
  it("shows a clear message with a way back", () => {
    render(<App url="/projects/does-not-exist/" />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to the portfolio/ })).toHaveAttribute("href", withBase("/"));
    // The real header and footer are still there.
    expect(screen.getByRole("link", { name: new RegExp(profile.name) })).toBeInTheDocument();
  });
});
