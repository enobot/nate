import { Briefcase, MapPin } from "lucide-react";
import Chip from "../components/Chip.jsx";
import JackWorkflow from "../components/JackWorkflow.jsx";
import Reveal from "../components/Reveal.jsx";
import Section from "../components/Section.jsx";
import { getIcon } from "../components/icons.js";
import { profile } from "../data/profile.js";

/** One stat tile. Reads as a sentence: kicker + value + label. */
function StatTile({ stat }) {
  const Icon = getIcon(stat.icon);
  // Long values like "Campus-wide" use a smaller size so they stay on one line.
  const valueSize = stat.value.length > 6 ? "text-xl" : "text-2xl sm:text-3xl";
  return (
    <li className="glow-frame relative rounded-xl border border-electric-soft/12 bg-navy-950/60 p-4 transition-shadow duration-300 hover:shadow-[0_0_28px_-12px_rgb(34_227_245/0.9)]">
      <Icon aria-hidden="true" className="size-5 text-cyan" />
      <p className="mt-3 flex flex-col">
        {stat.kicker ? <span className="hud-label text-ink-dim">{stat.kicker} </span> : null}
        <span className={`font-display font-bold tracking-wide whitespace-nowrap text-white ${valueSize}`}>
          {stat.value}
        </span>
        <span className="mt-1 text-sm text-ink-muted"> {stat.label}</span>
      </p>
    </li>
  );
}

function FeaturedRole({ job }) {
  return (
    <article
      aria-labelledby={`job-${job.id}`}
      className="glass hud-corners relative overflow-hidden rounded-2xl"
    >
      {/* Console-style title bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-electric-soft/10 bg-navy-950/50 px-5 py-3 sm:px-6">
        <p className="hud-label flex items-center gap-2 text-cyan-soft">
          <span aria-hidden="true" className="relative flex size-2.5">
            <span className="absolute inline-flex size-full rounded-full bg-online motion-safe:animate-pulse-ring" />
            <span className="relative inline-flex size-2.5 rounded-full bg-online" />
          </span>
          Current role
        </p>
        <p className="hud-label text-ink-dim">
          {job.start} – {job.end}
        </p>
      </div>

      <div className="p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 id={`job-${job.id}`} className="font-display text-xl font-bold tracking-wide text-white sm:text-2xl">
              {job.title}
            </h3>
            <p className="mt-2 text-base font-medium text-ink">{job.organization}</p>
            {job.team ? <p className="mt-1 font-mono text-sm text-electric-soft">{job.team}</p> : null}
          </div>
          {job.location ? (
            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
              <MapPin aria-hidden="true" className="size-4 text-cyan" />
              {job.location}
            </p>
          ) : null}
        </div>

        {job.summary ? <p className="mt-5 max-w-3xl text-ink-muted">{job.summary}</p> : null}

        {job.stats?.length ? (
          <ul aria-label="At a glance" className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {job.stats.map((stat) => (
              <StatTile key={stat.value + stat.label} stat={stat} />
            ))}
          </ul>
        ) : null}

        {job.featured && profile.workflow ? (
          <div className="mt-7">
            <JackWorkflow workflow={profile.workflow} />
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <h4 className="hud-label text-ink-dim">What I do</h4>
            <ul className="mt-3 space-y-3">
              {job.highlights.map((highlight) => (
                <li key={highlight} className="flex gap-3 text-ink-muted">
                  <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rotate-45 bg-cyan" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>
          {job.tools?.length ? (
            <div>
              <h4 className="hud-label text-ink-dim">Tools &amp; tech</h4>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {job.tools.map((tool) => (
                  <li key={tool}>
                    <Chip className="border-cyan/25 text-cyan-soft">{tool}</Chip>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function CompactRole({ job }) {
  return (
    <article aria-labelledby={`job-${job.id}`} className="glass glow-frame relative h-full rounded-2xl p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-electric-soft/20 bg-navy-900/80">
          <Briefcase aria-hidden="true" className="size-4 text-electric-soft" />
        </span>
        <div>
          <h4 id={`job-${job.id}`} className="font-semibold text-white">
            {job.title}
          </h4>
          <p className="text-sm text-ink-muted">{job.organization}</p>
          <p className="hud-label mt-1 text-ink-dim">
            {job.start} – {job.end}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {job.highlights.map((highlight) => (
          <li key={highlight} className="flex gap-3 text-sm text-ink-muted">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-electric-soft" />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function Experience() {
  const featured = profile.experience.filter((job) => job.featured);
  const others = profile.experience.filter((job) => !job.featured);

  return (
    <Section
      id="experience"
      index="02"
      kicker="Professional Experience"
      title="Experience"
      intro="Hands-on campus network support at Cal State Fullerton, backed by earlier leadership experience."
    >
      <div className="space-y-8">
        {featured.map((job) => (
          <Reveal key={job.id}>
            <FeaturedRole job={job} />
          </Reveal>
        ))}

        {others.length ? (
          <div>
            <h3 className="hud-label mb-4 text-ink-dim">Earlier experience</h3>
            <ul className="grid gap-4 md:grid-cols-2">
              {others.map((job, index) => (
                <li key={job.id}>
                  <Reveal delay={index * 0.08} className="h-full">
                    <CompactRole job={job} />
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
