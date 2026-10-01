import { useState } from "react";
import { SEED, type Item } from "./data";
import SuppliersForm from "./SuppliersForm";
import SuppliersList from "./SuppliersList";

export default function SuppliersPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Proveedores</h2>
      <SuppliersForm onAdd={add} />
      <SuppliersList items={items} />
    </div>
  );
}
