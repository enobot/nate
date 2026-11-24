import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App.jsx";
import { PROJECT_LINK_TYPES } from "./components/ProjectLinks.jsx";
import { profile } from "./data/profile.js";
import { projects } from "./data/projects.js";
import { withBase } from "./lib/router.jsx";
import { projectPath } from "./lib/routes.js";

describe("project cards", () => {
  it("each open the project's own page", () => {
    render(<App />);
    const section = document.getElementById("projects");
    for (const project of projects) {
      const card = within(section).getByRole("article", { name: project.title });
      const link = within(card).getByRole("link", { name: `View project ${project.title}` });
      expect(link).toHaveAttribute("href", withBase(projectPath(project)));
      // The title is a link to the same page.
      expect(within(card).getByRole("link", { name: project.title })).toHaveAttribute("href", withBase(projectPath(project)));
    }
  });

  it("navigate to the project page without a reload, then Back returns home", async () => {
    const user = userEvent.setup();
    render(<App />);
    const project = projects.find((item) => item.details?.length);
    const card = within(document.getElementById("projects")).getByRole("article", { name: project.title });
    await user.click(within(card).getByRole("link", { name: `View project ${project.title}` }));

    const heading = await screen.findByRole("heading", { level: 1, name: project.title });
    expect(window.location.pathname).toBe(withBase(projectPath(project)));
    expect(document.title).toBe(`${project.title} | ${profile.name}`);
    // Focus moves to the new page's title for keyboard and screen-reader users.
    await waitFor(() => expect(heading).toHaveFocus());
    project.details.forEach((detail) => expect(screen.getByText(detail)).toBeInTheDocument());

    window.history.back();
    expect(await screen.findByRole("heading", { level: 1, name: profile.name })).toBeInTheDocument();
    expect(document.getElementById("projects")).not.toBeNull();
  });

  it("can be filtered by status", async () => {
    const user = userEvent.setup();
    render(<App />);
    const section = document.getElementById("projects");
    const filters = within(section).getByRole("group", { name: "Filter projects by status" });
    const inDevelopment = projects.filter((project) => project.status === "In Development");

    const devButton = within(filters).getByRole("button", { name: /^In Development/ });
    await user.click(devButton);
    expect(devButton).toHaveAttribute("aria-pressed", "true");
    const cards = within(section).getAllByRole("article");
    expect(cards).toHaveLength(inDevelopment.length);
    cards.forEach((card) => expect(within(card).getByText("In Development")).toBeInTheDocument());

    const allButton = within(filters).getByRole("button", { name: /^All/ });
    await user.click(allButton);
    expect(within(section).getAllByRole("article")).toHaveLength(projects.length);
  });

  it("show a link button only for links that are filled in", () => {
    render(<App />);
    for (const project of projects) {
      const card = screen.getByRole("article", { name: project.title });
      for (const { key, label } of PROJECT_LINK_TYPES) {
        const link = within(card).queryByRole("link", { name: new RegExp(`^${label} for ${project.title}`) });
        if (project.links?.[key]) {
          expect(link, `${project.id}.${key}`).toHaveAttribute("href", project.links[key]);
          expect(link).toHaveAttribute("target", "_blank");
          expect(link.getAttribute("rel")).toContain("noopener");
        } else {
          expect(link, `${project.id}.${key}`).toBeNull();
        }
      }
    }
  });
});

describe("skills", () => {
  it("shows all five groups at once, with every skill visible", () => {
    render(<App />);
    const skills = document.getElementById("skills");
    const groupHeadings = within(skills).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(groupHeadings).toEqual(["Networking", "IT Operations", "Programming", "Databases", "Systems"]);

    // No tabs: nothing is hidden behind a click.
    expect(within(skills).queryByRole("tablist")).toBeNull();
    for (const group of profile.skills) {
      const region = within(skills).getByRole("region", { name: group.label });
      group.items.forEach((item) => expect(within(region).getByText(item.name)).toBeVisible());
    }
  });

  it("shows where each skill was used", () => {
    render(<App />);
    const skills = document.getElementById("skills");
    for (const group of profile.skills) {
      const region = within(skills).getByRole("region", { name: group.label });
      for (const item of group.items) {
        const row = within(region).getByText(item.name).closest("li");
        item.usedIn.forEach((key) => expect(within(row).getByText(profile.evidence[key])).toBeInTheDocument());
      }
    }
  });
});

describe("jack activation workflow", () => {
  it("shows every step and moves the highlight to the chosen one", async () => {
    const user = userEvent.setup();
    render(<App />);
    const steps = profile.workflow.steps;
    steps.forEach((step) => expect(screen.getByText(step.text)).toBeInTheDocument());

    const first = screen.getByRole("button", { name: `Step 1: ${steps[0].label}` });
    const third = screen.getByRole("button", { name: `Step 3: ${steps[2].label}` });
    expect(first).toHaveAttribute("aria-pressed", "true");
    await user.click(third);
    expect(third).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
  });
});

describe("mobile menu", () => {
  it("opens, closes with Escape, and returns focus to the toggle", async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "mobile-menu");
    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Close menu");
    const menu = screen.getByRole("navigation", { name: "Mobile" });
    const links = within(menu).getAllByRole("link");
    expect(links).toHaveLength(7);

    // Move focus into the menu, then press Escape.
    links[2].focus();
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull());
  });

  it("closes when a link is chosen", async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    await user.click(toggle);
    const menu = screen.getByRole("navigation", { name: "Mobile" });
    await user.click(within(menu).getByRole("link", { name: /Projects/ }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("offers the resume download next to the section links", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const panel = document.getElementById("mobile-menu");
    expect(within(panel).getByRole("link", { name: /Download resume/ })).toHaveAttribute("download");
  });
});
