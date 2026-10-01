import type { Item } from "./data";
import BranchesRow from "./BranchesRow";

export default function BranchesList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <BranchesRow key={item.id} item={item} />
      ))}
    </div>
  );
}
