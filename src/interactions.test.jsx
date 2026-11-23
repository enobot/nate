import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App.jsx";
import { profile } from "./data/profile.js";
import { projects } from "./data/projects.js";

describe("project cards", () => {
  it("expand and collapse their details with aria-expanded", async () => {
    const user = userEvent.setup();
    render(<App />);
    const project = projects.find((item) => item.details?.length);
    const card = screen.getByRole("article", { name: project.title });
    const toggle = within(card).getByRole("button", { name: `Details for ${project.title}` });

    const region = document.getElementById(toggle.getAttribute("aria-controls"));
    expect(region).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(region).queryByText(project.details[0])).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    project.details.forEach((detail) => expect(within(region).getByText(detail)).toBeInTheDocument());

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(within(region).queryByText(project.details[0])).toBeNull());
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

  it("hide GitHub and demo buttons when no URL is set", () => {
    render(<App />);
    for (const project of projects) {
      const card = screen.getByRole("article", { name: project.title });
      const github = within(card).queryByRole("link", { name: /github/i });
      const demo = within(card).queryByRole("link", { name: /live demo/i });
      if (project.github) expect(github).toHaveAttribute("href", project.github);
      else expect(github).toBeNull();
      if (project.demo) expect(demo).toHaveAttribute("href", project.demo);
      else expect(demo).toBeNull();
    }
  });
});

describe("skills tabs", () => {
  it("move with the arrow keys and update aria-selected", async () => {
    const user = userEvent.setup();
    render(<App />);
    const tablist = screen.getByRole("tablist", { name: "Skill categories" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(profile.skills.length);

    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[0]]);

    await user.click(tabs[0]);
    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1]).toHaveFocus();
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[1]]);

    // Only the selected panel is shown, and it belongs to the selected tab.
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[1].id);
    expect(tabs[1]).toHaveAttribute("aria-controls", panel.id);
    profile.skills[1].items.forEach((item) => expect(within(panel).getByText(item.name)).toBeInTheDocument());

    await user.keyboard("{ArrowLeft}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveFocus();

    // Wraps around from the first tab to the last.
    await user.keyboard("{ArrowLeft}");
    expect(tabs[tabs.length - 1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[tabs.length - 1]).toHaveFocus();

    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(tabs[tabs.length - 1]).toHaveAttribute("aria-selected", "true");
  });

  it("show where each skill was used", () => {
    render(<App />);
    const panel = screen.getByRole("tabpanel");
    const firstSkill = profile.skills[0].items[0];
    const slot = within(panel).getByText(firstSkill.name).closest("li");
    firstSkill.usedIn.forEach((key) => expect(within(slot).getByText(profile.evidence[key])).toBeInTheDocument());
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
});
