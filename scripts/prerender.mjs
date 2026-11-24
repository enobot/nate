// Build step 3 of 3 (see "build" in package.json):
//   1. `vite build` builds the browser app into dist/
//   2. `vite build --ssr` builds a server copy of the app into dist-ssr/
//   3. this script renders every page to HTML and writes it into dist/
//
// Result: GitHub Pages serves real HTML for "/", every "/projects/<id>/" page,
// and 404.html. Content appears without waiting for JavaScript, search engines
// can read it, and deep links to project pages load directly.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "dist");
const ssrDir = resolve(root, "dist-ssr");

const HEAD_BLOCK = /<!--head:start-->[\s\S]*?<!--head:end-->/;
const ROOT_DIV = '<div id="root"></div>';

const template = readFileSync(resolve(distDir, "index.html"), "utf8");
if (!HEAD_BLOCK.test(template) || !template.includes(ROOT_DIV)) {
  throw new Error("dist/index.html is missing the head markers or the empty #root div.");
}

const server = await import(pathToFileURL(resolve(ssrDir, "entry-server.js")).href);
const siteUrl = server.siteUrl();

let count = 0;
for (const route of server.prerenderRoutes()) {
  const head = server.headFor(server.matchRoute(route.path));
  const appHtml = server.render(route.path);
  if (!appHtml.trim()) throw new Error(`Rendering ${route.path} produced no HTML.`);

  const html = template
    .replace(HEAD_BLOCK, `<!--head:start-->\n    ${server.headTags(head, siteUrl)}\n    <!--head:end-->`)
    .replace(ROOT_DIV, `<div id="root">${appHtml}</div>`);

  const outFile = resolve(distDir, route.file);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html);
  count += 1;
  console.log(`prerendered ${route.path.padEnd(42)} -> dist/${route.file}`);
}

// The server copy is only needed for this step.
rmSync(ssrDir, { recursive: true, force: true });
console.log(`Pre-rendered ${count} pages.`);
