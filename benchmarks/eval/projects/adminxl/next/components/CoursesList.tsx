import type { Item } from "@/lib/data";
import CoursesRow from "@/components/CoursesRow";

export default function CoursesList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <CoursesRow key={item.id} item={item} />
      ))}
    </div>
  );
}
