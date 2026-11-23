import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NetworkCanvas, { nodeCountFor } from "./NetworkCanvas.jsx";

// jsdom has no layout engine, so canvas size is provided for these tests.
function fakeCanvasSize(width, height) {
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {},
  });
}

function setDevicePixelRatio(value) {
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
}

function setDocumentHidden(value) {
  Object.defineProperty(document, "hidden", { value, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  setDevicePixelRatio(1);
  setDocumentHidden(false);
});

describe("nodeCountFor", () => {
  it("scales with area but stays within limits", () => {
    expect(nodeCountFor(100, 100)).toBe(18);
    expect(nodeCountFor(800, 600)).toBe(30);
    expect(nodeCountFor(5000, 3000)).toBe(80);
  });
});

describe("NetworkCanvas", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<NetworkCanvas />);
    expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
  });

  it("caps the device pixel ratio at 2", () => {
    fakeCanvasSize(400, 300);
    setDevicePixelRatio(3);
    const { container } = render(<NetworkCanvas />);
    const canvas = container.querySelector("canvas");
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it("starts an animation loop and cancels it on unmount", () => {
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = render(<NetworkCanvas />);
    expect(requestFrame).toHaveBeenCalled();
    unmount();
    expect(cancelFrame).toHaveBeenCalled();
  });

  it("draws one still frame and never animates when reduced motion is preferred", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }));
    const clearRect = vi.fn();
    const getContext = HTMLCanvasElement.prototype.getContext;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function wrapped(type) {
      const context = getContext.call(this, type);
      context.clearRect = clearRect;
      return context;
    });
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");

    render(<NetworkCanvas />);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(clearRect).toHaveBeenCalled(); // a static frame was drawn
  });

  it("pauses while the browser tab is hidden and resumes when visible", () => {
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    render(<NetworkCanvas />);
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");

    act(() => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(cancelFrame).toHaveBeenCalled();

    act(() => {
      setDocumentHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requestFrame).toHaveBeenCalled();
  });
});
