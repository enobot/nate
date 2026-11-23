import { cn } from "../lib/cn.js";

const VARIANTS = {
  primary:
    "glow-frame relative bg-linear-to-r from-electric-deep to-neon-purple-deep text-white shadow-[0_0_24px_-6px_rgb(61_123_255/0.7)] hover:shadow-[0_0_32px_-4px_rgb(168_85_247/0.75)]",
  ghost:
    "glow-frame relative glass text-ink hover:text-white",
  subtle:
    "text-cyan-soft hover:text-white underline-offset-4 hover:underline px-0",
};

/**
 * A link styled as a button.
 * - `external` opens in a new tab safely and tells screen-reader users.
 * - `download` asks the browser to download the file.
 */
export default function ButtonLink({
  href,
  children,
  variant = "primary",
  icon: Icon,
  external = false,
  download,
  className = "",
  ...rest
}) {
  const externalProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <a
      href={href}
      download={download}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-[color,box-shadow,transform] duration-200 motion-safe:hover:-translate-y-0.5",
        VARIANTS[variant],
        className,
      )}
      {...externalProps}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
      <span>{children}</span>
      {external ? (
        <>
          {" "}
          <span className="sr-only">(opens in a new tab)</span>
        </>
      ) : null}
    </a>
  );
}
