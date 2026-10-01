import { createSignal } from "solid-js";
import { SEED, type Item } from "./data";
import CoursesForm from "./CoursesForm";
import CoursesList from "./CoursesList";

export default function CoursesPage() {
  const [items, setItems] = createSignal<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items(), { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">Cursos</h2>
      <CoursesForm onAdd={add} />
      <CoursesList items={items()} />
    </div>
  );
}
