import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-ignore: runtime en JS plano
import { $m, batch, computed, effect, root, signal } from "../runtime/runtime.js";

test("effect se re-ejecuta al cambiar un signal", () => {
  const a = signal(1);
  const seen: number[] = [];
  root(() => effect(() => seen.push(a.v)));
  a.v = 2;
  a.v = 2; // mismo valor: no notifica
  a.v = 3;
  assert.deepEqual(seen, [1, 2, 3]);
});

test("computed es lazy y se recalcula una sola vez por cambio", () => {
  const a = signal(2);
  let runs = 0;
  const c = computed(() => { runs++; return a.v * 10; });
  assert.equal(runs, 0);
  assert.equal(c.v, 20);
  assert.equal(c.v, 20);
  assert.equal(runs, 1);
  a.v = 3;
  assert.equal(c.v, 30);
  assert.equal(runs, 2);
});

test("batch agrupa cambios: el effect corre una vez y sin estados intermedios", () => {
  const a = signal(1), b = signal(1);
  const sum = computed(() => a.v + b.v);
  const seen: number[] = [];
  root(() => effect(() => seen.push(sum.v)));
  batch(() => { a.v = 10; b.v = 20; });
  assert.deepEqual(seen, [2, 30]);
});

test("$m notifica mutaciones in-place", () => {
  const list = signal([] as number[]);
  const seen: number[] = [];
  root(() => effect(() => seen.push(list.v.length)));
  $m(list, list.v.push(1));
  assert.deepEqual(seen, [0, 1]);
});

test("dispose de root detiene sus effects", () => {
  const a = signal(0);
  const seen: number[] = [];
  const dispose = root(() => effect(() => seen.push(a.v)));
  dispose();
  a.v = 1;
  assert.deepEqual(seen, [0]);
});

test("effects solo siguen las dependencias leídas en la última ejecución", () => {
  const flag = signal(true), a = signal("a"), b = signal("b");
  const seen: string[] = [];
  root(() => effect(() => seen.push(flag.v ? a.v : b.v)));
  flag.v = false;
  a.v = "A"; // ya no es dependencia
  b.v = "B";
  assert.deepEqual(seen, ["a", "b", "B"]);
});
