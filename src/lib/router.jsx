import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

// A small client-side router for the site's few pages: the home page,
// one page per project, and a not-found page.
//
// Why not a routing library? The site only needs path matching, links, and
// back/forward support, so ~150 lines of plain React keep the bundle small
// and make the behavior easy to explain.
//
// Every page is also pre-rendered to real HTML at build time
// (scripts/prerender.mjs), so links work and content shows even before
// JavaScript loads. This router then takes over for instant navigation.

const BASE = import.meta.env.BASE_URL; // "/" locally, "/nate/" on GitHub Pages

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function withTrailingSlash(base) {
  return base.endsWith("/") ? base : `${base}/`;
}

/**
 * Remove the deploy base from a browser path.
 * "/nate/projects/lab/" -> "/projects/lab/", "/nate" -> "/"
 * @param {string} pathname
 * @param {string} [base]
 */
export function stripBase(pathname, base = BASE) {
  const prefix = withTrailingSlash(base || "/");
  if (pathname === prefix.slice(0, -1)) return "/";
  if (pathname.startsWith(prefix)) return `/${pathname.slice(prefix.length)}`;
  return pathname || "/";
}

/**
 * Add the deploy base to an in-site path. Full URLs are returned unchanged.
 * "/projects/lab/" -> "/nate/projects/lab/", "/#skills" -> "/nate/#skills"
 * @param {string} to
 * @param {string} [base]
 */
export function withBase(to, base = BASE) {
  if (/^[a-z][a-z\d+.-]*:/i.test(to) || to.startsWith("//")) return to;
  return `${withTrailingSlash(base || "/")}${to.replace(/^\/+/, "")}`;
}

/**
 * Pages are folders on GitHub Pages ("/projects/lab/"), so every path except
 * the root ends with a slash. "/projects/lab" and "projects/lab/" both become
 * "/projects/lab/".
 * @param {string} path
 */
export function normalizePath(path) {
  let normalized = path.startsWith("/") ? path : `/${path}`;
  normalized = normalized.replace(/\/{2,}/g, "/");
  if (normalized !== "/" && !normalized.endsWith("/")) normalized += "/";
  return normalized;
}

/** Split "/path/#hash" into its path and hash ("#hash" or ""). */
export function splitHash(to) {
  const index = to.indexOf("#");
  if (index === -1) return { path: to || "/", hash: "" };
  return { path: to.slice(0, index) || "/", hash: to.slice(index) };
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Jump (don't glide) to a position. The site's CSS turns on smooth scrolling
// for in-page links; a new page should still start at the top immediately.
function jumpTo(top) {
  window.scrollTo({ top, left: 0, behavior: "instant" });
}

function readBrowserLocation(action, key) {
  return {
    path: normalizePath(stripBase(window.location.pathname)),
    hash: window.location.hash,
    action,
    key,
  };
}

const RouterContext = createContext(null);

/**
 * Provides the current location to the app.
 * @param {{ url?: string, children: import("react").ReactNode }} props
 *   `url` is only passed when pre-rendering on the server (e.g. "/projects/lab/").
 */
export function RouterProvider({ url, children }) {
  const [location, setLocation] = useState(() => {
    if (url != null) {
      const { path, hash } = splitHash(url);
      return { path: normalizePath(path), hash, action: "initial", key: "initial" };
    }
    return readBrowserLocation("initial", window.history.state?.key ?? "initial");
  });

  // Scroll positions per history entry, so Back returns to where you were.
  const scrollPositions = useRef(new Map());
  const currentKey = useRef(location.key);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    function onPopState(event) {
      scrollPositions.current.set(currentKey.current, window.scrollY);
      const key = event.state?.key ?? "initial";
      currentKey.current = key;
      setLocation((previous) => ({ ...readBrowserLocation("pop", key), previousPath: previous.path }));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to) => {
    const { path, hash } = splitHash(to);
    const nextPath = normalizePath(path);
    scrollPositions.current.set(currentKey.current, window.scrollY);
    const key = Math.random().toString(36).slice(2, 10);
    currentKey.current = key;
    window.history.pushState({ key }, "", `${withBase(nextPath)}${hash}`);
    setLocation((previous) => ({ path: nextPath, hash, action: "push", key, previousPath: previous.path }));
  }, []);

  // After each in-app navigation: restore the old position on Back/Forward,
  // otherwise jump to the #section (if any) or the top of the new page.
  useIsomorphicLayoutEffect(() => {
    if (location.action === "initial") return; // the browser handles the first load
    if (location.action === "pop") {
      const saved = scrollPositions.current.get(location.key);
      if (saved != null) {
        jumpTo(saved);
        return;
      }
    }
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) {
        // Smooth within the same page; instant when arriving from another page.
        const samePage = location.previousPath === location.path;
        target.scrollIntoView({ behavior: samePage && !prefersReducedMotion() ? "smooth" : "instant", block: "start" });
        return;
      }
    }
    jumpTo(0);
  }, [location]);

  return <RouterContext.Provider value={{ location, navigate }}>{children}</RouterContext.Provider>;
}

/** @returns {{ location: { path: string, hash: string, action: string, key: string, previousPath?: string }, navigate: (to: string) => void }} */
export function useRouter() {
  const context = useContext(RouterContext);
  if (!context) throw new Error("useRouter must be used inside <RouterProvider>.");
  return context;
}

/**
 * An in-site link. It is a normal <a href> (so it works without JavaScript,
 * can be opened in a new tab, and is crawlable), but plain left-clicks are
 * handled by the router so the page doesn't reload.
 * `to` is a site path such as "/projects/lab/" or "/#skills".
 */
export function Link({ to, onClick, children, ...rest }) {
  const { navigate } = useRouter();

  function handleClick(event) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === "_blank" ||
      rest.download != null
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  }

  return (
    <a href={withBase(to)} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
