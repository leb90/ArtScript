<script lang="ts">
  let { onAdd }: { onAdd: (name: string, amount: number) => void } = $props();
  let name = $state("");
  let amount = $state("");

  function submit() {
    onAdd(name, Number(amount) || 0);
    name = "";
    amount = "";
  }
</script>

<div class="flex gap-2">
  <input placeholder="Nombre" bind:value={name} />
  <input placeholder="Descuento" type="number" bind:value={amount} />
  <button class="primary" onclick={submit}>Agregar</button>
</div>
