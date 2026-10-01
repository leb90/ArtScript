import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import EmployeesForm from "./EmployeesForm";
import EmployeesList from "./EmployeesList";

export default function EmployeesPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Empleados</h2>
      <EmployeesForm onAdd={add} />
      <EmployeesList items={items()} />
    </div>
  );
}
