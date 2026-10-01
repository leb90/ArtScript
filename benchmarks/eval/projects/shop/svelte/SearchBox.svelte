<script lang="ts">
  let { value = $bindable() }: { value: string } = $props();
</script>

<input placeholder="Buscar" bind:value />
