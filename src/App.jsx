import { useEffect } from "react";
import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import Header from "./components/Header.jsx";
import { RouterProvider, useRouter } from "./lib/router.jsx";
import { headFor, matchRoute } from "./lib/routes.js";
import HomePage from "./pages/HomePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ProjectPage from "./pages/ProjectPage.jsx";
import Footer from "./sections/Footer.jsx";

/**
 * @param {{ url?: string }} props
 *   `url` is only passed when pre-rendering a page at build time.
 */
export default function App({ url }) {
  return (
    // reducedMotion="user": if the visitor's OS asks for reduced motion,
    // movement animations are turned off across the whole site.
    // LazyMotion + domAnimation loads only the animation features the site
    // uses (fades, slides, exit), keeping the JavaScript bundle small.
    // `strict` makes any accidental use of the heavier <motion.*> components
    // throw an error, so always use <m.*> components (m.div, m.li, ...).
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <RouterProvider url={url}>
          <Shell />
        </RouterProvider>
      </LazyMotion>
    </MotionConfig>
  );
}

function Shell() {
  const { location } = useRouter();
  const route = matchRoute(location.path);
  const navigated = location.action !== "initial";
  const title = headFor(route).title;

  // Keep the browser tab title in sync while navigating inside the site.
  // (The first page load already has the right <title> from pre-rendering.)
  useEffect(() => {
    if (navigated) document.title = title;
  }, [title, navigated]);

  let page;
  if (route.name === "project") page = <ProjectPage project={route.project} navigated={navigated} />;
  else if (route.name === "notFound") page = <NotFoundPage navigated={navigated} />;
  else page = <HomePage />;

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-3 focus:text-white focus:ring-2 focus:ring-cyan"
      >
        Skip to content
      </a>

      {/* Fixed decorative backdrop: gradients + faint grid */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-20">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_600px_at_10%_-10%,rgb(61_123_255/0.14),transparent_60%),radial-gradient(900px_520px_at_100%_15%,rgb(168_85_247/0.12),transparent_60%),linear-gradient(180deg,#05060a_0%,#070b1c_45%,#05060a_100%)]" />
        <div className="grid-lines absolute inset-0 [mask-image:linear-gradient(180deg,#000,transparent_85%)] opacity-60" />
      </div>

      <Header route={route} />
      <main id="main" tabIndex={-1}>
        {/* Page transition: a short fade when moving between pages.
            The first page shows immediately (initial={false}). */}
        <m.div
          key={location.path}
          initial={navigated ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {page}
        </m.div>
      </main>
      <Footer />
    </>
  );
}
