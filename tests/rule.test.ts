// The rule about what goes in a .ts file is repeated wherever an agent reads instructions: every
// copy says the same.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const RULE = "Write everything in `.art`: data, constants, helpers and formatting (`Intl`, `Date` and string methods cover most of it); when you do need an npm package, call it from `.art` too (`use \"pkg\" { x }`). Imperative code goes in a `.ts` file instead: code that drives the DOM or a canvas, or runs heavy loops (an animation or physics loop, canvas or WebGL drawing, a parser), and the wrapper of a library that owns its DOM (a map, a chart). Not in `.ts`: mock data, constants, date or money formatters, small wrappers around npm functions. What you import from `.ts` arrives as `Any`: the checker can't verify it, and `art check` warns (`MODULE_COULD_BE_ART`) when a module could be ArtScript.";

const COPIES = [
  "templates/default/AGENTS.md",
  "templates/default/.claude/skills/artscript/SKILL.md",
  "templates/default/.cursor/rules/artscript.mdc",
  "docs/SPEC.md",
  "docs/SPEC-CORE.md",
  "website/lib/content.ts", // inside a template literal: its backticks are escaped
];

test("the .ts rule is the same in every copy an agent reads", () => {
  for (const file of COPIES) {
    const text = readFileSync(file, "utf8").replaceAll("\\`", "`");
    assert.ok(text.includes(RULE), `${file} doesn't carry the rule word for word`);
    assert.doesNotMatch(text, /Measured: with this rule/, file);
  }
});

// How to lay out the files is in every copy of the agent loop (not in the specs, which describe
// the language): the same words everywhere.
const STRUCTURE = "Split the code into files from the start: every `.art` file in `src/` (subfolders too) is part of one program, with no imports. `app.art` keeps the pages, each putting its sections together; one component per file in `src/components/`; the data and constants people change (prices, texts, an email address) in `src/config.art`; the tests in `src/tests.art`. A one-screen app can stay in `app.art`.";

test("the file structure rule is the same in every copy of the agent loop", () => {
  for (const file of COPIES.filter((f) => !f.startsWith("docs/"))) {
    const text = readFileSync(file, "utf8").replaceAll("\\`", "`");
    assert.ok(text.includes(STRUCTURE), `${file} doesn't carry the structure rule word for word`);
  }
});
