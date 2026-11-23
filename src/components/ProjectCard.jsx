import { useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { ChevronDown, ExternalLink, FolderGit2 } from "lucide-react";
import ButtonLink from "./ButtonLink.jsx";
import Chip from "./Chip.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { getIcon } from "./icons.js";
import { useSpotlight } from "../hooks/useSpotlight.js";
import { assetUrl } from "../lib/assetUrl.js";
import { cn } from "../lib/cn.js";

/**
 * Top of the card: the real screenshot if the project has one, otherwise a
 * themed graphic with the project's icon (never a fake screenshot).
 */
function ProjectVisual({ project }) {
  if (project.image?.src) {
    return (
      <img
        src={assetUrl(project.image.src)}
        alt={project.image.alt}
        width={project.image.width}
        height={project.image.height}
        loading="lazy"
        decoding="async"
        className="aspect-video w-full rounded-t-2xl border-b border-electric-soft/10 object-cover"
      />
    );
  }

  const Icon = getIcon(project.icon);
  const inDevelopment = project.status === "In Development";
  return (
    <div
      aria-hidden="true"
      className="grid-lines relative flex aspect-video items-center justify-center overflow-hidden rounded-t-2xl border-b border-electric-soft/10 bg-navy-950"
    >
      <div
        className={cn(
          "absolute inset-0",
          inDevelopment
            ? "bg-[radial-gradient(circle_at_50%_55%,rgb(251_191_36/0.14),transparent_60%)]"
            : "bg-[radial-gradient(circle_at_50%_55%,rgb(34_227_245/0.16),transparent_60%)]",
        )}
      />
      <div className="relative flex size-20 items-center justify-center rounded-2xl border border-cyan/30 bg-navy-900/80 shadow-[0_0_40px_-8px_rgb(61_123_255/0.8)] transition-transform duration-500 motion-safe:group-hover:scale-110 motion-safe:group-hover:rotate-3">
        <Icon className={cn("size-9", inDevelopment ? "text-amber" : "text-cyan")} />
      </div>
      <span className="hud-label absolute bottom-3 left-4 text-[0.62rem] text-ink-dim">
        {project.id}
      </span>
      {inDevelopment ? (
        <span className="absolute top-0 left-0 h-0.5 w-full bg-[repeating-linear-gradient(90deg,rgb(251_191_36/0.7)_0_12px,transparent_12px_24px)]" />
      ) : null}
    </div>
  );
}

/**
 * One project card with an expandable details section.
 * The details toggle is a real button with aria-expanded/aria-controls.
 */
export default function ProjectCard({ project }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const handlePointerMove = useSpotlight();

  const titleId = `project-title-${project.id}`;
  const detailsId = `project-details-${project.id}`;
  const details = project.details ?? [];
  const detailsHeading = project.status === "Completed" ? "Highlights" : "Goals";

  return (
    <article
      aria-labelledby={titleId}
      onPointerMove={handlePointerMove}
      className="glass glow-frame spotlight group relative flex h-full flex-col rounded-2xl transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-1 hover:shadow-[0_24px_60px_-28px_rgb(61_123_255/0.6)]"
    >
      <ProjectVisual project={project} />

      <div className="relative z-10 flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          <span className="hud-label text-[0.68rem] text-ink-dim">{project.category}</span>
        </div>

        <h3 id={titleId} className="mt-3 font-display text-lg font-bold tracking-wide text-white">
          {project.title}
        </h3>
        <p className="mt-2 text-sm text-ink-muted sm:text-base">{project.summary}</p>

        <ul aria-label="Technologies" className="mt-4 flex flex-wrap gap-1.5">
          {project.tech.map((tech) => (
            <li key={tech}>
              <Chip>{tech}</Chip>
            </li>
          ))}
        </ul>

        <div id={detailsId}>
          <AnimatePresence initial={false}>
            {open && details.length > 0 ? (
              <m.div
                key="details"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-5 rounded-xl border border-electric-soft/12 bg-navy-950/60 p-4">
                  <h4 className="hud-label text-cyan-soft">{detailsHeading}</h4>
                  <ul className="mt-3 space-y-2">
                    {details.map((item) => (
                      <li key={item} className="flex gap-2.5 text-sm text-ink-muted">
                        <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-cyan" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
          {details.length > 0 ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-electric-soft/20 px-4 text-sm font-semibold text-ink transition-colors hover:border-cyan/50 hover:text-white"
            >
              Details{" "}
              <span className="sr-only">for {project.title}</span>
              <ChevronDown
                aria-hidden="true"
                className={cn("size-4 transition-transform duration-300", open && "rotate-180")}
              />
            </button>
          ) : null}
          {project.github ? (
            <ButtonLink href={project.github} variant="ghost" icon={FolderGit2} external>
              GitHub{" "}
              <span className="sr-only">repository for {project.title}</span>
            </ButtonLink>
          ) : null}
          {project.demo ? (
            <ButtonLink href={project.demo} variant="ghost" icon={ExternalLink} external>
              Live demo{" "}
              <span className="sr-only">of {project.title}</span>
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </article>
  );
}
