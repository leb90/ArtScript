<script lang="ts">
  type Author = { id: string; name: string };
  type Post = { id: string; title: string; author: Author | null };

  let authors = $state<Author[]>([]);
  let posts = $state<Post[]>([]);
  let name = $state("");
  let title = $state("");
  let authorId = $state("");
  let error = $state("");

  const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function load() {
    authors = await (await fetch("/api/authors")).json();
    posts = await (await fetch("/api/posts")).json();
  }
  load();

  async function createAuthor() {
    await fetch("/api/authors", json("POST", { name }));
    name = "";
    await load();
  }

  async function removeAuthor(id: string) {
    const res = await fetch(`/api/authors/${id}`, { method: "DELETE" });
    error = res.ok ? "" : "El autor tiene posts";
    await load();
  }

  async function publish() {
    await fetch("/api/posts", json("POST", { title, authorId }));
    title = "";
    await load();
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex gap-2">
    <input placeholder="Autor" bind:value={name} />
    <button onclick={createAuthor}>Crear autor</button>
  </div>
  {#each authors as a (a.id)}
    <div class="flex gap-2">
      <span>{a.name}</span>
      <button onclick={() => removeAuthor(a.id)}>Borrar autor</button>
    </div>
  {/each}
  {#if error}<span class="text-red-600">{error}</span>{/if}
  <div class="flex gap-2">
    <input placeholder="Título" bind:value={title} />
    <select bind:value={authorId}>
      <option value="" disabled>Autor del post</option>
      {#each authors as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
    </select>
    <button onclick={publish}>Publicar</button>
  </div>
  {#each posts as p (p.id)}<p>{p.title} por {p.author?.name}</p>{/each}
</div>
