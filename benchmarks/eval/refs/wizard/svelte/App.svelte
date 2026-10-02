<script lang="ts">
  let step = $state(1);
  let name = $state("");
  let plan = $state("Gratis");
  let news = $state(false);
  let error = $state("");
  let done = $state(false);

  function next() {
    if (step === 1 && !name.trim()) {
      error = "Nombre requerido";
      return;
    }
    error = "";
    step++;
  }
</script>

{#if done}
  <p>¡Listo, {name}!</p>
{:else}
  <div class="flex flex-col gap-2">
    <p>Paso {step} de 3</p>
    {#if step === 1}
      <input placeholder="Nombre" bind:value={name} />
      {#if error}<span>{error}</span>{/if}
      <button onclick={next}>Siguiente</button>
    {:else if step === 2}
      <select bind:value={plan}>
        <option>Gratis</option>
        <option>Pro</option>
      </select>
      <label><input type="checkbox" bind:checked={news} /> Recibir novedades</label>
      <div class="flex gap-2">
        <button onclick={() => step--}>Atrás</button>
        <button onclick={next}>Siguiente</button>
      </div>
    {:else}
      <p>{name} eligió {plan}</p>
      {#if news}<p>Con novedades</p>{/if}
      <div class="flex gap-2">
        <button onclick={() => step--}>Atrás</button>
        <button onclick={() => (done = true)}>Confirmar</button>
      </div>
    {/if}
  </div>
{/if}
