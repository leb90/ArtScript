import type { Item } from "@/lib/data";
import OrdersRow from "@/components/OrdersRow";

export default function OrdersList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <OrdersRow key={item.id} item={item} />
      ))}
    </div>
  );
}
