import { useState } from "react";
import { SEED, type Item } from "./data";
import EmployeesForm from "./EmployeesForm";
import EmployeesList from "./EmployeesList";

export default function EmployeesPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Empleados</h2>
      <EmployeesForm onAdd={add} />
      <EmployeesList items={items} />
    </div>
  );
}
