import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import BranchesForm from "./BranchesForm";
import BranchesList from "./BranchesList";

export default function BranchesPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Sucursales</h2>
      <BranchesForm onAdd={add} />
      <BranchesList items={items()} />
    </div>
  );
}
