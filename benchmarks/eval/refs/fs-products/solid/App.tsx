import { createResource, createSignal, For, Show } from "solid-js";

type Product = { id: string; name: string; code: string; price: number };

export default function App() {
  const [products, { refetch }] = createResource<Product[]>(async () => (await fetch("/api/products")).json());
  const [name, setName] = createSignal("");
  const [code, setCode] = createSignal("");
  const [price, setPrice] = createSignal("");
  const [error, setError] = createSignal("");

  async function save() {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name(), code: code(), price: Number(price()) }),
    });
    setError(res.ok ? "" : (await res.json()).error);
    refetch();
  }

  return (
    <div class="flex flex-col gap-3">
      <input placeholder="Nombre" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      <input placeholder="Código" value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
      <input placeholder="Precio" value={price()} onInput={(e) => setPrice(e.currentTarget.value)} />
      <button onClick={save}>Guardar</button>
      <Show when={error()}>
        <span class="text-red-600">{error()}</span>
      </Show>
      <For each={products() ?? []}>{(p) => <p>{p.name} ({p.code})</p>}</For>
    </div>
  );
}
