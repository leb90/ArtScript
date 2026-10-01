import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import OrdersForm from "./OrdersForm";
import OrdersList from "./OrdersList";

export default function OrdersPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Pedidos</h2>
      <OrdersForm onAdd={add} />
      <OrdersList items={items()} />
    </div>
  );
}
