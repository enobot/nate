// =============================================================================
// PROJECTS: add, edit, or remove projects here. Cards on the site are built
// from this list automatically, in the order written below.
// See EDITING.md for a copy-paste template.
// =============================================================================

/**
 * The only allowed values for a project's `status`.
 * - "Completed": finished work. Describe what you built in the past tense.
 * - "In Development": work you are actively building. Describe it as a goal
 *   ("Building...", "Will..."), never as a finished result.
 */
export const PROJECT_STATUSES = /** @type {const} */ (["Completed", "In Development"]);

/**
 * @typedef {"Completed" | "In Development"} ProjectStatus
 */

/**
 * Optional screenshot. Put the image file in public/projects/ and reference it
 * WITHOUT a leading slash, e.g. "projects/campus-network-lab.png".
 * @typedef {Object} ProjectImage
 * @property {string} src     Path inside the public/ folder.
 * @property {string} alt     Describe what the screenshot shows (for screen readers).
 * @property {number} width   Real pixel width of the image file.
 * @property {number} height  Real pixel height of the image file.
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 *   Unique short name, lowercase-with-dashes (e.g. "movie-theater-tickets").
 * @property {string} title
 *   Project name shown on the card.
 * @property {ProjectStatus} status
 *   Must be one of PROJECT_STATUSES: "Completed" or "In Development".
 * @property {string} category
 *   Short label such as "Academic project" or "Personal project".
 * @property {string} summary
 *   One or two sentences shown on the card.
 * @property {string[]} tech
 *   Languages, tools, or concepts used (shown as chips).
 * @property {string[]} [details]
 *   Extra bullet points shown when the card is expanded. For "Completed"
 *   projects these are highlights; for "In Development" they are goals.
 * @property {string} [icon]
 *   Icon shown when there is no screenshot. One of: "network", "terminal",
 *   "database", "film", "calculator", "clipboard", "server", "code".
 *   See src/components/icons.js for the full list.
 * @property {ProjectImage} [image]
 *   Optional screenshot. When missing, a themed graphic with the icon is shown.
 * @property {string} [github]
 *   Full https:// link to the source code. Leave "" to hide the button.
 * @property {string} [demo]
 *   Full https:// link to a live demo or video. Leave "" to hide the button.
 */

/** @type {Project[]} */
export const projects = [
  {
    id: "movie-theater-tickets",
    title: "Movie Theater Ticket System",
    status: "Completed",
    category: "Academic project",
    summary:
      "A C# desktop application for movie selection, seat booking, checkout, and ticket and concession pricing.",
    tech: ["C#", "Desktop application"],
    details: [
      "Built the application flows for movie selection, seat booking, and checkout.",
      "Designed the user interface flow and implemented the ticket and concession pricing logic.",
    ],
    icon: "film",
    github: "",
    demo: "",
  },
  {
    id: "operations-optimization",
    title: "Operations & Optimization Analysis",
    status: "Completed",
    category: "Academic project",
    summary:
      "Linear programming models in Microsoft Excel that evaluate production decisions and maximize profit contribution.",
    tech: ["Microsoft Excel", "Linear programming", "Sensitivity analysis", "Goal Seek"],
    details: [
      "Built linear programming models to evaluate production decisions and maximize profit contribution.",
      "Applied sensitivity analysis and Goal Seek to test constraints and financial scenarios.",
    ],
    icon: "calculator",
    github: "",
    demo: "",
  },

  // ---------------------------------------------------------------------------
  // IMPORTANT, NATE: The three "In Development" projects below are PLACEHOLDERS.
  // Before you share this site with recruiters, edit or delete any project you
  // are not actually building. Interviewers may ask about anything listed here.
  // When you finish one: change status to "Completed", rewrite the summary and
  // details in the past tense, and add github/demo links if you have them.
  // ---------------------------------------------------------------------------
  {
    id: "campus-network-lab",
    title: "Campus Network Lab",
    status: "In Development",
    category: "Personal project",
    summary:
      "Building a Cisco Packet Tracer lab of a multi-VLAN campus network, with a documented topology and troubleshooting runbook.",
    tech: ["Cisco Packet Tracer", "VLANs", "802.1Q trunking", "Inter-VLAN routing", "DHCP", "ACLs"],
    details: [
      "Will configure 802.1Q trunking between switches and inter-VLAN routing.",
      "Will add a voice VLAN, DHCP, and access control lists (ACLs).",
      "Will document the topology and write a troubleshooting runbook.",
    ],
    icon: "network",
    github: "",
    demo: "",
  },
  {
    id: "it-asset-tracker",
    title: "IT Asset & Service Request Tracker",
    status: "In Development",
    category: "Personal project",
    summary:
      "Building a C#/.NET application with a SQL database for tracking equipment, jack and port assignments, and service requests.",
    tech: ["C#", ".NET", "SQL"],
    details: [
      "Will track equipment, jack and port assignments, and service requests in one database.",
      "Will include SQL reporting queries over that data.",
    ],
    icon: "clipboard",
    github: "",
    demo: "",
  },
  {
    id: "network-diagnostics-toolkit",
    title: "Network Diagnostics Toolkit",
    status: "In Development",
    category: "Personal project",
    summary:
      "Building PowerShell scripts that will automate ping, tracert, and ipconfig checks and log the results to CSV for ticket notes.",
    tech: ["PowerShell", "ping", "tracert", "ipconfig", "CSV"],
    details: [
      "Will run ping, tracert, and ipconfig checks from a single script.",
      "Will log results to CSV so they can be added to ticket notes.",
    ],
    icon: "terminal",
    github: "",
    demo: "",
  },
];

export default projects;
