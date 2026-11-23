import { ArrowUp } from "lucide-react";
import Monogram from "../components/Monogram.jsx";
import { profile } from "../data/profile.js";
import { assetUrl } from "../lib/assetUrl.js";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-electric-soft/10 py-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-ink-dim sm:px-6">
        <p className="flex items-center gap-2.5">
          <Monogram className="size-6" />
          <span>
            © {year} {profile.name}
          </span>
        </p>
        <div className="flex items-center gap-5">
          {/* Created by `npm run build` (see vite.config.js); not present in `npm run dev`. */}
          <a
            href={assetUrl("third-party-licenses.txt")}
            className="inline-flex min-h-11 items-center rounded-md text-ink-muted transition-colors hover:text-cyan-soft"
          >
            Licenses
          </a>
          <a
            href="#home"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-ink-muted transition-colors hover:text-cyan-soft"
          >
            Back to top
            <ArrowUp aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
