import type { Item } from "@/lib/data";
import InvoicesRow from "@/components/InvoicesRow";

export default function InvoicesList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <InvoicesRow key={item.id} item={item} />
      ))}
    </div>
  );
}
