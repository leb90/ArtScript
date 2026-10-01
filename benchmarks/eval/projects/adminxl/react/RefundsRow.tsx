import type { Item } from "./data";

export default function RefundsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Reintegro: {item.amount}</span>
    </div>
  );
}
