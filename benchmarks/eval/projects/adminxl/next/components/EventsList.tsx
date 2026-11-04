import type { Item } from "@/lib/data";
import EventsRow from "@/components/EventsRow";

export default function EventsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <EventsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
