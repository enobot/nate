// =============================================================================
// PROJECTS: add, edit, or remove projects here. The project cards AND each
// project's own page (/projects/<id>/) are built from this list, in this order.
// See EDITING.md for a copy-paste template.
//
// Every section of a project page is optional: leave a field out (or empty)
// and that section is simply not shown. Never fill a field with something that
// isn't true yet. Unfinished work stays "In Development".
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
 * An image file in public/projects/<id>/ (screenshot or diagram). Reference it
 * WITHOUT a leading slash, e.g. "projects/campus-network-lab/topology.svg".
 * @typedef {Object} ProjectImage
 * @property {string} src      Path inside the public/ folder.
 * @property {string} alt      What the image shows (read by screen readers).
 * @property {number} width    Real pixel width of the file.
 * @property {number} height   Real pixel height of the file.
 * @property {string} [caption] Short caption shown under the image.
 */

/**
 * Links shown as buttons. Use full https:// URLs. Leave a key out (or "")
 * to hide its button. Only add links you have opened and checked.
 * @typedef {Object} ProjectLinks
 * @property {string} [source] Source code repository.
 * @property {string} [demo]   Live, working demo.
 * @property {string} [docs]   Documentation (README, guides).
 * @property {string} [video]  Demo video.
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 *   Unique short name, lowercase-with-dashes. Also the page address:
 *   /projects/<id>/
 * @property {string} title
 * @property {ProjectStatus} status
 * @property {string} category    e.g. "Academic project" or "Personal project".
 * @property {string} summary     One or two sentences for the card.
 * @property {string[]} tech      Languages, tools, or concepts (shown as badges).
 * @property {string} [icon]      Icon when there is no image. See src/components/icons.js.
 * @property {string} [overview]  Project page: what it is, in a short paragraph.
 * @property {string} [problem]   Project page: the problem it addresses.
 * @property {string} [solution]  Project page: how it solves that problem.
 * @property {string[]} [details] Completed: highlights. In Development: goals.
 * @property {string[]} [architecture] Project page: how it's put together.
 * @property {string[]} [testing]      Project page: how it was tested, and what wasn't.
 * @property {string[]} [lessons]      Project page: lessons learned, in your own words.
 * @property {ProjectImage[]} [images] Screenshots or diagrams; the first is the card preview.
 * @property {ProjectLinks} [links]
 * @property {string} [interactive]
 *   An interactive tool shown on the project page, by its key in
 *   src/labs/registry.js. The card and page also get a "Try it" link to it.
 */

/** @type {Project[]} */
export const projects = [
  {
    id: "campus-network-lab",
    title: "Campus Network Lab",
    status: "In Development",
    category: "Personal project",
    summary:
      "A Cisco Packet Tracer lab of a fictional university network. The design, device configs, and automated checks are done; the Packet Tracer build and hands-on testing are in progress.",
    tech: ["Cisco Packet Tracer", "VLANs", "802.1Q trunking", "Inter-VLAN routing", "DHCP", "ACLs", "SSH", "Python (pytest)", "JavaScript"],
    icon: "network",
    interactive: "campus-policy-explorer",
    overview:
      "A campus network for a fictional school, Halcyon Ridge University, designed for Cisco Packet Tracer: five VLANs trunked over 802.1Q, inter-VLAN routing on a router-on-a-stick, DHCP with exclusions, a voice VLAN for IP phones, ACLs that control who can reach what, and SSH-only device management.",
    problem:
      "A campus network has to keep groups like faculty, students, servers, and phones on separate networks while still letting each one reach the services it needs, and only IT should be able to manage the network devices.",
    solution:
      "Each group gets its own VLAN and subnet. One router routes between them and hands out addresses with DHCP. Two extended ACLs decide which traffic is allowed, and the switches and router only accept SSH from the management VLAN.",
    details: [
      "Will build the network in Packet Tracer by following the lab's build guide and pasting in the finished configs.",
      "Will run the 32 end-to-end allowed/blocked traffic tests from the verification checklist and record the results.",
      "Will add real Packet Tracer screenshots and the saved .pkt file once the build is verified.",
    ],
    architecture: [
      "R1 (ISR4331): router-on-a-stick with one subinterface per VLAN, the DHCP server, and the ACLs.",
      "CORE-SW1 plus two access switches (Cisco 2960s), connected by 802.1Q trunks with a dedicated native VLAN.",
      "VLANs 10 Faculty, 20 Students, 30 Servers, 50 Voice, and 99 Management, on 10.10.x.0/24 subnets.",
      "Students are blocked from internal networks except the campus web and DNS server, and the server VLAN only allows the services it offers.",
    ],
    testing: [
      "Automated design checks (pytest) read the config files and verify the addressing plan, VLANs and trunks, DHCP pools, SSH settings, and 32 allowed/blocked ACL traffic cases. They run on GitHub Actions and are currently passing.",
      "The policy explorer on this page is a JavaScript port of the Python ACL checker that runs on the real config files in the browser. For all 32 cases it gives the same result and the same reasoning as the Python version, and its own tests check that every line of R1's two ACLs decides at least one case.",
      "Not yet tested in Packet Tracer: pasting the configs into Packet Tracer and checking end-to-end connectivity is the next step.",
    ],
    images: [
      {
        src: "projects/campus-network-lab/topology.svg",
        alt: "Topology diagram: router R1 trunks to core switch CORE-SW1, which connects the web and DNS server and trunks to two access switches serving faculty, students, phones, and IT.",
        width: 1200,
        height: 840,
        caption: "Topology diagram from the lab's design docs. This is a design drawing, not a Packet Tracer screenshot.",
      },
    ],
    links: {
      source: "https://github.com/enobot/campus-network-lab",
      docs: "https://github.com/enobot/campus-network-lab/tree/main/docs",
    },
  },
  {
    id: "movie-theater-tickets",
    title: "Movie Theater Ticket System",
    status: "Completed",
    category: "Academic project",
    summary:
      "A C# desktop application for movie selection, seat booking, checkout, and ticket and concession pricing.",
    tech: ["C#", "Desktop application"],
    icon: "film",
    overview:
      "A C# desktop application, built for a class, that takes a customer from choosing a movie to booking seats and checking out.",
    problem:
      "A movie theater has to sell tickets for specific showtimes, keep track of which seats are taken, and price tickets and snacks correctly at checkout.",
    solution:
      "The application walks the user through movie selection, seat booking, and checkout, with the ticket and concession pricing calculated by the program.",
    details: [
      "Built the application flows for movie selection, seat booking, and checkout.",
      "Designed the user interface flow and implemented the ticket and concession pricing logic.",
    ],
  },
  {
    id: "operations-optimization",
    title: "Operations & Optimization Analysis",
    status: "Completed",
    category: "Expanded rebuild of an academic project",
    summary:
      "A Streamlit app that solves a product-mix linear program with SciPy's HiGHS solver, with shadow prices, sensitivity sweeps, Goal Seek, and saved SQLite scenarios. An expanded rebuild of an Excel coursework project.",
    tech: ["Python", "SciPy (HiGHS)", "pandas", "SQL / SQLite", "Plotly", "Streamlit", "Excel (openpyxl)", "pytest", "GitHub Actions"],
    icon: "calculator",
    overview:
      "An interactive web app for a fictional furniture maker, Juniper Oak Furniture Co. (all data is synthetic and labeled as such). It rebuilds Nate's Excel linear-programming coursework as a full application: change the inputs, re-solve, and see what limits profit and why.",
    problem:
      "A manufacturer with limited labor hours, machine hours, and material budget has to decide how many of each product to build to earn the most profit contribution.",
    solution:
      "A linear-programming model solved with HiGHS through SciPy's linprog. The solver's dual values become shadow prices, each checked against a re-solve with one more unit. Sensitivity ranges and Goal Seek come from repeated re-solves, scenarios are saved in SQLite, and CSV and Excel files can be imported and exported.",
    details: [
      "Built the product-mix linear program and turned the solver's dual values into shadow prices with plain-English bottleneck explanations.",
      "Recovered Excel-style allowable ranges and Goal Seek (bisection and Brent's method over repeated solves).",
      "Stored datasets, scenarios, and solver runs in SQLite with parameterized reporting queries, and validated uploads (size limits, spreadsheet-formula neutralization).",
    ],
    architecture: [
      "optimizer/: the model, solver, sensitivity, and Goal Seek as plain Python with no Streamlit code, so it can be tested on its own.",
      "data/: SQLite storage (datasets, scenarios, solver runs) and CSV/Excel import and export.",
      "app_pages/ and ui/: eight Streamlit pages (Dashboard, Optimizer, Sensitivity, Scenarios, Goal Seek, Data & Files, SQL Reports, About) with Plotly charts.",
    ],
    testing: [
      "127 automated tests (pytest and Streamlit AppTest): hand-solved textbook problems, infeasible and unbounded cases, shadow-price sign checks, Goal Seek accuracy, upload validation, SQLite round trips, and CSV/Excel round trips.",
      "Checked by hand in the browser: raising labor hours from 2,800 to 3,000 raised profit from $134,524 to $138,844, exactly the 200 × $21.60 the app's shadow price predicts.",
    ],
    links: {
      source: "https://github.com/enobot/nate/tree/main/apps/operations-optimization-analysis",
      docs: "https://github.com/enobot/nate/blob/main/apps/operations-optimization-analysis/docs/WALKTHROUGH.md",
    },
  },
  {
    id: "network-diagnostics-toolkit",
    title: "Network Diagnostics Toolkit",
    status: "Completed",
    category: "Personal project",
    summary:
      "A read-only PowerShell module and interactive menu for help desk and network technicians. It runs ping, traceroute, IP configuration, DNS, adapter, and TCP port checks, then saves the results as timestamped CSV and text reports plus paste-ready ticket notes.",
    tech: ["PowerShell", ".NET (Ping, TcpClient)", "NetTCPIP / DnsClient / NetAdapter", "tracert", "Pester", "PSScriptAnalyzer", "GitHub Actions"],
    icon: "terminal",
    overview:
      "A PowerShell module for the first round of network troubleshooting on a Windows PC. Every check prints a clear [PASS], [FAIL], [WARN], or [INFO] line with a plain-language explanation, and the results can be saved as a report or turned into notes for a help desk ticket.",
    problem:
      "Help desk technicians repeat the same connectivity checks for every ticket, then retype the results into the ticket notes by hand.",
    solution:
      "Eleven module commands and a numbered menu. Every check returns the same result shape, so ping, DNS, and port results all feed one CSV file, one text report, and one block of ticket notes. Input is validated before anything is sent: explicit targets only, no address ranges or scans, at most 10 targets and 20 TCP checks per run, and no command that changes settings.",
    details: [
      "Built 11 commands with comment-based help and an interactive menu with [PASS]/[FAIL] output.",
      "Used .NET Ping and TcpClient with timeouts instead of Test-NetConnection, which took 8.9 s to report a closed port on the development PC, compared with 2.1 s for TcpClient.",
      "Wrote reports as UTF-8 CSV and text files that never overwrite an existing file and neutralize spreadsheet-formula cells.",
    ],
    architecture: [
      "src/NetworkDiagnostics/: the module, with one file per exported command in Public/ and the shared logic in Private/.",
      "Each check has three steps: validate the input, collect data through small network wrapper functions, and interpret the result as PASS, FAIL, WARN, or INFO.",
      "Only the wrapper functions touch the network, so unit tests can replace them with mocks. Reports and ticket notes are built from the same result objects.",
    ],
    testing: [
      "271 Pester tests: 260 unit tests with mocked Windows network calls and 11 integration tests against localhost and a TCP listener the tests open, including an end-to-end menu run in a separate PowerShell process.",
      "94.3% code coverage of the module on Windows PowerShell 5.1.",
      "PowerShell 7 support pending CI: the same tests run on PowerShell 7 in GitHub Actions, along with PSScriptAnalyzer.",
    ],
    links: {
      source: "https://github.com/enobot/nate/tree/main/apps/network-diagnostics-toolkit",
      docs: "https://github.com/enobot/nate/blob/main/apps/network-diagnostics-toolkit/docs/WALKTHROUGH.md",
    },
  },

  // ---------------------------------------------------------------------------
  // IMPORTANT, NATE: The "In Development" project below is still being built.
  // Before you share this site with recruiters, edit or delete any project you
  // are not actually working on. Interviewers may ask about anything listed.
  // When one is finished and verified: change status to "Completed", rewrite the
  // text in the past tense, and add its links, images, and test results.
  // ---------------------------------------------------------------------------
  {
    id: "it-asset-tracker",
    title: "IT Asset & Service Request Tracker",
    status: "In Development",
    category: "Personal project",
    summary:
      "Building a web application with a SQL database for tracking equipment, network jack and switch port assignments, and service requests.",
    tech: ["C#", "ASP.NET Core", "Entity Framework Core", "SQL", "React"],
    icon: "clipboard",
    overview:
      "A planned IT management web application for a fictional organization, modeled on the kind of equipment and jack records kept by a campus telecommunications team.",
    details: [
      "Will track equipment, jack and port assignments, and service requests in one database.",
      "Will include SQL reporting queries over that data.",
    ],
  },
];

export default projects;
