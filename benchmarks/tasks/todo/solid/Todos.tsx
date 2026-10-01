import { createMemo, createSignal, For, Show } from "solid-js";

type Todo = { id: string; title: string; done: boolean };

function TodoItem(props: { todo: Todo; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <div class="flex items-center gap-2">
      <input type="checkbox" checked={props.todo.done} onChange={() => props.onToggle(props.todo.id)} />
      <span>{props.todo.title}</span>
      <button class="danger small" onClick={() => props.onRemove(props.todo.id)}>x</button>
    </div>
  );
}

export default function Todos() {
  const [todos, setTodos] = createSignal<Todo[]>([]);
  const [draft, setDraft] = createSignal("");
  const pending = createMemo(() => todos().filter((t) => !t.done).length);

  function add() {
    if (draft().trim() === "") return;
    setTodos([...todos(), { id: crypto.randomUUID(), title: draft(), done: false }]);
    setDraft("");
  }

  return (
    <div class="flex flex-col gap-4">
      <h2>Tareas</h2>
      <div class="flex items-center gap-2">
        <input value={draft()} placeholder="¿Qué hay que hacer?" onInput={(e) => setDraft(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button class="primary" onClick={add}>Agregar</button>
      </div>
      <For each={todos()}>
        {(todo) => (
          <TodoItem
            todo={todo}
            onToggle={(id) => setTodos(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))}
            onRemove={(id) => setTodos(todos().filter((t) => t.id !== id))}
          />
        )}
      </For>
      <Show when={todos().length > 0} fallback={<span class="text-gray-500">No hay tareas</span>}>
        <span class="text-gray-500">{pending()} pendientes</span>
      </Show>
    </div>
  );
}
