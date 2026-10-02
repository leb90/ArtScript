import { createMemo, createSignal, For } from "solid-js";

type Employee = { name: string; age: number };

const employees: Employee[] = [
  { name: "Caro", age: 35 },
  { name: "Ana", age: 30 },
  { name: "Dani", age: 28 },
  { name: "Beto", age: 25 },
];

export default function App() {
  const [sort, setSort] = createSignal<"none" | "name" | "age">("none");
  const [filter, setFilter] = createSignal("");

  const rows = createMemo(() => {
    const found = employees.filter((e) => e.name.toLowerCase().includes(filter().toLowerCase()));
    if (sort() === "name") found.sort((a, b) => a.name.localeCompare(b.name));
    if (sort() === "age") found.sort((a, b) => a.age - b.age);
    return found;
  });

  return (
    <div class="flex flex-col gap-2">
      <input placeholder="Filtrar" value={filter()} onInput={(e) => setFilter(e.currentTarget.value)} />
      <div class="flex gap-2">
        <button onClick={() => setSort("name")}>Ordenar por nombre</button>
        <button onClick={() => setSort("age")}>Ordenar por edad</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Edad</th>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {(e) => (
              <tr>
                <td>{e.name}</td>
                <td>{e.age}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p>Empleados: {rows().length}</p>
    </div>
  );
}
