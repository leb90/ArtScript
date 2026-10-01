import { createSignal, For, Show } from "solid-js";
import type { Product } from "./data";
import SearchBox from "./SearchBox";
import ProductCard from "./ProductCard";

export default function Catalog(props: { products: Product[]; onAdd: (p: Product) => void }) {
  const [query, setQuery] = createSignal("");
  const shown = () => props.products.filter((p) => p.name.toLowerCase().includes(query().toLowerCase()));

  return (
    <div class="flex flex-col gap-2">
      <SearchBox value={query()} onChange={setQuery} />
      <div class="grid grid-cols-3 gap-2">
        <For each={shown()}>{(p) => <ProductCard product={p} onAdd={() => props.onAdd(p)} />}</For>
      </div>
      <Show when={shown().length === 0}>
        <span class="text-gray-500">Sin resultados</span>
      </Show>
    </div>
  );
}
