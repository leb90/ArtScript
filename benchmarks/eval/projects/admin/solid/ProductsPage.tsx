import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import ProductsForm from "./ProductsForm";
import ProductsList from "./ProductsList";

export default function ProductsPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Productos</h2>
      <ProductsForm onAdd={add} />
      <ProductsList items={items()} />
    </div>
  );
}
