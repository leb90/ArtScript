<script lang="ts">
  let count = $state(0);
  let double = $derived(count * 2);
</script>

<div class="flex flex-col gap-4 items-center">
  <h2>Contador</h2>
  <div class="flex items-center gap-2">
    <button onclick={() => count--}>-</button>
    <span class="font-semibold">{count}</span>
    <button class="primary" onclick={() => count++}>+</button>
  </div>
  <span class="text-gray-500">El doble es {double}</span>
  {#if count > 5}
    <span>¡Más de 5!</span>
  {/if}
</div>
