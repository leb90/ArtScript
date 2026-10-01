import { useState } from "react";
import { SEED, type Item } from "./data";
import CoursesForm from "./CoursesForm";
import CoursesList from "./CoursesList";

export default function CoursesPage() {
  const [items, setItems] = useState<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    setItems([...items, { id: Date.now(), name, amount, active: true }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Cursos</h2>
      <CoursesForm onAdd={add} />
      <CoursesList items={items} />
    </div>
  );
}
