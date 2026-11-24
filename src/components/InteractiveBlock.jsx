import { useEffect, useState } from "react";

/**
 * A project page section that holds an interactive tool from
 * src/labs/registry.js. The pre-rendered HTML (and the first render in the
 * browser) shows a short loading message; the tool's code is fetched after
 * the page has loaded, so it never delays the rest of the page.
 */
export default function InteractiveBlock({ interactive, headingId }) {
  const [state, setState] = useState({ status: "loading", Component: null });

  useEffect(() => {
    let active = true;
    interactive.load().then(
      (module) => {
        if (active) setState({ status: "ready", Component: module.default });
      },
      () => {
        if (active) setState({ status: "error", Component: null });
      },
    );
    return () => {
      active = false;
    };
  }, [interactive]);

  const { status, Component } = state;
  // min-w-0 lets this grid item shrink to the page width, so wide parts of a
  // tool (long menus, access lists) scroll inside their own boxes, not the page.
  return (
    <section
      id={interactive.anchor}
      aria-labelledby={headingId}
      className="glass relative min-w-0 scroll-mt-24 rounded-2xl border border-cyan/25 p-5 sm:p-7"
    >
      <h2 id={headingId} className="hud-label text-cyan-soft">
        {interactive.title}
      </h2>
      <div className="mt-3">
        {status === "ready" ? <Component /> : null}
        {status === "loading" ? <p className="text-ink-muted">{interactive.loadingText}</p> : null}
        {status === "error" ? (
          <p role="alert" className="text-ink">
            {interactive.errorText}
          </p>
        ) : null}
      </div>
    </section>
  );
}
