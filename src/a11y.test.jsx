import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App.jsx";
import { projects } from "./data/projects.js";
import { HOME_TITLE, headFor, matchRoute, projectPath } from "./lib/routes.js";

// Copy <html lang> from the real index.html and set the page <title> the
// build would produce, because the tests render into jsdom's blank page.
const LANG = readFileSync(resolve(process.cwd(), "index.html"), "utf8").match(/<html[^>]*\blang="([^"]+)"/)[1];

function setTitleFor(path) {
  document.title = headFor(matchRoute(path)).title;
}

beforeEach(() => {
  document.documentElement.lang = LANG;
  document.title = HOME_TITLE;
});

async function runAxe() {
  const results = await axe.run(document, {
    rules: {
      // jsdom does not render or lay out pages, so axe cannot compute real
      // foreground/background colors there. Contrast is checked in a real
      // browser instead (see the README's testing notes).
      "color-contrast": { enabled: false },
    },
  });
  // Guard against a vacuous pass: axe must actually have checked the page.
  expect(results.passes.length).toBeGreaterThan(20);
  return results.violations.map((violation) => ({
    id: violation.id,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

describe("accessibility (axe-core)", () => {
  it("has no violations on the home page", async () => {
    render(<App />);
    expect(await runAxe()).toEqual([]);
  });

  it("has no violations with the mobile menu open, a workflow step chosen and projects filtered", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("button", { name: /^Step 3:/ }));
    const filters = within(document.getElementById("projects")).getByRole("group", { name: "Filter projects by status" });
    await user.click(within(filters).getByRole("button", { name: /^In Development/ }));
    expect(await runAxe()).toEqual([]);
  });

  it.each(projects.map((project) => [project.title, projectPath(project)]))(
    "has no violations on the %s page",
    async (_title, path) => {
      setTitleFor(path);
      render(<App url={path} />);
      expect(await runAxe()).toEqual([]);
    },
  );

  it("has no violations on the not-found page", async () => {
    setTitleFor("/no-such-page/");
    render(<App url="/no-such-page/" />);
    expect(await runAxe()).toEqual([]);
  });
});
