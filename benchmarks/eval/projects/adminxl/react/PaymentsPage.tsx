import { useState } from "react";
import { SEED, type Item } from "./data";
import PaymentsForm from "./PaymentsForm";
import PaymentsList from "./PaymentsList";

export default function PaymentsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Pagos</h2>
      <PaymentsForm onAdd={add} />
      <PaymentsList items={items} />
    </div>
  );
}
