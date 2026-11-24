import { ArrowUp } from "lucide-react";
import Monogram from "../components/Monogram.jsx";
import { profile } from "../data/profile.js";
import { assetUrl } from "../lib/assetUrl.js";
import { Link } from "../lib/router.jsx";

// Fixed at build time (vite.config.js) so the pre-rendered page and the
// browser always show the same year.
const YEAR = typeof __BUILD_YEAR__ === "undefined" ? new Date().getFullYear() : __BUILD_YEAR__;

function joinNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function Footer() {
  return (
    <footer className="border-t border-electric-soft/10 py-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-ink-dim sm:px-6">
        <div className="flex items-center gap-2.5">
          <Monogram className="size-6" />
          <p>
            © {YEAR} {profile.credits?.length ? joinNames(profile.credits) : profile.name}
          </p>
        </div>
        <div className="flex items-center gap-5">
          {/* Created by `npm run build` (see vite.config.js); not present in `npm run dev`. */}
          <a
            href={assetUrl("third-party-licenses.txt")}
            className="inline-flex min-h-11 items-center rounded-md text-ink-muted transition-colors hover:text-cyan-soft"
          >
            Licenses
          </a>
          <Link
            to="/#home"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-ink-muted transition-colors hover:text-cyan-soft"
          >
            Back to top
            <ArrowUp aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
