import { useState } from "react";
import { getIcon } from "./icons.js";
import { cn } from "../lib/cn.js";

/**
 * "How a jack activation works": the steps of Nate's CSUF work as a small
 * interactive flow. Every step's text is always visible (nothing is hidden
 * behind a click). Choosing a step (click, tap, or keyboard) moves the
 * progress line to it, which helps when talking someone through the process.
 */
export default function JackWorkflow({ workflow }) {
  const [active, setActive] = useState(0);
  const steps = workflow.steps;
  const progress = steps.length > 1 ? active / (steps.length - 1) : 1;

  return (
    <div className="rounded-xl border border-electric-soft/12 bg-navy-950/50 p-4 sm:p-6">
      <h4 className="hud-label text-ink-dim">{workflow.title}</h4>

      <div className="relative mt-5">
        {/* Connector + progress line: vertical on phones, horizontal from md up. */}
        <div
          aria-hidden="true"
          className="absolute top-5 bottom-5 left-5 w-0.5 bg-electric-soft/15 md:top-5 md:right-[10%] md:bottom-auto md:left-[10%] md:h-0.5 md:w-auto"
        >
          <div
            className="h-[var(--progress)] w-full bg-linear-to-b from-cyan to-neon-purple shadow-[0_0_12px_rgb(34_227_245/0.8)] transition-[height,width] duration-500 ease-out md:h-full md:w-[var(--progress)] md:bg-linear-to-r"
            style={{ "--progress": `${progress * 100}%` }}
          />
        </div>

        <ol className="relative grid gap-4 md:grid-cols-5 md:gap-3">
          {steps.map((step, index) => {
            const Icon = getIcon(step.icon);
            const reached = index <= active;
            const current = index === active;
            return (
              <li key={step.id} className="flex gap-4 md:flex-col md:items-center md:text-center">
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-pressed={current}
                  aria-label={`Step ${index + 1}: ${step.label}`}
                  className={cn(
                    "relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,transform] duration-300 motion-safe:active:scale-95",
                    reached ? "border-cyan/70 bg-navy-800" : "border-electric-soft/20 bg-navy-950",
                    current && "shadow-[0_0_22px_-4px_rgb(34_227_245/0.95)]",
                  )}
                >
                  <Icon aria-hidden="true" className={cn("size-5", reached ? "text-cyan" : "text-ink-dim")} />
                </button>
                <div className="pt-1 md:pt-0">
                  <p className={cn("font-mono text-xs tracking-[0.12em] uppercase", current ? "text-cyan-soft" : "text-ink-dim")}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, "0")} </span>
                    {step.label}
                  </p>
                  <p className={cn("mt-1 text-sm transition-colors duration-300", current ? "text-ink" : "text-ink-muted")}>
                    {step.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
