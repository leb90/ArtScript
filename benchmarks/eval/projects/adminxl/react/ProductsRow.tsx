import type { Item } from "./data";

export default function ProductsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Precio: {item.amount}</span>
    </div>
  );
}
