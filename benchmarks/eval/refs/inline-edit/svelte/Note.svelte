<script lang="ts">
  let { text, onsave }: { text: string; onsave: (text: string) => void } = $props();

  let editing = $state(false);
  let draft = $state("");

  function edit() {
    draft = text;
    editing = true;
  }

  function save() {
    onsave(draft);
    editing = false;
  }
</script>

<li class="flex gap-2">
  {#if editing}
    <input bind:value={draft} />
    <button onclick={save}>Guardar</button>
    <button onclick={() => (editing = false)}>Cancelar</button>
  {:else}
    <span>{text}</span>
    <button onclick={edit}>Editar</button>
  {/if}
</li>
