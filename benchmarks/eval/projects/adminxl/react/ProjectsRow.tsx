import type { Item } from "./data";

export default function ProjectsRow({ item }: { item: Item }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold">{item.name}</span>
      <span>Presupuesto: {item.amount}</span>
    </div>
  );
}
