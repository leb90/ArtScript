import type { Item } from "@/lib/data";
import ShipmentsRow from "@/components/ShipmentsRow";

export default function ShipmentsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <ShipmentsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
