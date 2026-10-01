<script lang="ts">
  type Contact = { name: string; kind: string };

  let contacts = $state<Contact[]>([]);
  let open = $state(false);
  let name = $state("");
  let kind = $state("Amigo");

  function save() {
    contacts.push({ name, kind });
    name = "";
    open = false;
  }
</script>

<div class="flex flex-col gap-3">
  <button onclick={() => (open = true)}>Nuevo contacto</button>
  {#each contacts as c, i (i)}<p>{c.name} ({c.kind})</p>{/each}
  {#if open}
    <div role="dialog" class="fixed inset-0 flex items-center justify-center bg-black/40">
      <div class="flex flex-col gap-2 rounded bg-white p-4">
        <input placeholder="Nombre" bind:value={name} />
        <select bind:value={kind}>
          <option>Amigo</option>
          <option>Trabajo</option>
        </select>
        <div class="flex gap-2">
          <button onclick={save}>Guardar</button>
          <button onclick={() => (open = false)}>Cancelar</button>
        </div>
      </div>
    </div>
  {/if}
</div>
