<script lang="ts">
  import { SEED, type Item } from "./data";
  import CategoriesForm from "./CategoriesForm.svelte";
  import CategoriesList from "./CategoriesList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Categorías</h2>
  <CategoriesForm onAdd={add} />
  <CategoriesList {items} />
</div>
