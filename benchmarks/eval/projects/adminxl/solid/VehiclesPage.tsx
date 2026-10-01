import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import VehiclesForm from "./VehiclesForm";
import VehiclesList from "./VehiclesList";

export default function VehiclesPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Vehículos</h2>
      <VehiclesForm onAdd={add} />
      <VehiclesList items={items()} />
    </div>
  );
}
