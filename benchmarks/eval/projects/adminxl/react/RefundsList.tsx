import type { Item } from "./data";
import RefundsRow from "./RefundsRow";

export default function RefundsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <RefundsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
