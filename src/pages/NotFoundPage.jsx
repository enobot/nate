import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "../lib/router.jsx";

/** Shown for unknown addresses (also written to 404.html for GitHub Pages). */
export default function NotFoundPage({ navigated }) {
  const headingRef = useRef(null);

  useEffect(() => {
    if (navigated) headingRef.current?.focus({ preventScroll: true });
  }, [navigated]);

  return (
    <section aria-labelledby="not-found-heading" className="flex min-h-[70svh] items-center pt-24 pb-16">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <p className="hud-label text-amber">Error 404 · signal lost</p>
        <h1
          id="not-found-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 font-display text-3xl font-bold tracking-wide text-white sm:text-5xl"
        >
          Page not found
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted">
          This address doesn&apos;t match any page on the site. The link may be old or mistyped.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-linear-to-r from-electric-deep to-neon-purple-deep px-5 text-sm font-semibold text-white"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to the portfolio
          </Link>
          <Link
            to="/#projects"
            className="glass inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-semibold text-ink hover:text-white"
          >
            See projects
          </Link>
        </div>
      </div>
    </section>
  );
}
