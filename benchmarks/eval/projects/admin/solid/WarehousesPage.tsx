import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import WarehousesForm from "./WarehousesForm";
import WarehousesList from "./WarehousesList";

export default function WarehousesPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Depósitos</h2>
      <WarehousesForm onAdd={add} />
      <WarehousesList items={items()} />
    </div>
  );
}
