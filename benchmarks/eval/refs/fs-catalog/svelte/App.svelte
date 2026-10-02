<script lang="ts">
  type Product = { id: number; name: string };
  const SIZE = 5;

  let items = $state<Product[]>([]);
  let total = $state(0);
  let q = $state("");
  let page = $state(0);

  async function load() {
    const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&page=${page}`);
    ({ items, total } = await res.json());
  }
  load();

  async function seed() {
    await fetch("/api/seed", { method: "POST" });
    await load();
  }

  function search() {
    page = 0;
    load();
  }

  function go(to: number) {
    page = to;
    load();
  }
</script>

<div class="flex flex-col gap-2">
  <button onclick={seed}>Cargar ejemplos</button>
  <input placeholder="Buscar" bind:value={q} oninput={search} />
  {#each items as p (p.id)}<p>{p.name}</p>{/each}
  <p>Total: {total}</p>
  <div class="flex gap-2">
    <button disabled={page === 0} onclick={() => go(page - 1)}>Anterior</button>
    <button disabled={(page + 1) * SIZE >= total} onclick={() => go(page + 1)}>Siguiente</button>
  </div>
</div>
