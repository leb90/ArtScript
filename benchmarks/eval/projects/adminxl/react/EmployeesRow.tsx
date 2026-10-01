import type { Item } from "./data";

export default function EmployeesRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Sueldo: {item.amount}</span>
    </div>
  );
}
