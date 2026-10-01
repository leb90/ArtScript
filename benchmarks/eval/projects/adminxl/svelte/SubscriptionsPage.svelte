<script lang="ts">
  import { SEED, type Item } from "./data";
  import SubscriptionsForm from "./SubscriptionsForm.svelte";
  import SubscriptionsList from "./SubscriptionsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Suscripciones</h2>
  <SubscriptionsForm onAdd={add} />
  <SubscriptionsList {items} />
</div>
