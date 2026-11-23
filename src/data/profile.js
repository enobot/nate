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
  // Paste your GitHub profile URL here (e.g. "https://github.com/your-username")
  // and GitHub links will appear in the Contact section automatically.
  github: "",

  hero: {
    kicker: "IT Portfolio",
    role: "IT Support · Networking · Information Systems",
    tagline:
      "Information Systems student at Cal State Fullerton, supporting the network analyst team in CSUF IT Telecommunications across the entire campus.",
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
      "I'm an Information Systems student at California State University, Fullerton, earning a B.A. in Business Administration with a concentration in Information Systems (expected May 2027).",
      "As an IT Telecommunications Student Assistant, I support the network analyst team across the entire campus: activating and verifying switch ports, assigning VLANs on Alcatel-Lucent OmniSwitch devices over SSH, installing and repairing data and voice jacks, diagnosing connectivity issues, and working ServiceNow incidents and service requests.",
      "My coursework covers database management, SQL, systems analysis, and business telecommunications. Earlier roles in high-volume restaurants gave me customer service, team leadership, and staff training experience.",
    ],
    targetRoles: ["IT support", "Network technician", "IT analyst"],
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
        "Activate roughly 50 data and voice jacks per week and verify additional connections; install and repair jacks to restore LAN and telephone service.",
        "Diagnose connectivity issues with ping, tracert, ipconfig, and OmniSwitch port status checks, resolving some independently and working with network analysts on complex router, switch, and VPN problems.",
        "Support department office moves of 50+ people, activating and verifying data and voice connections.",
        "Work ServiceNow incidents and service requests as part of a team handling 100+ tickets per week (more during move seasons), updating ticket notes and status through closure.",
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

  // Skill categories shown as tabs. `usedIn` lists keys from `evidence` above.
  // Leave `usedIn` empty ([]) if you'd rather not show a tag for a skill.
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
      ],
    },
    {
      id: "diagnostics",
      label: "Diagnostics & Tools",
      icon: "terminal",
      blurb: "Command-line checks and the tools used to find and fix connectivity problems.",
      items: [
        { name: "ping", usedIn: ["csuf"] },
        { name: "tracert", usedIn: ["csuf"] },
        { name: "ipconfig", usedIn: ["csuf"] },
        { name: "Switch port status commands", usedIn: ["csuf"] },
        { name: "SSH", usedIn: ["csuf"] },
        { name: "PuTTY", usedIn: ["csuf"] },
        { name: "ServiceNow", usedIn: ["csuf"] },
        // Nate: add where you used Zoom Phone, e.g. usedIn: ["csuf"].
        { name: "Zoom Phone", usedIn: [] },
      ],
    },
    {
      id: "it-support",
      label: "IT Support",
      icon: "headset",
      blurb: "Helping campus users and keeping technical records accurate.",
      items: [
        { name: "Hardware & software troubleshooting", usedIn: ["csuf"] },
        { name: "End-user support", usedIn: ["csuf"] },
        { name: "Technical documentation", usedIn: ["csuf"] },
        { name: "Equipment & asset tracking", usedIn: ["csuf"] },
        { name: "Telecommunications databases", usedIn: ["csuf"] },
      ],
    },
    {
      id: "data-programming",
      label: "Data & Programming",
      icon: "database",
      blurb: "Database, programming, and analytics skills from coursework and academic projects.",
      items: [
        { name: "SQL", usedIn: ["coursework"] },
        { name: "C#", usedIn: ["project"] },
        { name: "Database management", usedIn: ["coursework", "csuf"] },
        { name: "Systems analysis", usedIn: ["coursework"] },
        { name: "Microsoft Excel (pivot tables, Goal Seek, linear programming)", usedIn: ["project"] },
        { name: "Data visualization", usedIn: ["coursework"] },
        { name: "Statistical analysis", usedIn: ["coursework"] },
      ],
    },
    {
      id: "software",
      label: "Software",
      icon: "app-window",
      blurb: "Productivity, planning, and creative applications.",
      items: [
        // Nate: add tags here if you want to show where you used these.
        { name: "Microsoft Office", usedIn: [] },
        { name: "Microsoft Project", usedIn: [] },
        { name: "Adobe After Effects", usedIn: [] },
      ],
    },
    {
      id: "professional",
      label: "Professional",
      icon: "handshake",
      blurb: "People skills from high-volume restaurant roles.",
      items: [
        { name: "Customer service", usedIn: ["ramen"] },
        { name: "Team leadership", usedIn: ["chipotle"] },
        { name: "Staff training", usedIn: ["chipotle"] },
      ],
    },
  ],

  // Resume downloads. Files live in public/resume/. `primary: true` is the one
  // the "Download Resume" button in the hero links to.
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
