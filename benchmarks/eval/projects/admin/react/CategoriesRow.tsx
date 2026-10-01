import type { Item } from "./data";

export default function CategoriesRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Margen: {item.amount}</span>
    </div>
  );
}
