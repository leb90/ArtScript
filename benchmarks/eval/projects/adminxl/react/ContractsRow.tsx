import type { Item } from "./data";

export default function ContractsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Valor: {item.amount}</span>
    </div>
  );
}
