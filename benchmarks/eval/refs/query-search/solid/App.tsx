import { createMemo, createSignal, For, onCleanup } from "solid-js";

const products = ["Mesa", "Silla", "Sillón", "Lámpara"];
const queryOf = () => new URLSearchParams(location.search).get("q") ?? "";

export default function App() {
  const [q, setQ] = createSignal(queryOf());
  const [text, setText] = createSignal(queryOf());
  const onPop = () => setQ(queryOf());
  window.addEventListener("popstate", onPop);
  onCleanup(() => window.removeEventListener("popstate", onPop));

  function search() {
    history.pushState(null, "", `?q=${encodeURIComponent(text())}`);
    setQ(text());
  }
  const results = createMemo(() => products.filter((p) => p.toLowerCase().includes(q().toLowerCase())));

  return (
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <input placeholder="Buscar" value={text()} onInput={(e) => setText(e.currentTarget.value)} />
        <button onClick={search}>Buscar</button>
      </div>
      <ul>
        <For each={results()}>{(p) => <li>{p}</li>}</For>
      </ul>
      <p>Resultados: {results().length}</p>
    </div>
  );
}
