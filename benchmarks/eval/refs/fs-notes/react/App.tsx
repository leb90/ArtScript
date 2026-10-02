import { useEffect, useState } from "react";

type User = { email: string };
type Note = { id: string; text: string };

const post = (url: string, body?: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");

  const loadNotes = () => fetch("/api/notes").then((r) => r.json()).then(setNotes);
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setUser);
  }, []);
  useEffect(() => {
    if (user) loadNotes();
  }, [user]);

  async function enter(url: string) {
    const r = await post(url, { email, password });
    if (!r.ok) {
      setError("Datos incorrectos");
      return;
    }
    setUser(await r.json());
    setEmail("");
    setPassword("");
    setError("");
  }

  async function logout() {
    await post("/api/logout");
    setUser(null);
    setNotes([]);
  }

  async function add() {
    await post("/api/notes", { text });
    setText("");
    loadNotes();
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-2">
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={() => enter("/api/signup")}>Crear cuenta</button>
          <button onClick={() => enter("/api/login")}>Entrar</button>
        </div>
        {error && <span>{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <span>Hola, {user.email}</span>
        <button onClick={logout}>Salir</button>
      </div>
      <div className="flex gap-2">
        <input placeholder="Nota" value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={add}>Agregar</button>
      </div>
      <ul>
        {notes.map((n) => <li key={n.id}>{n.text}</li>)}
      </ul>
    </div>
  );
}
