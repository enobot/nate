import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App.jsx";
import { sections } from "./data/navigation.js";
import { profile } from "./data/profile.js";
import { projects } from "./data/projects.js";
import { assetUrl } from "./lib/assetUrl.js";

describe("App rendering", () => {
  it("renders all seven sections, each with its heading", () => {
    render(<App />);
    expect(sections.map((section) => section.id)).toEqual([
      "home",
      "about",
      "skills",
      "experience",
      "projects",
      "resume",
      "contact",
    ]);

    for (const section of sections) {
      const element = document.getElementById(section.id);
      expect(element, section.id).not.toBeNull();
      expect(element.tagName).toBe("SECTION");
      if (section.id === "home") {
        expect(within(element).getByRole("heading", { level: 1 })).toHaveAccessibleName(profile.name);
      } else {
        expect(within(element).getByRole("heading", { level: 2 })).toHaveTextContent(section.label);
      }
      // Each section is labelled by its heading, so it shows up as a landmark.
      expect(element).toHaveAttribute("aria-labelledby", `${section.id}-heading`);
    }
  });

  it("has exactly one h1", () => {
    render(<App />);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("has nav links that all point at sections that exist", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(sections.map((section) => section.label));
    for (const link of links) {
      const href = link.getAttribute("href");
      expect(href).toMatch(/^#[a-z-]+$/);
      expect(document.getElementById(href.slice(1)), href).not.toBeNull();
    }
  });

  it("has a skip link that targets the main content", () => {
    render(<App />);
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("never renders a phone number", () => {
    render(<App />);
    const html = document.documentElement.outerHTML;
    expect(html).not.toMatch(/\b\d{10}\b/); // a phone number typed without separators
    expect(html).not.toMatch(/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/);
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it("links to the correct email and LinkedIn", () => {
    render(<App />);
    const mailLinks = [...document.querySelectorAll('a[href^="mailto:"]')];
    expect(mailLinks.length).toBeGreaterThan(0);
    mailLinks.forEach((link) => expect(link).toHaveAttribute("href", "mailto:nathanaelahaig@gmail.com"));

    const linkedInLinks = [...document.querySelectorAll('a[href*="linkedin.com"]')];
    expect(linkedInLinks.length).toBeGreaterThan(0);
    linkedInLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "https://www.linkedin.com/in/nah28");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    });
  });

  it("hides GitHub links while no GitHub URL is set", () => {
    render(<App />);
    const anyGithubUrl = profile.github || projects.some((project) => project.github);
    if (!anyGithubUrl) {
      expect(screen.queryByRole("link", { name: /github/i })).toBeNull();
      expect(document.querySelector('a[href*="github.com"]')).toBeNull();
    }
  });

  it("offers both resume PDFs as downloads that respect the base path", () => {
    render(<App />);
    const resumeSection = document.getElementById("resume");
    for (const resume of profile.resumes) {
      const link = within(resumeSection).getByRole("link", { name: `Download PDF: ${resume.label}` });
      expect(link).toHaveAttribute("href", assetUrl(resume.file));
      expect(link.getAttribute("href").startsWith(import.meta.env.BASE_URL)).toBe(true);
      expect(link).toHaveAttribute("download");
      expect(link).toHaveAttribute("target", "_blank");
    }
    const heroDownload = within(document.getElementById("home")).getByRole("link", { name: /download resume/i });
    expect(heroDownload).toHaveAttribute("href", assetUrl(profile.resumes.find((resume) => resume.primary).file));
  });

  it("links to the third-party licenses file using the base path", () => {
    render(<App />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Licenses" })).toHaveAttribute(
      "href",
      `${import.meta.env.BASE_URL}third-party-licenses.txt`,
    );
  });

  it("features the CSUF role with the verified stat tiles", () => {
    render(<App />);
    const experience = document.getElementById("experience");
    const featured = within(experience).getByRole("article", { name: "IT Telecommunications Student Assistant" });
    const tiles = within(featured).getByRole("list", { name: "At a glance" });
    const text = within(tiles)
      .getAllByRole("listitem")
      .map((tile) => tile.textContent.replace(/\s+/g, " ").trim());
    expect(text).toEqual([
      "~50 data/voice jack activations per week",
      "Team handles 100+ ServiceNow tickets per week",
      "Office moves of 50+ people supported",
      "Campus-wide coverage",
    ]);
  });

  it("labels every project with its real status", () => {
    render(<App />);
    const projectSection = document.getElementById("projects");
    for (const project of projects) {
      const card = within(projectSection).getByRole("article", { name: project.title });
      expect(within(card).getByText(project.status)).toBeInTheDocument();
    }
  });

  it("does not show skill percentages or proficiency bars", () => {
    render(<App />);
    const skills = document.getElementById("skills");
    expect(skills.textContent).not.toMatch(/\d+\s*%/);
    expect(within(skills).queryByRole("progressbar")).toBeNull();
    expect(within(skills).queryByRole("meter")).toBeNull();
  });
});
