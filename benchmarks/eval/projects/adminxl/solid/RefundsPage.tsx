import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import RefundsForm from "./RefundsForm";
import RefundsList from "./RefundsList";

export default function RefundsPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Devoluciones</h2>
      <RefundsForm onAdd={add} />
      <RefundsList items={items()} />
    </div>
  );
}
