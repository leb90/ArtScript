import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { check } from "../src/checker.ts";
import { parse } from "../src/parser.ts";

const errs = (src: string) => check(parse(src, "t.art"));
const types = (src: string) => errs(src).map((d) => d.type);

const USER = "model User {\n  id: ID\n  name: String\n  email: Email\n}\n";

test("los ejemplos no tienen errores", () => {
  for (const f of ["examples/counter/app.art", "examples/todo/app.art", "templates/default/src/app.art", "examples/users/app.art", "examples/notes/app.art"]) {
    assert.deepEqual(errs(readFileSync(f, "utf8")), [], f);
  }
});

test("UNDEFINED_NAME sugiere el nombre más parecido", () => {
  const [d] = errs("page A {\n  state count = 0\n  text cont\n}");
  assert.equal(d.type, "UNDEFINED_NAME");
  assert.equal(d.code, "E1001");
  assert.deepEqual(d.fixes, ["count"]);
  assert.equal(d.at, "A");
  assert.deepEqual([d.loc.line, d.loc.col], [3, 8]);
});

test("globales de JS están permitidos", () => {
  assert.deepEqual(types("page A {\n  state t = Date.now()\n  text Math.round(t / 1000)\n}"), []);
});

test("UNKNOWN_FIELD en modelos", () => {
  const [d] = errs(USER + "component C(u: User) {\n  text u.nme\n}");
  assert.equal(d.type, "UNKNOWN_FIELD");
  assert.deepEqual(d.fixes, ["name"]);
});

test("POSSIBLY_EMPTY al indexar una lista sin ?.", () => {
  const [d] = errs(USER + "page P {\n  state users: User[] = []\n  text users[0].name\n}");
  assert.equal(d.type, "POSSIBLY_EMPTY");
  assert.equal(d.actual, "User?");
  assert.deepEqual(d.fixes, ["users[0]?.name"]);
  assert.deepEqual(types(USER + "page P {\n  state users: User[] = []\n  text users[0]?.name ?? \"-\"\n}"), []);
});

test("objetos literales se validan contra el modelo en push", () => {
  const t = types(USER + 'page P {\n  state users: User[] = []\n  button "x" -> users.push({ id: "1", nmae: "a" })\n}');
  assert.deepEqual(t.sort(), ["MISSING_FIELD", "UNKNOWN_FIELD"]);
  const t2 = types(USER + 'page P {\n  state users: User[] = []\n  button "x" -> users.push({ id: "1", name: 5, email: "e" })\n}');
  assert.deepEqual(t2, ["TYPE_MISMATCH"]);
});

test("TYPE_MISMATCH en anotación de state y aritmética", () => {
  assert.deepEqual(types('page P {\n  state n: Number = "a"\n}'), ["TYPE_MISMATCH"]);
  assert.deepEqual(types('page P {\n  state s = "a"\n  text s * 2\n}'), ["TYPE_MISMATCH"]);
});

test("ASSIGN_READONLY en computed y props", () => {
  const [d] = errs('page P {\n  state a = 1\n  computed b = a * 2\n  button "x" -> b = 3\n}');
  assert.equal(d.type, "ASSIGN_READONLY");
  assert.equal(d.actual, "computed");
  assert.deepEqual(types('component C(n: Number) {\n  button "x" -> n++\n}'), ["ASSIGN_READONLY"]);
});

test("mutar campos de un modelo recibido como prop está permitido", () => {
  assert.deepEqual(types(USER + 'component C(u: User) {\n  input u.name\n  button "x" -> u.name = "a"\n}'), []);
});

test("elementos, props y flags desconocidos sugieren alternativas", () => {
  const ds = errs('page P {\n  colum gap=2 {\n  }\n  row gpa=2 {\n  }\n  button "x" primry\n}');
  assert.deepEqual(ds.map((d) => [d.type, d.fixes?.[0]]), [["UNKNOWN_ELEMENT", "column"], ["UNKNOWN_PROP", "gap"], ["UNKNOWN_PROP", "primary"]]);
});

test("valores de props enum", () => {
  assert.deepEqual(types("page P {\n  row align=centre {\n  }\n}"), ["TYPE_MISMATCH"]);
  assert.deepEqual(types("page P {\n  row align=center justify=between {\n  }\n}"), []);
});

test("componentes: props faltantes, desconocidas y tipos", () => {
  const src = USER + 'component Card(u: User, big: Bool = false) {\n  text u.name\n}\n';
  assert.deepEqual(types(src + "page P {\n  Card big=true\n}"), ["MISSING_PROP"]);
  assert.deepEqual(types(src + 'page P {\n  state u: User? = null\n  Card u=u colr="x"\n}').sort(), ["POSSIBLY_EMPTY", "UNKNOWN_PROP"]);
});

test("input necesita algo enlazable; acción y hijos solo donde corresponde", () => {
  assert.deepEqual(types('page P {\n  input "hola"\n}'), ["NOT_BINDABLE"]);
  assert.deepEqual(types('page P {\n  text "a" -> x()\n}').includes("NO_ACTION"), true);
  assert.deepEqual(types('page P {\n  text "a" {\n    text "b"\n  }\n}'), ["NO_CHILDREN"]);
});

test("for necesita una lista", () => {
  assert.deepEqual(types('page P {\n  state n = 3\n  for x in n {\n    text x\n  }\n}'), ["NOT_A_LIST"]);
});

test("nombres duplicados y tipos desconocidos", () => {
  assert.deepEqual(types("page P {\n  state a = 1\n  state a = 2\n}"), ["DUPLICATE_NAME"]);
  assert.deepEqual(types("model M {\n  x: Strng\n}")[0], "UNKNOWN_TYPE");
});

test("conditional flags take a Bool", () => {
  const src = "model T {\n  title: String\n  done: Bool\n}\ncomponent C(t: T) {\n  text t.title muted=t.done\n}";
  assert.deepEqual(types(src), []);
  assert.deepEqual(types('page P {\n  text "a" muted="yes"\n}'), ["TYPE_MISMATCH"]);
});

test("suggestions never repeat the wrong name itself", () => {
  const [d] = errs('page P {\n  row muted=true {\n  }\n}');
  assert.equal(d.type, "UNKNOWN_PROP");
  assert.ok(!(d.fixes ?? []).includes("muted"));
});

const CART = "model Item {\n  id: Number\n  qty: Number\n}\n";

test("narrowing: `if x` and `if x != null` make x non-null inside the branch", () => {
  const fn = (cond: string) => `${CART}page P {\n  state cart: Item[] = []\n  fn add(id) {\n    let found = cart.find(i => i.id == id)\n    if ${cond} {\n      found.qty++\n    }\n  }\n}`;
  assert.deepEqual(types(fn("found")), []);
  assert.deepEqual(types(fn("found != null")), []);
  assert.deepEqual(types(fn("null !== found")), []);
  assert.deepEqual(types(fn("found && found.qty > 0")), []);
  assert.deepEqual(types(fn("true")), ["POSSIBLY_EMPTY"]);
});

test("narrowing: else branch and early return", () => {
  const body = (b: string) => `${CART}page P {\n  state cart: Item[] = []\n  fn add(id) {\n    let found = cart.find(i => i.id == id)\n${b}\n  }\n}`;
  assert.deepEqual(types(body("    if found == null {\n      return\n    } else {\n      found.qty++\n    }")), []);
  assert.deepEqual(types(body("    if !found {\n      cart.push({ id: id, qty: 1 })\n      return\n    }\n    found.qty++")), []);
  // without the return, the rest of the block is not narrowed
  assert.deepEqual(types(body("    if !found {\n      cart.push({ id: id, qty: 1 })\n    }\n    found.qty++")), ["POSSIBLY_EMPTY"]);
});

test("narrowing: ternary, && in expressions, if in views and nested paths", () => {
  const src = `model Profile {\n  name: String\n}\nmodel User {\n  profile: Profile?\n}\ncomponent C(u: User?) {\n  text u ? u.profile?.name : "-"\n  text u && u.profile && u.profile.name\n  if u?.profile {\n    text u.profile.name\n  } else {\n    text "none"\n  }\n}`;
  assert.deepEqual(types(src), []);
  assert.deepEqual(types(src.replace('text u ? u.profile?.name : "-"', 'text u.profile?.name ?? "-"')), ["POSSIBLY_EMPTY"]);
});
