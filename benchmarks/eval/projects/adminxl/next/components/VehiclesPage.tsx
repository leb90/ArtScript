import { useState } from "react";
import { SEED, type Item } from "@/lib/data";
import VehiclesForm from "@/components/VehiclesForm";
import VehiclesList from "@/components/VehiclesList";

export default function VehiclesPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Vehículos</h2>
      <VehiclesForm onAdd={add} />
      <VehiclesList items={items} />
    </div>
  );
}
