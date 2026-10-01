import type { Item } from "./data";
import SubscriptionsRow from "./SubscriptionsRow";

export default function SubscriptionsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <SubscriptionsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
