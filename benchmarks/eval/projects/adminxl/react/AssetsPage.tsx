import { useState } from "react";
import { SEED, type Item } from "./data";
import AssetsForm from "./AssetsForm";
import AssetsList from "./AssetsList";

export default function AssetsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Activos</h2>
      <AssetsForm onAdd={add} />
      <AssetsList items={items} />
    </div>
  );
}
