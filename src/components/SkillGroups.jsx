import Reveal from "./Reveal.jsx";
import { getIcon } from "./icons.js";
import { cn } from "../lib/cn.js";

// Tag colors for each kind of evidence. Unknown keys fall back to neutral.
const EVIDENCE_STYLES = {
  csuf: "border-cyan/40 text-cyan-soft",
  coursework: "border-neon-purple/45 text-neon-purple-soft",
  project: "border-electric/50 text-electric-soft",
};
const NEUTRAL_EVIDENCE = "border-ink-dim/40 text-ink-muted";

function EvidenceTag({ label, kind }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[0.68rem] leading-tight tracking-wide whitespace-nowrap",
        EVIDENCE_STYLES[kind] ?? NEUTRAL_EVIDENCE,
      )}
    >
      {label}
    </span>
  );
}

/**
 * Every skill group visible at once (no tabs to click through), so a hiring
 * manager can scan the whole list in a few seconds. Each skill is tagged with
 * where it was used: on the job, in coursework, or in a project.
 * The first group (Networking) is the widest, since it's Nate's core work.
 */
export default function SkillGroups({ groups, evidence }) {
  const usedKeys = new Set(groups.flatMap((group) => group.items.flatMap((item) => item.usedIn)));

  return (
    <div>
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((group, index) => {
          const Icon = getIcon(group.icon);
          const headingId = `skills-group-${group.id}`;
          return (
            <li key={group.id} className={cn(index === 0 && "lg:col-span-2 lg:row-span-1")}>
              <Reveal
                as="section"
                aria-labelledby={headingId}
                delay={(index % 3) * 0.06}
                className="glass glow-frame relative h-full rounded-2xl p-5 sm:p-6"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-cyan/25 bg-navy-900/80 shadow-[0_0_20px_-8px_rgb(34_227_245/0.8)]">
                    <Icon aria-hidden="true" className="size-5 text-cyan" />
                  </span>
                  <div>
                    <h3 id={headingId} className="font-display text-base font-bold tracking-wide text-white">
                      {group.label}
                    </h3>
                    <p className="mt-1 text-sm text-ink-muted">{group.blurb}</p>
                  </div>
                </div>
                <ul className={cn("mt-5 grid gap-2.5", index === 0 && "sm:grid-cols-2")}>
                  {group.items.map((item) => (
                    <li
                      key={item.name}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border border-electric-soft/10 bg-navy-950/55 px-3 py-2.5 transition-colors duration-200 hover:border-cyan/35"
                    >
                      <span className="text-sm font-medium text-ink">{item.name}</span>
                      {item.usedIn.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          <span className="sr-only">Used in: </span>
                          {item.usedIn.map((key) => (
                            <EvidenceTag key={key} kind={key} label={evidence[key] ?? key} />
                          ))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="hud-label text-ink-dim">Tags show where each skill was used:</span>
        {Object.entries(evidence)
          .filter(([key]) => usedKeys.has(key))
          .map(([key, label]) => (
            <EvidenceTag key={key} kind={key} label={label} />
          ))}
      </p>
    </div>
  );
}
