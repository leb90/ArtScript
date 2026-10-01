<script lang="ts">
  import { SEED, type Item } from "./data";
  import VehiclesForm from "./VehiclesForm.svelte";
  import VehiclesList from "./VehiclesList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Vehículos</h2>
  <VehiclesForm onAdd={add} />
  <VehiclesList {items} />
</div>
