<script lang="ts">
  import type { CartItem } from "./data";
  let { item, onChangeQty }: { item: CartItem; onChangeQty: (delta: number) => void } = $props();
</script>

<div class="flex items-center gap-2">
  <span>{item.product.name}</span>
  <button onclick={() => onChangeQty(-1)}>-</button>
  <span>{item.qty}</span>
  <button onclick={() => onChangeQty(1)}>+</button>
  <span>${(item.product.price * item.qty).toFixed(2)}</span>
</div>
