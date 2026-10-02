import { useEffect, useState } from "react";

type Task = { id: string; title: string; done: boolean };

const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState("Todas");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const load = () => fetch("/api/tasks").then((r) => r.json()).then(setTasks);
  useEffect(() => { load(); }, []);

  async function add() {
    await fetch("/api/tasks", json("POST", { title }));
    setTitle("");
    load();
  }

  async function markDone(id: string) {
    await fetch(`/api/tasks/${id}`, json("PATCH", { done: true }));
    load();
  }

  function rename(task: Task) {
    setRenaming(task.id);
    setNewTitle(task.title);
  }

  async function saveTitle(id: string) {
    await fetch(`/api/tasks/${id}`, json("PATCH", { title: newTitle }));
    setRenaming(null);
    load();
  }

  const visible = tasks.filter((t) => filter === "Todas" || (filter === "Hechas") === t.done);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input placeholder="Tarea" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button onClick={add}>Agregar</button>
      </div>
      <select value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option>Todas</option>
        <option>Pendientes</option>
        <option>Hechas</option>
      </select>
      {visible.map((t) => (
        <div key={t.id} className="flex gap-2">
          {renaming === t.id ? (
            <>
              <input placeholder="Nuevo título" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <button onClick={() => saveTitle(t.id)}>Guardar</button>
            </>
          ) : (
            <span>{t.title}{t.done && " (hecha)"}</span>
          )}
          {!t.done && <button onClick={() => markDone(t.id)}>Hecha</button>}
          <button onClick={() => rename(t)}>Renombrar</button>
        </div>
      ))}
    </div>
  );
}
