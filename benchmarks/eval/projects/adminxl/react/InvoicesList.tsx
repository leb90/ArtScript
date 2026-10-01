import type { Item } from "./data";
import InvoicesRow from "./InvoicesRow";

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
