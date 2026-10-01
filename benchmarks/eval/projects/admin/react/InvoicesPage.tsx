import { useState } from "react";
import { SEED, type Item } from "./data";
import InvoicesForm from "./InvoicesForm";
import InvoicesList from "./InvoicesList";

export default function InvoicesPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Facturas</h2>
      <InvoicesForm onAdd={add} />
      <InvoicesList items={items} />
    </div>
  );
}
