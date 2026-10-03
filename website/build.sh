#!/bin/sh
# Builds the ArtScript website (an ArtScript app) into site/ for GitHub Pages: npm run site
# The site lives at the root of artscript.dev; the three example apps (apps/) are built into
# site/demos/ as static demos (their backend runs in the visitor's browser: art build --demo).
set -e
cd "$(dirname "$0")/.."
SITE=https://artscript.dev
rm -rf site
node src/cli.ts build website --out site --prerender --site $SITE
echo artscript.dev > site/CNAME
# The demos. Each app is its own ArtScript project with its own base path.
node src/cli.ts build apps/shop --out site/demos/shop --base /demos/shop --demo
node src/cli.ts build apps/backoffice --out site/demos/backoffice --base /demos/backoffice --demo
node src/cli.ts build apps/landing --out site/demos/brisa --base /demos/brisa --prerender --site $SITE
# GitHub Pages serves one 404 page for every unknown path: it sends a demo's paths to that demo
# (`?__art_path=`, which the runtime turns back into the path) and shows the site for the rest.
{
  echo '<script>const m=/^\/demos\/(shop|backoffice|brisa)(\/.*)?$/.exec(location.pathname);if(m)location.replace(`/demos/${m[1]}/?__art_path=${encodeURIComponent(location.pathname+location.search)}`)</script>'
  cat site/_app.html
} > site/404.html
rm -f site/demos/*/404.html site/demos/*/_redirects
# Every guide as Markdown, and all of them in one file, for AI agents.
mkdir -p site/md
cp docs/SPEC.md docs/SPEC-EDIT.md docs/DEPLOY.md SECURITY.md website/content/*.md site/md/
C=website/content
cat docs/SPEC.md docs/SPEC-EDIT.md $C/introduction.md $C/quick-start.md $C/tutorial.md $C/components.md $C/routing.md \
  $C/backend.md $C/auth.md $C/styling.md $C/testing.md $C/libraries.md $C/recipes.md $C/agents.md $C/cli.md docs/DEPLOY.md SECURITY.md > site/llms-full.txt
echo "site → $(pwd)/site"
