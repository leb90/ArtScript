// app.css from `art build`: which .css files go in, and the `@import`/`@charset` lifted to the top.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const APP = 'page Home "/" {\n  text "hi"\n}\n';

function build(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "art-css-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  execFileSync(process.execPath, ["src/cli.ts", "build", dir], { stdio: "pipe" });
  return readFileSync(join(dir, "dist", "app.css"), "utf8");
}

test("app.css: an @import whose URL has a ';' (Google Fonts weights) is lifted whole", () => {
  const font = '@import url("https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500&display=swap");';
  const bare = "@import url(https://fonts.googleapis.com/css2?family=Inter:wght@400;700);";
  const css = build({ "app.art": APP, "styles.css": `${font}\n${bare}\n@charset "utf-8";\nbody { color: red; }\n.a { margin: 0; }\n` });
  const lines = css.split("\n");
  assert.equal(lines[0], '@charset "utf-8";');
  assert.equal(lines[1], font);
  assert.equal(lines[2], bare);
  assert.match(lines[3], /^@layer art\{/);
  assert.match(css, /body\{color:red\}\.a\{margin:0\}/, "the rules after the imports are intact (minified)");
  assert.doesNotMatch(css, /^500&display/m);
});

test("app.css: the .art sources' folders and the project root, not native copies (ios/, android/)", () => {
  const css = build({
    "src/app.art": APP,
    "src/styles/theme.css": ".theme { color: blue; }\n",
    "root.css": ".root { color: green; }\n",
    "ios/App/App/public/app.css": ".copy-ios { color: red; }\n",
    "android/app/src/main/assets/public/app.css": ".copy-android { color: red; }\n",
    "public/vendor.css": ".public { color: red; }\n",
    "server/admin.css": ".server { color: red; }\n",
  });
  assert.match(css, /\.theme\{/);
  assert.match(css, /\.root\{/);
  assert.doesNotMatch(css, /copy-ios|copy-android|\.public|\.server/);
});
