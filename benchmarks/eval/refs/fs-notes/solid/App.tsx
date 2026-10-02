import { createResource, createSignal, For, Show } from "solid-js";

type User = { email: string };
type Note = { id: string; text: string };

const post = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

export default function App() {
  const [user, { mutate: setUser }] = createResource<User | null>(async () => (await fetch("/api/me")).json());
  const [notes, { refetch }] = createResource(
    () => user()?.email,
    async (): Promise<Note[]> => (await fetch("/api/notes")).json(),
  );
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [text, setText] = createSignal("");

  async function access(url: string, failure: string) {
    const res = await post(url, { email: email(), password: password() });
    if (!res.ok) {
      setError(failure);
      return;
    }
    setUser(await res.json());
    setEmail("");
    setPassword("");
    setError("");
  }

  async function logout() {
    await post("/api/logout");
    setUser(null);
  }

  async function add() {
    await post("/api/notes", { text: text() });
    setText("");
    refetch();
  }

  return (
    <Show
      when={user()}
      fallback={
        <div class="flex flex-col gap-2">
          <input placeholder="Email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
          <input type="password" placeholder="Contraseña" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
          <div class="flex gap-2">
            <button onClick={() => access("/api/signup", "No se pudo crear la cuenta")}>Crear cuenta</button>
            <button onClick={() => access("/api/login", "Datos incorrectos")}>Entrar</button>
          </div>
          <Show when={error()}>
            <span>{error()}</span>
          </Show>
        </div>
      }
    >
      {(u) => (
        <div class="flex flex-col gap-2">
          <p>Hola, {u().email}</p>
          <button onClick={logout}>Salir</button>
          <input placeholder="Nota" value={text()} onInput={(e) => setText(e.currentTarget.value)} />
          <button onClick={add}>Agregar</button>
          <ul>
            <For each={notes() ?? []}>{(n) => <li>{n.text}</li>}</For>
          </ul>
        </div>
      )}
    </Show>
  );
}
