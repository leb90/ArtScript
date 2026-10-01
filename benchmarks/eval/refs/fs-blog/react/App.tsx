import { useEffect, useState } from "react";

type Author = { id: string; name: string };
type Post = { id: string; title: string; author: Author | null };

export default function App() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setAuthors(await (await fetch("/api/authors")).json());
    setPosts(await (await fetch("/api/posts")).json());
  };
  useEffect(() => { load(); }, []);

  const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function createAuthor() {
    await fetch("/api/authors", json("POST", { name }));
    setName("");
    load();
  }

  async function removeAuthor(id: string) {
    const res = await fetch(`/api/authors/${id}`, { method: "DELETE" });
    setError(res.ok ? "" : "El autor tiene posts");
    load();
  }

  async function publish() {
    await fetch("/api/posts", json("POST", { title, authorId }));
    setTitle("");
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input placeholder="Autor" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={createAuthor}>Crear autor</button>
      </div>
      {authors.map((a) => (
        <div key={a.id} className="flex gap-2">
          <span>{a.name}</span>
          <button onClick={() => removeAuthor(a.id)}>Borrar autor</button>
        </div>
      ))}
      {error && <span className="text-red-600">{error}</span>}
      <div className="flex gap-2">
        <input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
          <option value="" disabled>Autor del post</option>
          {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button onClick={publish}>Publicar</button>
      </div>
      {posts.map((p) => <p key={p.id}>{p.title} por {p.author?.name}</p>)}
    </div>
  );
}
