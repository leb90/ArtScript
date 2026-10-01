import { useState } from "react";
import { SEED, type Item } from "./data";
import ProjectsForm from "./ProjectsForm";
import ProjectsList from "./ProjectsList";

export default function ProjectsPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Proyectos</h2>
      <ProjectsForm onAdd={add} />
      <ProjectsList items={items} />
    </div>
  );
}
