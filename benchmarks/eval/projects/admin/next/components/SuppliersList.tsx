import type { Item } from "@/lib/data";
import SuppliersRow from "@/components/SuppliersRow";

export default function SuppliersList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <SuppliersRow key={item.id} item={item} />
      ))}
    </div>
  );
}
