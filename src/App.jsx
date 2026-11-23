import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import Header from "./components/Header.jsx";
import About from "./sections/About.jsx";
import Contact from "./sections/Contact.jsx";
import Experience from "./sections/Experience.jsx";
import Footer from "./sections/Footer.jsx";
import Hero from "./sections/Hero.jsx";
import Projects from "./sections/Projects.jsx";
import Resume from "./sections/Resume.jsx";
import Skills from "./sections/Skills.jsx";

export default function App() {
  return (
    // reducedMotion="user": if the visitor's OS asks for reduced motion,
    // movement animations are turned off across the whole site.
    // LazyMotion + domAnimation loads only the animation features the site
    // uses (fades, slides, in-view, exit), keeping the JavaScript bundle small.
    // `strict` makes any accidental use of the heavier <motion.*> components
    // throw an error, so always use <m.*> components (m.div, m.li, ...).
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
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

        <Header />
        <main id="main" tabIndex={-1}>
          <Hero />
          <About />
          <Skills />
          <Experience />
          <Projects />
          <Resume />
          <Contact />
        </main>
        <Footer />
      </LazyMotion>
    </MotionConfig>
  );
}
