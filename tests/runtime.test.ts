import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-ignore: runtime is plain JS
import { $m, batch, computed, effect, root, signal } from "../runtime/runtime.js";

test("effects re-run when a signal changes", () => {
  const a = signal(1);
  const seen: number[] = [];
  root(() => effect(() => seen.push(a.v)));
  a.v = 2;
  a.v = 2; // same value: no notification
  a.v = 3;
  assert.deepEqual(seen, [1, 2, 3]);
});

test("computed is lazy and recomputes once per change", () => {
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

test("batch groups changes: the effect runs once, with no intermediate states", () => {
  const a = signal(1), b = signal(1);
  const sum = computed(() => a.v + b.v);
  const seen: number[] = [];
  root(() => effect(() => seen.push(sum.v)));
  batch(() => { a.v = 10; b.v = 20; });
  assert.deepEqual(seen, [2, 30]);
});

test("$m notifies in-place mutations", () => {
  const list = signal([] as number[]);
  const seen: number[] = [];
  root(() => effect(() => seen.push(list.v.length)));
  $m(list, list.v.push(1));
  assert.deepEqual(seen, [0, 1]);
});

test("disposing a root stops its effects", () => {
  const a = signal(0);
  const seen: number[] = [];
  const dispose = root(() => effect(() => seen.push(a.v)));
  dispose();
  a.v = 1;
  assert.deepEqual(seen, [0]);
});

test("effects only track dependencies read in their last run", () => {
  const flag = signal(true), a = signal("a"), b = signal("b");
  const seen: string[] = [];
  root(() => effect(() => seen.push(flag.v ? a.v : b.v)));
  flag.v = false;
  a.v = "A"; // no longer a dependency
  b.v = "B";
  assert.deepEqual(seen, ["a", "b", "B"]);
});
