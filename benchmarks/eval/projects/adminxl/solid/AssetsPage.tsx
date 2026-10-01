import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import AssetsForm from "./AssetsForm";
import AssetsList from "./AssetsList";

export default function AssetsPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Activos</h2>
      <AssetsForm onAdd={add} />
      <AssetsList items={items()} />
    </div>
  );
}
