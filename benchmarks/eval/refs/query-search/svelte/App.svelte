<script lang="ts">
  const products = ["Mesa", "Silla", "Sillón", "Lámpara"];
  const readQuery = () => new URLSearchParams(location.search).get("q") ?? "";

  let q = $state(readQuery());
  let text = $state(readQuery());

  $effect(() => {
    const onPop = () => (q = text = readQuery());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  function search(e: SubmitEvent) {
    e.preventDefault();
    history.pushState(null, "", `?q=${encodeURIComponent(text)}`);
    q = text;
  }

  const results = $derived(products.filter((p) => p.toLowerCase().includes(q.toLowerCase())));
</script>

<div class="flex flex-col gap-2">
  <form class="flex gap-2" onsubmit={search}>
    <input placeholder="Buscar" bind:value={text} />
    <button>Buscar</button>
  </form>
  <ul>
    {#each results as p (p)}<li>{p}</li>{/each}
  </ul>
  <p>Resultados: {results.length}</p>
</div>
