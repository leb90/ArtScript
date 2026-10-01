<script lang="ts">
  import type { Item } from "./data";
  import BranchesRow from "./BranchesRow.svelte";

  let { items }: { items: Item[] } = $props();
</script>

{#if items.length === 0}
  <span class="text-gray-500">Sin registros</span>
{:else}
  <div class="flex flex-col gap-1">
    {#each items as item (item.id)}
      <BranchesRow {item} />
    {/each}
  </div>
{/if}
