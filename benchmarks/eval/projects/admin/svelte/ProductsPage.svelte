<script lang="ts">
  import { SEED, type Item } from "./data";
  import ProductsForm from "./ProductsForm.svelte";
  import ProductsList from "./ProductsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Productos</h2>
  <ProductsForm onAdd={add} />
  <ProductsList {items} />
</div>
