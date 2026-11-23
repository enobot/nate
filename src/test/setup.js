// Test setup: runs before every test file.
//
// jsdom (the fake browser used by the tests) does not implement a few browser
// APIs that the site uses. The small stand-ins below only replace those missing
// browser APIs; the site's own components and data are always the real code.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount rendered components between tests (Vitest globals are off,
// so Testing Library cannot register this automatically).
afterEach(() => {
  cleanup();
});

// window.matchMedia: used for prefers-reduced-motion and breakpoint checks.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

// IntersectionObserver: used for scroll-spy, reveal-on-scroll and pausing
// the hero animation. This version never reports intersections.
if (!window.IntersectionObserver) {
  class IntersectionObserverStub {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.root = options.root ?? null;
      this.rootMargin = options.rootMargin ?? "0px";
      this.thresholds = [].concat(options.threshold ?? 0);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver = IntersectionObserverStub;
  globalThis.IntersectionObserver = IntersectionObserverStub;
}

// ResizeObserver: used by the hero canvas to follow its size.
if (!window.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub;
  globalThis.ResizeObserver = ResizeObserverStub;
}

// window.scrollTo: jsdom only logs "Not implemented" when an in-page #link is
// clicked (it has no layout to scroll). A silent no-op keeps test output clean.
window.scrollTo = () => {};

// Canvas 2D context: jsdom has no drawing support. This stand-in accepts any
// drawing call and property so the canvas code still runs end to end.
function createFake2dContext(canvas) {
  const state = { canvas };
  const context = new Proxy(state, {
    get(target, property) {
      if (property in target) return target[property];
      // Any drawing method (beginPath, arc, stroke, createRadialGradient, ...)
      // is a no-op that returns the context so chained calls keep working.
      return () => context;
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  return context;
}
HTMLCanvasElement.prototype.getContext = function getContext(type) {
  return type === "2d" ? createFake2dContext(this) : null;
};
