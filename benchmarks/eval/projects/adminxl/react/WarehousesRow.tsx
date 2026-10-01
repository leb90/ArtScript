import type { Item } from "./data";

export default function WarehousesRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Capacidad: {item.amount}</span>
    </div>
  );
}
