import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ICONS } from "../components/icons.js";
import { headFor, headTags } from "../lib/routes.js";
import { profile } from "./profile.js";
import { PROJECT_STATUSES, projects } from "./projects.js";

// Any US-style phone number: 555-123-4567, (555) 123-4567, 555.123.4567, +1 555 123 4567
const PHONE_PATTERN = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}/;
// Words that describe plans or goals rather than finished work.
// ("Goal Seek" is excluded: it is the name of an Excel tool, not a goal.)
const GOAL_PHRASING = /\b(building|will|planned|planning|plan to|goals?(?!\s+seek)|coming soon|in progress|todo|tbd)\b/i;

const completed = projects.filter((project) => project.status === "Completed");
const inDevelopment = projects.filter((project) => project.status === "In Development");

describe("projects data", () => {
  it("has projects with unique ids", () => {
    expect(projects.length).toBeGreaterThan(0);
    const ids = projects.map((project) => project.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it.each(projects)("$title has a title, summary, valid status and tech list", (project) => {
    expect(project.title?.trim()).toBeTruthy();
    expect(project.summary?.trim()).toBeTruthy();
    expect(project.category?.trim()).toBeTruthy();
    expect(PROJECT_STATUSES).toContain(project.status);
    expect(Array.isArray(project.tech)).toBe(true);
    expect(project.tech.length).toBeGreaterThan(0);
    project.tech.forEach((tech) => expect(tech.trim()).toBeTruthy());
  });

  it.each(projects)("$title only uses known link types with https URLs", (project) => {
    for (const [key, url] of Object.entries(project.links ?? {})) {
      expect(["source", "demo", "docs", "video"], `${project.id}.links.${key}`).toContain(key);
      if (url) expect(url, `${project.id}.links.${key}`).toMatch(/^https:\/\/\S+$/);
    }
  });

  it.each(projects)("$title uses a known icon and well-formed images (if any)", (project) => {
    if (project.icon) expect(Object.keys(ICONS)).toContain(project.icon);
    for (const image of project.images ?? []) {
      expect(image.src).toBeTruthy();
      expect(image.src.startsWith("/")).toBe(false);
      expect(image.alt?.trim()).toBeTruthy();
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
      expect(existsSync(resolve(process.cwd(), "public", image.src)), image.src).toBe(true);
    }
  });

  it("only marks a project Completed without goal wording on its page either", () => {
    for (const project of completed) {
      for (const field of ["overview", "solution"]) {
        if (project[field]) expect(project[field], `${project.id}.${field}`).not.toMatch(GOAL_PHRASING);
      }
    }
  });

  it("describes completed projects as finished work, not goals", () => {
    expect(completed.length).toBeGreaterThan(0);
    for (const project of completed) {
      const text = [project.summary, ...(project.details ?? [])];
      text.forEach((line) => expect(line, `${project.id}: "${line}"`).not.toMatch(GOAL_PHRASING));
    }
  });

  it("describes in-development projects as goals, never as finished results", () => {
    for (const project of inDevelopment) {
      expect(project.summary, project.id).toMatch(GOAL_PHRASING);
      (project.details ?? []).forEach((line) => expect(line, `${project.id}: "${line}"`).toMatch(GOAL_PHRASING));
    }
  });
});

describe("profile data", () => {
  it("has the correct email and LinkedIn", () => {
    expect(profile.email).toBe("nathanaelahaig@gmail.com");
    expect(profile.linkedin).toBe("https://www.linkedin.com/in/nah28");
  });

  it("only uses https links", () => {
    expect(profile.linkedin).toMatch(/^https:\/\//);
    if (profile.github) expect(profile.github).toMatch(/^https:\/\/github\.com\/\S+$/);
  });

  it("contains no phone number anywhere", () => {
    const everything = JSON.stringify({ profile, projects });
    expect(everything).not.toMatch(PHONE_PATTERN);
    expect(everything).not.toMatch(/\b\d{10}\b/); // a phone number typed without separators
    expect(everything).not.toMatch(/tel:/i);
  });

  it("features the CSUF IT Telecommunications role first with the verified stats", () => {
    const [first] = profile.experience;
    expect(first.featured).toBe(true);
    expect(first.organization).toBe("California State University, Fullerton");
    expect(first.title).toBe("IT Telecommunications Student Assistant");
    const sentences = first.stats.map((stat) => [stat.kicker, stat.value, stat.label].filter(Boolean).join(" "));
    expect(sentences).toEqual([
      "~50 data/voice jack activations per week",
      "Team handles 100+ ServiceNow tickets per week",
      "Office moves of 50+ people supported",
      "Campus-wide coverage",
    ]);
  });

  it("groups skills into the five requested areas", () => {
    // Order is chosen so each two-column row pairs groups of similar height.
    expect(profile.skills.map((group) => group.label)).toEqual([
      "Networking",
      "IT Operations",
      "Databases",
      "Programming",
      "Systems",
    ]);
  });

  it("tags skills only with known evidence and never with proficiency levels", () => {
    for (const category of profile.skills) {
      expect(category.items.length).toBeGreaterThan(0);
      for (const item of category.items) {
        expect(Object.keys(item).sort()).toEqual(["name", "usedIn"]);
        item.usedIn.forEach((key) => expect(Object.keys(profile.evidence)).toContain(key));
      }
    }
  });

  it("points every resume download at a real PDF in public/", () => {
    expect(profile.resumes.length).toBeGreaterThan(0);
    for (const resume of profile.resumes) {
      expect(resume.file.startsWith("/")).toBe(false);
      const path = resolve(process.cwd(), "public", resume.file);
      expect(existsSync(path), resume.file).toBe(true);
      expect(readFileSync(path).subarray(0, 5).toString()).toBe("%PDF-");
    }
    expect(profile.resumes.filter((resume) => resume.primary)).toHaveLength(1);
  });
});

describe("index.html", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

  it("contains no phone number", () => {
    expect(html).not.toMatch(PHONE_PATTERN);
    expect(html).not.toMatch(/tel:/i);
  });

  it("has the placeholder where each page's <head> tags are inserted", () => {
    expect(html).toContain("<!--app-head-->");
    // Title, description and canonical come from src/lib/routes.js, not here.
    expect(html).not.toMatch(/<title>/);
  });

  it("builds absolute canonical and Open Graph URLs from the site URL", () => {
    const tags = headTags(headFor({ name: "home" }), "https://enobot.github.io/nate");
    expect(tags).toContain('<link rel="canonical" href="https://enobot.github.io/nate/" />');
    expect(tags).toContain('<meta property="og:url" content="https://enobot.github.io/nate/" />');
  });
});
