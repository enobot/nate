import { CircleCheck, Hammer } from "lucide-react";
import { cn } from "../lib/cn.js";

const STYLES = {
  Completed: {
    icon: CircleCheck,
    className: "border-online/40 bg-online/10 text-online",
  },
  "In Development": {
    icon: Hammer,
    className: "border-amber/40 bg-amber/10 text-amber",
  },
};

/** Shows a project's status: "Completed" or "In Development". */
export default function StatusBadge({ status }) {
  const style = STYLES[status] ?? STYLES["In Development"];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "hud-label inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem]",
        style.className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {status}
    </span>
  );
}
