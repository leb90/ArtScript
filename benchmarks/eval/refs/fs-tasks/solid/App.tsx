import { createResource, createSignal, For, Show } from "solid-js";

type Task = { id: string; title: string; done: boolean };

const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function App() {
  const [tasks, { refetch }] = createResource<Task[]>(async () => (await fetch("/api/tasks")).json());
  const [title, setTitle] = createSignal("");
  const [filter, setFilter] = createSignal("Todas");
  const [renaming, setRenaming] = createSignal<string | null>(null);
  const [newTitle, setNewTitle] = createSignal("");

  const visible = () =>
    (tasks() ?? []).filter((t) => filter() === "Todas" || (filter() === "Hechas") === t.done);

  async function add() {
    await fetch("/api/tasks", json("POST", { title: title() }));
    setTitle("");
    refetch();
  }

  async function markDone(id: string) {
    await fetch(`/api/tasks/${id}`, json("PATCH", { done: true }));
    refetch();
  }

  function rename(task: Task) {
    setNewTitle(task.title);
    setRenaming(task.id);
  }

  async function save(id: string) {
    await fetch(`/api/tasks/${id}`, json("PATCH", { title: newTitle() }));
    setRenaming(null);
    refetch();
  }

  return (
    <div class="flex flex-col gap-2">
      <input placeholder="Tarea" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
      <button onClick={add}>Agregar</button>
      <select value={filter()} onChange={(e) => setFilter(e.currentTarget.value)}>
        <option>Todas</option>
        <option>Pendientes</option>
        <option>Hechas</option>
      </select>
      <For each={visible()}>
        {(t) => (
          <div class="flex gap-2">
            <Show
              when={renaming() === t.id}
              fallback={<span>{t.title}{t.done ? " (hecha)" : ""}</span>}
            >
              <input placeholder="Nuevo título" value={newTitle()} onInput={(e) => setNewTitle(e.currentTarget.value)} />
              <button onClick={() => save(t.id)}>Guardar</button>
            </Show>
            <Show when={!t.done}>
              <button onClick={() => markDone(t.id)}>Hecha</button>
            </Show>
            <button onClick={() => rename(t)}>Renombrar</button>
          </div>
        )}
      </For>
    </div>
  );
}
