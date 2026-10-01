import type { Item } from "./data";
import CouponsRow from "./CouponsRow";

export default function CouponsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <CouponsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
