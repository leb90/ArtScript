<script lang="ts">
  type Task = { id: string; title: string; done: boolean };

  let tasks = $state<Task[]>([]);
  let title = $state("");
  let filter = $state("Todas");
  let renaming = $state<string | null>(null);
  let newTitle = $state("");

  const visible = $derived(tasks.filter((t) => filter === "Todas" || (filter === "Hechas") === t.done));

  const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function load() {
    tasks = await (await fetch("/api/tasks")).json();
  }
  load();

  async function add() {
    await fetch("/api/tasks", json("POST", { title }));
    title = "";
    await load();
  }

  async function markDone(id: string) {
    await fetch(`/api/tasks/${id}`, json("PATCH", { done: true }));
    await load();
  }

  function rename(t: Task) {
    renaming = t.id;
    newTitle = t.title;
  }

  async function saveTitle(id: string) {
    await fetch(`/api/tasks/${id}`, json("PATCH", { title: newTitle }));
    renaming = null;
    await load();
  }
</script>

<div class="flex flex-col gap-2">
  <input placeholder="Tarea" bind:value={title} />
  <button onclick={add}>Agregar</button>
  <select bind:value={filter}>
    <option>Todas</option>
    <option>Pendientes</option>
    <option>Hechas</option>
  </select>
  {#each visible as t (t.id)}
    <div class="flex gap-2">
      {#if renaming === t.id}
        <input placeholder="Nuevo título" bind:value={newTitle} />
        <button onclick={() => saveTitle(t.id)}>Guardar</button>
      {:else}
        <span>{t.title}{t.done ? " (hecha)" : ""}</span>
      {/if}
      {#if !t.done}<button onclick={() => markDone(t.id)}>Hecha</button>{/if}
      <button onclick={() => rename(t)}>Renombrar</button>
    </div>
  {/each}
</div>
