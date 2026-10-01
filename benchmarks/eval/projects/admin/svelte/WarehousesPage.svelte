<script lang="ts">
  import { SEED, type Item } from "./data";
  import WarehousesForm from "./WarehousesForm.svelte";
  import WarehousesList from "./WarehousesList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Depósitos</h2>
  <WarehousesForm onAdd={add} />
  <WarehousesList {items} />
</div>
