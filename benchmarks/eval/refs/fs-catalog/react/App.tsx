import { useEffect, useState } from "react";

type Product = { id: number; name: string };

const PAGE = 5;

export default function App() {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  async function load() {
    const r = await fetch(`/api/products?q=${encodeURIComponent(q)}&page=${page}`);
    const data = await r.json();
    setItems(data.items);
    setTotal(data.total);
  }
  useEffect(() => { load(); }, [q, page]);

  async function seed() {
    await fetch("/api/seed", { method: "POST" });
    load();
  }

  function search(text: string) {
    setQ(text);
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={seed}>Cargar ejemplos</button>
      <input placeholder="Buscar" value={q} onChange={(e) => search(e.target.value)} />
      <ul>
        {items.map((p) => <li key={p.id}>{p.name}</li>)}
      </ul>
      <p>Total: {total}</p>
      <div className="flex gap-2">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
        <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
