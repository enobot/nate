// =============================================================================
// PROFILE DATA: everything about Nate that appears on the site lives here.
// Edit the text in this file and the site updates; no component changes needed.
// See EDITING.md for step-by-step instructions.
//
// Privacy: do NOT add a phone number or street address to this file.
// The site is public. Email and LinkedIn are the contact methods.
// =============================================================================

export const profile = {
  name: "Nathanael Haig",
  shortName: "Nate",
  location: "Fullerton, CA",
  email: "nathanaelahaig@gmail.com",
  linkedin: "https://www.linkedin.com/in/nah28",
  // Paste your own GitHub profile URL here (e.g. "https://github.com/your-username")
  // and it replaces the "Project code" link below in the hero and Contact section.
  github: "",
  // The repository that holds the project code. Shown as "Project code on GitHub"
  // so it is never mistaken for a personal GitHub profile.
  projectRepo: "https://github.com/enobot/nate",

  hero: {
    kicker: "IT Portfolio",
    role: "IT Support · Networking · Information Systems",
    // The big line under the name: what Nate does, in plain words.
    headline: "Information Systems student with hands-on campus network and ServiceNow support experience at Cal State Fullerton.",
    tagline:
      "Information Systems student (B.A., May 2027) and IT Telecommunications student assistant. Seeking entry-level IT support, network technician, NOC technician, and IT analyst roles.",
    // Verified facts shown as chips under the tagline (all from the resume).
    // The project counts are added automatically from projects.js.
    highlights: [
      "~50 data/voice jack activations per week",
      "Switch ports and VLANs on Alcatel-Lucent OmniSwitch over SSH",
      "ServiceNow tickets in a team that handles 100+ per week",
    ],
    // Shown in the "status panel" next to the name. Keep each value short.
    status: [
      { label: "Status", value: "Open to entry-level IT roles", live: true },
      { label: "Grad", value: "May 2027" },
      { label: "Base", value: "Fullerton, CA" },
      { label: "Current", value: "CSUF IT Telecommunications" },
    ],
  },

  about: {
    paragraphs: [
      "I'm an Information Systems student at California State University, Fullerton (B.A. in Business Administration, Information Systems concentration, expected May 2027). My coursework covers database management, SQL, systems analysis, and business telecommunications.",
      "Alongside my job on the campus network team, I build small IT tools to practice the work: a diagnostics module, an asset and ticket tracker, and a network lab. Each project page says what is finished and what was tested.",
      "Earlier roles in high-volume restaurants gave me customer service, team leadership, and staff training experience.",
    ],
    targetRoles: ["IT support", "Network technician", "NOC technician", "IT analyst"],
  },

  education: [
    {
      school: "California State University, Fullerton",
      credential: "Bachelor of Arts in Business Administration",
      detail: "Concentration in Information Systems",
      date: "Expected May 2027",
      completedCoursework: [
        "Database Management Systems",
        "Principles of Information Systems",
        "Introduction to Programming",
        "Business Analytics I & II",
      ],
      inProgressCoursework: [
        { name: "Business Telecommunications", term: "Fall 2026" },
        { name: "Systems Analysis & Design", term: "Fall 2026" },
        { name: "Integrated Enterprise Information Systems", term: "Spring 2027" },
        { name: "Senior Project: Information Systems Development", term: "Spring 2027" },
      ],
    },
    {
      school: "Glendale Community College",
      credential: "Transfer coursework",
      date: "2021 – 2025",
    },
  ],

  // Jobs, newest first. The job with `featured: true` gets the large dashboard card.
  experience: [
    {
      id: "csuf-it-telecom",
      featured: true,
      organization: "California State University, Fullerton",
      team: "IT Telecommunications · Network analyst team",
      title: "IT Telecommunications Student Assistant",
      location: "Fullerton, CA",
      start: "Sep 2026",
      end: "Present",
      summary:
        "Supporting the network analyst team in Cal State Fullerton IT Telecommunications across the entire campus.",
      // Stat tiles. Each tile reads as one sentence: kicker + value + label.
      // Only use numbers that are on the resume.
      stats: [
        { icon: "cable", kicker: "", value: "~50", label: "data/voice jack activations per week" },
        { icon: "ticket", kicker: "Team handles", value: "100+", label: "ServiceNow tickets per week" },
        { icon: "users", kicker: "Office moves of", value: "50+", label: "people supported" },
        { icon: "building", kicker: "", value: "Campus-wide", label: "coverage" },
      ],
      highlights: [
        "Activate and verify switch ports and assign VLANs on Alcatel-Lucent OmniSwitch devices over SSH using PuTTY, connecting data and voice endpoints across the entire campus.",
        "Install and repair data and voice jacks to restore LAN and telephone service, and verify additional connections.",
        "Diagnose connectivity issues with ping, tracert, ipconfig, and OmniSwitch port status checks, resolving some independently and working with network analysts on complex router, switch, and VPN problems.",
        "Work ServiceNow incidents and service requests, updating ticket notes and status through closure (more tickets during move seasons).",
        "Maintain the university's telecommunications database and equipment asset records, keeping phone and equipment information accurate and current.",
      ],
      tools: [
        "Alcatel-Lucent OmniSwitch",
        "VLANs",
        "SSH",
        "PuTTY",
        "ping",
        "tracert",
        "ipconfig",
        "ServiceNow",
      ],
    },
    {
      id: "ramen-hub",
      organization: "Ramen Hub & Sushi",
      title: "Server & Marketing Content Creator",
      start: "Aug 2025",
      end: "Nov 2026",
      highlights: [
        "Handled guest requests in a high-volume restaurant and created promotional social media content.",
      ],
    },
    {
      id: "chipotle",
      organization: "Chipotle Mexican Grill",
      title: "Kitchen Manager",
      start: "Oct 2020",
      end: "Oct 2021",
      highlights: [
        "Supervised kitchen operations and coordinated team workflow during high-volume service.",
        "Trained staff and ensured compliance with food safety and quality standards.",
      ],
    },
  ],

  // Labels for the "where I used it" tags in the Skills section.
  evidence: {
    csuf: "CSUF IT Telecom",
    coursework: "Coursework",
    project: "Project",
    ramen: "Ramen Hub & Sushi",
    chipotle: "Chipotle",
  },

  // Skill groups, all shown at once so they're quick to scan.
  // `usedIn` lists keys from `evidence` above (where the skill was used).
  // Leave `usedIn` empty ([]) if you'd rather not show a tag for a skill.
  // Only list skills backed by the resume or a verified project.
  skills: [
    {
      id: "networking",
      label: "Networking",
      icon: "network",
      blurb: "Switch, VLAN, and jack work on the CSUF campus network.",
      items: [
        { name: "Alcatel-Lucent OmniSwitch", usedIn: ["csuf"] },
        { name: "Switch port activation & verification", usedIn: ["csuf"] },
        { name: "VLAN assignment", usedIn: ["csuf"] },
        { name: "LAN troubleshooting", usedIn: ["csuf"] },
        { name: "VPN connectivity", usedIn: ["csuf"] },
        { name: "Routers & switches", usedIn: ["csuf"] },
        { name: "Data & voice jack installation and repair", usedIn: ["csuf"] },
        { name: "ping, tracert, ipconfig", usedIn: ["csuf", "project"] },
        { name: "SSH (PuTTY)", usedIn: ["csuf"] },
        { name: "Cisco IOS: VLANs, ACLs, DHCP, inter-VLAN routing", usedIn: ["project"] },
      ],
    },
    {
      id: "it-operations",
      label: "IT Operations",
      icon: "headset",
      blurb: "Tickets, troubleshooting, and keeping campus users connected.",
      items: [
        { name: "ServiceNow incidents & service requests", usedIn: ["csuf"] },
        { name: "Hardware & software troubleshooting", usedIn: ["csuf"] },
        { name: "End-user support", usedIn: ["csuf"] },
        { name: "Technical documentation", usedIn: ["csuf"] },
        { name: "Equipment & asset tracking", usedIn: ["csuf", "project"] },
        // Nate: add where you used Zoom Phone, e.g. usedIn: ["csuf"].
        { name: "Zoom Phone", usedIn: [] },
        { name: "Customer service", usedIn: ["ramen"] },
      ],
    },
    {
      id: "databases",
      label: "Databases",
      icon: "database",
      blurb: "SQL, database management, and data analysis.",
      items: [
        { name: "SQL", usedIn: ["coursework", "project"] },
        { name: "SQLite & Entity Framework Core", usedIn: ["project"] },
        { name: "Database management", usedIn: ["coursework", "csuf"] },
        { name: "Telecommunications databases", usedIn: ["csuf"] },
        { name: "Microsoft Excel (pivot tables, Goal Seek, linear programming)", usedIn: ["project"] },
        { name: "Data visualization", usedIn: ["coursework"] },
        { name: "Statistical analysis", usedIn: ["coursework"] },
      ],
    },
    {
      id: "programming",
      label: "Programming",
      icon: "code",
      blurb: "C#, PowerShell, Python, and TypeScript, with automated tests on every project.",
      items: [
        { name: "C# & ASP.NET Core", usedIn: ["project"] },
        { name: "PowerShell", usedIn: ["project"] },
        { name: "Python (SciPy, pandas, Streamlit)", usedIn: ["project"] },
        { name: "React & TypeScript", usedIn: ["project"] },
        { name: "Automated testing (xUnit, Pester, pytest, Vitest)", usedIn: ["project"] },
        { name: "Git & GitHub Actions", usedIn: ["project"] },
      ],
    },
    {
      id: "systems",
      label: "Systems",
      icon: "server",
      blurb: "Analyzing and planning business information systems.",
      items: [
        { name: "Systems analysis & design", usedIn: ["coursework"] },
        { name: "Business analytics", usedIn: ["coursework"] },
        { name: "Docker & app hosting (Render, Streamlit)", usedIn: ["project"] },
        // Nate: add tags here if you want to show where you used these.
        { name: "Microsoft Project", usedIn: [] },
        { name: "Microsoft Office", usedIn: [] },
      ],
    },
  ],

  // "How a jack activation works": the steps shown in the Experience section.
  // Built from the CSUF duties on the resume. Nate: correct the wording if
  // your team's real process differs.
  workflow: {
    title: "How a jack activation works",
    steps: [
      {
        id: "ticket",
        label: "Ticket",
        icon: "ticket",
        text: "A ServiceNow service request comes in for a data or voice jack.",
      },
      {
        id: "locate",
        label: "Locate",
        icon: "cable",
        text: "Match the wall jack to the switch port it's patched to.",
      },
      {
        id: "configure",
        label: "Configure",
        icon: "terminal",
        text: "SSH into the Alcatel-Lucent OmniSwitch with PuTTY, activate the port, and assign the VLAN.",
      },
      {
        id: "verify",
        label: "Verify",
        icon: "network",
        text: "Check the port status and confirm connectivity with tools like ping.",
      },
      {
        id: "close",
        label: "Close",
        icon: "clipboard",
        text: "Update the ticket notes and status through closure.",
      },
    ],
  },

  // People credited in the footer for building this site.
  credits: ["Nathanael Haig", "Tracy Tran"],

  // Resume downloads. Files live in public/resume/. `primary: true` is the one
  // the "Download Resume" button in the hero links to.
  // Both PDFs are one page and have no phone number (checked before publishing).
  // If this list is ever emptied, the Resume section points visitors to LinkedIn
  // and email instead of showing download buttons.
  resumes: [
    {
      id: "network",
      label: "Network Technician resume",
      description: "Leads with switch port activation, VLAN assignment, and campus jack work.",
      file: "resume/Nathanael_Haig_Resume_Network.pdf",
      primary: true,
    },
    {
      id: "it-support",
      label: "IT Support resume",
      description: "Leads with ServiceNow tickets, connectivity diagnostics, and asset records.",
      file: "resume/Nathanael_Haig_Resume_IT_Support.pdf",
    },
  ],
};

export default profile;
