import { useState } from "react";
import ProjectCard from "../components/ProjectCard.jsx";
import Reveal from "../components/Reveal.jsx";
import Section from "../components/Section.jsx";
import { PROJECT_STATUSES, projects } from "../data/projects.js";
import { cn } from "../lib/cn.js";

const ALL = "All";
const FILTERS = [ALL, ...PROJECT_STATUSES];

export default function Projects() {
  const [filter, setFilter] = useState(ALL);
  const visible = filter === ALL ? projects : projects.filter((project) => project.status === filter);

  const featuredProjects = visible.filter((project) => project.featured);
  const otherProjects = visible.filter((project) => !project.featured);

  const countFor = (value) =>
    value === ALL ? projects.length : projects.filter((project) => project.status === value).length;

  return (
    <Section
      id="projects"
      index="03"
      kicker="Technical Projects"
      title="Projects"
      intro="Each project page covers the problem, the solution, how it works, how it was tested, its limits, and who did what. Each one says whether it is a portfolio project or an expanded rebuild of coursework."
    >
      <div role="group" aria-label="Filter projects by status" className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((value) => {
          const pressed = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={pressed}
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-mono text-xs tracking-[0.12em] uppercase transition-[color,background-color,border-color] duration-200",
                pressed
                  ? "border-cyan/60 bg-cyan/10 text-cyan-soft"
                  : "border-electric-soft/15 text-ink-muted hover:border-electric-soft/40 hover:text-white",
              )}
            >
              {value}
              <span aria-hidden="true" className={cn("rounded px-1.5", pressed ? "bg-cyan/20" : "bg-navy-800/80")}>
                {countFor(value)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {visible.length} {visible.length === 1 ? "project" : "projects"}
      </p>

      {featuredProjects.length ? (
        <ul className="mb-6 grid gap-6 md:grid-cols-2">
          {featuredProjects.map((project, index) => (
            <li key={project.id}>
              <Reveal delay={index * 0.07} className="h-full">
                <ProjectCard project={project} featured />
              </Reveal>
            </li>
          ))}
        </ul>
      ) : null}

      {otherProjects.length ? (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {otherProjects.map((project, index) => (
            <li key={project.id}>
              <Reveal delay={(index % 3) * 0.07} className="h-full">
                <ProjectCard project={project} />
              </Reveal>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
