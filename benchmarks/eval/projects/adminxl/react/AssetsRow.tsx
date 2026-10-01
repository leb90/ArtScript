import type { Item } from "./data";

export default function AssetsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Valuación: {item.amount}</span>
    </div>
  );
}
