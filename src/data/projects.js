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
 * @property {boolean} [featured]    Shown larger, at the top of the Projects section.
 * @property {string[]} [limitations]  Project page: what it can't do yet, stated plainly.
 * @property {string[]} [contributions] Project page: who did what (original coursework vs. this version).
 * @property {{ step: string, code?: string }[]} [install] Project page: how to try, run, or install it.
 * @property {{ caption: string, text: string }} [sampleOutput] Project page: real captured output.
 * @property {string} [interactive]
 *   An interactive tool shown on the project page, by its key in
 *   src/labs/registry.js. The card and page also get a "Try it" link to it.
 */

/** @type {Project[]} */
export const projects = [
  {
    id: "it-asset-tracker",
    title: "IT Asset & Service Request Tracker",
    status: "Completed",
    featured: true,
    category: "Portfolio project",
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
      "Switches, access and uplink ports, wall jacks, and VLANs are modeled the way a campus telecom team works with them, including patching and activating a jack.",
      "Jacks can't be patched into a switch uplink: the API refuses with 409 Conflict, and the patch dialog only offers free access ports.",
      "8 parameterized SQL reports (warranty expirations, ticket aging, time to resolve, jack utilization, and more), each with CSV export.",
      "The ticket workflow and assignment history are enforced on the server, with optimistic concurrency that returns 409 Conflict on stale edits.",
    ],
    architecture: [
      "src/ItAssetTracker.Api/: thin controllers, services with the business logic and the report SQL, domain rule classes, request and response contracts, and EF Core migrations.",
      "client/: React, TypeScript, Vite, and Tailwind CSS. Its production build is served by the API, so the whole app runs as one service.",
      "One Docker image (Node build stage, .NET publish stage, small non-root runtime) that reads the port from the PORT variable and has a /api/health check. Hosted on Render's free plan.",
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
    limitations: [
      "No sign-in: anyone who can reach the app can read and change data. The \"Working as\" picker records who did a ticket action, but the server can't verify it.",
      "SQLite allows one writer at a time, which is fine for a demo but not for heavy concurrent use.",
      "Render's free plan puts the demo to sleep after 15 minutes idle (the next visit takes about 50 seconds), and the demo data resets on every restart.",
      "All data is invented (Alder Creek College). The app hasn't been used by a real IT team.",
    ],
    install: [
      { step: "Try the live demo: no install needed. The first visit after a quiet period takes about 50 seconds while it wakes." },
      { step: "Run it locally: install the .NET 10 SDK and Node.js 22.22 or later, then get the code.", code: "git clone https://github.com/enobot/nate.git\ncd nate/apps/it-asset-service-request-tracker" },
      { step: "On Windows, one script restores, builds, and starts the app with demo data.", code: "powershell -ExecutionPolicy Bypass -File .\\run-demo.ps1" },
      { step: "Full setup, test commands, and Docker instructions are in the README." },
    ],
    contributions: [
      "Portfolio project built by Tracy Tran and Nathanael Haig.",
      "The data model is based on the jack, switch port, and ServiceNow ticket work in Nathanael's CSUF IT Telecommunications job.",
    ],
    links: {
      demo: "https://it-asset-service-request-tracker.onrender.com",
      source: "https://github.com/enobot/nate/tree/main/apps/it-asset-service-request-tracker",
      docs: "https://github.com/enobot/nate/blob/main/apps/it-asset-service-request-tracker/docs/WALKTHROUGH.md",
    },
  },
  {
    id: "network-diagnostics-toolkit",
    title: "Network Diagnostics Toolkit",
    status: "Completed",
    featured: true,
    category: "Portfolio project",
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
      "11 commands with comment-based help, plus an interactive numbered menu with [PASS]/[FAIL] output.",
      "Ping and port checks use .NET Ping and TcpClient with timeouts instead of Test-NetConnection, which took 8.9 s to report a closed port on the development PC, compared with 2.1 s for TcpClient.",
      "Reports are UTF-8 CSV and text files that never overwrite an existing file and neutralize spreadsheet-formula cells.",
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
    images: [
      {
        src: "projects/network-diagnostics-toolkit/console-output.svg",
        alt: "Toolkit console output: a passing ping of 127.0.0.1, a ticket note with three passing checks, and a refused request for 21 ports.",
        width: 1352,
        height: 609,
        caption: "Real console output from docs/examples/cmdlet-usage.txt (captured 2026-11-23, Windows PowerShell 5.1), drawn as an image with the long prompt shortened to PS>. Not a screenshot.",
      },
    ],
    sampleOutput: {
      caption: "Real console output, captured with tools/New-ExampleTranscript.ps1 on 2026-11-23 on Windows PowerShell 5.1. The computer name, MAC addresses, and network details were replaced with documentation values.",
      text: `PS> Test-NdtPing -Target 127.0.0.1 -Count 2 | Show-NdtResult
[PASS] Ping 127.0.0.1 - 2/2 replies, 0% loss, min/avg/max 0/0/0 ms
       Reply 1: Success from 127.0.0.1 time=0 ms TTL=128
       Reply 2: Success from 127.0.0.1 time=0 ms TTL=128

PS> Get-NdtAdapter | Show-NdtResult -NoDetails
[PASS] Adapter Ethernet - Up at 1 Gbps, MAC 00-00-5E-00-53-10
[WARN] Adapter Wi-Fi - Media disconnected: no link detected, MAC 00-00-5E-00-53-11. Check the cable and wall jack, or that Wi-Fi is connected.

PS> Invoke-NdtQuickCheck -Target localhost -Port $openPort -Count 1 | New-NdtTicketNote -Title 'INC0000000 example'
INC0000000 example
Run: 2026-11-23T22:32:35-08:00 from HELPDESK-PC01
Tool: Network Diagnostics Toolkit 1.0.0 (read-only checks; only the targets listed were contacted)

[PASS] DNS localhost - A lookup for localhost returned 1 record(s) in 0 ms: A 127.0.0.1 (TTL 1200s)
[PASS] Ping localhost - 1/1 replies (resolved to 127.0.0.1), 0% loss, min/avg/max 0/0/0 ms
[PASS] TcpPort localhost - TCP port 55732 is open on localhost (127.0.0.1) (connected in 0 ms).

Totals: 3 check(s) - 3 PASS, 0 FAIL, 0 WARN, 0 INFO

PS> Test-NdtPort -Target 127.0.0.1 -Port (1..21)
Error: Too many ports (21). The limit is 20 per run. Port scanning is not supported.`,
    },
    limitations: [
      "Windows only: it needs Windows 10, Windows 11, or Windows Server with Windows PowerShell 5.1 or PowerShell 7, because it uses tracert and the Windows networking modules.",
      "Read-only by design: it never changes network settings, never scans address ranges, and stops at 10 targets and 20 TCP checks per run.",
      "PowerShell 7 is tested in GitHub Actions only, not on the development PC. The timings above are single measurements on one PC, not benchmarks.",
      "Not on the PowerShell Gallery: publishing needs a Gallery API key, so it's installed from the repository or the release ZIP.",
    ],
    install: [
      { step: "Needs Windows 10, Windows 11, or Windows Server with Windows PowerShell 5.1 (built in) or PowerShell 7. No administrator rights needed." },
      { step: "Download NetworkDiagnosticsToolkit-1.0.0.zip from the release and extract it, or clone the repository and open apps\\network-diagnostics-toolkit.", code: "git clone https://github.com/enobot/nate.git\ncd nate\\apps\\network-diagnostics-toolkit" },
      { step: "Start the interactive menu.", code: "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\Start-NetworkToolkit.ps1" },
      { step: "Or import the module and run the commands directly.", code: "Import-Module .\\src\\NetworkDiagnostics\\NetworkDiagnostics.psd1" },
    ],
    contributions: [
      "Portfolio project built by Tracy Tran and Nathanael Haig.",
      "The checks mirror the ping, tracert, and ipconfig troubleshooting in Nathanael's CSUF IT Telecommunications job.",
    ],
    links: {
      release: "https://github.com/enobot/nate/releases/tag/toolkit-v1.0.0",
      source: "https://github.com/enobot/nate/tree/main/apps/network-diagnostics-toolkit",
      docs: "https://github.com/enobot/nate/blob/main/apps/network-diagnostics-toolkit/docs/WALKTHROUGH.md",
    },
  },
  {
    id: "movie-theater-tickets",
    title: "Movie Theater Ticket System",
    status: "Completed",
    category: "Expanded rebuild of coursework",
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
      "The original project's ticket and concession pricing (ticket types, matinee discount, premium seats, sales tax) runs as a server-side C# module covered by 25 unit tests.",
      "Transactions and unique indexes prevent double-booking, shown by a test that sends 12 simultaneous requests for one seat.",
      "A keyboard-accessible React and TypeScript seat map with live SignalR updates, plus a cookie-protected admin dashboard for movies, screenings, reservations, and sales.",
    ],
    architecture: [
      "src/MovieTheater.Api/: ASP.NET Core with thin controllers, services for booking, seat holds, orders, and reports, a PriceCalculator, EF Core migrations, and a SignalR hub for seat updates.",
      "client/: React, TypeScript, Vite, and Tailwind CSS. Its production build is served by the API, so the whole app runs as one service.",
      "Checkout is simulated and never asks for card details. The admin area uses a cookie sign-in with a rate-limited login.",
      "One Docker image, hosted free on Render with a /healthz health check.",
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
    limitations: [
      "Payments are simulated: there are no card fields and no payment provider.",
      "One shared demo admin account, not per-user accounts.",
      "Render's free plan puts the demo to sleep after 15 minutes idle (the next visit takes about 50 seconds), and the demo data resets on every restart.",
    ],
    install: [
      { step: "Try the live demo: no install needed. The first visit after a quiet period takes about 50 seconds while it wakes." },
      { step: "Run it locally: install the .NET 10 SDK and Node.js 22.22 or later, then restore and start the app from apps/movie-theater-ticket-system.", code: "dotnet restore MovieTheater.slnx\nnpm ci --prefix client\ndotnet run --project src/MovieTheater.Api" },
      { step: "The README covers the client build, the demo admin password setting, and the test commands." },
    ],
    contributions: [
      "Original coursework: Nathanael Haig built the original C# desktop ticketing app for a class. That version isn't included here.",
      "This web rebuild: a portfolio project built by Tracy Tran and Nathanael Haig, reusing the original's pricing rules.",
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
    category: "Expanded rebuild of coursework",
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
      "A product-mix linear program whose dual values become shadow prices, with plain-English bottleneck explanations.",
      "Excel-style allowable ranges and Goal Seek, recovered with bisection and Brent's method over repeated solves.",
      "Datasets, scenarios, and solver runs are stored in SQLite with parameterized reporting queries, and uploads are validated (size limits, spreadsheet-formula neutralization).",
    ],
    architecture: [
      "optimizer/: the model, solver, sensitivity, and Goal Seek as plain Python with no Streamlit code, so it can be tested on its own.",
      "data/: SQLite storage (datasets, scenarios, solver runs) and CSV/Excel import and export.",
      "app_pages/ and ui/: eight Streamlit pages (Dashboard, Optimizer, Sensitivity, Scenarios, Goal Seek, Data & Files, SQL Reports, About) with Plotly charts.",
      "Hosted free on Streamlit Community Cloud from this site's repository.",
    ],
    testing: [
      "127 automated tests (pytest and Streamlit AppTest): hand-solved textbook problems, infeasible and unbounded cases, shadow-price sign checks, Goal Seek accuracy, upload validation, SQLite round trips, and CSV/Excel round trips.",
      "Checked by hand in the browser: raising labor hours from 2,800 to 3,000 raised profit from $134,524 to $138,844, exactly the 200 × $21.60 the app's shadow price predicts.",
      "The hosted app shows the same $134,524 optimal plan as the local one.",
    ],
    images: [
      {
        src: "projects/operations-optimization/dashboard.png",
        alt: "Dashboard of the Operations and Optimization app showing an optimal profit contribution of $134,524, a recommended production plan chart, and resource utilization.",
        width: 1366,
        height: 860,
        caption: "Dashboard of the live app (screenshot taken 2026-11-24): the optimal plan, its gain over the recent mix, and which resources are binding. The Fork button and badge are Streamlit's own.",
      },
      {
        src: "projects/operations-optimization/optimizer.png",
        alt: "Optimizer page with editable labor hours, machine hours, material budget, rates, and a product table.",
        width: 1366,
        height: 860,
        caption: "Optimizer page of the live app (screenshot taken 2026-11-24): editable resources, costs, and products, with synthetic data labeled as such.",
      },
    ],
    limitations: [
      "All data is synthetic (a fictional furniture maker), and the app labels it that way.",
      "Streamlit Community Cloud puts the app to sleep when nobody has used it for a while, so the first visit may need a click to wake it, and anything a visitor saves resets when it restarts.",
      "Tested on Python 3.13 only.",
    ],
    install: [
      { step: "Try the live demo: no install needed." },
      { step: "Run it locally with Python 3.13, from the root of the repository (Windows PowerShell shown).", code: "python -m venv apps\\operations-optimization-analysis\\.venv\n.\\apps\\operations-optimization-analysis\\.venv\\Scripts\\Activate.ps1\npython -m pip install -r apps\\operations-optimization-analysis\\requirements.txt\nstreamlit run apps/operations-optimization-analysis/app.py" },
    ],
    contributions: [
      "Original coursework: Nathanael Haig built the original Excel linear-programming model for a class.",
      "This web rebuild: a portfolio project built by Tracy Tran and Nathanael Haig.",
    ],
    links: {
      demo: "https://nate-operations-optimization.streamlit.app",
      source: "https://github.com/enobot/nate/tree/main/apps/operations-optimization-analysis",
      docs: "https://github.com/enobot/nate/blob/main/apps/operations-optimization-analysis/docs/WALKTHROUGH.md",
    },
  },
  // Campus Network Lab stays last until its Packet Tracer build is done and
  // verified; then move it to the top of this list.
  {
    id: "campus-network-lab",
    title: "Campus Network Lab",
    status: "In Development",
    category: "Portfolio project",
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
    limitations: [
      "Not yet built or tested in Packet Tracer, so there is no .pkt file and no Packet Tracer screenshot.",
      "The automated checks read the config files; they don't prove the configs behave the same on Packet Tracer's simulated devices.",
    ],
    contributions: [
      "Portfolio project designed by Tracy Tran and Nathanael Haig.",
    ],
    links: {
      source: "https://github.com/enobot/campus-network-lab",
      docs: "https://github.com/enobot/campus-network-lab/tree/main/docs",
    },
  },
];

export default projects;
