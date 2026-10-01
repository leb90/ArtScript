<script lang="ts">
  import { SEED, type Item } from "./data";
  import AssetsForm from "./AssetsForm.svelte";
  import AssetsList from "./AssetsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Activos</h2>
  <AssetsForm onAdd={add} />
  <AssetsList {items} />
</div>
