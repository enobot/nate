import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.js";

/**
 * Fades content in the first time it scrolls into view.
 *
 * The hiding and the animation are plain CSS (see `.reveal` in index.css) and
 * only apply when JavaScript is running (the `js` class on <html>). So the
 * pre-rendered HTML is fully visible to search engines, to readers with
 * JavaScript turned off, and when printing. Reduced-motion users get the
 * content without the slide.
 */
export default function Reveal({ children, className, delay = 0, as: Tag = "div", ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn("reveal", visible && "is-visible", className)}
      style={delay ? { "--reveal-delay": `${delay}s` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
