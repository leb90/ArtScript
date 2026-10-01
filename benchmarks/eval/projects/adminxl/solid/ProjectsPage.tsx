import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import ProjectsForm from "./ProjectsForm";
import ProjectsList from "./ProjectsList";

export default function ProjectsPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Proyectos</h2>
      <ProjectsForm onAdd={add} />
      <ProjectsList items={items()} />
    </div>
  );
}
