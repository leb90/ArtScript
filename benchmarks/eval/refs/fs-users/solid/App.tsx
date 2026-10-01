import { createResource, createSignal, For, Show } from "solid-js";

type User = { id: string; name: string; email: string };

export default function App() {
  const [users, { refetch }] = createResource<User[]>(async () => (await fetch("/api/users")).json());
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal("");

  async function add() {
    if (!email().includes("@")) {
      setError("Email inválido");
      return;
    }
    await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name(), email: email() }) });
    setName("");
    setEmail("");
    setError("");
    refetch();
  }

  async function remove(id: string) {
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    refetch();
  }

  return (
    <div class="flex flex-col gap-2">
      <input placeholder="Nombre" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      <input placeholder="Email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
      <button onClick={add}>Agregar</button>
      <Show when={error()}>
        <span>{error()}</span>
      </Show>
      <For each={users() ?? []}>
        {(u) => (
          <div class="flex gap-2">
            <span>{u.name} ({u.email})</span>
            <button onClick={() => remove(u.id)}>Borrar</button>
          </div>
        )}
      </For>
    </div>
  );
}
