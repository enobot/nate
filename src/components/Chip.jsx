import { cn } from "../lib/cn.js";

/** Small rounded label for technologies and tools. */
export default function Chip({ children, className = "" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-electric-soft/20 bg-navy-900/70 px-2 py-0.5 font-mono text-xs text-ink-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
