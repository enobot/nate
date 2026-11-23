# Editing your portfolio

Hi Nate! This guide shows how to update the site yourself. You don't need to touch any
component code: **all the words on the site live in two files**:

| File | What's in it |
| --- | --- |
| `src/data/profile.js` | Your name, email, LinkedIn, GitHub, hero text, About text, education, jobs, skills, and resume files |
| `src/data/projects.js` | Your projects (one block per project) |

After you edit and push to GitHub, the site rebuilds and updates by itself (see
[How changes go live](#how-changes-go-live)).

> **Privacy rule:** never put your phone number or street address in these files. The site
> is public. There's a test that fails on purpose if a phone number shows up.

---

## 1. Run the site on your computer

You only need to do the setup once.

1. Install **Node.js 26** from <https://nodejs.org> (or use `nvm-windows` and run `nvm use 26`).
2. Open a terminal in this folder (`nate`).
3. Install the dependencies:

   ```bash
   npm install
   ```

4. Start the local preview:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:5173> in your browser. Leave the terminal running: every time you
   save a file, the page refreshes automatically. Press `Ctrl + C` in the terminal to stop it.

## 2. Add a new project

Open `src/data/projects.js`. Projects are listed inside `export const projects = [ ... ];`.
Copy this block, paste it inside the list (after another project's closing `},`), and fill
it in:

```js
  {
    id: "my-new-project",            // unique, lowercase, words joined with dashes
    title: "My New Project",
    status: "In Development",        // "In Development" or "Completed" (exact spelling)
    category: "Personal project",    // or "Academic project"
    summary: "Building a ... that will ...",
    tech: ["PowerShell", "SQL"],     // shown as small chips
    details: [                        // shown when someone clicks "Details"
      "Will ...",
      "Will ...",
    ],
    icon: "terminal",                 // see the list below
    github: "",                       // full https:// link, or "" to hide the button
    demo: "",                         // full https:// link, or "" to hide the button
  },
```

**Icons you can use:** `network`, `terminal`, `database`, `film`, `calculator`, `clipboard`,
`server`, `code`, `cable`, `ticket`, `users`, `building`, `headset`, `handshake`,
`app-window`. (To add more, see `src/components/icons.js`.)

**Order:** cards appear in the same order as the list. Move a block up or down to reorder.

**Remove a project:** delete its whole `{ ... },` block.

> The three "In Development" projects that came with the site are **placeholders**. Before
> you send the link to recruiters, edit or delete any project you aren't actually building.
> Interviewers may ask about anything listed.

## 3. Mark a project as Completed

When you finish a project:

1. Change `status: "In Development"` to `status: "Completed"`.
2. Rewrite the `summary` and `details` in the **past tense**: describe what you built, not
   what you plan to build. For example, "Building a lab that will..." becomes
   "A Packet Tracer lab of a multi-VLAN campus network with..." and "Will configure..."
   becomes "Configured...".
3. Add your `github` and/or `demo` links if you have them.

The tests check this for you: a "Completed" project can't use planning words like
"building", "will", or "planned", and an "In Development" project must use them. That keeps
unfinished work from ever looking finished.

## 4. Add a screenshot to a project

Without a screenshot, each card shows a themed graphic with the project's icon. To use a real
screenshot instead:

1. Create the folder `public/projects/` (if it doesn't exist) and put your image there, e.g.
   `public/projects/campus-network-lab.png`. Keep it under about 300 KB (PNG, JPG or WebP).
2. Find the image's size in pixels: on Windows, right-click the file → **Properties** →
   **Details** → *Width* and *Height*.
3. Add an `image` entry to the project (note: **no slash** at the start of `src`):

   ```js
   image: {
     src: "projects/campus-network-lab.png",
     alt: "Packet Tracer topology with three VLANs and a router",
     width: 1280,
     height: 720,
   },
   ```

   `alt` describes what the picture shows, for people using screen readers.

## 5. Update your info, experience and skills

All in `src/data/profile.js`. Change the text between the quotes and save.

- **Hero (top of the page):** `hero.role`, `hero.tagline`, and the `hero.status` rows.
- **About:** the `about.paragraphs` list and `about.targetRoles`.
- **Education:** the `education` list. Move a course from `inProgressCoursework` to
  `completedCoursework` when you finish it.
- **Experience:** the `experience` list, newest job first. The job with `featured: true` gets
  the big dashboard card. Each job has a `highlights` list (one bullet per line). The
  `stats` tiles on the featured job should only use numbers that are on your resume.
- **Skills:** the `skills` list. Each category becomes a tab. Each skill looks like:

  ```js
  { name: "VLAN assignment", usedIn: ["csuf"] },
  ```

  `usedIn` shows small tags saying where you used the skill. The available tags are defined
  in `evidence` just above (`csuf`, `coursework`, `project`, `ramen`, `chipotle`). You can add
  a new one there, e.g. `homelab: "Home lab"`, then use `usedIn: ["homelab"]`. Leave it as
  `[]` for no tag. A few skills (Zoom Phone, Microsoft Office, Microsoft Project, Adobe After
  Effects) have no tag yet. Add one if you'd like to show where you used them.

## 6. Add your GitHub profile

In `src/data/profile.js`, set:

```js
github: "https://github.com/your-username",
```

A GitHub button then appears in the Contact section. (It stays hidden while this is `""`.)

## 7. Replace the resume PDFs

The downloadable resumes are in `public/resume/`:

- `Nathanael_Haig_Resume_Network.pdf`
- `Nathanael_Haig_Resume_IT_Support.pdf`

**Easiest:** save your new PDF over the old one using **exactly the same file name**.

**Different name or a third resume:** put the file in `public/resume/` and update the
`resumes` list at the bottom of `src/data/profile.js` (`label`, `description`, `file`).
Exactly one resume should have `primary: true`; that's the one the big "Download Resume"
button at the top uses.

## 8. Check your work before publishing

```bash
npm test
```

All tests should pass. If one fails, read the message; it says which rule broke, for example
a project with a misspelled status (`"Complete"` instead of `"Completed"`), a link that isn't
`https://`, or a resume file name that doesn't match. Fix the data and run it again.

Optional: `npm run build` makes sure the production build works.

## How changes go live

1. Save your edits.
2. Commit and push to the `main` branch on GitHub (for example with GitHub Desktop, or
   `git add .` → `git commit -m "Update projects"` → `git push`).
3. GitHub runs the **Deploy to GitHub Pages** workflow (see the **Actions** tab). It runs the
   tests, builds the site and publishes it, usually within a couple of minutes.
4. If the tests fail, nothing is published and the old version stays online, so a typo can't
   break the live site. Fix it and push again.

## Taking ownership of the repository

The site currently lives in the `enobot/nate` repository. When you want it on your own GitHub
account, either:

- **Transfer it:** the current owner opens **Settings → General → Danger Zone → Transfer
  ownership** and enters your username. After you accept, the site moves to
  `https://<your-username>.github.io/nate/`; or
- **Get added as a collaborator:** **Settings → Collaborators → Add people**, so you can push
  changes while it stays where it is.

You don't need to change any code after a transfer or rename: the workflow asks GitHub for the
correct address and base path every time it builds. Afterwards, check that
**Settings → Pages → Source** is still **GitHub Actions**, and optionally update the default
`VITE_SITE_URL` in `.env` to the new address (it's only used for builds on your own computer).

If you ever connect a custom domain (Settings → Pages → Custom domain), that works too: the
base path becomes `/` automatically.
