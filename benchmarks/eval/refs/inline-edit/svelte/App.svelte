<script lang="ts">
  import Note from "./Note.svelte";

  let notes = $state(["Comprar pan", "Llamar a Ana", "Pagar luz"]);
  let edited = $state(0);

  function save(i: number, text: string) {
    notes[i] = text;
    edited++;
  }
</script>

<div class="flex flex-col gap-2">
  <ul>
    {#each notes as note, i (i)}
      <Note text={note} onsave={(text) => save(i, text)} />
    {/each}
  </ul>
  <p>Editadas: {edited}</p>
</div>
