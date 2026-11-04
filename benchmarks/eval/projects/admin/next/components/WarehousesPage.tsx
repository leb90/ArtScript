import { useState } from "react";
import { SEED, type Item } from "@/lib/data";
import WarehousesForm from "@/components/WarehousesForm";
import WarehousesList from "@/components/WarehousesList";

export default function WarehousesPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Depósitos</h2>
      <WarehousesForm onAdd={add} />
      <WarehousesList items={items} />
    </div>
  );
}
