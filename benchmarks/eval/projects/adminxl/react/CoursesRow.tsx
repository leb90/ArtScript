import type { Item } from "./data";

export default function CoursesRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Cupo: {item.amount}</span>
    </div>
  );
}
