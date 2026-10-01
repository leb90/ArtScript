<script lang="ts">
  import { SEED, type Item } from "./data";
  import EventsForm from "./EventsForm.svelte";
  import EventsList from "./EventsList.svelte";

  let items = $state<Item[]>(SEED.map((i) => ({ ...i })));

  function add(name: string, amount: number) {
    items.push({ id: Date.now(), name, amount, active: true });
  }
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-xl font-bold">Eventos</h2>
  <EventsForm onAdd={add} />
  <EventsList {items} />
</div>
