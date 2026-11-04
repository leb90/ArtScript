import { useState } from "react";
import { SEED, type Item } from "@/lib/data";
import ProductsForm from "@/components/ProductsForm";
import ProductsList from "@/components/ProductsList";

export default function ProductsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Productos</h2>
      <ProductsForm onAdd={add} />
      <ProductsList items={items} />
    </div>
  );
}
