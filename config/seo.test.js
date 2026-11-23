import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_URL,
  buildRobotsTxt,
  buildSitemapXml,
  normalizeBasePath,
  normalizeSiteUrl,
} from "./seo.js";

describe("normalizeSiteUrl", () => {
  it("defaults to the GitHub Pages URL", () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl("")).toBe(DEFAULT_SITE_URL);
  });

  it("removes trailing slashes and spaces", () => {
    expect(normalizeSiteUrl(" https://enobot.github.io/nate/ ")).toBe("https://enobot.github.io/nate");
    expect(normalizeSiteUrl("https://example.com//")).toBe("https://example.com");
  });

  it("rejects values that are not full URLs", () => {
    expect(() => normalizeSiteUrl("enobot.github.io/nate")).toThrow(/VITE_SITE_URL/);
    expect(() => normalizeSiteUrl("/nate")).toThrow(/VITE_SITE_URL/);
  });
});

describe("normalizeBasePath", () => {
  it.each([
    [undefined, "/"],
    ["", "/"],
    ["/", "/"],
    ["nate", "/nate/"],
    ["/nate", "/nate/"],
    ["/nate/", "/nate/"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  it("rejects a path that Git Bash converted into a Windows path", () => {
    expect(() => normalizeBasePath("C:/Program Files/Git/nate/")).toThrow(/MSYS_NO_PATHCONV/);
    expect(() => normalizeBasePath("/C:/Program Files/Git/nate/")).toThrow(/Windows file path/);
  });
});

describe("robots.txt and sitemap.xml", () => {
  it("points robots.txt at the sitemap", () => {
    expect(buildRobotsTxt("https://enobot.github.io/nate")).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://enobot.github.io/nate/sitemap.xml\n",
    );
  });

  it("lists the home page in the sitemap", () => {
    const xml = buildSitemapXml("https://enobot.github.io/nate", new Date("2026-11-22T12:00:00Z"));
    expect(xml).toContain("<loc>https://enobot.github.io/nate/</loc>");
    expect(xml).toContain("<lastmod>2026-11-22</lastmod>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});
