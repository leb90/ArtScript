import type { Item } from "./data";

export default function VehiclesRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Kilometraje: {item.amount}</span>
    </div>
  );
}
