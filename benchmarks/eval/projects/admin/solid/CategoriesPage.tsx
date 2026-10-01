import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import CategoriesForm from "./CategoriesForm";
import CategoriesList from "./CategoriesList";

export default function CategoriesPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Categorías</h2>
      <CategoriesForm onAdd={add} />
      <CategoriesList items={items()} />
    </div>
  );
}
