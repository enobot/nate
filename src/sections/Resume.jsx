import { Download, FileText, UserRound } from "lucide-react";
import ButtonLink from "../components/ButtonLink.jsx";
import Reveal from "../components/Reveal.jsx";
import Section from "../components/Section.jsx";
import { profile } from "../data/profile.js";
import { assetUrl } from "../lib/assetUrl.js";

export default function Resume() {
  return (
    <Section
      id="resume"
      index="05"
      kicker="Data files"
      title="Resume"
      intro="Two versions of the same experience, each tuned for a different kind of role."
    >
      <ul className="grid gap-6 md:grid-cols-2">
        {profile.resumes.map((resume, index) => (
          <li key={resume.id}>
            <Reveal delay={index * 0.08} className="h-full">
              <article
                aria-labelledby={`resume-${resume.id}`}
                className="glass glow-frame relative flex h-full flex-col rounded-2xl p-6"
              >
                <div className="flex items-start gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan/30 bg-navy-900/80 shadow-[0_0_24px_-8px_rgb(34_227_245/0.8)]">
                    <FileText aria-hidden="true" className="size-6 text-cyan" />
                  </span>
                  <div>
                    <h3 id={`resume-${resume.id}`} className="font-display text-base font-bold tracking-wide text-white">
                      {resume.label}
                    </h3>
                    <p className="mt-1.5 text-sm text-ink-muted">{resume.description}</p>
                    <p className="hud-label mt-2 text-ink-dim">PDF · 1 page</p>
                  </div>
                </div>
                <div className="mt-6">
                  <ButtonLink
                    href={assetUrl(resume.file)}
                    icon={Download}
                    download
                    target="_blank"
                    rel="noopener"
                    variant={resume.primary ? "primary" : "ghost"}
                  >
                    Download PDF<span className="sr-only">: {resume.label}</span>
                  </ButtonLink>
                </div>
              </article>
            </Reveal>
          </li>
        ))}
      </ul>

      <Reveal className="mt-6">
        <p className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-4 text-ink-muted">
          <span>Prefer LinkedIn? My full profile is there too.</span>
          <ButtonLink href={profile.linkedin} variant="ghost" icon={UserRound} external>
            View LinkedIn profile
          </ButtonLink>
        </p>
      </Reveal>
    </Section>
  );
}
