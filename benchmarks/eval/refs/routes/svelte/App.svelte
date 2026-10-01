<script lang="ts">
  const products = [{ id: 1, name: "Mesa" }, { id: 2, name: "Silla" }];
  let path = $state(location.pathname);

  $effect(() => {
    const onPop = () => (path = location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  function go(e: MouseEvent, to: string) {
    e.preventDefault();
    history.pushState(null, "", to);
    path = to;
  }

  const product = $derived.by(() => {
    const m = path.match(/^\/productos\/(\d+)$/);
    return m ? products.find((p) => p.id === Number(m[1])) : undefined;
  });
</script>

{#if path === "/"}
  <h1>Productos</h1>
  {#each products as p (p.id)}
    <div class="flex gap-2">
      <span>{p.name}</span>
      <a href={`/productos/${p.id}`} onclick={(e) => go(e, `/productos/${p.id}`)}>Ver</a>
    </div>
  {/each}
{:else if product}
  <h1>{product.name}</h1>
  <a href="/" onclick={(e) => go(e, "/")}>Volver</a>
{:else}
  <h1>No encontrado</h1>
{/if}
