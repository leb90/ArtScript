import { useEffect, useState } from "react";

type User = { id: string; name: string; email: string };

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const load = () => fetch("/api/users").then((r) => r.json()).then(setUsers);
  useEffect(() => { load(); }, []);

  async function add() {
    if (!email.includes("@")) {
      setError("Email inválido");
      return;
    }
    await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email }) });
    setName("");
    setEmail("");
    setError("");
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-2">
      <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button onClick={add}>Agregar</button>
      {error && <span>{error}</span>}
      {users.map((u) => (
        <div key={u.id} className="flex gap-2">
          <span>{u.name} ({u.email})</span>
          <button onClick={() => remove(u.id)}>Borrar</button>
        </div>
      ))}
    </div>
  );
}
