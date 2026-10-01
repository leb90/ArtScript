<script lang="ts">
  import { SEED, type Item } from "./data";
  import OrdersForm from "./OrdersForm.svelte";
  import OrdersList from "./OrdersList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Pedidos</h2>
  <OrdersForm onAdd={add} />
  <OrdersList {items} />
</div>
