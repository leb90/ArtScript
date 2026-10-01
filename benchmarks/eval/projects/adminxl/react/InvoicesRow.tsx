import type { Item } from "./data";

export default function InvoicesRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Importe: {item.amount}</span>
    </div>
  );
}
