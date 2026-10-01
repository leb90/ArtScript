<script lang="ts">
  import type { CartItem } from "./data";
  let { cart, onClear }: { cart: CartItem[]; onClear: () => void } = $props();
  let total = $derived(cart.reduce((sum, i) => sum + i.product.price * i.qty, 0));
</script>

<div class="flex items-center justify-between border-t pt-2">
  <span class="font-bold">Total: ${total.toFixed(2)}</span>
  <button class="danger" onclick={onClear}>Vaciar carrito</button>
</div>
