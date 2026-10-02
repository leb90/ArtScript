#!/bin/sh
# Builds the ArtScript website (an ArtScript app) into site/ for GitHub Pages: npm run site
set -e
cd "$(dirname "$0")/.."
rm -rf site
node src/cli.ts build website --out site --base /ArtScript --prerender --site https://leb90.github.io/ArtScript
# Unknown paths get the app shell (GitHub Pages serves 404.html for them).
cp site/_app.html site/404.html
# Every guide as Markdown, and all of them in one file, for AI agents.
mkdir -p site/md
cp docs/SPEC.md docs/SPEC-EDIT.md docs/DEPLOY.md SECURITY.md website/content/*.md site/md/
C=website/content
cat docs/SPEC.md docs/SPEC-EDIT.md $C/introduction.md $C/quick-start.md $C/tutorial.md $C/components.md $C/routing.md \
  $C/backend.md $C/auth.md $C/styling.md $C/testing.md $C/libraries.md $C/agents.md $C/cli.md docs/DEPLOY.md SECURITY.md > site/llms-full.txt
echo "site → $(pwd)/site"
