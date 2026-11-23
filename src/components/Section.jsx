import Reveal from "./Reveal.jsx";

/**
 * A page section with a numbered HUD-style heading.
 * The heading gets an id so the <section> can be labelled by it.
 */
export default function Section({ id, index, kicker, title, intro, children }) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mb-10 max-w-3xl sm:mb-14">
          <p className="hud-label flex items-center gap-3 text-cyan-soft">
            <span aria-hidden="true" className="text-ink-dim">
              {index}
            </span>
            <span aria-hidden="true" className="h-px w-10 bg-linear-to-r from-cyan to-transparent" />
            <span>{kicker}</span>
          </p>
          <h2
            id={headingId}
            className="mt-3 font-display text-2xl font-bold tracking-wide text-white sm:text-4xl"
          >
            {title}
          </h2>
          {intro ? <p className="mt-4 text-base text-ink-muted sm:text-lg">{intro}</p> : null}
        </Reveal>
        {children}
      </div>
    </section>
  );
}
