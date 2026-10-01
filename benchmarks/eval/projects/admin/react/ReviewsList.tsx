import type { Item } from "./data";
import ReviewsRow from "./ReviewsRow";

export default function ReviewsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <ReviewsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
