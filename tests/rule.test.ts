// The rule about what goes in a .ts file is repeated wherever an agent reads instructions: every
// copy says the same.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const RULE = "Write everything in `.art`: data, constants, helpers and formatting (`Intl`, `Date` and string methods cover most of it); when you do need an npm package, call it from `.art` too (`use \"pkg\" { x }`). Imperative code goes in a `.ts` file instead: code that drives the DOM or a canvas, or runs heavy loops (an animation or physics loop, canvas or WebGL drawing, a parser), and the wrapper of a library that owns its DOM (a map, a chart). Not in `.ts`: mock data, constants, date or money formatters, small wrappers around npm functions. What you import from `.ts` arrives as `Any`: the checker can't verify it, and `art check` warns (`MODULE_COULD_BE_ART`) when a module could be ArtScript.";

const COPIES = [
  "templates/default/AGENTS.md",
  "templates/default/.claude/skills/artscript/SKILL.md",
  "templates/default/.cursor/rules/artscript.mdc",
  "docs/SPEC.md",
  "docs/SPEC-CORE.md",
  "website/lib/content.ts", // inside a template literal: its backticks are escaped
  "skills/artscript/SKILL.md", // the standalone skill, for agents without a project yet
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

// The standalone skill carries the specs of this version (npm run skill copies them) and a
// frontmatter the skill loaders accept: a name equal to its folder, a short description.
test("the standalone skill (skills/artscript) is valid and carries this version's specs", () => {
  for (const f of ["SPEC.md", "SPEC-CORE.md", "SPEC-EDIT.md"]) {
    assert.equal(readFileSync(`skills/artscript/references/${f}`, "utf8"), readFileSync(`docs/${f}`, "utf8"), `skills/artscript/references/${f} is older than docs/${f}: run npm run skill`);
  }
  const skill = readFileSync("skills/artscript/SKILL.md", "utf8");
  const [, front] = /^---\n([\s\S]*?)\n---\n/.exec(skill)!;
  assert.match(front, /^name: artscript$/m);
  const description = /^description: (.+)$/m.exec(front)![1];
  assert.ok(description.length <= 1024 && description.split(/\. (?=[A-Z])/).length <= 3, description);
  for (const ref of skill.matchAll(/`(references\/[^`]+)`/g)) assert.ok(existsSync(`skills/artscript/${ref[1]}`), ref[1]);
});
