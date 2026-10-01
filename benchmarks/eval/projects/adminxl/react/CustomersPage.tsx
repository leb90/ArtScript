import { useState } from "react";
import { SEED, type Item } from "./data";
import CustomersForm from "./CustomersForm";
import CustomersList from "./CustomersList";

export default function CustomersPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Clientes</h2>
      <CustomersForm onAdd={add} />
      <CustomersList items={items} />
    </div>
  );
}
