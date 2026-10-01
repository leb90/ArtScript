import { useState } from "react";
import { SEED, type Item } from "./data";
import ShipmentsForm from "./ShipmentsForm";
import ShipmentsList from "./ShipmentsList";

export default function ShipmentsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Envíos</h2>
      <ShipmentsForm onAdd={add} />
      <ShipmentsList items={items} />
    </div>
  );
}
