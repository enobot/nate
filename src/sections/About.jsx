import { BookOpen, GraduationCap, MapPin, Target } from "lucide-react";
import Reveal from "../components/Reveal.jsx";
import Section from "../components/Section.jsx";
import { profile } from "../data/profile.js";

export default function About() {
  const { about, education } = profile;
  const [primary, ...others] = education;

  return (
    <Section id="about" index="01" kicker="Player profile" title="About">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <Reveal className="space-y-5 text-base text-ink-muted sm:text-lg">
          {about.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <div className="glass rounded-xl p-4">
              <p className="hud-label flex items-center gap-2 text-ink-dim">
                <MapPin aria-hidden="true" className="size-3.5 text-cyan" /> Location
              </p>
              <p className="mt-1.5 text-base text-ink">{profile.location}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="hud-label flex items-center gap-2 text-ink-dim">
                <Target aria-hidden="true" className="size-3.5 text-cyan" /> Seeking
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-x-2 text-base text-ink">
                {about.targetRoles.map((role, index) => (
                  <li key={role}>
                    {role}
                    {index < about.targetRoles.length - 1 ? <span aria-hidden="true" className="text-ink-dim"> ·</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="glass hud-corners relative rounded-2xl p-5 sm:p-6">
            <h3 className="flex items-center gap-2.5 font-display text-base font-bold tracking-wide text-white">
              <GraduationCap aria-hidden="true" className="size-5 text-cyan" />
              Education
            </h3>

            {primary ? (
              <div className="mt-5">
                <p className="font-semibold text-ink">{primary.school}</p>
                <p className="mt-1 text-ink-muted">
                  {primary.credential}
                  {primary.detail ? `, ${primary.detail}` : ""}
                </p>
                <p className="hud-label mt-2 text-cyan-soft">{primary.date}</p>

                {primary.completedCoursework?.length ? (
                  <div className="mt-5">
                    <h4 className="hud-label flex items-center gap-2 text-ink-dim">
                      <BookOpen aria-hidden="true" className="size-3.5" /> Completed coursework
                    </h4>
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {primary.completedCoursework.map((course) => (
                        <li
                          key={course}
                          className="rounded-md border border-online/30 bg-online/5 px-2 py-1 text-sm text-ink"
                        >
                          {course}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {primary.inProgressCoursework?.length ? (
                  <div className="mt-5">
                    <h4 className="hud-label flex items-center gap-2 text-ink-dim">
                      <BookOpen aria-hidden="true" className="size-3.5" /> In progress
                    </h4>
                    <ul className="mt-2.5 space-y-1.5">
                      {primary.inProgressCoursework.map((course) => (
                        <li
                          key={course.name}
                          className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md border border-electric-soft/12 bg-navy-950/50 px-3 py-2 text-sm"
                        >
                          <span className="text-ink">{course.name}</span>
                          <span className="font-mono text-xs text-ink-dim">{course.term}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {others.map((school) => (
              <div key={school.school} className="mt-6 border-t border-electric-soft/10 pt-5">
                <p className="font-semibold text-ink">{school.school}</p>
                <p className="mt-1 text-ink-muted">{school.credential}</p>
                <p className="hud-label mt-2 text-cyan-soft">{school.date}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
