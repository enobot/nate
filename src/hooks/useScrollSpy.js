import { useEffect, useState } from "react";

/**
 * Returns the id of the section currently in the middle of the screen,
 * so the navigation can highlight it.
 *
 * It watches a thin horizontal band across the middle of the viewport
 * (via IntersectionObserver), plus a scroll check so the last section
 * still activates when the page can't scroll it up to the middle.
 *
 * @param {string[]} ids - section ids in page order
 * @returns {string} the active id
 */
export function useScrollSpy(ids) {
  const [activeId, setActiveId] = useState(ids[0]);
  const key = ids.join("|");

  useEffect(() => {
    const sectionIds = key.split("|");
    const elements = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
    if (elements.length === 0) return undefined;

    let observer = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          const hit = entries.find((entry) => entry.isIntersecting);
          if (hit) setActiveId(hit.target.id);
        },
        { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
      );
      elements.forEach((element) => observer.observe(element));
    }

    let ticking = false;
    function checkBottom() {
      ticking = false;
      const scrolledToBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (scrolledToBottom && window.scrollY > 0) {
        setActiveId(sectionIds[sectionIds.length - 1]);
      }
    }
    function handleScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(checkBottom);
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
  }, [key]);

  return activeId;
}
