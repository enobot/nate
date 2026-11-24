import About from "../sections/About.jsx";
import Contact from "../sections/Contact.jsx";
import Experience from "../sections/Experience.jsx";
import Hero from "../sections/Hero.jsx";
import Projects from "../sections/Projects.jsx";
import Resume from "../sections/Resume.jsx";
import Skills from "../sections/Skills.jsx";

/** The one-page portfolio: every section in navigation order. */
export default function HomePage() {
  return (
    <>
      <Hero />
      <About />
      <Experience />
      <Projects />
      <Skills />
      <Resume />
      <Contact />
    </>
  );
}
