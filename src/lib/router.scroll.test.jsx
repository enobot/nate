import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, useRouter } from "./router.jsx";

// Checks how the router scrolls after navigating: a new page starts at the top
// instantly; a #section on the same page scrolls smoothly.

let router;
function Capture() {
  router = useRouter();
  return <div id="skills">skills</div>;
}

describe("router scrolling", () => {
  let scrollTo;
  let scrollIntoView;

  beforeEach(() => {
    scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("jumps instantly to the top of a new page", () => {
    render(
      <RouterProvider>
        <Capture />
      </RouterProvider>,
    );
    act(() => router.navigate("/projects/campus-network-lab/"));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("scrolls smoothly to a section on the same page", () => {
    render(
      <RouterProvider>
        <Capture />
      </RouterProvider>,
    );
    act(() => router.navigate("/#skills"));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });
  });

  it("jumps instantly to a section when arriving from another page", () => {
    window.history.replaceState(null, "", "/projects/campus-network-lab/");
    render(
      <RouterProvider>
        <Capture />
      </RouterProvider>,
    );
    act(() => router.navigate("/#skills"));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "instant", block: "start" });
  });
});
