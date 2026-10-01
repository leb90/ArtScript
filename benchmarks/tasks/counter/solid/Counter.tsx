import { createSignal, Show } from "solid-js";

export default function Counter() {
  const [count, setCount] = createSignal(0);
  const double = () => count() * 2;

  return (
    <div class="flex flex-col gap-4 items-center">
      <h2>Contador</h2>
      <div class="flex items-center gap-2">
        <button onClick={() => setCount(count() - 1)}>-</button>
        <span class="font-semibold">{count()}</span>
        <button class="primary" onClick={() => setCount(count() + 1)}>+</button>
      </div>
      <span class="text-gray-500">El doble es {double()}</span>
      <Show when={count() > 5}>
        <span>¡Más de 5!</span>
      </Show>
    </div>
  );
}
