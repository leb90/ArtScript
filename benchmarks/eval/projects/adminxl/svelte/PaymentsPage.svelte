<script lang="ts">
  import { SEED, type Item } from "./data";
  import PaymentsForm from "./PaymentsForm.svelte";
  import PaymentsList from "./PaymentsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Pagos</h2>
  <PaymentsForm onAdd={add} />
  <PaymentsList {items} />
</div>
