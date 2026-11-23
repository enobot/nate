// The page sections, in order. The navigation bar and the section ids are
// built from this list, so a nav link can never point at a missing section.
export const sections = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "skills", label: "Skills" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "resume", label: "Resume" },
  { id: "contact", label: "Contact" },
];

export const sectionIds = sections.map((section) => section.id);
