<script lang="ts">
  type User = { id: string; name: string; email: string };

  let users = $state<User[]>([]);
  let name = $state("");
  let email = $state("");
  let error = $state("");

  async function load() {
    users = await (await fetch("/api/users")).json();
  }
  load();

  async function add() {
    if (!email.includes("@")) {
      error = "Email inválido";
      return;
    }
    await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email }) });
    name = "";
    email = "";
    error = "";
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    await load();
  }
</script>

<div class="flex flex-col gap-2">
  <input placeholder="Nombre" bind:value={name} />
  <input placeholder="Email" bind:value={email} />
  <button onclick={add}>Agregar</button>
  {#if error}<span>{error}</span>{/if}
  {#each users as u (u.id)}
    <div class="flex gap-2">
      <span>{u.name} ({u.email})</span>
      <button onclick={() => remove(u.id)}>Borrar</button>
    </div>
  {/each}
</div>
