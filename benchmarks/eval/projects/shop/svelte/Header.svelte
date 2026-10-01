<script lang="ts">
  let { count }: { count: number } = $props();
</script>

<div class="flex items-center justify-between">
  <h1 class="text-2xl font-bold">Tienda</h1>
  <span class="text-gray-500">Carrito ({count})</span>
</div>
