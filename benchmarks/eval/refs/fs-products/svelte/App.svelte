<script lang="ts">
  type Product = { id: string; name: string; code: string; price: number };

  let products = $state<Product[]>([]);
  let name = $state("");
  let code = $state("");
  let price = $state("");
  let error = $state("");

  async function load() {
    products = await (await fetch("/api/products")).json();
  }
  load();

  async function save() {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, code, price: Number(price) }),
    });
    error = res.ok ? "" : (await res.json()).error;
    await load();
  }
</script>

<div class="flex flex-col gap-3">
  <input placeholder="Nombre" bind:value={name} />
  <input placeholder="Código" bind:value={code} />
  <input placeholder="Precio" type="text" inputmode="decimal" bind:value={price} />
  <button onclick={save}>Guardar</button>
  {#if error}<span class="text-red-600">{error}</span>{/if}
  {#each products as p (p.id)}<p>{p.name} ({p.code})</p>{/each}
</div>
