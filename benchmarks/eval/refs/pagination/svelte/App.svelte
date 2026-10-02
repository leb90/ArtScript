<script lang="ts">
  const SIZE = 10;
  const items = Array.from({ length: 23 }, (_, i) => `Ítem ${i + 1}`);
  const pages = Math.ceil(items.length / SIZE);

  let page = $state(1);
  const visible = $derived(items.slice((page - 1) * SIZE, page * SIZE));
</script>

<div class="flex flex-col gap-2">
  <ul>
    {#each visible as item (item)}<li>{item}</li>{/each}
  </ul>
  <p>Página {page} de {pages}</p>
  <div class="flex gap-2">
    <button disabled={page === 1} onclick={() => page--}>Anterior</button>
    <button disabled={page === pages} onclick={() => page++}>Siguiente</button>
  </div>
</div>
