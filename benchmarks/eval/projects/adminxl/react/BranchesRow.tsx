import type { Item } from "./data";

export default function BranchesRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Ventas: {item.amount}</span>
    </div>
  );
}
