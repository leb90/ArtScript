import type { Item } from "./data";

export default function ShipmentsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Costo: {item.amount}</span>
    </div>
  );
}
