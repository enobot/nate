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
    category: "Expanded rebuild of an academic project",
    summary:
      "An expanded web rebuild of an academic C# desktop project: a full-stack movie ticketing app with live seat maps, timed seat holds, simulated checkout, and an admin dashboard.",
    tech: [
      "C#",
      "ASP.NET Core",
      "Entity Framework Core",
      "SQLite",
      "SignalR",
      "React",
      "TypeScript",
      "Tailwind CSS",
      "xUnit",
      "Vitest",
      "GitHub Actions",
      "Docker",
    ],
    icon: "film",
    overview:
      "The original was a C# desktop application, built for a class, that took a customer from choosing a movie to booking seats and checking out. This is an expanded portfolio rebuild of that project as a web app, not the original coursework submission. All movies are fictional and every payment is simulated.",
    problem:
      "Two customers can try to buy the same seat at the same moment, and every price has to be trustworthy even though the browser can't be trusted.",
    solution:
      "Seats are held for 10 minutes while a customer checks out, and unique database indexes plus transactions make sure exactly one booking wins a race. Prices are calculated only on the server. SignalR pushes seat changes to everyone viewing the same screening, so a seat someone else holds is disabled without a reload.",
    details: [
      "Rebuilt the original project's ticket and concession pricing (ticket types, matinee discount, premium seats, sales tax) as a server-side C# module covered by 25 unit tests.",
      "Prevented double-booking with transactions and unique indexes, and proved it with a test that sends 12 simultaneous requests for one seat.",
      "Built a keyboard-accessible React and TypeScript seat map with live SignalR updates, plus a cookie-protected admin dashboard for movies, screenings, reservations, and sales.",
    ],
    architecture: [
      "src/MovieTheater.Api/: ASP.NET Core with thin controllers, services for booking, seat holds, orders, and reports, a PriceCalculator, EF Core migrations, and a SignalR hub for seat updates.",
      "client/: React, TypeScript, Vite, and Tailwind CSS. Its production build is served by the API, so the whole app runs as one service.",
      "Checkout is simulated and never asks for card details. The admin area uses a cookie sign-in with a rate-limited login.",
      "One Docker image, hosted free on Render with a /healthz health check. Render's free plan puts it to sleep after 15 minutes idle, so the first visit after that takes about 50 seconds, and the demo data resets on every restart.",
    ],
    testing: [
      "136 xUnit tests: 46 unit tests (25 of them for ticket and concession pricing) and 90 integration tests that run the real API against real SQLite files.",
      "A concurrency test sends 12 booking requests for the same seat at the same moment, and exactly one succeeds.",
      "48 Vitest tests for the React client, plus linting and TypeScript type-checking.",
      "Checked by hand in the browser: live seat updates between two customers in separate browsers, cart totals matching the server, simulated checkout, order lookup and cancellation, the admin dashboard, and the seat map on a phone.",
      "On the hosted app, holding a seat from a second cart changed it to \"held by another customer\" on an open seat map without a reload.",
    ],
    images: [
      {
        src: "projects/movie-theater-tickets/seat-map.jpg",
        alt: "Seat map for Neon Tide Runners in Auditorium 1, with premium rows, wheelchair-accessible seats, a legend, and a live updates indicator.",
        width: 800,
        height: 474,
        caption: "Seat map for a screening: premium rows, wheelchair-accessible seats, and a live-update indicator.",
      },
      {
        src: "projects/movie-theater-tickets/seat-held-countdown.jpg",
        alt: "Seat E7 selected on the seat map, with a 9:59 hold countdown in the header and in the Your seats panel.",
        width: 800,
        height: 468,
        caption: "A held seat with the 10-minute hold countdown in the header and side panel.",
      },
      {
        src: "projects/movie-theater-tickets/cart.jpg",
        alt: "Cart with seat E7 as an adult premium ticket, a concessions list, and a summary of tickets, concessions, sales tax, and total.",
        width: 800,
        height: 468,
        caption: "Cart with ticket types, concessions, and totals calculated by the server.",
      },
      {
        src: "projects/movie-theater-tickets/checkout-simulated.jpg",
        alt: "Checkout page with a notice that no real payment is processed, contact fields, and an order summary totaling $34.40.",
        width: 800,
        height: 474,
        caption: "Simulated checkout: no card fields, and clearly labeled that no real payment is processed.",
      },
      {
        src: "projects/movie-theater-tickets/order-confirmed.jpg",
        alt: "Order confirmation for one senior ticket and a Date Night Combo, with order number, tax, total, and a simulated payment reference.",
        width: 800,
        height: 468,
        caption: "Order confirmation with the ticket, concessions, tax, and a simulated payment reference.",
      },
      {
        src: "projects/movie-theater-tickets/order-lookup.jpg",
        alt: "My orders page that found one order by order number and email, with a Cancel order button.",
        width: 800,
        height: 468,
        caption: "Order lookup by order number and email, with online cancellation.",
      },
      {
        src: "projects/movie-theater-tickets/admin-sales-dashboard.jpg",
        alt: "Admin sales dashboard with gross sales, tickets sold, concessions, and refunds, plus ticket sales by movie and concession sales.",
        width: 800,
        height: 468,
        caption: "Admin sales dashboard with totals calculated from the orders in the database.",
      },
    ],
    links: {
      demo: "https://movie-theater-ticket-system.onrender.com",
      source: "https://github.com/enobot/nate/tree/main/apps/movie-theater-ticket-system",
      docs: "https://github.com/enobot/nate/blob/main/apps/movie-theater-ticket-system/docs/WALKTHROUGH.md",
    },
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
      "Hosted free on Streamlit Community Cloud from this site's repository. The app sleeps when nobody has used it for a while, so the first visit may need a click to wake it, and anything a visitor saves is reset when it restarts.",
    ],
    testing: [
      "127 automated tests (pytest and Streamlit AppTest): hand-solved textbook problems, infeasible and unbounded cases, shadow-price sign checks, Goal Seek accuracy, upload validation, SQLite round trips, and CSV/Excel round trips.",
      "Checked by hand in the browser: raising labor hours from 2,800 to 3,000 raised profit from $134,524 to $138,844, exactly the 200 × $21.60 the app's shadow price predicts.",
      "The hosted app shows the same $134,524 optimal plan as the local one.",
    ],
    links: {
      demo: "https://nate-operations-optimization.streamlit.app",
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
      "GitHub Actions runs the same tests on Windows PowerShell 5.1 and PowerShell 7, plus PSScriptAnalyzer, which fails the build on any warning. All three passed on the first run.",
    ],
    links: {
      source: "https://github.com/enobot/nate/tree/main/apps/network-diagnostics-toolkit",
      docs: "https://github.com/enobot/nate/blob/main/apps/network-diagnostics-toolkit/docs/WALKTHROUGH.md",
    },
  },
  {
    id: "it-asset-tracker",
    title: "IT Asset & Service Request Tracker",
    status: "Completed",
    category: "Personal project",
    summary:
      "A full-stack IT management app for a fictional college that tracks equipment, network jacks and switch ports, and service requests from intake to resolution.",
    tech: [
      "C#",
      "ASP.NET Core",
      "Entity Framework Core",
      "SQLite",
      "SQL",
      "React",
      "TypeScript",
      "Vite",
      "Tailwind CSS",
      "xUnit",
      "Vitest",
      "GitHub Actions",
      "Docker",
    ],
    icon: "clipboard",
    overview:
      "A web app for the IT department of a fictional school, Alder Creek College (all names, rooms, and devices are invented). It keeps equipment inventory, network jack and switch port patching, and service requests in one database, modeled on the records a campus telecom team keeps.",
    problem:
      "Campus IT teams often track equipment, jack-to-port patching, and service tickets in separate places, which leads to double-patched ports and lost ticket history.",
    solution:
      "An ASP.NET Core Web API with Entity Framework Core and SQLite that enforces the rules on the server: unique asset tags and serial numbers, one jack per switch port, no jacks on uplink ports, only the allowed ticket status changes, and VLANs from 1 to 4094. A React and TypeScript front end shows dashboards and reports where every number comes from a parameterized SQL query.",
    details: [
      "Modeled switches, ports (access and uplink), wall jacks, and VLANs the way a campus telecom team works with them, including patching and activating a jack.",
      "Kept jacks off switch uplink ports: the API refuses with a 409 Conflict, and the patch dialog only offers free access ports.",
      "Built 8 parameterized SQL reports, such as warranty expirations, ticket aging, time to resolve, and jack utilization, each with CSV export.",
      "Enforced the ticket workflow and assignment history on the server, with optimistic concurrency that returns 409 Conflict on stale edits.",
    ],
    architecture: [
      "src/ItAssetTracker.Api/: thin controllers, services with the business logic and the report SQL, domain rule classes, request and response contracts, and EF Core migrations.",
      "client/: React, TypeScript, Vite, and Tailwind CSS. Its production build is served by the API, so the whole app runs as one service.",
      "One Docker image (Node build stage, .NET publish stage, small non-root runtime) that reads the port from the PORT variable and has a /api/health check. It's hosted free on Render, whose free plan puts it to sleep after 15 minutes idle, so the first visit after that takes about 50 seconds, and the demo data resets on every restart.",
      "No sign-in yet: the demo's \"Working as\" technician picker is not authenticated, and the README says so.",
    ],
    testing: [
      "191 xUnit tests: unit tests for every ticket status change (36 combinations), the asset and network rules, and VLAN range edges, plus integration tests that run the real API against real SQLite files.",
      "40 Vitest component tests for the React pages, plus TypeScript type-checking and linting.",
      "GitHub Actions runs the backend tests, the client checks, and a Docker image build whenever the app changes. All three jobs passed on the first run.",
      "The hosted app on Render passes its /api/health check and returns the same report numbers as the local build.",
      "Checked by hand in the browser on desktop and mobile: creating an asset (including validation errors), moving a ticket through its workflow with its history, patching and activating jacks, and the reports.",
    ],
    images: [
      {
        src: "projects/it-asset-tracker/dashboard.jpg",
        alt: "Dashboard with counts of assets, open requests, warranty expirations, and network jacks, plus the newest service requests.",
        width: 800,
        height: 474,
        caption: "Dashboard with live counts from the database: assets, open requests, warranty expirations, and jack utilization.",
      },
      {
        src: "projects/it-asset-tracker/service-request.jpg",
        alt: "Service request SR000083, Activate jack 2-211A for office move, with its workflow, assignment controls, and history.",
        width: 800,
        height: 474,
        caption: "A service request with its workflow actions, assignment controls, and history.",
      },
      {
        src: "projects/it-asset-tracker/network-switches.jpg",
        alt: "Network page listing six closet switches with their access ports, patched ports, active jacks, and utilization bars.",
        width: 800,
        height: 469,
        caption: "Network switches with access-port utilization. Each switch's uplink is left out of the count.",
      },
      {
        src: "projects/it-asset-tracker/jack-dialog-no-free-ports.jpg",
        alt: "Patch and activate dialog for jack 1-113A warning that ADM-IDF1-SW01 has no free access ports, with the patch buttons disabled.",
        width: 800,
        height: 474,
        caption: "The patch dialog never offers a switch's uplink port. Here the switch has no free access ports left.",
      },
      {
        src: "projects/it-asset-tracker/reports.jpg",
        alt: "Reports page showing assets by status and assets by building, each with Show SQL and Export CSV buttons.",
        width: 800,
        height: 474,
        caption: "Each report is a parameterized SQL query, with Show SQL and Export CSV.",
      },
      {
        src: "projects/it-asset-tracker/assets.jpg",
        alt: "Equipment inventory table of laptops with asset tags, models, status, location, assignee, and warranty end dates, with search and filters.",
        width: 800,
        height: 474,
        caption: "Equipment inventory with search and filters by status, type, and building.",
      },
    ],
    links: {
      demo: "https://it-asset-service-request-tracker.onrender.com",
      source: "https://github.com/enobot/nate/tree/main/apps/it-asset-service-request-tracker",
      docs: "https://github.com/enobot/nate/blob/main/apps/it-asset-service-request-tracker/docs/WALKTHROUGH.md",
    },
  },
];

export default projects;
