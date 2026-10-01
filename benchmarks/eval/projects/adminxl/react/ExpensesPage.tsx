import { useState } from "react";
import { SEED, type Item } from "./data";
import ExpensesForm from "./ExpensesForm";
import ExpensesList from "./ExpensesList";

export default function ExpensesPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Gastos</h2>
      <ExpensesForm onAdd={add} />
      <ExpensesList items={items} />
    </div>
  );
}
