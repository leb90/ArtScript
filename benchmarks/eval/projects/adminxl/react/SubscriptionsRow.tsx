import type { Item } from "./data";

export default function SubscriptionsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Cuota: {item.amount}</span>
    </div>
  );
}
