<script lang="ts">
  import { SEED, type Item } from "./data";
  import RefundsForm from "./RefundsForm.svelte";
  import RefundsList from "./RefundsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Devoluciones</h2>
  <RefundsForm onAdd={add} />
  <RefundsList {items} />
</div>
