<script lang="ts">
  import type { Product } from "./data";
  import SearchBox from "./SearchBox.svelte";
  import ProductCard from "./ProductCard.svelte";

  let { products, onAdd }: { products: Product[]; onAdd: (p: Product) => void } = $props();
  let query = $state("");
  let shown = $derived(products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())));
</script>

<div class="flex flex-col gap-2">
  <SearchBox bind:value={query} />
  <div class="grid grid-cols-3 gap-2">
    {#each shown as p (p.id)}
      <ProductCard product={p} onAdd={() => onAdd(p)} />
    {/each}
  </div>
  {#if shown.length === 0}<span class="text-gray-500">Sin resultados</span>{/if}
</div>
