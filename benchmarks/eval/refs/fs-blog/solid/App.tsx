import { createResource, createSignal, For, Show } from "solid-js";

type Author = { id: string; name: string };
type Post = { id: string; title: string; author: Author | null };

const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function App() {
  const [authors, { refetch: reloadAuthors }] = createResource<Author[]>(async () => (await fetch("/api/authors")).json());
  const [posts, { refetch: reloadPosts }] = createResource<Post[]>(async () => (await fetch("/api/posts")).json());
  const [name, setName] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [authorId, setAuthorId] = createSignal("");
  const [error, setError] = createSignal("");
  const reload = () => { reloadAuthors(); reloadPosts(); };

  async function createAuthor() {
    await fetch("/api/authors", json("POST", { name: name() }));
    setName("");
    reload();
  }

  async function removeAuthor(id: string) {
    const res = await fetch(`/api/authors/${id}`, { method: "DELETE" });
    setError(res.ok ? "" : "El autor tiene posts");
    reload();
  }

  async function publish() {
    await fetch("/api/posts", json("POST", { title: title(), authorId: authorId() }));
    setTitle("");
    reload();
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="flex gap-2">
        <input placeholder="Autor" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        <button onClick={createAuthor}>Crear autor</button>
      </div>
      <For each={authors() ?? []}>
        {(a) => (
          <div class="flex gap-2">
            <span>{a.name}</span>
            <button onClick={() => removeAuthor(a.id)}>Borrar autor</button>
          </div>
        )}
      </For>
      <Show when={error()}>
        <span class="text-red-600">{error()}</span>
      </Show>
      <div class="flex gap-2">
        <input placeholder="Título" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        <select value={authorId()} onChange={(e) => setAuthorId(e.currentTarget.value)}>
          <option value="" disabled>Autor del post</option>
          <For each={authors() ?? []}>{(a) => <option value={a.id}>{a.name}</option>}</For>
        </select>
        <button onClick={publish}>Publicar</button>
      </div>
      <For each={posts() ?? []}>{(p) => <p>{p.title} por {p.author?.name}</p>}</For>
    </div>
  );
}
