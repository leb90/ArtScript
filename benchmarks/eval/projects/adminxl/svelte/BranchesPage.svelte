<script lang="ts">
  import { SEED, type Item } from "./data";
  import BranchesForm from "./BranchesForm.svelte";
  import BranchesList from "./BranchesList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Sucursales</h2>
  <BranchesForm onAdd={add} />
  <BranchesList {items} />
</div>
