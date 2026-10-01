<script lang="ts">
  import type { Item } from "./data";

  let { item }: { item: Item } = $props();
</script>

<div class="flex gap-2">
  <span class="font-semibold">{item.name}</span>
  <span>Total: {item.amount}</span>
</div>
