import type { Item } from "./data";

export default function CustomersRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Saldo: {item.amount}</span>
    </div>
  );
}
