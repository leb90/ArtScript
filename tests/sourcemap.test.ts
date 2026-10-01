// Source maps: generated JS lines point back to the .art lines they come from.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compile } from "../src/compile.ts";

// Decodes the mappings of a v3 source map: per generated line, [source, line, col] (0-based) or null.
function decode(mappings: string): ([number, number, number] | null)[] {
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let src = 0, line = 0, col = 0;
  return mappings.split(";").map((seg) => {
    if (!seg) return null;
    const nums: number[] = [];
    let v = 0, shift = 0;
    for (const ch of seg.split(",")[0]) {
      const d = B64.indexOf(ch);
      v += (d & 31) << shift;
      if (d & 32) shift += 5;
      else { nums.push(v & 1 ? -(v >> 1) : v >> 1); v = 0; shift = 0; }
    }
    src += nums[1]; line += nums[2]; col += nums[3];
    return [src, line, col];
  });
}

test("source map: the JS of a view element maps to its .art line", () => {
  const src = readFileSync("examples/todo/app.art", "utf8");
  const r = compile([{ file: "app.art", src }]);
  const map = JSON.parse(r.map!);
  assert.deepEqual(map.sources, ["app.art"]);
  assert.equal(map.sourcesContent[0], src);
  const lines = decode(map.mappings);
  const js = r.js!.split("\n");
  const at = (needle: string) => {
    const i = js.findIndex((l) => l.includes(needle));
    return lines[i] && lines[i]![1] + 1;
  };
  const artLine = (needle: string) => src.split("\n").findIndex((l) => l.includes(needle)) + 1;
  assert.equal(at('textContent = "Add"'), artLine('button "Add"'));
  assert.equal(at("function add("), artLine("fn add()"));
  assert.equal(at("$.computed("), artLine("computed pending"));
});
