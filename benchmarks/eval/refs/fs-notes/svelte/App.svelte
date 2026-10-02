<script lang="ts">
  type Note = { id: string; text: string };

  let me = $state<{ email: string } | null>(null);
  let notes = $state<Note[]>([]);
  let email = $state("");
  let password = $state("");
  let text = $state("");
  let error = $state("");

  const post = (url: string, body?: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

  async function loadNotes() {
    notes = await (await fetch("/api/notes")).json();
  }

  async function init() {
    me = await (await fetch("/api/me")).json();
    if (me) await loadNotes();
  }
  init();

  async function enter(url: string) {
    const res = await post(url, { email, password });
    if (!res.ok) {
      error = "Datos incorrectos";
      return;
    }
    me = await res.json();
    email = "";
    password = "";
    error = "";
    await loadNotes();
  }

  async function logout() {
    await post("/api/logout");
    me = null;
    notes = [];
  }

  async function add() {
    await post("/api/notes", { text });
    text = "";
    await loadNotes();
  }
</script>

{#if me}
  <div class="flex flex-col gap-2">
    <p>Hola, {me.email}</p>
    <button onclick={logout}>Salir</button>
    <input placeholder="Nota" bind:value={text} />
    <button onclick={add}>Agregar</button>
    {#each notes as n (n.id)}<p>{n.text}</p>{/each}
  </div>
{:else}
  <div class="flex flex-col gap-2">
    <input placeholder="Email" bind:value={email} />
    <input type="password" placeholder="Contraseña" bind:value={password} />
    <button onclick={() => enter("/api/signup")}>Crear cuenta</button>
    <button onclick={() => enter("/api/login")}>Entrar</button>
    {#if error}<span>{error}</span>{/if}
  </div>
{/if}
