import type { Item } from "./data";

export default function PaymentsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Monto: {item.amount}</span>
    </div>
  );
}
