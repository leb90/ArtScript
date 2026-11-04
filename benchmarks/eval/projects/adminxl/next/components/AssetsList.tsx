import type { Item } from "@/lib/data";
import AssetsRow from "@/components/AssetsRow";

export default function AssetsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <AssetsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
