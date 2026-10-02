import { useEffect, useState } from "react";

type Result = { option: string; votes: number; percent: number };

export default function App() {
  const [results, setResults] = useState<Result[]>([]);

  const load = () => fetch("/api/results").then((r) => r.json()).then(setResults);
  useEffect(() => { load(); }, []);

  async function vote(option: string) {
    await fetch("/api/votes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option }) });
    load();
  }

  async function reset() {
    await fetch("/api/votes", { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={() => vote("Perros")}>Votar Perros</button>
        <button onClick={() => vote("Gatos")}>Votar Gatos</button>
      </div>
      {results.map((r) => <p key={r.option}>{r.option}: {r.percent}% ({r.votes} votos)</p>)}
      <button onClick={reset}>Reiniciar</button>
    </div>
  );
}
