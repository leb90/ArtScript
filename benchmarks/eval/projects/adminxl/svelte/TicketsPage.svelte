<script lang="ts">
  import { SEED, type Item } from "./data";
  import TicketsForm from "./TicketsForm.svelte";
  import TicketsList from "./TicketsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Tickets</h2>
  <TicketsForm onAdd={add} />
  <TicketsList {items} />
</div>
