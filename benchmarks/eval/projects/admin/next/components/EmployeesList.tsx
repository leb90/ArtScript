import type { Item } from "@/lib/data";
import EmployeesRow from "@/components/EmployeesRow";

export default function EmployeesList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <EmployeesRow key={item.id} item={item} />
      ))}
    </div>
  );
}
