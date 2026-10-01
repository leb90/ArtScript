import type { Item } from "./data";

export default function CouponsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Descuento: {item.amount}</span>
    </div>
  );
}
