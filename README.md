# Nathanael Haig — IT Portfolio

A single-page portfolio for **Nathanael "Nate" Haig**, an Information Systems student at
California State University, Fullerton who supports the network analyst team in CSUF IT
Telecommunications. The site presents his campus networking experience, skills, projects,
and resumes with a dark, HUD-inspired interface.

Live site (after deployment): **https://enobot.github.io/nate/**

> Want to change the content? Read **[EDITING.md](EDITING.md)**. All text lives in two files:
> `src/data/profile.js` and `src/data/projects.js`.

---

## Tech stack (and why)

| Tool | Version | Why it's here |
| --- | --- | --- |
| [React](https://react.dev) | 19.3 | Component-based UI; same stack as the owner's other projects. |
| [Vite](https://vite.dev) + `@vitejs/plugin-react` | 8.3 / 6.3 | Fast dev server and optimized production builds. |
| [Tailwind CSS](https://tailwindcss.com) via `@tailwindcss/vite` | 4.3 | Utility classes plus one CSS file of design tokens (`@theme` in `src/index.css`). |
| [Motion](https://motion.dev) (`motion/react`) | 14.14 | Page transitions and the mobile menu animation. Loaded through `LazyMotion` + `domAnimation` to keep the bundle small. Respects the visitor's reduced-motion setting. Scroll reveals and the hero entrance are plain CSS. |
| [Lucide](https://lucide.dev) (`lucide-react`) | 1.78 | Consistent, tree-shaken SVG icons. |
| [Fontsource](https://fontsource.org) | 5.3 | Self-hosted fonts: Orbitron (headings), Inter (body), JetBrains Mono (HUD labels). No requests to font CDNs. |
| Vitest + Testing Library + jsdom + axe-core | 5.1 / 16.3 / 31.0 / 4.14 | Unit, interaction and accessibility tests. |

Plain JavaScript (no TypeScript) keeps the code approachable.

### Pages and pre-rendering

The site has a home page, one page per project (`/projects/<id>/`), and a 404 page.

- **Routing:** a small router in `src/lib/router.jsx` (about 150 lines, no routing library).
  Links are normal `<a href>` tags, so they work without JavaScript and can be opened in a new
  tab; plain clicks are handled in the browser without a page reload, and Back/Forward restore
  the scroll position.
- **Pre-rendering:** `npm run build` runs three steps: the normal browser build, a server build
  of the same app (`src/entry-server.jsx`), and `scripts/prerender.mjs`, which renders every
  page to HTML and writes it into `dist/` (e.g. `dist/projects/campus-network-lab/index.html`)
  with its own `<title>`, description, and canonical link. GitHub Pages then serves real HTML
  for every page: content shows before JavaScript loads, search engines can read it, and deep
  links to project pages work. In the browser, `src/main.jsx` "hydrates" that HTML (attaches
  the interactivity) instead of drawing the page again.
- **Page list:** `src/lib/routes.js` is the single list of pages and their `<head>` details,
  used by the app, the pre-renderer, and the sitemap.

## Project structure

```
nate/
├─ .github/workflows/deploy.yml   Build, test and deploy to GitHub Pages on every push to main
├─ config/seo.js                  Helpers for the site URL, base path, robots.txt and sitemap.xml
├─ public/
│  ├─ favicon.svg                 "NH" monogram
│  └─ resume/                     The two resume PDFs offered for download
├─ src/
│  ├─ data/
│  │  ├─ profile.js               Name, links, summary, education, experience, skills, resumes
│  │  ├─ projects.js              Project list (+ documentation of every field)
│  │  └─ navigation.js            Section ids and nav labels
│  ├─ components/                 Reusable pieces (Header, ProjectCard, SkillGroups, JackWorkflow, NetworkCanvas, ...)
│  ├─ pages/                      HomePage, ProjectPage, NotFoundPage
│  ├─ sections/                   One file per home page section (Hero, About, Skills, ...)
│  ├─ hooks/                      useScrollSpy, useSpotlight
│  ├─ lib/                        router, routes (page list + <head> tags), assetUrl, cn
│  ├─ test/setup.js               Test setup (stand-ins for browser APIs jsdom lacks)
│  ├─ index.css                   Tailwind import, design tokens, custom utilities
│  ├─ entry-server.jsx            Renders a page to HTML at build time
│  └─ main.jsx / App.jsx          Browser entry point and page layout
├─ scripts/prerender.mjs          Writes every page's HTML into dist/ (last build step)
├─ index.html                     Page template: shared meta tags and JSON-LD structured data
├─ vite.config.js                 Base path, plugins, SEO file generation, test config
├─ .env                           VITE_SITE_URL (public site URL, used for absolute links)
└─ .nvmrc                         Node version (26)
```

## Local setup

Requirements: **Node.js 26** (see `.nvmrc`) and npm.

```bash
npm install      # install dependencies (creates node_modules/)
npm run dev      # start the dev server at http://localhost:5173
npm test         # run all tests once
npm run build    # production build into dist/
npm run preview  # serve the dist/ build locally
```

`npm run test:watch` re-runs tests as you edit.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` installs dependencies, **runs the tests**, builds
the site with the correct base path, and publishes it. A failing test stops the deployment.

1. Create the public repository **`enobot/nate`** on GitHub (empty: no README or license).
2. In the repository, open **Settings → Pages → Build and deployment** and set **Source** to
   **GitHub Actions**. Do this **before the first push**. (If you already pushed, set it now and
   re-run the workflow from the **Actions** tab.)
3. From this folder, push the code to the `main` branch:

   ```bash
   git init
   git add .
   git commit -m "Initial portfolio"
   git branch -M main
   git remote add origin https://github.com/enobot/nate.git
   git push -u origin main
   ```

4. Open the **Actions** tab and watch **Deploy to GitHub Pages**. When both jobs are green, the
   site is live at **https://enobot.github.io/nate/** (the first deploy can take a minute or two
   to appear).

Every later push to `main` redeploys automatically. You can also run the workflow by hand from
the Actions tab (**Run workflow**).

### How the base path works

GitHub Pages serves project sites from a sub-path (`/nate/`). The workflow asks
`actions/configure-pages` for the real path and URL and passes them to the build as
`BASE_PATH` and `VITE_SITE_URL`. Nothing is hard-coded, so renaming or transferring the
repository (or adding a custom domain) keeps working without code changes.

In code, every file from `public/` (resume PDFs, screenshots) is referenced through
`assetUrl()` in `src/lib/assetUrl.js`, which prefixes `import.meta.env.BASE_URL`.

### Testing the sub-path build locally

PowerShell:

```powershell
$env:BASE_PATH = "/nate/"; $env:VITE_SITE_URL = "https://enobot.github.io/nate"
npm run build
npx vite preview     # open http://localhost:4173/nate/
Remove-Item Env:BASE_PATH; Remove-Item Env:VITE_SITE_URL
```

macOS / Linux:

```bash
BASE_PATH=/nate/ VITE_SITE_URL=https://enobot.github.io/nate npm run build
BASE_PATH=/nate/ npx vite preview   # open http://localhost:4173/nate/
```

Git Bash on Windows: add `MSYS_NO_PATHCONV=1`, otherwise Git Bash rewrites `/nate/` into a
Windows folder path (the build stops with an error explaining this):

```bash
MSYS_NO_PATHCONV=1 BASE_PATH=/nate/ VITE_SITE_URL=https://enobot.github.io/nate npm run build
MSYS_NO_PATHCONV=1 BASE_PATH=/nate/ npx vite preview
```

`vite preview` needs the same `BASE_PATH` so it serves the files under `/nate/`.

## SEO

- Every page has its own title, meta description, canonical link, and Open Graph / Twitter
  tags (built in `src/lib/routes.js` from `VITE_SITE_URL`). `index.html` adds `theme-color`
  and JSON-LD `Person` structured data (name, job title, CSUF, city/state only, LinkedIn).
  The 404 page is marked `noindex`.
- `npm run build` writes `robots.txt` and a `sitemap.xml` listing the home page and every
  project page (see `config/seo.js` and the `seo-files` plugin in `vite.config.js`).
- Note: search engines only read `robots.txt` at the root of a domain, so on
  `enobot.github.io/nate/` it is informational. Submit `https://enobot.github.io/nate/sitemap.xml`
  in Google Search Console (URL-prefix property) to get the page indexed faster.
- There is no social preview image (`og:image`) yet. Adding a 1200×630 PNG in `public/` and an
  `og:image` tag with its absolute URL would improve link previews.

## Accessibility, performance and privacy

- Semantic landmarks, one `h1`, skip-to-content link, visible focus rings, labelled sections.
- All skill groups are visible at once (no hidden tabs). The jack-activation workflow uses
  buttons with `aria-pressed`. After moving to another page, focus goes to that page's
  heading. The mobile menu closes with Esc and returns focus.
- Content is visible without JavaScript: pages are pre-rendered, and scroll-reveal effects
  only hide content while JavaScript is running (the `js` class on `<html>`).
- Reduced motion: smooth scrolling, Motion animations and CSS animations are turned off or
  minimized, and the hero network animation draws a single still frame.
- The hero canvas caps `devicePixelRatio` at 2, scales its node count to the screen size, and
  pauses when off-screen or when the tab is hidden.
- No analytics, cookies, trackers, or third-party requests. Fonts and icons are bundled.
- The phone number from the resume PDFs is intentionally **not** shown on the site; a test
  fails if one appears in the data, `index.html`, or the rendered page.

Last measured production build (`npm run build`, Vite 8.3.8): JS **392 kB (124.9 kB gzip)**,
CSS **57.6 kB (12.5 kB gzip)**. Most of the JS is React DOM. Font files are split by
character set and the browser only downloads the ones the page uses. Because pages are
pre-rendered, the largest text on screen is painted with the first paint instead of waiting
for the JavaScript to download and run.

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| Deployed page is blank, browser console shows 404s for `/assets/...` | The site was built without the `/nate/` base path. Deploy through the workflow (it sets `BASE_PATH` automatically) or follow "Testing the sub-path build locally". |
| `configure-pages` step fails ("Get Pages site failed" / "Not Found") | GitHub Pages is not enabled for the repository. Settings → Pages → Source: **GitHub Actions**, then re-run the workflow. |
| `deploy` job fails with an environment protection error | Settings → Environments → `github-pages`: allow deployments from the `main` branch. |
| Workflow stops at `npm test` | A test failed, so nothing was deployed. Run `npm test` locally and read the message: it names the file and the rule that broke. |
| `npm ci` fails with "lock file out of sync" | Run `npm install` locally and commit the updated `package-lock.json`. |
| Resume link downloads a 404 | The PDF name in `src/data/profile.js` must match the file in `public/resume/` exactly (case-sensitive on GitHub Pages). |
| Old version still showing | Wait a minute and hard-refresh (Ctrl+F5); GitHub Pages caches briefly. |

## Known limitations

- Tested with automated tests (Vitest/jsdom, axe-core) and a headless Chromium render at
  1440×900, 768×1024 and 390×844. Not yet tested by hand in Firefox or Safari, on real phones,
  or with a screen reader (NVDA, VoiceOver).
- Color contrast was checked by calculation against the design tokens, not by an automated
  in-browser contrast tool (jsdom cannot compute it).
- The three "In Development" projects are placeholders; see the note in `src/data/projects.js`.

## Credits and licenses

`npm run build` also writes **`dist/third-party-licenses.txt`** with the full license text of
every bundled package (linked from the site footer).

- **Fonts** (via Fontsource, license `OFL-1.1` in each package):
  - Orbitron — Copyright 2018 The Orbitron Project Authors — SIL Open Font License 1.1
  - Inter — Copyright 2016 The Inter Project Authors — SIL Open Font License 1.1
  - JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors — SIL Open Font License 1.1
- **Icons:** Lucide — ISC License (Lucide Icons and Contributors); some icons derived from
  Feather — MIT License (Cole Bemis). Lucide does not include brand logos, so generic icons are
  used for LinkedIn and GitHub links.
- **Libraries:** React, React DOM, Motion, Tailwind CSS, Vite — MIT License.
- **Test-only** (not shipped to visitors): axe-core — MPL-2.0; Vitest, Testing Library,
  jsdom — MIT.
- The "NH" favicon/monogram and all other graphics are original to this project.
