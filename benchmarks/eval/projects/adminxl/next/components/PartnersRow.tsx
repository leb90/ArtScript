import type { Item } from "@/lib/data";

export default function PartnersRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Aporte: {item.amount}</span>
    </div>
  );
}
