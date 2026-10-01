import { useState } from "react";
import { SEED, type Item } from "./data";
import BranchesForm from "./BranchesForm";
import BranchesList from "./BranchesList";

export default function BranchesPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Sucursales</h2>
      <BranchesForm onAdd={add} />
      <BranchesList items={items} />
    </div>
  );
}
