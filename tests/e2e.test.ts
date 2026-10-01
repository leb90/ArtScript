// Compiles .art → JS, mounts it in an in-memory DOM and interacts like a user.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { all, mountApp } from "./helpers.ts";

test("counter: clicks actualizan texto, computed e if", async () => {
  const { root } = await mountApp(readFileSync("examples/counter/app.art", "utf8"));
  const [minus, plus] = all(root, "button");
  const spans = () => all(root, "span").map((s) => s.textContent);
  assert.deepEqual(spans(), ["0", "El doble es 0"]);
  plus.click();
  plus.click();
  minus.click();
  assert.deepEqual(spans(), ["1", "El doble es 2"]);
  for (let i = 0; i < 5; i++) plus.click();
  assert.deepEqual(spans(), ["6", "El doble es 12", "¡Más de 5!"]);
  minus.click();
  assert.deepEqual(spans(), ["5", "El doble es 10"]);
});

test("todo: input, enter, lista, checkbox en componente hijo y borrar", async () => {
  const { root } = await mountApp(readFileSync("examples/todo/app.art", "utf8"));
  const input = all(root, "input")[0];
  const addBtn = all(root, "button")[0];
  const footer = () => all(root, "span").at(-1)!.textContent;

  assert.equal(footer(), "No hay tareas");
  input.typeText("Comprar pan");
  input.pressEnter();
  assert.equal(input.value, "", "draft se limpia y el input refleja el state");
  input.typeText("Estudiar");
  addBtn.click();
  input.typeText("   ");
  addBtn.click(); // empty: ignored

  const items = () => all(root, "span").slice(0, -1).map((s) => s.textContent);
  assert.deepEqual(items(), ["Comprar pan", "Estudiar"]);
  assert.equal(footer(), "2 pendientes");

  // checkbox inside TodoItem mutates todo.done → notifies the parent state
  all(root, "input").filter((i) => i.type === "checkbox")[0].toggle();
  assert.equal(footer(), "1 pendientes");

  // delete via a callback passed as a prop
  all(root, "button").filter((b) => b.textContent === "x")[0].click();
  assert.deepEqual(items(), ["Estudiar"]);
  assert.equal(footer(), "1 pendientes");
});

test("if/else y for desmontan effects de ramas removidas", async () => {
  const { root, dispose } = await mountApp(`page P {
  state show = true
  state n = 0
  button "t" -> show = !show
  button "inc" -> n++
  if show {
    text n
  } else {
    text "oculto"
  }
}`);
  const [toggle, inc] = all(root, "button");
  inc.click();
  assert.equal(all(root, "span")[0].textContent, "1");
  toggle.click();
  assert.equal(all(root, "span")[0].textContent, "oculto");
  inc.click(); // must not revive the removed branch
  assert.equal(all(root, "span").length, 1);
  toggle.click();
  assert.equal(all(root, "span")[0].textContent, "2");
  dispose();
});

test("props de layout y flags se traducen a estilos y clases", async () => {
  const { root } = await mountApp(`page P {
  grid cols=3 gap=2 pad=4 {
    button "a" primary
  }
}`);
  const grid = all(root, "div")[0];
  assert.equal(grid.className, "a-grid");
  assert.deepEqual(grid.style, { gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px", padding: "16px" });
  assert.equal(all(root, "button")[0].className, "a-primary");
});

test("conditional flag toggles its class reactively", async () => {
  const { root } = await mountApp(`page P {
  state done = false
  text "task" bold muted=done
  button "t" -> done = !done
}`);
  const span = all(root, "span")[0];
  assert.equal(span.className, "a-bold");
  all(root, "button")[0].click();
  assert.equal(span.className, "a-bold a-muted");
  all(root, "button")[0].click();
  assert.equal(span.className, "a-bold");
});

test("enum prop keywords win over a state with the same name (type=email next to state email)", async () => {
  const { root } = await mountApp(`page P {
  state email = ""
  state center = 1
  input email type=email
  row align=center {
    text center
  }
}`);
  assert.equal(all(root, "input")[0].type, "email");
  assert.equal(all(root, "div")[0].style.alignItems, "center");
});
