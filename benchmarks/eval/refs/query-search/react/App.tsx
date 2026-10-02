import { useEffect, useState } from "react";

const products = ["Mesa", "Silla", "Sillón", "Lámpara"];

const queryOf = () => new URLSearchParams(location.search).get("q") ?? "";

export default function App() {
  const [q, setQ] = useState(queryOf);
  const [text, setText] = useState(q);
  useEffect(() => {
    const onPop = () => setQ(queryOf());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function search() {
    history.pushState(null, "", `?q=${encodeURIComponent(text)}`);
    setQ(text);
  }

  const results = products.filter((p) => p.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input placeholder="Buscar" value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={search}>Buscar</button>
      </div>
      <ul>
        {results.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <p>Resultados: {results.length}</p>
    </div>
  );
}
