import { describe, expect, it } from "vitest";
import { projects } from "../data/projects.js";
import { escapeHtml, headFor, headTags, matchRoute, prerenderRoutes, projectPath, sitemapPaths } from "./routes.js";

describe("matchRoute", () => {
  it("finds the home page", () => {
    expect(matchRoute("/")).toEqual({ name: "home" });
  });

  it("finds every project page", () => {
    for (const project of projects) {
      expect(matchRoute(projectPath(project))).toEqual({ name: "project", project });
    }
  });

  it("returns notFound for unknown projects and other paths", () => {
    expect(matchRoute("/projects/no-such-project/").name).toBe("notFound");
    expect(matchRoute("/projects/").name).toBe("notFound");
    expect(matchRoute("/about/").name).toBe("notFound");
    expect(matchRoute("/projects/../etc/").name).toBe("notFound");
  });
});

describe("page <head> details", () => {
  it("gives each project page its own title, description and URL", () => {
    for (const project of projects) {
      const head = headFor({ name: "project", project });
      expect(head.title).toBe(`${project.title} | Nathanael Haig`);
      expect(head.description).toContain(project.status);
      expect(head.path).toBe(`/projects/${project.id}/`);
      expect(head.index).toBe(true);
    }
  });

  it("keeps the not-found page out of search results", () => {
    const head = headFor({ name: "notFound" });
    expect(head.index).toBe(false);
    const tags = headTags(head, "https://enobot.github.io/nate");
    expect(tags).toContain('<meta name="robots" content="noindex" />');
    expect(tags).not.toContain("canonical");
  });

  it("escapes text so data can't break the HTML", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
    const tags = headTags(
      { title: 'A "quoted" <title>', description: "x & y", path: "/", type: "website", index: true },
      "https://example.com",
    );
    expect(tags).toContain("<title>A &quot;quoted&quot; &lt;title&gt;</title>");
    expect(tags).toContain('content="x &amp; y"');
  });
});

describe("pre-rendered pages and sitemap", () => {
  it("writes the home page, every project page, and 404.html", () => {
    const routes = prerenderRoutes();
    expect(routes[0]).toEqual({ path: "/", file: "index.html" });
    for (const project of projects) {
      expect(routes).toContainEqual({ path: projectPath(project), file: `projects/${project.id}/index.html` });
    }
    expect(routes).toContainEqual({ path: "/404/", file: "404.html" });
  });

  it("lists every indexable page in the sitemap (not the 404 page)", () => {
    expect(sitemapPaths()).toEqual(["/", ...projects.map(projectPath)]);
  });
});
