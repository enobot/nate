// Icon names that can be used in src/data/profile.js and src/data/projects.js.
// To add one: import it from "lucide-react" (browse https://lucide.dev/icons)
// and add a short lowercase key below.
import {
  AppWindow,
  Building,
  Cable,
  Calculator,
  ClipboardList,
  CodeXml,
  Database,
  Film,
  FolderGit2,
  Handshake,
  Headset,
  Network,
  Server,
  Terminal,
  Ticket,
  Users,
} from "lucide-react";

export const ICONS = {
  "app-window": AppWindow,
  building: Building,
  cable: Cable,
  calculator: Calculator,
  clipboard: ClipboardList,
  code: CodeXml,
  database: Database,
  film: Film,
  handshake: Handshake,
  headset: Headset,
  network: Network,
  server: Server,
  terminal: Terminal,
  ticket: Ticket,
  users: Users,
};

/**
 * Look up an icon component by key, falling back to a generic project icon.
 * @param {string | undefined} key
 */
export function getIcon(key) {
  return (key && ICONS[key]) || FolderGit2;
}
