import { getIcon } from "./icons.js";
import { assetUrl } from "../lib/assetUrl.js";
import { cn } from "../lib/cn.js";

/**
 * A project's preview: its first real image (screenshot or diagram) if it has
 * one, otherwise a themed graphic with the project's icon. Never a fake
 * screenshot.
 */
export default function ProjectVisual({ project, className, eager = false }) {
  const image = project.images?.[0];
  if (image?.src) {
    return (
      <div className={cn("relative overflow-hidden bg-navy-950", className)}>
        <img
          src={assetUrl(image.src)}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="aspect-video h-full w-full object-contain p-2"
        />
      </div>
    );
  }

  const Icon = getIcon(project.icon);
  const inDevelopment = project.status === "In Development";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid-lines relative flex aspect-video items-center justify-center overflow-hidden bg-navy-950",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          inDevelopment
            ? "bg-[radial-gradient(circle_at_50%_55%,rgb(251_191_36/0.14),transparent_60%)]"
            : "bg-[radial-gradient(circle_at_50%_55%,rgb(34_227_245/0.16),transparent_60%)]",
        )}
      />
      <div className="relative flex size-20 items-center justify-center rounded-2xl border border-cyan/30 bg-navy-900/80 shadow-[0_0_40px_-8px_rgb(61_123_255/0.8)] transition-transform duration-500 motion-safe:group-hover:scale-110 motion-safe:group-hover:rotate-3">
        <Icon className={cn("size-9", inDevelopment ? "text-amber" : "text-cyan")} />
      </div>
      <span className="hud-label absolute bottom-3 left-4 text-[0.62rem] text-ink-dim">{project.id}</span>
      {inDevelopment ? (
        <span className="absolute top-0 left-0 h-0.5 w-full bg-[repeating-linear-gradient(90deg,rgb(251_191_36/0.7)_0_12px,transparent_12px_24px)]" />
      ) : null}
    </div>
  );
}
