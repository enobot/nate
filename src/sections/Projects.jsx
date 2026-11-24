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

  const countFor = (value) =>
    value === ALL ? projects.length : projects.filter((project) => project.status === value).length;

  return (
    <Section
      id="projects"
      index="04"
      kicker="Quest board"
      title="Projects"
      intro="Completed academic work and projects in development. Open any project for the full write-up: the problem, the approach, how it was tested, and links where they exist."
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

      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((project, index) => (
          <li key={project.id}>
            <Reveal delay={(index % 3) * 0.07} className="h-full">
              <ProjectCard project={project} />
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}
