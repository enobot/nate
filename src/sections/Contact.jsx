import { FolderGit2, Mail, MapPin, UserRound } from "lucide-react";
import ButtonLink from "../components/ButtonLink.jsx";
import Reveal from "../components/Reveal.jsx";
import Section from "../components/Section.jsx";
import { profile } from "../data/profile.js";

// "Network technician" -> "network technician", but keep acronyms like "IT support".
const toSentenceCase = (text) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

export default function Contact() {
  // e.g. "IT support, network technician, or IT analyst"
  const roles = new Intl.ListFormat("en", { type: "disjunction" }).format(
    profile.about.targetRoles.map(toSentenceCase),
  );
  return (
    <Section id="contact" index="06" kicker="Contact" title="Contact">
      <Reveal>
        <div className="glass hud-corners relative overflow-hidden rounded-3xl p-6 sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-neon-purple/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-cyan/10 blur-3xl"
          />

          <div className="relative max-w-2xl">
            <p className="font-display text-xl font-bold tracking-wide text-white sm:text-2xl">
              Let&apos;s connect.
            </p>
            <p className="mt-3 text-ink-muted sm:text-lg">
              I&apos;m looking for entry-level {roles} roles. Email is the fastest way to reach me.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-dim">
              <MapPin aria-hidden="true" className="size-4 text-cyan" />
              {profile.location}
            </p>
          </div>

          <ul className="relative mt-8 flex flex-wrap gap-3">
            <li>
              <ButtonLink href={`mailto:${profile.email}`} icon={Mail}>
                {profile.email}
              </ButtonLink>
            </li>
            <li>
              <ButtonLink href={profile.linkedin} variant="ghost" icon={UserRound} external>
                LinkedIn
              </ButtonLink>
            </li>
            {profile.github || profile.projectRepo ? (
              <li>
                <ButtonLink href={profile.github || profile.projectRepo} variant="ghost" icon={FolderGit2} external>
                  {profile.github ? "GitHub" : "Project code on GitHub"}
                </ButtonLink>
              </li>
            ) : null}
          </ul>
        </div>
      </Reveal>
    </Section>
  );
}
