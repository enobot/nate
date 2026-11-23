import { m } from "motion/react";
import { ArrowRight, Download, Mail, UserRound } from "lucide-react";
import ButtonLink from "../components/ButtonLink.jsx";
import NetworkCanvas from "../components/NetworkCanvas.jsx";
import { profile } from "../data/profile.js";
import { assetUrl } from "../lib/assetUrl.js";

const container = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

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
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-void/85 via-void/40 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-linear-to-b from-transparent to-void"
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.25fr_1fr]">
        <m.div variants={container} initial="hidden" animate="shown">
          <m.p variants={item} className="hud-label flex items-center gap-2 text-cyan-soft">
            <span aria-hidden="true">[</span>
            {hero.kicker}
            <span aria-hidden="true">]</span>
            <span aria-hidden="true" className="inline-block h-3.5 w-2 bg-cyan motion-safe:animate-blink" />
          </m.p>

          <m.h1
            id="home-heading"
            variants={item}
            className="mt-5 font-display text-4xl leading-[1.05] font-bold tracking-wide text-white sm:text-6xl lg:text-7xl"
          >
            <span className="block">{firstName}</span>{" "}
            <span className="text-neon block">{lastName}</span>
          </m.h1>

          <m.p variants={item} className="mt-5 font-mono text-sm tracking-wide text-electric-soft sm:text-base">
            {hero.role}
          </m.p>

          <m.p variants={item} className="mt-5 max-w-xl text-base text-ink-muted sm:text-lg">
            {hero.tagline}
          </m.p>

          <m.div variants={item} className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="#projects" icon={ArrowRight}>
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
          </m.div>

          <m.ul variants={item} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Quick contact">
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
          </m.ul>
        </m.div>

        <StatusPanel status={hero.status} />
      </div>
    </section>
  );
}

/** HUD-style status readout next to the name. */
function StatusPanel({ status }) {
  return (
    <m.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="glass hud-corners relative rounded-2xl p-5 sm:p-6"
    >
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

      <div aria-hidden="true" className="mt-5 flex items-end gap-1 border-t border-electric-soft/10 pt-4">
        {[40, 65, 50, 80, 60, 90, 70, 55, 85, 75, 95, 65].map((height, index) => (
          <span
            // Purely decorative "signal" bars.
            key={index}
            className="w-full rounded-sm bg-linear-to-t from-electric/30 to-cyan/70"
            style={{ height: `${height * 0.28}px` }}
          />
        ))}
      </div>
    </m.div>
  );
}
