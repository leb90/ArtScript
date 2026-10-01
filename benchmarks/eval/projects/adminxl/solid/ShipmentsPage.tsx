import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import ShipmentsForm from "./ShipmentsForm";
import ShipmentsList from "./ShipmentsList";

export default function ShipmentsPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Envíos</h2>
      <ShipmentsForm onAdd={add} />
      <ShipmentsList items={items()} />
    </div>
  );
}
