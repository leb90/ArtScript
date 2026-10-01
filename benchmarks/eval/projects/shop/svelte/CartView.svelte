<script lang="ts">
  import type { CartItem } from "./data";
  import CartItemRow from "./CartItemRow.svelte";
  import Summary from "./Summary.svelte";

  let { cart, onChangeQty, onClear }: { cart: CartItem[]; onChangeQty: (id: number, delta: number) => void; onClear: () => void } = $props();
</script>

{#if cart.length === 0}
  <span class="text-gray-500">El carrito está vacío</span>
{:else}
  <div class="flex flex-col gap-2">
    {#each cart as item (item.product.id)}
      <CartItemRow {item} onChangeQty={(d) => onChangeQty(item.product.id, d)} />
    {/each}
    <Summary {cart} {onClear} />
  </div>
{/if}
