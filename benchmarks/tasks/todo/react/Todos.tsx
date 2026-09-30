import { useState } from "react";

type Todo = { id: string; title: string; done: boolean };

function TodoItem({ todo, onToggle, onRemove }: { todo: Todo; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo.id)} />
      <span>{todo.title}</span>
      <button className="danger small" onClick={() => onRemove(todo.id)}>x</button>
    </div>
  );
}

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState("");
  const pending = todos.filter((t) => !t.done).length;

  function add() {
    if (draft.trim() === "") return;
    setTodos([...todos, { id: crypto.randomUUID(), title: draft, done: false }]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-4">
      <h2>Tareas</h2>
      <div className="flex items-center gap-2">
        <input value={draft} placeholder="¿Qué hay que hacer?" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="primary" onClick={add}>Agregar</button>
      </div>
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={(id) => setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))}
          onRemove={(id) => setTodos(todos.filter((t) => t.id !== id))}
        />
      ))}
      {todos.length === 0 ? <span className="text-gray-500">No hay tareas</span> : <span className="text-gray-500">{pending} pendientes</span>}
    </div>
  );
}
