import { createResource, createSignal, For } from "solid-js";

type Product = { id: number; name: string };
type Result = { items: Product[]; total: number };

const SIZE = 5;

export default function App() {
  const [q, setQ] = createSignal("");
  const [page, setPage] = createSignal(0);
  const [result, { refetch }] = createResource(
    () => ({ q: q(), page: page() }),
    async ({ q, page }): Promise<Result> => (await fetch(`/api/products?q=${encodeURIComponent(q)}&page=${page}`)).json(),
  );
  const total = () => result.latest?.total ?? 0;

  async function seed() {
    await fetch("/api/seed", { method: "POST" });
    refetch();
  }

  function search(text: string) {
    setQ(text);
    setPage(0);
  }

  return (
    <div class="flex flex-col gap-2">
      <button onClick={seed}>Cargar ejemplos</button>
      <input placeholder="Buscar" value={q()} onInput={(e) => search(e.currentTarget.value)} />
      <ul>
        <For each={result.latest?.items ?? []}>{(p) => <li>{p.name}</li>}</For>
      </ul>
      <p>Total: {total()}</p>
      <div class="flex gap-2">
        <button disabled={page() === 0} onClick={() => setPage(page() - 1)}>Anterior</button>
        <button disabled={(page() + 1) * SIZE >= total()} onClick={() => setPage(page() + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
