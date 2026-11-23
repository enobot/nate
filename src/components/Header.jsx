import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Menu, X } from "lucide-react";
import Monogram from "./Monogram.jsx";
import { sections, sectionIds } from "../data/navigation.js";
import { profile } from "../data/profile.js";
import { useScrollSpy } from "../hooks/useScrollSpy.js";
import { cn } from "../lib/cn.js";

const MOBILE_MENU_ID = "mobile-menu";

/** Sticky glass navigation bar with scroll-spy and a mobile menu. */
export default function Header() {
  const activeId = useScrollSpy(sectionIds);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef(null);
  const headerRef = useRef(null);

  const closeMenu = useCallback((restoreFocus) => {
    setMenuOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  // Glass background appears once the page is scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the menu is open: Esc closes it (focus returns to the toggle),
  // and clicking outside the header closes it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    }
    function onPointerDown(event) {
      if (headerRef.current && !headerRef.current.contains(event.target)) closeMenu(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen, closeMenu]);

  // Close the mobile menu if the window grows to desktop width.
  useEffect(() => {
    const query = window.matchMedia?.("(min-width: 64rem)");
    if (!query) return undefined;
    const onChange = (event) => {
      if (event.matches) setMenuOpen(false);
    };
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  return (
    <header
      ref={headerRef}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled || menuOpen
          ? "border-b border-electric-soft/10 bg-void/70 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a
          href="#home"
          className="group flex items-center gap-2.5 rounded-md"
          onClick={() => closeMenu(false)}
        >
          <Monogram className="size-8 transition-transform duration-300 motion-safe:group-hover:rotate-[30deg]" />
          <span className="font-display text-sm font-bold tracking-[0.12em] text-white uppercase">
            {profile.name}
          </span>
        </a>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {sections.map((section) => {
              const isActive = activeId === section.id;
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "relative block rounded-md px-3 py-2 font-mono text-xs tracking-[0.12em] uppercase transition-colors",
                      isActive ? "text-cyan-soft" : "text-ink-muted hover:text-white",
                    )}
                  >
                    {section.label}
                    {/* Glowing underline: grows in on the active link (pure CSS). */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-3 -bottom-px h-0.5 origin-center rounded-full bg-cyan shadow-[0_0_10px_rgb(34_227_245/0.9)] transition-[transform,opacity] duration-300",
                        isActive ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                      )}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <button
          ref={toggleRef}
          type="button"
          className="glass inline-flex size-11 items-center justify-center rounded-lg text-ink lg:hidden"
          aria-expanded={menuOpen}
          aria-controls={MOBILE_MENU_ID}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
          <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      <div id={MOBILE_MENU_ID} className="lg:hidden">
        <AnimatePresence initial={false}>
          {menuOpen ? (
            <m.nav
              key="mobile-nav"
              aria-label="Mobile"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="border-t border-electric-soft/10 bg-void/95 px-4 pt-2 pb-5 backdrop-blur-xl sm:px-6"
            >
              <ul className="mx-auto grid max-w-6xl gap-1">
                {sections.map((section, index) => {
                  const isActive = activeId === section.id;
                  return (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => closeMenu(false)}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-md px-3 font-mono text-sm tracking-[0.12em] uppercase",
                          isActive ? "bg-navy-800/60 text-cyan-soft" : "text-ink-muted hover:bg-navy-900 hover:text-white",
                        )}
                      >
                        <span aria-hidden="true" className="text-xs text-ink-dim">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {section.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </m.nav>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}
