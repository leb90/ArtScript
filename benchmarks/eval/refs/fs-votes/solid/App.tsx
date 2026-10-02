import { createResource, For } from "solid-js";

type Result = { option: string; votes: number; percent: number };

export default function App() {
  const [results, { refetch }] = createResource<Result[]>(async () => (await fetch("/api/results")).json());

  async function vote(option: string) {
    await fetch("/api/votes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option }) });
    refetch();
  }

  async function reset() {
    await fetch("/api/votes", { method: "DELETE" });
    refetch();
  }

  return (
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <button onClick={() => vote("Perros")}>Votar Perros</button>
        <button onClick={() => vote("Gatos")}>Votar Gatos</button>
      </div>
      <For each={results() ?? []}>
        {(r) => <p>{r.option}: {r.percent}% ({r.votes} votos)</p>}
      </For>
      <button onClick={reset}>Reiniciar</button>
    </div>
  );
}
