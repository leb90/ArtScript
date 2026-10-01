import type { Item } from "./data";

export default function TicketsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Prioridad: {item.amount}</span>
    </div>
  );
}
