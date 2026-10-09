// Mutations through an untracked alias (a fn parameter, a computed's item) notify only the states
// that hold the object, once per flush; an object no state holds notifies nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-ignore: runtime is plain JS
import { $mut, batch, effect, root, signal } from "../runtime/runtime.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("a mutated object notifies the state that holds it, not the others", async () => {
  let runsA = 0, runsB = 0, runsC = 0;
  const dispose = root(() => {
    const items = signal([{ n: 1 }, { n: 2 }]);
    const game = signal({ drops: [{ x: 0 }], score: 0 });
    const other = signal({ v: 1 });
    effect(() => { items.v; runsA++; });
    effect(() => { game.v; runsB++; });
    effect(() => { other.v; runsC++; });
    const item = items.v[1], drop = game.v.drops[0];
    // Inside a batch (a handler): notified when the batch ends.
    batch(() => { $mut(item, item.n = 5); $mut(item, item.n = 6); });
    assert.deepEqual([runsA, runsB, runsC], [2, 1, 1]);
    // Outside a batch (an animation frame): once, on the next microtask, however many mutations.
    for (let i = 0; i < 1000; i++) $mut(drop, drop.x = i);
    assert.deepEqual([runsA, runsB, runsC], [2, 1, 1]);
  });
  await tick();
  assert.deepEqual([runsA, runsB, runsC], [2, 2, 1]);
  dispose();
});

test("an object no state holds notifies nothing", async () => {
  let runs = 0;
  root(() => {
    const s = signal({ a: 1 });
    effect(() => { s.v; runs++; });
    const local = { x: 0 };
    for (let i = 0; i < 1000; i++) $mut(local, local.x = i);
  });
  await tick();
  assert.equal(runs, 1);
});
