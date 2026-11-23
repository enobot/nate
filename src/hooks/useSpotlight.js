import { useCallback } from "react";

/**
 * Pointer-move handler that stores the pointer position in CSS variables
 * (--mx, --my) on the element. The `spotlight` CSS utility uses them to draw
 * a soft glow under the pointer. Writing CSS variables directly avoids
 * re-rendering React on every mouse move.
 */
export function useSpotlight() {
  return useCallback((event) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    element.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    element.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);
}
