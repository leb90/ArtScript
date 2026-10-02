import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { ELEMENTS } from "../src/elements.ts";

const dir = new URL("../editors/tree-sitter-artscript/", import.meta.url);

test("tree-sitter: the elements without content match src/elements.ts", () => {
  const grammar = readFileSync(new URL("grammar.js", dir), "utf8");
  const listed = JSON.parse(/const NO_CONTENT = (\[.*?\]);/.exec(grammar)![1]) as string[];
  // `meta` isn't a UI element (the parser handles it), and it takes no content either.
  const expected = [...Object.entries(ELEMENTS).filter(([, spec]) => spec.content === null).map(([name]) => name), "meta"];
  assert.deepEqual([...listed].sort(), expected.sort());
});

test("tree-sitter: the generated parser is committed and up to date with grammar.js", () => {
  assert.ok(existsSync(new URL("src/parser.c", dir)), "run `npm run generate` in editors/tree-sitter-artscript");
  const json = JSON.parse(readFileSync(new URL("src/grammar.json", dir), "utf8"));
  assert.equal(json.name, "artscript");
  // Every keyword and tag the grammar file names is in the generated grammar.
  const grammar = readFileSync(new URL("grammar.js", dir), "utf8");
  const generated = JSON.stringify(json);
  for (const [, word] of grammar.matchAll(/"([a-z]+)"/g)) assert.ok(generated.includes(`"${word}"`), `'${word}' is missing from src/grammar.json: regenerate`);
});
