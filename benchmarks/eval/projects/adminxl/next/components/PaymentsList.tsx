import type { Item } from "@/lib/data";
import PaymentsRow from "@/components/PaymentsRow";

export default function PaymentsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <PaymentsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
