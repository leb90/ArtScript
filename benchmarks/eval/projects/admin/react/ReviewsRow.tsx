import type { Item } from "./data";

export default function ReviewsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Puntaje: {item.amount}</span>
    </div>
  );
}
