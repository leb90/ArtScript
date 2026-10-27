#!/bin/sh
# The standalone agent skill (skills/artscript), for agents without an ArtScript project yet and for
# skill marketplaces: copies the specs into its references/ and packs it as skills/artscript.zip
# (a folder with SKILL.md at its top). npm run skill
set -e
cd "$(dirname "$0")/.."
cp docs/SPEC.md docs/SPEC-CORE.md docs/SPEC-EDIT.md skills/artscript/references/
rm -f skills/artscript.zip
(cd skills && zip -qr artscript.zip artscript -x '.*')
echo "skill → $(pwd)/skills/artscript.zip"
