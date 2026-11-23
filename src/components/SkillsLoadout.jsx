import { useRef, useState } from "react";
import { m } from "motion/react";
import { getIcon } from "./icons.js";
import { cn } from "../lib/cn.js";

// Tag colors for each kind of evidence. Unknown keys fall back to neutral.
const EVIDENCE_STYLES = {
  csuf: "border-cyan/40 text-cyan-soft",
  coursework: "border-neon-purple/45 text-neon-purple-soft",
  project: "border-electric/50 text-electric-soft",
};
const NEUTRAL_EVIDENCE = "border-ink-dim/40 text-ink-muted";

const listVariants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.035 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

/**
 * Skills shown as a "loadout": category tabs, each with a grid of skill
 * slots tagged with where the skill was used.
 *
 * Keyboard support follows the WAI-ARIA tabs pattern:
 * Left/Right arrows move between tabs (wrapping), Home/End jump to the ends.
 */
export default function SkillsLoadout({ categories, evidence }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef([]);

  function selectTab(index, moveFocus) {
    setActiveIndex(index);
    if (moveFocus) tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event) {
    const last = categories.length - 1;
    let next = null;
    if (event.key === "ArrowRight") next = activeIndex === last ? 0 : activeIndex + 1;
    else if (event.key === "ArrowLeft") next = activeIndex === 0 ? last : activeIndex - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next !== null) {
      event.preventDefault();
      selectTab(next, true);
    }
  }

  const usedKeys = new Set(categories.flatMap((category) => category.items.flatMap((item) => item.usedIn)));

  return (
    <div className="glass hud-corners relative rounded-2xl p-4 sm:p-6">
      <div
        role="tablist"
        aria-label="Skill categories"
        className="flex flex-wrap gap-2 border-b border-electric-soft/10 pb-4"
        onKeyDown={handleKeyDown}
      >
        {categories.map((category, index) => {
          const isActive = index === activeIndex;
          const Icon = getIcon(category.icon);
          return (
            <button
              key={category.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`skills-tab-${category.id}`}
              aria-selected={isActive}
              aria-controls={`skills-panel-${category.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(index, false)}
              className={cn(
                "relative inline-flex min-h-11 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-200",
                isActive
                  ? "border-cyan/60 bg-cyan/10 text-white shadow-[0_0_18px_-6px_rgb(34_227_245/0.8)]"
                  : "border-electric-soft/15 bg-navy-950/40 text-ink-muted hover:border-electric-soft/40 hover:text-white",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-4", isActive ? "text-cyan" : "text-ink-dim")} />
              {category.label}
              <span
                aria-hidden="true"
                className={cn(
                  "rounded px-1.5 font-mono text-[0.7rem]",
                  isActive ? "bg-cyan/20 text-cyan-soft" : "bg-navy-800/80 text-ink-muted",
                )}
              >
                {category.items.length}
              </span>
            </button>
          );
        })}
      </div>

      {categories.map((category, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={category.id}
            role="tabpanel"
            id={`skills-panel-${category.id}`}
            aria-labelledby={`skills-tab-${category.id}`}
            hidden={!isActive}
            tabIndex={0}
            className="pt-5"
          >
            <p className="text-ink-muted">{category.blurb}</p>
            <m.ul
              // Changing the key replays the entrance animation when the tab opens.
              key={isActive ? "active" : "inactive"}
              variants={listVariants}
              initial="hidden"
              animate="shown"
              className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {category.items.map((item) => (
                <m.li
                  key={item.name}
                  variants={itemVariants}
                  className="group relative rounded-xl border border-electric-soft/12 bg-navy-950/55 p-4 transition-[border-color,box-shadow] duration-200 hover:border-cyan/40 hover:shadow-[0_0_20px_-10px_rgb(34_227_245/0.9)]"
                >
                  <p className="font-medium text-ink">{item.name}</p>
                  {item.usedIn.length > 0 ? (
                    <p className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="sr-only">Used in: </span>
                      {item.usedIn.map((key) => (
                        <span
                          key={key}
                          className={cn(
                            "rounded border px-1.5 py-0.5 font-mono text-[0.68rem] tracking-wide",
                            EVIDENCE_STYLES[key] ?? NEUTRAL_EVIDENCE,
                          )}
                        >
                          {evidence[key] ?? key}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </m.li>
              ))}
            </m.ul>
          </div>
        );
      })}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-electric-soft/10 pt-4">
        <span className="hud-label text-ink-dim">Tags show where each skill was used:</span>
        {Object.entries(evidence)
          .filter(([key]) => usedKeys.has(key))
          .map(([key, label]) => (
            <span
              key={key}
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[0.68rem] tracking-wide",
                EVIDENCE_STYLES[key] ?? NEUTRAL_EVIDENCE,
              )}
            >
              {label}
            </span>
          ))}
      </div>
    </div>
  );
}
