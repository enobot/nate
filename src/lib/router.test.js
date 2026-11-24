import { describe, expect, it } from "vitest";
import { normalizePath, splitHash, stripBase, withBase } from "./router.jsx";

describe("router path helpers", () => {
  it.each([
    ["/nate/projects/lab/", "/nate/", "/projects/lab/"],
    ["/nate/", "/nate/", "/"],
    ["/nate", "/nate/", "/"],
    ["/projects/lab/", "/", "/projects/lab/"],
    ["/", "/", "/"],
  ])("stripBase(%j, %j) -> %j", (pathname, base, expected) => {
    expect(stripBase(pathname, base)).toBe(expected);
  });

  it.each([
    ["/projects/lab/", "/nate/", "/nate/projects/lab/"],
    ["/#skills", "/nate/", "/nate/#skills"],
    ["/", "/nate/", "/nate/"],
    ["/projects/lab/", "/", "/projects/lab/"],
    ["https://github.com/enobot/x", "/nate/", "https://github.com/enobot/x"],
    ["mailto:a@example.com", "/nate/", "mailto:a@example.com"],
  ])("withBase(%j, %j) -> %j", (to, base, expected) => {
    expect(withBase(to, base)).toBe(expected);
  });

  it.each([
    ["/", "/"],
    ["/projects/lab", "/projects/lab/"],
    ["projects/lab/", "/projects/lab/"],
    ["//projects//lab", "/projects/lab/"],
  ])("normalizePath(%j) -> %j", (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it("splits a hash off a path", () => {
    expect(splitHash("/#skills")).toEqual({ path: "/", hash: "#skills" });
    expect(splitHash("/projects/lab/")).toEqual({ path: "/projects/lab/", hash: "" });
    expect(splitHash("#top")).toEqual({ path: "/", hash: "#top" });
  });
});
