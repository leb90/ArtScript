// Destructuring in fn and arrow parameters, `let`, both kinds of `for`, and `ref` at the top level:
// the JavaScript habits that otherwise send an agent to a .ts file.
import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { compile } from "../src/compile.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";
import { runTests } from "../src/testing.ts";

const SRC = `const PRICES = { tea: 2, cake: 5 }

fn label({ name, city = "?" }) {
  return \`\${name} (\${city})\`
}

fn total(prices) {
  let sum = 0
  for [k, v] in Object.entries(prices) {
    sum += v
  }
  return sum
}

fn firstAndRest(xs) {
  let [first, ...rest] = xs
  let { length } = rest
  return \`\${first}+\${length}\`
}

page Home "/" {
  state people = [{ name: "Ana", city: "Lima", n: 1 }, { name: "Bea", city: "Quito", n: 2 }]

  button "add" -> people.push({ name: "Caro", city: "Cusco", n: 3 })
  button "bump" -> people[0].n++
  text people.map(({ name }) => name).join(",")
  text label({ name: "Dani" })
  text \`total \${total(PRICES)} \${firstAndRest([1, 2, 3])}\`
  for { name, n }, i in people key name {
    text \`\${i}:\${name}=\${n}\`
  }
}

test "destructured" {
  open "/"
  see "Ana,Bea"
  see "Dani (?)"
  see "total 7 1+2"
  see "0:Ana=1"
  see "1:Bea=2"
  click "add"
  see "2:Caro=3"
  click "bump"
  see "0:Ana=2"
}
`;

test("destructuring: canonical, checked and compiled", () => {
  // A top-level `const` is written as a `computed` (the canonical form of a derived value).
  assert.equal(printProgram(parse(SRC, "t")), SRC.replace("const PRICES", "computed PRICES"));
  assert.deepEqual(check(parse(SRC, "t")).map((d) => d.msg), []);
  const js = compile([{ file: "a.art", src: SRC }]).js!;
  assert.match(js, /function label\(\{ name, city = "\?" \}\)/);
  assert.match(js, /for \(const \[k, v\] of /);
  // An arrow with one destructured parameter keeps its parentheses.
  assert.match(printProgram(parse('page P {\n  text [{ a: 1 }].map(({ a }) => a).join("")\n}\n', "t")), /\(\{ a \}\) => a/);
});

test("destructuring: it runs, and destructured rows update", async () => {
  const r = await runTests([{ file: "app.art", src: SRC }]);
  assert.deepEqual(r, [{ name: 'test "destructured"', ok: true }]);
});

test("destructuring: a default inside a pattern is a literal; an unknown name is still an error", () => {
  const [d] = compile([{ file: "t.art", src: "page P {\n  state x = 1\n  fn f({ a = x }) {\n    return a\n  }\n\n  text f({})\n}\n" }]).diagnostics;
  assert.equal(d?.type, "UNEXPECTED_TOKEN");
  assert.match(d.msg, /must be a literal, not `x`/);
  assert.deepEqual(d.fixes, ["drop `= x` and write `a = a ?? x` in the body"]);
  assert.deepEqual(check(parse("fn f({ a }) {\n  return b\n}\n\npage P {\n  text f({ a: 1 })\n}\n", "t")).map((x) => x.type), ["UNDEFINED_NAME"]);
});

test("ref at the top level: a shared variable", async () => {
  const src = 'ref seen = new Set()\n\nfn visit(name) {\n  seen.add(name)\n  return seen.size\n}\n\npage Home "/" {\n  state n = 0\n\n  button "visit" -> n = visit(`p${n}`)\n  text `seen ${n}`\n}\n\ntest "shared" {\n  open "/"\n  click "visit"\n  click "visit"\n  see "seen 2"\n}\n';
  assert.deepEqual(check(parse(src, "t")), []);
  assert.deepEqual(await runTests([{ file: "app.art", src }]), [{ name: 'test "shared"', ok: true }]);
});
