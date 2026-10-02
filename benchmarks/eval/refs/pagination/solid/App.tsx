import { createSignal, For } from "solid-js";

const items = Array.from({ length: 23 }, (_, i) => `Ítem ${i + 1}`);
const SIZE = 10;
const pages = Math.ceil(items.length / SIZE);

export default function App() {
  const [page, setPage] = createSignal(1);
  const visible = () => items.slice((page() - 1) * SIZE, page() * SIZE);

  return (
    <div class="flex flex-col gap-2">
      <ul>
        <For each={visible()}>{(item) => <li>{item}</li>}</For>
      </ul>
      <p>Página {page()} de {pages}</p>
      <div class="flex gap-2">
        <button disabled={page() === 1} onClick={() => setPage(page() - 1)}>Anterior</button>
        <button disabled={page() === pages} onClick={() => setPage(page() + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
