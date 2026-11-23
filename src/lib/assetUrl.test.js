import { describe, expect, it } from "vitest";
import { assetUrl } from "./assetUrl.js";

describe("assetUrl", () => {
  it("prefixes the GitHub Pages sub-path", () => {
    expect(assetUrl("resume/file.pdf", "/nate/")).toBe("/nate/resume/file.pdf");
  });

  it("does not double up slashes", () => {
    expect(assetUrl("/resume/file.pdf", "/nate/")).toBe("/nate/resume/file.pdf");
    expect(assetUrl("resume/file.pdf", "/nate")).toBe("/nate/resume/file.pdf");
  });

  it("works at the domain root", () => {
    expect(assetUrl("resume/file.pdf", "/")).toBe("/resume/file.pdf");
  });

  it("supports a relative base", () => {
    expect(assetUrl("resume/file.pdf", "./")).toBe("./resume/file.pdf");
  });

  it("leaves full URLs untouched", () => {
    expect(assetUrl("https://example.com/a.png", "/nate/")).toBe("https://example.com/a.png");
    expect(assetUrl("mailto:someone@example.com", "/nate/")).toBe("mailto:someone@example.com");
    expect(assetUrl("//cdn.example.com/a.png", "/nate/")).toBe("//cdn.example.com/a.png");
  });

  it("uses Vite's BASE_URL by default", () => {
    expect(assetUrl("resume/file.pdf")).toBe(`${import.meta.env.BASE_URL}resume/file.pdf`);
  });

  it("returns an empty string for an empty path", () => {
    expect(assetUrl("")).toBe("");
    expect(assetUrl(undefined)).toBe("");
  });
});
