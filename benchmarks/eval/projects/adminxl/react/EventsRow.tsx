import type { Item } from "./data";

export default function EventsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Asistentes: {item.amount}</span>
    </div>
  );
}
