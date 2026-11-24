import { ArrowRight, Download, FolderGit2, Mail, UserRound } from "lucide-react";
import ButtonLink from "../components/ButtonLink.jsx";
import NetworkCanvas from "../components/NetworkCanvas.jsx";
import { profile } from "../data/profile.js";
import { assetUrl } from "../lib/assetUrl.js";
import { withBase } from "../lib/router.jsx";

// The hero text is part of the pre-rendered HTML and fully visible on the
// first paint (no "fade in from invisible"), because it's the largest thing
// on screen and the browser's Largest Contentful Paint metric waits for it.
// The entrance effect is a short CSS slide (`hero-enter`) that respects
// reduced-motion settings.

export default function Hero() {
  const { hero } = profile;
  const primaryResume = profile.resumes.find((resume) => resume.primary) ?? profile.resumes[0];
  const [firstName, ...rest] = profile.name.split(" ");
  const lastName = rest.join(" ");

  return (
    <section
      id="home"
      aria-labelledby="home-heading"
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden pt-24 pb-16"
    >
      {/* Decorative background layers */}
      <NetworkCanvas className="absolute inset-0 -z-10 h-full w-full opacity-80 [mask-image:radial-gradient(ellipse_at_60%_45%,#000_35%,transparent_80%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-void/90 via-void/50 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-linear-to-b from-transparent to-void"
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          {/* One line of inline text, so the brackets stay with the words when it wraps on phones. */}
          <p className="hero-enter hud-label text-cyan-soft">
            <span aria-hidden="true">[ </span>
            {hero.role}
            <span aria-hidden="true">
              {" ]"}
              <span className="ml-2 inline-block h-3.5 w-2 translate-y-0.5 bg-cyan motion-safe:animate-blink" />
            </span>
          </p>

          <h1
            id="home-heading"
            className="hero-enter mt-5 font-display text-4xl leading-[1.05] font-bold tracking-wide text-white sm:text-6xl lg:text-7xl"
            style={{ "--enter-delay": "40ms" }}
          >
            <span className="block">{firstName}</span> <span className="text-neon block">{lastName}</span>
          </h1>

          <p
            className="hero-enter mt-6 max-w-2xl text-xl leading-snug font-semibold text-white sm:text-2xl"
            style={{ "--enter-delay": "80ms" }}
          >
            {hero.headline}
          </p>

          <p
            className="hero-enter mt-4 max-w-2xl text-base text-ink-muted sm:text-lg"
            style={{ "--enter-delay": "120ms" }}
          >
            {hero.tagline}
          </p>

          <div className="hero-enter mt-8 flex flex-wrap gap-3" style={{ "--enter-delay": "160ms" }}>
            <ButtonLink href={withBase("/#projects")} icon={ArrowRight}>
              View Projects
            </ButtonLink>
            {primaryResume ? (
              <ButtonLink
                href={assetUrl(primaryResume.file)}
                variant="ghost"
                icon={Download}
                download
                target="_blank"
                rel="noopener"
              >
                Download Resume{" "}
                <span className="sr-only">(PDF, {primaryResume.label})</span>
              </ButtonLink>
            ) : null}
            {/* Shown automatically once profile.github is set. */}
            {profile.github ? (
              <ButtonLink href={profile.github} variant="ghost" icon={FolderGit2} external>
                GitHub
              </ButtonLink>
            ) : null}
          </div>

          <ul
            className="hero-enter mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm"
            style={{ "--enter-delay": "200ms" }}
            aria-label="Quick contact"
          >
            <li>
              <a
                href={`mailto:${profile.email}`}
                className="inline-flex min-h-11 items-center gap-2 text-ink-muted transition-colors hover:text-cyan-soft"
              >
                <Mail aria-hidden="true" className="size-4" />
                {profile.email}
              </a>
            </li>
            <li>
              <a
                href={profile.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-ink-muted transition-colors hover:text-cyan-soft"
              >
                <UserRound aria-hidden="true" className="size-4" />
                LinkedIn{" "}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </div>

        <StatusPanel status={hero.status} />
      </div>
    </section>
  );
}

/** HUD-style status readout next to the name. */
function StatusPanel({ status }) {
  return (
    <div className="hero-enter glass hud-corners relative rounded-2xl p-5 sm:p-6" style={{ "--enter-delay": "260ms" }}>
      <div className="flex items-center justify-between border-b border-electric-soft/10 pb-3">
        <p className="hud-label text-ink-dim">sys.status</p>
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2 rounded-full bg-neon-purple/70" />
          <span className="size-2 rounded-full bg-electric/70" />
          <span className="size-2 rounded-full bg-cyan/70" />
        </span>
      </div>

      <dl className="mt-4 space-y-3.5">
        {status.map((row) => (
          <div key={row.label} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3">
            <dt className="hud-label text-ink-dim">{row.label}</dt>
            <dd className="flex items-center gap-2 font-mono text-sm text-ink">
              {row.live ? (
                <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full rounded-full bg-online motion-safe:animate-pulse-ring" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-online" />
                </span>
              ) : null}
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
