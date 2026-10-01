import { useEffect, useState } from "react";

type Product = { id: string; name: string; code: string; price: number };

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  const load = () => fetch("/api/products").then((r) => r.json()).then(setProducts);
  useEffect(() => { load(); }, []);

  async function save() {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, code, price: Number(price) }),
    });
    setError(res.ok ? "" : (await res.json()).error);
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} />
      <input placeholder="Precio" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
      <button onClick={save}>Guardar</button>
      {error && <span className="text-red-600">{error}</span>}
      {products.map((p) => <p key={p.id}>{p.name} ({p.code})</p>)}
    </div>
  );
}
