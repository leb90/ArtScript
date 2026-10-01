import type { Item } from "./data";

export default function ExpensesRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Gasto: {item.amount}</span>
    </div>
  );
}
