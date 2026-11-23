import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App.jsx";

// Copy <html lang> and <title> from the real index.html into the test document,
// because the tests render the app into jsdom's blank page.
beforeEach(() => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  document.documentElement.lang = html.match(/<html[^>]*\blang="([^"]+)"/)[1];
  document.title = html.match(/<title>([^<]+)<\/title>/)[1];
});

async function runAxe() {
  const results = await axe.run(document, {
    rules: {
      // jsdom does not render or lay out pages, so axe cannot compute real
      // foreground/background colors there. Contrast is instead handled by
      // the color tokens in src/index.css (checked by hand against WCAG AA).
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
  it("has no violations on initial render", async () => {
    render(<App />);
    expect(await runAxe()).toEqual([]);
  });

  it("has no violations with the mobile menu open, a project expanded and another skills tab selected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const firstCard = within(document.getElementById("projects")).getAllByRole("article")[0];
    await user.click(within(firstCard).getByRole("button", { name: /^Details/ }));
    const tabs = screen.getAllByRole("tab");
    await user.click(tabs[tabs.length - 1]);
    expect(await runAxe()).toEqual([]);
  });
});
