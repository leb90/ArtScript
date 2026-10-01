import { useState } from "react";
import { SEED, type Item } from "./data";
import RefundsForm from "./RefundsForm";
import RefundsList from "./RefundsList";

export default function RefundsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Devoluciones</h2>
      <RefundsForm onAdd={add} />
      <RefundsList items={items} />
    </div>
  );
}
