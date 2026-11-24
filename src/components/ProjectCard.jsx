import { ArrowRight, MousePointerClick, Star } from "lucide-react";
import Chip from "./Chip.jsx";
import ProjectLinks from "./ProjectLinks.jsx";
import ProjectVisual from "./ProjectVisual.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { useSpotlight } from "../hooks/useSpotlight.js";
import { interactiveFor } from "../labs/registry.js";
import { Link } from "../lib/router.jsx";
import { projectPath } from "../lib/routes.js";

const MAX_BADGES = 5;
const MAX_BADGES_FEATURED = 8;

/**
 * One project card. Every card has the same layout: preview, status,
 * title, summary, technology badges, then the calls to action. The title
 * and "View project" both open the project's own page.
 */
export default function ProjectCard({ project, featured = false }) {
  const handlePointerMove = useSpotlight();
  const titleId = `project-title-${project.id}`;
  const shownTech = project.tech.slice(0, featured ? MAX_BADGES_FEATURED : MAX_BADGES);
  const hiddenTech = project.tech.length - shownTech.length;
  const interactive = interactiveFor(project);

  return (
    <article
      aria-labelledby={titleId}
      onPointerMove={handlePointerMove}
      className="glass glow-frame spotlight group relative flex h-full flex-col overflow-hidden rounded-2xl transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-1 hover:shadow-[0_24px_60px_-28px_rgb(61_123_255/0.6)] focus-within:shadow-[0_24px_60px_-28px_rgb(61_123_255/0.6)]"
    >
      <ProjectVisual project={project} className="border-b border-electric-soft/10" />

      <div className="relative z-10 flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          {featured ? (
            <span className="hud-label inline-flex items-center gap-1 text-[0.68rem] text-amber">
              <Star aria-hidden="true" className="size-3" />
              Featured
            </span>
          ) : null}
          <span className="hud-label text-[0.68rem] text-ink-dim">{project.category}</span>
        </div>

        <h3 id={titleId} className="mt-3 font-display text-lg font-bold tracking-wide text-white">
          <Link to={projectPath(project)} className="rounded-sm hover:text-cyan-soft">
            {project.title}
          </Link>
        </h3>
        <p className="mt-2 text-sm text-ink-muted sm:text-base">{project.summary}</p>

        <ul aria-label="Technologies" className="mt-4 flex flex-wrap gap-1.5">
          {shownTech.map((tech) => (
            <li key={tech}>
              <Chip>{tech}</Chip>
            </li>
          ))}
          {hiddenTech > 0 ? (
            <li>
              <Chip className="text-ink-dim">+{hiddenTech} more</Chip>
            </li>
          ) : null}
        </ul>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
          <Link
            to={projectPath(project)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-cyan/35 bg-cyan/8 px-4 text-sm font-semibold text-cyan-soft transition-colors hover:border-cyan/70 hover:text-white"
          >
            View project{" "}
            <span className="sr-only">{project.title}</span>
            <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
          </Link>
          {interactive ? (
            <Link
              to={`${projectPath(project)}#${interactive.anchor}`}
              className="glow-frame glass relative inline-flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold text-ink transition-colors hover:text-white"
            >
              <MousePointerClick aria-hidden="true" className="size-4 shrink-0 text-cyan" />
              {interactive.cardCta}
              <span className="sr-only">: {interactive.title} for {project.title}</span>
            </Link>
          ) : null}
          <ProjectLinks project={project} size="sm" />
        </div>
      </div>
    </article>
  );
}
