import { useEffect, useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, CircleAlert } from "lucide-react";
import Chip from "../components/Chip.jsx";
import InteractiveBlock from "../components/InteractiveBlock.jsx";
import ProjectLinks from "../components/ProjectLinks.jsx";
import ProjectVisual from "../components/ProjectVisual.jsx";
import Reveal from "../components/Reveal.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { projects } from "../data/projects.js";
import { interactiveFor } from "../labs/registry.js";
import { assetUrl } from "../lib/assetUrl.js";
import { Link } from "../lib/router.jsx";
import { projectPath } from "../lib/routes.js";

/** A titled block on the project page. Only rendered when it has content. */
function Block({ id, title, children }) {
  return (
    <Reveal as="section" aria-labelledby={id} className="glass relative rounded-2xl p-5 sm:p-7">
      <h2 id={id} className="hud-label text-cyan-soft">
        {title}
      </h2>
      <div className="mt-3 text-ink-muted">{children}</div>
    </Reveal>
  );
}

function Bullets({ items }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rotate-45 bg-cyan" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const has = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value?.trim?.()));

/**
 * The detail page for one project: /projects/<id>/
 * Every section comes from src/data/projects.js and only appears when that
 * field is filled in, so the page never shows placeholder text.
 */
export default function ProjectPage({ project, navigated }) {
  const headingRef = useRef(null);
  const index = projects.indexOf(project);
  const previous = index > 0 ? projects[index - 1] : null;
  const next = index < projects.length - 1 ? projects[index + 1] : null;
  const completed = project.status === "Completed";
  const prefix = `project-${project.id}`;
  const interactive = interactiveFor(project);

  // After navigating here inside the site, move focus to the page title so
  // keyboard and screen-reader users start at the new content.
  useEffect(() => {
    if (navigated) headingRef.current?.focus({ preventScroll: true });
  }, [navigated, project.id]);

  return (
    <article aria-labelledby={`${prefix}-title`} className="pt-24 pb-20 sm:pt-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            to="/#projects"
            className="inline-flex min-h-11 items-center gap-2 rounded-md text-ink-muted transition-colors hover:text-cyan-soft"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            All projects
          </Link>
        </nav>

        {/* Header: what it is, its status, and where to go next */}
        <header className="mt-4 grid items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={project.status} />
              <span className="hud-label text-[0.7rem] text-ink-dim">{project.category}</span>
            </div>
            <h1
              id={`${prefix}-title`}
              ref={headingRef}
              tabIndex={-1}
              className="mt-4 font-display text-3xl leading-tight font-bold tracking-wide text-white sm:text-5xl"
            >
              {project.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-ink-muted">{project.summary}</p>
            <ul aria-label="Technologies" className="mt-6 flex flex-wrap gap-1.5">
              {project.tech.map((tech) => (
                <li key={tech}>
                  <Chip>{tech}</Chip>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-2">
              {interactive ? (
                <Link
                  to={`${projectPath(project)}#${interactive.anchor}`}
                  className="glow-frame relative inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-linear-to-r from-electric-deep to-neon-purple-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgb(61_123_255/0.7)] transition-[color,box-shadow,transform] duration-200 hover:shadow-[0_0_32px_-4px_rgb(168_85_247/0.75)] motion-safe:hover:-translate-y-0.5"
                >
                  <ArrowDown aria-hidden="true" className="size-4 shrink-0" />
                  {interactive.cta}
                </Link>
              ) : null}
              <ProjectLinks project={project} primaryFirst={!interactive} />
            </div>
          </div>
          <div className="glass hud-corners relative overflow-hidden rounded-2xl">
            <ProjectVisual project={project} eager />
          </div>
        </header>

        {!completed ? (
          <p className="mt-10 flex gap-3 rounded-xl border border-amber/35 bg-amber/8 p-4 text-sm text-ink sm:text-base">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber" />
            <span>
              <strong className="font-semibold text-amber">In development.</strong> This page describes the goals and
              what is finished so far. Results, screenshots, and links are added only after they have been checked.
            </span>
          </p>
        ) : null}

        <div className="mt-10 grid gap-5">
          {has(project.overview) ? (
            <Block id={`${prefix}-overview`} title="Overview">
              <p className="max-w-3xl text-base sm:text-lg">{project.overview}</p>
            </Block>
          ) : null}

          {interactive ? <InteractiveBlock interactive={interactive} headingId={`${prefix}-interactive`} /> : null}

          {has(project.problem) || has(project.solution) ? (
            <div className="grid gap-5 md:grid-cols-2">
              {has(project.problem) ? (
                <Block id={`${prefix}-problem`} title="Problem">
                  <p>{project.problem}</p>
                </Block>
              ) : null}
              {has(project.solution) ? (
                <Block id={`${prefix}-solution`} title="Solution">
                  <p>{project.solution}</p>
                </Block>
              ) : null}
            </div>
          ) : null}

          {has(project.details) ? (
            <Block id={`${prefix}-details`} title={completed ? "What I built" : "Goals"}>
              <Bullets items={project.details} />
            </Block>
          ) : null}

          {has(project.architecture) ? (
            <Block id={`${prefix}-architecture`} title="Architecture">
              <Bullets items={project.architecture} />
            </Block>
          ) : null}

          {has(project.testing) ? (
            <Block id={`${prefix}-testing`} title="Testing">
              <Bullets items={project.testing} />
            </Block>
          ) : null}

          {has(project.images) ? (
            <Block id={`${prefix}-images`} title="Screenshots & diagrams">
              <div className="grid gap-5 md:grid-cols-2">
                {project.images.map((image) => (
                  <figure key={image.src} className="overflow-hidden rounded-xl border border-electric-soft/12 bg-navy-950">
                    <a href={assetUrl(image.src)} target="_blank" rel="noopener" className="block">
                      <img
                        src={assetUrl(image.src)}
                        alt={image.alt}
                        width={image.width}
                        height={image.height}
                        loading="lazy"
                        decoding="async"
                        className="h-auto w-full bg-white/95 p-2"
                      />
                      <span className="sr-only"> (opens full size in a new tab)</span>
                    </a>
                    {image.caption ? (
                      <figcaption className="border-t border-electric-soft/12 px-4 py-3 text-sm text-ink-muted">
                        {image.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            </Block>
          ) : null}

          {has(project.lessons) ? (
            <Block id={`${prefix}-lessons`} title="Lessons learned">
              <Bullets items={project.lessons} />
            </Block>
          ) : null}
        </div>

        {/* Previous / next project */}
        <nav aria-label="More projects" className="mt-12 grid gap-4 border-t border-electric-soft/10 pt-8 sm:grid-cols-2">
          {previous ? (
            <Link
              to={projectPath(previous)}
              className="glass group flex min-h-11 flex-col rounded-xl p-4 transition-colors hover:border-cyan/40"
            >
              <span className="hud-label flex items-center gap-1.5 text-ink-dim">
                <ArrowLeft aria-hidden="true" className="size-3.5" /> Previous
              </span>
              <span className="mt-1 font-semibold text-white group-hover:text-cyan-soft">{previous.title}</span>
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          {next ? (
            <Link
              to={projectPath(next)}
              className="glass group flex min-h-11 flex-col rounded-xl p-4 text-right transition-colors hover:border-cyan/40 sm:items-end"
            >
              <span className="hud-label flex items-center gap-1.5 text-ink-dim sm:justify-end">
                Next <ArrowRight aria-hidden="true" className="size-3.5" />
              </span>
              <span className="mt-1 font-semibold text-white group-hover:text-cyan-soft">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </div>
    </article>
  );
}
