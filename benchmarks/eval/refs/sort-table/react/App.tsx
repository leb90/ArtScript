import { useState } from "react";

type Employee = { name: string; age: number };

const employees: Employee[] = [
  { name: "Caro", age: 35 },
  { name: "Ana", age: 30 },
  { name: "Dani", age: 28 },
  { name: "Beto", age: 25 },
];

export default function App() {
  const [sort, setSort] = useState<"none" | "name" | "age">("none");
  const [filter, setFilter] = useState("");

  const rows = employees.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));
  if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "age") rows.sort((a, b) => a.age - b.age);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={() => setSort("name")}>Ordenar por nombre</button>
        <button onClick={() => setSort("age")}>Ordenar por edad</button>
        <input placeholder="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Edad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.name}>
              <td>{e.name}</td>
              <td>{e.age}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Empleados: {rows.length}</p>
    </div>
  );
}
