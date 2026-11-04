import type { Item } from "@/lib/data";
import ProjectsRow from "@/components/ProjectsRow";

export default function ProjectsList({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className="text-gray-500">Sin registros</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <ProjectsRow key={item.id} item={item} />
      ))}
    </div>
  );
}
