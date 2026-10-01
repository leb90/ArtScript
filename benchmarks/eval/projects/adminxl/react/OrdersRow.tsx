import type { Item } from "./data";

export default function OrdersRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Total: {item.amount}</span>
    </div>
  );
}
