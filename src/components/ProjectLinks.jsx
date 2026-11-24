import { BookOpen, CirclePlay, ExternalLink, FolderGit2 } from "lucide-react";
import ButtonLink from "./ButtonLink.jsx";

// The external links a project can have, in the order they're shown.
// A button only appears when its URL is filled in projects.js.
export const PROJECT_LINK_TYPES = [
  { key: "demo", label: "Live demo", icon: ExternalLink },
  { key: "source", label: "Source code", icon: FolderGit2 },
  { key: "docs", label: "Documentation", icon: BookOpen },
  { key: "video", label: "Demo video", icon: CirclePlay },
];

/** Buttons for a project's demo, source code, documentation, and video links. */
export default function ProjectLinks({ project, size = "md" }) {
  const available = PROJECT_LINK_TYPES.filter(({ key }) => project.links?.[key]);
  if (available.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={`Links for ${project.title}`}>
      {available.map(({ key, label, icon }, index) => (
        <li key={key}>
          <ButtonLink
            href={project.links[key]}
            variant={index === 0 && size === "md" ? "primary" : "ghost"}
            icon={icon}
            external
            className={size === "sm" ? "px-3.5 text-xs" : undefined}
          >
            {label}{" "}
            <span className="sr-only">for {project.title}</span>
          </ButtonLink>
        </li>
      ))}
    </ul>
  );
}
