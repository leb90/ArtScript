<script lang="ts">
  import { SEED, type Item } from "./data";
  import CouponsForm from "./CouponsForm.svelte";
  import CouponsList from "./CouponsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Cupones</h2>
  <CouponsForm onAdd={add} />
  <CouponsList {items} />
</div>
