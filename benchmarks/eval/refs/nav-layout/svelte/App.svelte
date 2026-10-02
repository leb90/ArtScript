<script lang="ts">
  let path = $state(location.pathname);
  let likes = $state(0);

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

  const member = $derived(path.match(/^\/equipo\/([^/]+)$/)?.[1]);
</script>

<nav class="flex gap-2">
  <a href="/" onclick={(e) => go(e, "/")}>Inicio</a>
  <a href="/equipo" onclick={(e) => go(e, "/equipo")}>Equipo</a>
  <button onclick={() => likes++}>Me gusta</button>
  <span>Likes: {likes}</span>
</nav>

{#if path === "/"}
  <h1>Bienvenido</h1>
{:else if path === "/equipo"}
  <h1>Nuestro equipo</h1>
  <a href="/equipo/ana" onclick={(e) => go(e, "/equipo/ana")}>Ana</a>
  <a href="/equipo/beto" onclick={(e) => go(e, "/equipo/beto")}>Beto</a>
{:else if member}
  <h1>Perfil de {member}</h1>
  <a href="/equipo" onclick={(e) => go(e, "/equipo")}>Volver al equipo</a>
{:else}
  <h1>No encontrado</h1>
{/if}
