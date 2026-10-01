<script lang="ts">
  import type { Product } from "./data";
  let { product, onAdd }: { product: Product; onAdd: () => void } = $props();
</script>

<div class="flex flex-col gap-1 rounded border p-2">
  <span class="font-semibold">{product.name}</span>
  <span>${product.price.toFixed(2)}</span>
  <button class="primary" onclick={onAdd}>Agregar</button>
</div>
