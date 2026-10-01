import type { Item } from "./data";

export default function SuppliersRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Deuda: {item.amount}</span>
    </div>
  );
}
