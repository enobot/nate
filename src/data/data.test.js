import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ICONS } from "../components/icons.js";
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

  it.each(projects)("$title only uses https links", (project) => {
    for (const key of ["github", "demo"]) {
      const url = project[key];
      if (url) expect(url, `${project.id}.${key}`).toMatch(/^https:\/\/\S+$/);
    }
  });

  it.each(projects)("$title uses a known icon and a well-formed screenshot (if any)", (project) => {
    if (project.icon) expect(Object.keys(ICONS)).toContain(project.icon);
    if (project.image) {
      expect(project.image.src).toBeTruthy();
      expect(project.image.src.startsWith("/")).toBe(false);
      expect(project.image.alt?.trim()).toBeTruthy();
      expect(project.image.width).toBeGreaterThan(0);
      expect(project.image.height).toBeGreaterThan(0);
      expect(existsSync(resolve(process.cwd(), "public", project.image.src))).toBe(true);
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

  it("builds absolute URLs from VITE_SITE_URL", () => {
    expect(html).toContain('<link rel="canonical" href="%VITE_SITE_URL%/" />');
    expect(html).toContain('<meta property="og:url" content="%VITE_SITE_URL%/" />');
  });
});
