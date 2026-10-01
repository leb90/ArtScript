<script lang="ts">
  import { SEED, type Item } from "./data";
  import ShipmentsForm from "./ShipmentsForm.svelte";
  import ShipmentsList from "./ShipmentsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Envíos</h2>
  <ShipmentsForm onAdd={add} />
  <ShipmentsList {items} />
</div>
